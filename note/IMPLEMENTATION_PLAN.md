# 実装計画：自然言語ログ方式への移行

**作成日**: 2025-06-29  
**対象**: TimeLogger Discord Bot 自然言語ログ方式移行  
**実装方針**: 段階的移行によるリスク最小化

## 📋 実装概要

### 移行戦略
1. **段階的移行**: 既存機能を停止せずに新機能を並行開発
2. **データ保持**: 既存データを保持しつつ新形式に対応
3. **後方互換**: 旧機能を維持して安全な移行期間を確保

## 🏗️ Phase 1: データ基盤構築

### 1.1 新データベース設計

#### **新テーブル作成**
```sql
-- 新活動ログテーブル
CREATE TABLE activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,           -- ユーザーの生入力
    input_timestamp TEXT NOT NULL,  -- 入力時刻（UTC）
    business_date TEXT NOT NULL,    -- 業務日（5am基準）
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 分析結果キャッシュテーブル
CREATE TABLE daily_analysis_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    analysis_result TEXT NOT NULL,  -- JSON形式
    log_count INTEGER NOT NULL,
    generated_at TEXT NOT NULL,
    UNIQUE(user_id, business_date)
);

-- インデックス作成
CREATE INDEX idx_logs_user_date ON activity_logs(user_id, business_date, is_deleted);
CREATE INDEX idx_logs_timestamp ON activity_logs(input_timestamp);
CREATE INDEX idx_cache_user_date ON daily_analysis_cache(user_id, business_date);
```

#### **データ移行スクリプト**
```typescript
// scripts/migrate-to-activity-logs.ts
class DataMigration {
  async migrateExistingData() {
    // 1. 既存activity_recordsから活動ログを抽出
    // 2. 新形式に変換してactivity_logsに挿入
    // 3. 移行結果の検証
  }
}
```

### 1.2 新型定義

```typescript
// src/types/activityLog.ts
interface ActivityLog {
  id: string;
  userId: string;
  content: string;
  inputTimestamp: string;
  businessDate: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DailyAnalysisResult {
  categories: CategorySummary[];
  timeline: TimelineEntry[];
  totalWorkMinutes: number;
  duplications: DuplicationWarning[];
  gaps: TimeGap[];
  insights: string;
  motivation: string;
}

interface TimelineEntry {
  startTime: string;
  endTime: string;
  category: string;
  content: string;
  confidence: number; // AIの時間推定信頼度
}
```

### 1.3 新Repository層

```typescript
// src/repositories/activityLogRepository.ts
interface IActivityLogRepository {
  saveLog(log: ActivityLog): Promise<void>;
  getLogsByDate(userId: string, businessDate: string): Promise<ActivityLog[]>;
  updateLog(logId: string, content: string): Promise<void>;
  deleteLog(logId: string): Promise<void>;
  getCache(userId: string, businessDate: string): Promise<DailyAnalysisResult | null>;
  saveCache(userId: string, businessDate: string, result: DailyAnalysisResult): Promise<void>;
}
```

**実装ファイル**: `src/repositories/sqliteActivityLogRepository.ts`

## 🔧 Phase 2: 新サービス層実装

### 2.1 ActivityLogService

```typescript
// src/services/activityLogService.ts
class ActivityLogService {
  async recordActivity(userId: string, content: string, timezone: string): Promise<ActivityLog> {
    // 1. 入力時刻の記録
    // 2. 業務日の計算
    // 3. ログの保存
    // 4. 分析キャッシュの無効化
  }

  async getLogsForEdit(userId: string, timezone: string): Promise<ActivityLog[]> {
    // 今日のログ一覧を返す（編集用）
  }

  async editLog(logId: string, newContent: string): Promise<void> {
    // ログの更新と分析キャッシュ無効化
  }
}
```

### 2.2 統合分析エンジン

```typescript
// src/services/unifiedAnalysisService.ts
class UnifiedAnalysisService {
  async analyzeDaily(logs: ActivityLog[], timezone: string): Promise<DailyAnalysisResult> {
    // 1. トークン数チェック
    // 2. 分割分析 or 一括分析の判定
    // 3. AIによる統合分析実行
    // 4. 結果の構造化
  }

  private async analyzeInChunks(logs: ActivityLog[]): Promise<DailyAnalysisResult> {
    // 時間帯別分割分析
    const morningLogs = logs.filter(/* 9:00-12:00 */);
    const afternoonLogs = logs.filter(/* 13:00-18:00 */);
    const eveningLogs = logs.filter(/* 18:00-21:00 */);
    
    // 各チャンクを分析して統合
  }

  private buildUnifiedPrompt(logs: ActivityLog[], timezone: string): string {
    // 統合分析用プロンプト構築
  }
}
```

### 2.3 スマートキャッシュ管理

```typescript
// src/services/analysisCacheService.ts
class AnalysisCacheService {
  async getCachedAnalysis(userId: string, businessDate: string): Promise<DailyAnalysisResult | null> {
    // キャッシュから分析結果を取得
  }

  async invalidateCache(userId: string, businessDate: string): Promise<void> {
    // ログ編集時のキャッシュ無効化
  }

  async updateCache(userId: string, businessDate: string, result: DailyAnalysisResult): Promise<void> {
    // 新しい分析結果をキャッシュ
  }
}
```

## 🎯 Phase 3: 新ハンドラー実装

### 3.1 新EditCommandHandler

```typescript
// src/handlers/newEditCommandHandler.ts
class NewEditCommandHandler {
  async showEditableList(message: Message, userId: string, timezone: string): Promise<void> {
    const logs = await this.activityLogService.getLogsForEdit(userId, timezone);
    
    const listText = logs.map((log, index) => 
      `${index + 1}. [${formatTime(log.inputTimestamp)}] ${log.content}`
    ).join('\n');
    
    await message.reply(`**今日の活動ログ一覧:**\n${listText}\n\n使用方法: \`!edit <ID> <新内容>\``);
  }

  async editLog(message: Message, logId: string, newContent: string): Promise<void> {
    await this.activityLogService.editLog(logId, newContent);
    await message.reply('✅ ログを更新しました');
  }
}
```

### 3.2 新SummaryHandler

```typescript
// src/handlers/newSummaryHandler.ts
class NewSummaryHandler {
  async generateSummary(message: Message, userId: string, targetDate?: string, timezone: string): Promise<void> {
    // 1. キャッシュ確認
    // 2. ログ取得
    // 3. 統合分析実行
    // 4. 結果フォーマット・送信
  }

  private formatSummaryResult(result: DailyAnalysisResult): string {
    // Discord用のサマリーフォーマット
  }
}
```

### 3.3 LogsCommandHandler（新機能）

```typescript
// src/handlers/logsCommandHandler.ts
class LogsCommandHandler {
  async showRawLogs(message: Message, userId: string, timezone: string): Promise<void> {
    // 今日の生ログ一覧を表示
  }
}
```

## ⚡ Phase 4: 統合とテスト

### 4.1 新旧システムの統合

```typescript
// src/bot.ts - 更新
class TaskLoggerBot {
  private initializeNewHandlers() {
    // 新ハンドラーの初期化
    this.newEditHandler = new NewEditCommandHandler(this.activityLogService);
    this.newSummaryHandler = new NewSummaryHandler(this.unifiedAnalysisService);
    this.logsHandler = new LogsCommandHandler(this.activityLogService);
  }

  private async handleMessage(message: Message) {
    // 新旧両方のハンドラーに対応
    if (this.isNewSystemEnabled) {
      // 新システムで処理
    } else {
      // 旧システムで処理（移行期間）
    }
  }
}
```

### 4.2 設定管理

```typescript
// src/config.ts - 更新
export const config = {
  // 既存設定...
  
  newSystem: {
    enabled: process.env.NEW_SYSTEM_ENABLED === 'true',
    migrationMode: process.env.MIGRATION_MODE === 'true',
  }
};
```

### 4.3 テスト実装

```typescript
// src/__tests__/services/activityLogService.test.ts
describe('ActivityLogService', () => {
  test('活動ログの記録', async () => {
    // テスト実装
  });

  test('ログの編集機能', async () => {
    // テスト実装
  });
});

// src/__tests__/services/unifiedAnalysisService.test.ts
describe('UnifiedAnalysisService', () => {
  test('統合分析の実行', async () => {
    // テスト実装
  });

  test('分割分析の実行', async () => {
    // テスト実装
  });
});
```

## 🚀 Phase 5: 移行実行

### 5.1 段階的リリース

1. **Week 1**: データ基盤構築とテスト
2. **Week 2**: 新機能実装と単体テスト
3. **Week 3**: 統合テストと移行テスト
4. **Week 4**: 本番環境での並行運用開始
5. **Week 5**: 新システムメイン運用、旧システム段階停止

### 5.2 移行チェックリスト

- [ ] 新テーブル作成完了
- [ ] 既存データ移行完了
- [ ] 新Repository実装完了
- [ ] 新Service層実装完了
- [ ] 新Handler実装完了
- [ ] 統合テスト完了
- [ ] パフォーマンステスト完了
- [ ] 本番環境デプロイ完了
- [ ] 並行運用確認完了
- [ ] 旧システム停止・清掃完了

## 📊 成功指標

### パフォーマンス指標
- **レスポンス時間**: サマリー生成5秒以内
- **精度向上**: AI分析精度向上（主観評価）
- **使いやすさ**: ユーザビリティ向上（編集機能の活用率）

### 技術指標
- **データ整合性**: 移行後のデータ損失ゼロ
- **システム可用性**: 99%以上の稼働率維持
- **エラー率**: 新機能でのエラー率1%以下

## ⚠️ リスク管理

### 想定リスク
1. **データ移行失敗**: 既存データの損失・破損
2. **AI分析精度**: 統合分析の精度低下
3. **パフォーマンス劣化**: トークン使用量増加
4. **ユーザビリティ**: 新UI/UXへの慣れ

### 対策
1. **バックアップ戦略**: 移行前の完全バックアップ
2. **段階的移行**: 新旧並行運用期間の確保
3. **ロールバック計画**: 問題発生時の即座復旧
4. **ユーザーサポート**: 移行ガイドと十分な説明

---

**この実装計画により、TimeLogger は安全かつ効率的に次世代の自然言語活動記録システムに進化します。**