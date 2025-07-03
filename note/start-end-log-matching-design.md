# 開始・終了ログマッチング機能設計書

## 📋 概要

現在の活動記録システムは、「10時から12時まで会議をした」のような完結型メッセージを前提としているが、新たに「開始のみ」「終了のみ」のメッセージを別々に受信し、後でマッチングして作業時間を算出する機能を追加する。

## 🎯 要件定義

### 現在の動作
- **完結型メッセージ**: 「10時から12時まで会議をした」
- **処理方法**: 単一メッセージからGeminiが開始・終了時刻を抽出

### 新しい動作
- **開始メッセージ**: 「10時から会議を始めた」「今から○○の作業を始める」
- **終了メッセージ**: 「会議を終えました」「○○の作業を12時に終了した」
- **処理方法**: 開始と終了を別々に受信し、内容と時間でマッチング

## 🏗️ システム設計

### 1. データベーススキーマ拡張

#### 既存テーブル: `activity_logs`
現在のスキーマにフィールドを追加：

```sql
-- 新しいフィールドを追加
ALTER TABLE activity_logs ADD COLUMN log_type TEXT DEFAULT 'complete' CHECK (log_type IN ('complete', 'start_only', 'end_only'));
ALTER TABLE activity_logs ADD COLUMN match_status TEXT DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'ignored'));
ALTER TABLE activity_logs ADD COLUMN matched_log_id TEXT;
ALTER TABLE activity_logs ADD COLUMN activity_key TEXT;
ALTER TABLE activity_logs ADD COLUMN similarity_score REAL;

-- インデックスの追加
CREATE INDEX IF NOT EXISTS idx_activity_logs_log_type ON activity_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_match_status ON activity_logs(match_status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_matched_log_id ON activity_logs(matched_log_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_activity_key ON activity_logs(activity_key);

-- 外部キー制約の追加
ALTER TABLE activity_logs ADD CONSTRAINT fk_matched_log_id 
    FOREIGN KEY (matched_log_id) REFERENCES activity_logs(id);
```

#### フィールド定義

| フィールド | タイプ | 説明 |
|-----------|--------|------|
| `log_type` | TEXT | ログの種類（complete/start_only/end_only） |
| `match_status` | TEXT | マッチング状態（unmatched/matched/ignored） |
| `matched_log_id` | TEXT | マッチング相手のログID |
| `activity_key` | TEXT | 活動内容の分類キー（マッチング用） |
| `similarity_score` | REAL | マッチング時の類似度スコア |

### 2. 型定義の拡張

#### TypeScript型定義
```typescript
// src/types/activityLog.ts に追加

export type LogType = 'complete' | 'start_only' | 'end_only';
export type MatchStatus = 'unmatched' | 'matched' | 'ignored';

export interface ActivityLog {
  // 既存フィールド
  id: string;
  userId: string;
  content: string;
  // ... 他の既存フィールド
  
  // 新しいフィールド
  logType: LogType;
  matchStatus: MatchStatus;
  matchedLogId?: string;
  activityKey?: string;
  similarityScore?: number;
}

export interface MatchingResult {
  startLog: ActivityLog;
  endLog: ActivityLog;
  matchScore: number;
  confidence: number;
  durationMinutes: number;
  warnings?: string[];
}

export interface MatchingCandidate {
  logId: string;
  score: number;
  reason: string;
  confidence: number;
}
```

### 3. マッチングロジック設計

#### 3.1 マッチング戦略

```typescript
export interface MatchingStrategy {
  // 時間的制約
  maxDurationHours: number;      // 最大作業時間（24時間）
  maxGapDays: number;            // 最大日数差（2日）
  
  // 類似性判定
  minSimilarityScore: number;    // 最小類似度スコア（0.6）
  keywordWeight: number;         // キーワード一致の重み（0.4）
  semanticWeight: number;        // 意味的類似性の重み（0.6）
  
  // マッチング優先度
  timeProximityWeight: number;   // 時間の近さの重み（0.3）
  contentSimilarityWeight: number; // 内容類似性の重み（0.7）
}
```

#### 3.2 マッチングアルゴリズム

```typescript
export class ActivityLogMatchingService {
  
  /**
   * 開始ログに対する終了ログ候補を検索
   */
  async findEndCandidates(startLog: ActivityLog): Promise<MatchingCandidate[]> {
    const candidates = await this.repository.getLogsByDateRange(
      startLog.userId,
      startLog.businessDate,
      this.getNextBusinessDate(startLog.businessDate)
    );
    
    return candidates
      .filter(log => 
        log.logType === 'end_only' && 
        log.matchStatus === 'unmatched' &&
        log.inputTimestamp > startLog.inputTimestamp
      )
      .map(log => this.calculateMatchScore(startLog, log))
      .sort((a, b) => b.score - a.score);
  }
  
  /**
   * マッチングスコアを計算
   */
  private calculateMatchScore(startLog: ActivityLog, endLog: ActivityLog): MatchingCandidate {
    const timeScore = this.calculateTimeScore(startLog, endLog);
    const contentScore = this.calculateContentScore(startLog, endLog);
    const totalScore = (timeScore * 0.3) + (contentScore * 0.7);
    
    return {
      logId: endLog.id,
      score: totalScore,
      reason: `時間スコア: ${timeScore.toFixed(2)}, 内容スコア: ${contentScore.toFixed(2)}`,
      confidence: this.calculateConfidence(timeScore, contentScore)
    };
  }
  
  /**
   * 時間的近さのスコアを計算
   */
  private calculateTimeScore(startLog: ActivityLog, endLog: ActivityLog): number {
    const startTime = new Date(startLog.inputTimestamp).getTime();
    const endTime = new Date(endLog.inputTimestamp).getTime();
    const diffHours = (endTime - startTime) / (1000 * 60 * 60);
    
    // 0-8時間: 1.0, 8-16時間: 0.5, 16-24時間: 0.2, 24時間以上: 0.0
    if (diffHours <= 8) return 1.0;
    if (diffHours <= 16) return 0.5;
    if (diffHours <= 24) return 0.2;
    return 0.0;
  }
  
  /**
   * 内容類似性のスコアを計算
   */
  private async calculateContentScore(startLog: ActivityLog, endLog: ActivityLog): Promise<number> {
    // キーワード抽出による類似性
    const keywordScore = this.calculateKeywordSimilarity(startLog.content, endLog.content);
    
    // Geminiによる意味的類似性
    const semanticScore = await this.geminiService.calculateSemanticSimilarity(
      startLog.content, 
      endLog.content
    );
    
    return (keywordScore * 0.4) + (semanticScore * 0.6);
  }
}
```

### 4. Gemini連携設計

#### 4.1 ログタイプ判定
```typescript
export interface LogTypeAnalysisRequest {
  content: string;
  inputTimestamp: string;
  timezone: string;
}

export interface LogTypeAnalysisResponse {
  logType: LogType;
  confidence: number;
  extractedTime?: string;
  activityKey: string;
  keywords: string[];
  reasoning: string;
}
```

#### 4.2 マッチング支援
```typescript
export interface MatchingAnalysisRequest {
  startLog: ActivityLog;
  endCandidates: ActivityLog[];
  timezone: string;
}

export interface MatchingAnalysisResponse {
  bestMatch?: {
    logId: string;
    confidence: number;
    reasoning: string;
  };
  alternatives: {
    logId: string;
    confidence: number;
    reasoning: string;
  }[];
  warnings: string[];
}
```

### 5. 実装方針

#### 5.1 段階的実装

**Phase 1: 基本機能**
- [ ] データベーススキーマの拡張
- [ ] ログタイプ判定機能
- [ ] 基本的なマッチング機能

**Phase 2: 高度な機能**
- [ ] Geminiによる意味的類似性判定
- [ ] 複数候補からの最適選択
- [ ] 手動修正機能

**Phase 3: 統合・最適化**
- [ ] サマリー生成の統合
- [ ] パフォーマンス最適化
- [ ] エラーハンドリング強化

#### 5.2 新しいサービスクラス

```typescript
export class ActivityLogMatchingService {
  constructor(
    private repository: SqliteActivityLogRepository,
    private geminiService: GeminiService
  ) {}
  
  /**
   * 新しいログを保存し、自動マッチングを実行
   */
  async saveLogWithMatching(request: CreateActivityLogRequest): Promise<ActivityLog> {
    const log = await this.repository.saveLog(request);
    
    if (log.logType === 'start_only') {
      await this.scheduleEndMatching(log);
    } else if (log.logType === 'end_only') {
      await this.performStartMatching(log);
    }
    
    return log;
  }
  
  /**
   * 開始ログに対する終了ログをマッチング
   */
  private async performStartMatching(endLog: ActivityLog): Promise<void> {
    const candidates = await this.findStartCandidates(endLog);
    
    if (candidates.length > 0) {
      const bestMatch = candidates[0];
      if (bestMatch.score >= this.strategy.minSimilarityScore) {
        await this.createMatch(bestMatch.logId, endLog.id, bestMatch.score);
      }
    }
  }
  
  /**
   * マッチングを作成
   */
  private async createMatch(startLogId: string, endLogId: string, score: number): Promise<void> {
    await this.repository.withTransaction(async () => {
      // 開始ログを更新
      await this.repository.updateLogMatching(startLogId, {
        matchStatus: 'matched',
        matchedLogId: endLogId,
        similarityScore: score
      });
      
      // 終了ログを更新
      await this.repository.updateLogMatching(endLogId, {
        matchStatus: 'matched',
        matchedLogId: startLogId,
        similarityScore: score
      });
    });
  }
}
```

### 6. ユーザーインターフェース

#### 6.1 新しいコマンド

```bash
# 未マッチログの表示
!unmatched

# マッチング手動実行
!match start_log_id end_log_id

# マッチング履歴の表示
!matches [date]

# マッチング状態の確認
!match-status [log_id]
```

#### 6.2 サマリー表示の改善

```typescript
// マッチング済みログペアの表示
export interface MatchedActivityEntry {
  startTime: string;
  endTime: string;
  duration: number;
  activity: string;
  confidence: number;
  matchType: 'auto' | 'manual';
}

// 未マッチログの警告
export interface UnmatchedWarning {
  logId: string;
  logType: LogType;
  content: string;
  timestamp: string;
  suggestions: string[];
}
```

### 7. エラーハンドリング

#### 7.1 マッチング失敗パターン

1. **時間矛盾**: 終了時刻が開始時刻より前
2. **内容不一致**: 類似度スコアが閾値以下
3. **重複マッチング**: 既にマッチ済みのログとの競合
4. **期限切れ**: 設定期間内にマッチングが見つからない

#### 7.2 対処方法

1. **自動修正**: 明らかな入力ミスの場合
2. **警告表示**: ユーザーに判断を委ねる
3. **手動介入**: 複雑なケースの手動修正
4. **無視設定**: マッチング対象外として設定

### 8. テスト戦略

#### 8.1 単体テスト
- [ ] ログタイプ判定のテスト
- [ ] マッチングスコア計算のテスト
- [ ] 時間計算のテスト

#### 8.2 統合テスト
- [ ] 完全なマッチングフローのテスト
- [ ] Gemini連携のテスト
- [ ] エラーケースのテスト

#### 8.3 パフォーマンステスト
- [ ] 大量ログでのマッチング性能
- [ ] 複数候補がある場合の処理時間
- [ ] メモリ使用量の測定

### 9. 運用考慮事項

#### 9.1 データマイグレーション
- 既存ログのlogTypeを'complete'に設定
- 既存ログのmatchStatusを'matched'に設定

#### 9.2 監視・アラート
- 未マッチログの蓄積監視
- マッチング失敗率の監視
- 処理時間の監視

#### 9.3 バックアップ・復旧
- マッチング前のデータ状態の保持
- 誤マッチングの修正機能
- データ整合性の定期チェック

## 🎉 期待される効果

1. **利便性向上**: より自然な記録方法
2. **精度向上**: 実際の作業時間をより正確に記録
3. **柔軟性向上**: 様々な記録スタイルに対応
4. **分析精度向上**: より詳細な時間分析が可能

## 📝 実装優先順位

1. **高優先度**: 基本マッチング機能
2. **中優先度**: Gemini連携強化
3. **低優先度**: 高度な分析機能

---

**作成日**: 2025-07-03  
**更新日**: 2025-07-03  
**バージョン**: 1.0  
**ステータス**: 設計完了