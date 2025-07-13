# Staging環境構成とリリースフロー設計書

## 📋 概要

本番デプロイ時の障害を防ぐため、個人開発における3層環境（Local → Staging → Production）とリリースフローを設計する。

### 🎯 解決する課題
- 本番デプロイ時の障害発生
- fly.io環境での事前検証不足
- develop → main直接マージによるリスク
- 環境差異による予期しない問題

## 🏗️ システム構成設計

### 環境概要

#### 1. **Local環境** (開発者端末)
```bash
# 用途
- TDD開発（Red-Green-Refactorサイクル）
- 単体テスト実行
- 機能実装とデバッグ
- 統合テスト（ローカルDB）

# 主要コマンド
npm run dev          # 開発モードで実行
npm run test:watch   # TDDウォッチモード
npm run dev:test     # 開発環境テスト
```

#### 2. **Staging環境** (fly.io)
```bash
# アプリ名: timelogger-staging
# 用途
- fly.io環境での統合テスト
- 本番前検証（重要機能の動作確認）
- パフォーマンステスト
- 環境変数・設定の動作確認

# タイムゾーン
- Asia/Kolkata（開発者の現在地に合わせて設定）

# データベース戦略
- 完全分離DB（timelogger_staging_data volume）
- テストデータ生成 + 必要時の匿名化本番データクローン
```

#### 3. **Production環境** (fly.io)
```bash
# アプリ名: timelogger-bitter-resonance-9585
# 用途
- 実際のDiscord Bot運用
- 本番データ蓄積
- ユーザー向けサービス提供
```

### インフラ構成

#### Staging環境詳細
```toml
# fly-staging.toml
app = 'timelogger-staging'
primary_region = 'nrt'
kill_signal = 'SIGINT'
kill_timeout = '5s'

[env]
  NODE_ENV = 'staging'
  TZ = 'Asia/Tokyo'
  PORT = '3000'

[[mounts]]
  source = 'timelogger_staging_data'
  destination = '/app/data'

# 費用最適化設定
[http_service]
  auto_stop_machines = true   # 未使用時自動停止
  auto_start_machines = true  # リクエスト時自動起動
  min_machines_running = 0    # 最小稼働台数0
```

#### データベース戦略

**基本方針: 分離 + 選択的クローン**

```bash
# 1. 日常開発用（軽量テストデータ）
scripts/staging/generate-test-data.js
- 匿名化されたサンプルデータ
- エッジケースを含むテストデータ
- マイグレーションテスト用データ

# 2. 重要リリース前（本番データクローン）
scripts/staging/clone-production-data.sh
- 個人情報の匿名化処理
- 最近のデータのみ（過去30日分）
- 重要なマイグレーション前のみ実行
```

## 🔄 リリースフロー設計

### ブランチ戦略
```
feature/* → develop → (staging検証) → main → production
```

### 詳細フロー

#### Phase 1: 開発・テスト段階
```bash
1. ローカル開発 (feature/xxx ブランチ)
   ├── TDD開発 (Red-Green-Refactor)
   ├── 単体テスト完了
   └── ローカル統合テスト完了

2. develop ブランチマージ
   ├── プルリクエスト作成
   ├── コードレビュー（個人開発では省略可）
   └── develop ブランチマージ
```

#### Phase 2: Staging検証段階
```bash
3. staging環境自動デプロイ (GitHub Actions)
   ├── develop ブランチpush → staging環境デプロイ
   ├── ビルド・テスト自動実行
   └── デプロイ成功通知

4. staging環境検証
   ├── 自動テスト実行
   │   ├── 重要機能煙幕テスト (!cost, !summary等)
   │   ├── API疎通確認
   │   └── データベース接続確認
   ├── 手動検証
   │   ├── Discord Bot動作確認
   │   ├── 新機能動作確認
   │   └── パフォーマンス確認
   └── 検証結果記録
```

#### Phase 3: 本番リリース段階
```bash
5. main ブランチマージ (staging検証完了後)
   ├── develop → main プルリクエスト
   ├── staging検証結果確認
   └── main ブランチマージ

6. production環境デプロイ
   ├── main ブランチpush → production環境デプロイ
   ├── 自動デプロイ実行
   ├── 本番環境ヘルスチェック
   └── デプロイ完了通知
```

### 品質ゲート

#### 各段階での必須チェック項目

**Local環境 (develop マージ前)**
- [ ] TDDサイクル完了（Red-Green-Refactor）
- [ ] 全単体テスト成功
- [ ] TypeScriptコンパイル成功
- [ ] カバレッジ45.5%以上維持

**Staging環境 (main マージ前)**
- [ ] 自動テスト成功
- [ ] 重要機能動作確認
  - [ ] `!cost` - API費用レポート表示
  - [ ] `!summary` - 今日のサマリー表示
  - [ ] `!timezone` - タイムゾーン設定
  - [ ] `!edit [ID]` - ログ編集機能
  - [ ] `!logs` - ログ一覧表示
- [ ] データベースマイグレーション確認
- [ ] パフォーマンス確認（応答時間2秒以内）

**Production環境 (デプロイ後)**
- [ ] ヘルスチェック成功
- [ ] 重要機能疎通確認
- [ ] ログエラー監視（30分間）

## 🤖 GitHub Actions ワークフロー設計

### 1. staging-deploy.yml
```yaml
# トリガー: develop ブランチpush
name: Staging Deploy
on:
  push:
    branches: [develop]
  workflow_dispatch:

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - name: ✅ 品質チェック
        run: |
          npm ci
          npm run build
          npm test
          npm run test:integration
      
      - name: 🚀 Staging環境デプロイ
        run: flyctl deploy --app timelogger-staging
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      
      - name: 🔍 煙幕テスト実行
        run: npm run staging:smoke-test
```

### 2. staging-validation.yml
```yaml
# トリガー: staging デプロイ後
name: Staging Validation
on:
  workflow_run:
    workflows: ["Staging Deploy"]
    types: [completed]

jobs:
  validate-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - name: 🔍 重要機能テスト
        run: |
          # Discord Bot API疎通確認
          # 重要コマンド動作確認
          # データベース接続確認
      
      - name: 📊 パフォーマンステスト
        run: npm run staging:performance-test
      
      - name: 📝 検証レポート生成
        run: npm run staging:generate-report
```

### 3. production-deploy.yml (改良版)
```yaml
# トリガー: main ブランチpush (staging検証完了後のみ)
name: Production Deploy
on:
  push:
    branches: [main]

jobs:
  check-staging-validation:
    runs-on: ubuntu-latest
    outputs:
      staging-validated: ${{ steps.check.outputs.validated }}
    steps:
      - name: 🔍 Staging検証状況確認
        id: check
        run: |
          # staging環境の最新検証結果確認
          # 必要な品質ゲートクリア確認
  
  deploy-production:
    needs: check-staging-validation
    if: needs.check-staging-validation.outputs.staging-validated == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: 🚀 Production環境デプロイ
        run: flyctl deploy --app timelogger-bitter-resonance-9585
      
      - name: 🏥 本番ヘルスチェック
        run: npm run production:health-check
```

## 🛠️ 運用・監視設計

### Staging環境運用

#### コスト最適化
```bash
# 自動suspend設定
- 夜間自動停止（本番同様のスケジュール設定）
- 未使用時自動停止（5分間アクセスなし）
- 開発時間外は完全停止

# 推定コスト
- マシン稼働: 月$5-10程度
- ストレージ: 月$1-2程度
```

#### 監視・ログ
```bash
# ログ確認
fly logs --app timelogger-staging

# ステータス確認
fly status --app timelogger-staging

# パフォーマンス監視
npm run staging:monitor
```

### データ管理

#### テストデータ生成
```javascript
// scripts/staging/generate-test-data.js
const testData = {
  users: [
    { discord_id: 'test_user_1', timezone: 'Asia/Tokyo' },
    // ...匿名化されたテストユーザー
  ],
  activities: [
    { content: 'テスト活動1', timestamp: '...' },
    // ...様々なパターンのテスト活動
  ]
};
```

#### 本番データクローン（重要リリース時）
```bash
# scripts/staging/clone-production-data.sh
#!/bin/bash
# 1. 本番DBバックアップ
# 2. 個人情報匿名化
# 3. staging環境復元
# 4. 検証実行
# 5. 検証後データクリア
```

## 📋 移行計画

### Phase 1: Staging環境構築 (1-2日)
```bash
✅ 作業項目:
- [ ] fly.io staging アプリ作成
- [ ] staging環境設定ファイル作成
- [ ] GitHub Actions ワークフロー作成
- [ ] テストデータ生成スクリプト作成
- [ ] staging環境デプロイ・動作確認
```

### Phase 2: リリースフロー統合 (1日)
```bash
✅ 作業項目:
- [ ] package.json スクリプト追加
- [ ] 品質ゲート実装
- [ ] 煙幕テスト作成
- [ ] パフォーマンステスト作成
- [ ] ドキュメント整備
```

### Phase 3: 運用開始・改善 (継続)
```bash
✅ 作業項目:
- [ ] 実際のdevelop → staging → production フロー実行
- [ ] 監視・アラート設定
- [ ] コスト最適化調整
- [ ] プロセス改善・自動化拡張
```

## 🚨 リスク管理

### 想定リスク・対策

#### 1. Staging環境コスト超過
**リスク**: 予期しないコスト発生
**対策**: 
- 自動suspend設定の徹底
- 月次コスト監視アラート
- 使用後の手動停止習慣

#### 2. Staging/Production環境差異
**リスク**: staging OKでも本番NG
**対策**:
- 環境設定の同期管理
- 本番データでの定期的な検証
- インフラ構成の定期確認

#### 3. デプロイフロー複雑化
**リスク**: 開発効率の低下
**対策**:
- 自動化の徹底
- 明確なチェックリスト
- エラー時の迅速なロールバック手順

### 緊急時対応

#### ロールバック手順
```bash
# Staging環境問題時
1. 前バージョンにロールバック
2. 問題調査・修正
3. 再テスト・デプロイ

# Production環境問題時
1. 即座に前安定版にロールバック
2. 本番影響の最小化
3. Staging環境での問題再現・修正
```

## 📈 成功指標

### 運用開始後の評価指標

#### 品質向上
- [ ] 本番デプロイ成功率: 95%以上
- [ ] 本番障害件数: 月1件以下
- [ ] 重要機能の回帰バグ: ゼロ

#### 効率性
- [ ] develop → production 平均リードタイム: 1日以内
- [ ] staging検証時間: 30分以内
- [ ] 自動化率: 80%以上

#### コスト効率
- [ ] staging環境月次コスト: $20以下
- [ ] 障害対応工数削減: 50%以上

---

## 📝 まとめ

本設計により、個人開発でありながら企業レベルの品質保証プロセスを構築し、本番デプロイの安全性を大幅に向上させる。

### 次のステップ
1. ✅ 本設計書のレビュー・承認
2. 🚀 Phase 1実装開始
3. 📊 運用開始・効果測定
4. 🔄 継続的改善

**重要**: 個人開発の効率性を損なうことなく、確実に品質向上を実現する運用を目指す。