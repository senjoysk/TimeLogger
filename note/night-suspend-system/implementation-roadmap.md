# 夜間サスペンド機能 実装ロードマップ

## 📋 プロジェクト概要

Discord Bot TimeLoggerに0:00-7:00の夜間サスペンド機能を実装し、GitHub Actionsによる自動化とテンプレートリポジトリ化を通じて、コスト効率的でスケーラブルなマルチユーザー対応システムを構築する。

## 🎯 実装目標

### 主要目標
- **コスト削減**: 70%のFly.io運用コスト削減
- **メッセージ保全**: 夜間メッセージの完全処理
- **スケーラビリティ**: 無制限ユーザー対応
- **自動化**: 人手介入なしの運用

### 成功指標
- 夜間サスペンド成功率: 99%以上
- メッセージリカバリ成功率: 99%以上
- GitHub Actions使用量: 無料枠内
- ユーザー満足度: 高い

## 🗓️ 実装フェーズ

### Phase 1: 基盤実装 (Week 1-2)
```
期間: 2週間
目標: 夜間サスペンド機能の基本実装
```

#### 1.1 データベース拡張
- [ ] スキーマ設計・レビュー
- [ ] マイグレーション実装
- [ ] テストデータ作成

```sql
-- 実装項目
ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT UNIQUE;
ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT;

CREATE TABLE IF NOT EXISTS suspend_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  suspend_time TEXT NOT NULL,
  expected_recovery_time TEXT NOT NULL,
  actual_recovery_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);
```

#### 1.2 API エンドポイント実装
- [ ] `/api/night-suspend` エンドポイント
- [ ] `/api/wake-up` エンドポイント
- [ ] `/api/morning-recovery` エンドポイント
- [ ] 認証ミドルウェア
- [ ] エラーハンドリング

```typescript
// 実装対象エンドポイント
POST /api/night-suspend   // 夜間サスペンド準備
POST /api/wake-up        // 朝の起動処理
POST /api/morning-recovery // メッセージリカバリ
GET  /api/suspend-status  // 状態確認
```

#### 1.3 メッセージリカバリ機能
- [ ] MorningMessageRecoveryクラス実装
- [ ] Discord API履歴取得
- [ ] 重複チェック機能
- [ ] バッチ処理機能

### Phase 2: GitHub Actions実装 (Week 3)
```
期間: 1週間
目標: 自動化システムの構築
```

#### 2.1 ワークフロー作成
- [ ] 夜間停止ワークフロー
- [ ] 朝の起動ワークフロー
- [ ] 手動実行機能
- [ ] 通知機能

```yaml
# 実装ワークフロー
.github/workflows/bot-schedule.yml
- 0:00 JST: 停止処理
- 7:00 JST: 起動処理
- 手動実行: 緊急対応
```

#### 2.2 セキュリティ実装
- [ ] 認証トークン生成
- [ ] GitHub Secrets設定
- [ ] 権限管理
- [ ] 監査ログ

### Phase 3: テスト・検証 (Week 4)
```
期間: 1週間
目標: 完全な動作検証
```

#### 3.1 単体テスト
- [ ] API エンドポイントテスト
- [ ] メッセージリカバリテスト
- [ ] データベース操作テスト
- [ ] エラーハンドリングテスト

#### 3.2 統合テスト
- [ ] 夜間サスペンドフローテスト
- [ ] 朝の起動フローテスト
- [ ] GitHub Actions動作テスト
- [ ] 障害復旧テスト

#### 3.3 負荷テスト
- [ ] 大量メッセージ処理テスト
- [ ] 並行処理テスト
- [ ] API制限テスト
- [ ] メモリ使用量テスト

### Phase 4: テンプレート化 (Week 5-6)
```
期間: 2週間
目標: オープンソース化とドキュメント整備
```

#### 4.1 コード汎用化
- [ ] 設定ファイル分離
- [ ] 環境変数化
- [ ] デフォルト値設定
- [ ] エラーメッセージ整備

#### 4.2 ドキュメント作成
- [ ] README.md更新
- [ ] セットアップガイド
- [ ] 設定リファレンス
- [ ] トラブルシューティング

#### 4.3 テンプレート設定
- [ ] .env.example作成
- [ ] fly.toml.example作成
- [ ] 自動セットアップスクリプト
- [ ] GitHub Actionsテンプレート

### Phase 5: 公開・運用 (Week 7)
```
期間: 1週間
目標: 一般公開と運用開始
```

#### 5.1 リポジトリ公開
- [ ] GitHub Template Repository設定
- [ ] ライセンス設定
- [ ] セキュリティ設定
- [ ] Issue・PRテンプレート

#### 5.2 運用監視
- [ ] 使用量監視
- [ ] エラー監視
- [ ] パフォーマンス監視
- [ ] ユーザーフィードバック収集

## 📊 各フェーズの詳細タスク

### Phase 1 詳細タスク

#### データベース拡張
```typescript
// 実装タスク
1. スキーマ設計レビュー
   - discord_message_idの重複処理
   - インデックス設計
   - パフォーマンス考慮

2. マイグレーション実装
   - 既存データの整合性確保
   - ロールバック機能
   - テストデータ作成

3. リポジトリ拡張
   - existsByDiscordMessageId()
   - getUnprocessedMessages()
   - saveSuspendState()
```

#### API実装
```typescript
// 実装優先度
Priority 1: /api/night-suspend
Priority 2: /api/wake-up
Priority 3: /api/morning-recovery
Priority 4: /api/suspend-status

// 品質要件
- レスポンス時間: < 5秒
- エラー率: < 1%
- 可用性: > 99%
```

### Phase 2 詳細タスク

#### GitHub Actions設計
```yaml
# ワークフロー要件
実行時間: < 5分
成功率: > 99%
通知機能: 失敗時のみ
リトライ: 3回まで

# 監視項目
- 実行時間
- 成功/失敗率
- API応答時間
- 通知送信状況
```

### Phase 3 詳細タスク

#### テスト戦略
```typescript
// テストカバレッジ目標
単体テスト: > 80%
統合テスト: > 60%
E2Eテスト: > 40%

// 重要テストケース
1. 夜間サスペンド正常系
2. 朝の起動・リカバリ正常系
3. ネットワーク障害時
4. Discord API制限時
5. 大量メッセージ処理時
```

## 🔧 技術スタック

### 開発環境
```
言語: TypeScript
フレームワーク: Discord.js v14
データベース: SQLite3
ホスティング: Fly.io
CI/CD: GitHub Actions
パッケージマネージャー: npm
```

### 依存関係
```json
{
  "dependencies": {
    "discord.js": "^14.0.0",
    "sqlite3": "^5.1.6",
    "express": "^4.18.0",
    "node-cron": "^3.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "supertest": "^6.0.0"
  }
}
```

## 🎯 品質保証

### コード品質
```typescript
// 品質指標
- TypeScript strict mode
- ESLint rule compliance
- Prettier formatting
- JSDoc documentation
- Unit test coverage > 80%
```

### パフォーマンス
```typescript
// パフォーマンス目標
- API応答時間: < 5秒
- メッセージ処理: < 1分/100件
- メモリ使用量: < 256MB
- 起動時間: < 60秒
```

### セキュリティ
```typescript
// セキュリティ要件
- 認証トークン必須
- HTTPS通信
- 環境変数での秘匿情報管理
- 入力値検証
- Rate limiting
```

## 📈 成功指標とKPI

### 技術指標
```
夜間サスペンド成功率: > 99%
メッセージリカバリ成功率: > 99%
API可用性: > 99.9%
平均応答時間: < 3秒
```

### ビジネス指標
```
コスト削減率: > 70%
ユーザー満足度: > 4.5/5
問題報告数: < 1件/月
導入ユーザー数: > 100人
```

### 運用指標
```
GitHub Actions使用量: 無料枠内
エラー発生率: < 1%
手動介入回数: < 1回/月
ドキュメント完成度: > 90%
```

## 🚨 リスク管理

### 技術リスク
```
Discord API制限:
- 影響度: 中
- 対策: レート制限対応、リトライ機能

GitHub Actions障害:
- 影響度: 低
- 対策: 手動実行機能、外部サービス併用

Fly.io障害:
- 影響度: 高
- 対策: 監視強化、自動復旧機能
```

### 運用リスク
```
大量ユーザー流入:
- 影響度: 中
- 対策: スケーラビリティ設計、監視体制

セキュリティ問題:
- 影響度: 高
- 対策: セキュリティ監査、脆弱性スキャン

サポート負荷:
- 影響度: 中
- 対策: ドキュメント充実、FAQ整備
```

## 📚 学習・研究項目

### 技術調査
```
Week 1-2:
- Discord.js v14 新機能調査
- Fly.io auto-suspend詳細調査
- GitHub Actions最新機能調査

Week 3-4:
- テスト戦略ベストプラクティス
- オープンソース運用ノウハウ
- コミュニティ管理手法
```

### 競合調査
```
類似プロジェクト:
- Discord activity bots
- GitHub Actions templates
- Fly.io deployment examples

ベストプラクティス:
- Template repository設計
- Multi-tenant architecture
- Cost optimization strategies
```

## 🎉 完了条件

### Phase 1 完了条件
- [ ] 全APIエンドポイントが正常動作
- [ ] データベーススキーマが完成
- [ ] 基本的なテストが全て通過
- [ ] ローカル環境での動作確認完了

### Phase 2 完了条件
- [ ] GitHub Actionsが正常実行
- [ ] 夜間サスペンドが自動動作
- [ ] 朝の起動・リカバリが正常動作
- [ ] 通知機能が正常動作

### Phase 3 完了条件
- [ ] 全テストが通過
- [ ] 負荷テストが完了
- [ ] 障害復旧テストが完了
- [ ] パフォーマンス要件を満たす

### Phase 4 完了条件
- [ ] テンプレートリポジトリが完成
- [ ] ドキュメントが完成
- [ ] セットアップスクリプトが動作
- [ ] 第三者による検証完了

### Phase 5 完了条件
- [ ] 公開リポジトリが利用可能
- [ ] 監視システムが稼働
- [ ] 初期ユーザーからのフィードバック収集
- [ ] 運用体制が確立

## 📝 次のアクション

### 即座に実行
1. **Phase 1開始**: データベーススキーマ設計
2. **環境準備**: 開発環境セットアップ
3. **タスク管理**: GitHub Projects設定

### 1週間以内
1. **詳細設計**: API仕様書作成
2. **テスト計画**: テストケース設計
3. **リスク評価**: リスク分析・対策策定

### 継続的実行
1. **進捗管理**: 週次進捗確認
2. **品質管理**: コードレビュー
3. **ドキュメント**: 実装と並行して整備

このロードマップに従って実装を進めることで、効率的で品質の高い夜間サスペンド機能を実現し、スケーラブルなオープンソースプロジェクトとして成功させることができます。