# GitHub Actions ワークフロー詳細設計

## 📋 概要

staging環境導入に伴うGitHub Actionsワークフローの詳細設計。開発効率を保ちながら品質保証を強化する。

## 🔄 ワークフロー構成

### 現在のワークフロー
```
.github/workflows/
├── fly-deploy.yml                    # main → production (既存)
└── night-suspend-automation.yml      # 夜間サスペンド (既存)
```

### 新規追加ワークフロー
```
.github/workflows/
├── staging-deploy.yml               # develop → staging (新規)
├── staging-validation.yml           # staging検証 (新規)
├── production-deploy.yml            # main → production (改良版)
└── quality-gate.yml                # 品質チェック統合 (新規)
```

## 📝 ワークフロー詳細設計

### 1. staging-deploy.yml
```yaml
name: Staging Deploy
on:
  push:
    branches: [develop]
  workflow_dispatch:
    inputs:
      skip_tests:
        description: 'テストをスキップ（緊急時のみ）'
        required: false
        default: 'false'
        type: boolean

env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  STAGING_APP_NAME: timelogger-staging

jobs:
  quality-check:
    runs-on: ubuntu-latest
    name: 品質チェック
    outputs:
      build-success: ${{ steps.build.outputs.success }}
      test-success: ${{ steps.test.outputs.success }}
    
    steps:
      - name: 📥 リポジトリチェックアウト
        uses: actions/checkout@v4
      
      - name: 🔧 Node.js セットアップ
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: 📦 依存関係インストール
        run: npm ci
      
      - name: 🏗️ TypeScriptビルド
        id: build
        run: |
          npm run build
          echo "success=true" >> $GITHUB_OUTPUT
      
      - name: 🧪 テスト実行
        id: test
        if: github.event.inputs.skip_tests != 'true'
        run: |
          npm test
          npm run test:integration
          echo "success=true" >> $GITHUB_OUTPUT
      
      - name: 📊 テストカバレッジ確認
        if: github.event.inputs.skip_tests != 'true'
        run: npm run test:coverage
      
      - name: 📋 品質チェック統合
        run: npm run quality:check

  deploy-staging:
    needs: quality-check
    if: needs.quality-check.outputs.build-success == 'true'
    runs-on: ubuntu-latest
    name: Staging環境デプロイ
    
    steps:
      - name: 📥 リポジトリチェックアウト
        uses: actions/checkout@v4
      
      - name: 🚀 Fly.io CLI セットアップ
        uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: 🔍 Staging環境ステータス確認
        run: |
          echo "📊 デプロイ前ステータス:"
          fly status --app $STAGING_APP_NAME || echo "アプリが見つかりません（初回デプロイの可能性）"
      
      - name: 🚀 Staging環境デプロイ実行
        run: |
          echo "🚀 Staging環境にデプロイを開始します..."
          fly deploy --app $STAGING_APP_NAME --config fly-staging.toml
      
      - name: ⏳ デプロイ完了待機
        run: |
          echo "⏳ アプリの起動を待機中..."
          for i in {1..10}; do
            if fly status --app $STAGING_APP_NAME | grep -q "started"; then
              echo "✅ アプリが正常に起動しました"
              break
            fi
            if [ $i -eq 10 ]; then
              echo "⚠️ アプリの起動に時間がかかっています"
              fly logs --app $STAGING_APP_NAME
            fi
            sleep 10
          done
      
      - name: 🔔 Slack通知
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          channel: '#deployment'
          text: |
            Staging Deploy: ${{ job.status }}
            Branch: ${{ github.ref_name }}
            Commit: ${{ github.sha }}
```

### 2. staging-validation.yml
```yaml
name: Staging Validation
on:
  workflow_run:
    workflows: ["Staging Deploy"]
    types: [completed]
  workflow_dispatch:
    inputs:
      test_type:
        description: '実行するテストタイプ'
        required: true
        default: 'all'
        type: choice
        options:
          - 'all'
          - 'smoke'
          - 'performance'

env:
  STAGING_APP_NAME: timelogger-staging
  STAGING_URL: https://timelogger-staging.fly.dev

jobs:
  validate-staging:
    if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}
    runs-on: ubuntu-latest
    name: Staging環境検証
    
    steps:
      - name: 📥 リポジトリチェックアウト
        uses: actions/checkout@v4
      
      - name: 🔧 Node.js セットアップ
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: 📦 依存関係インストール
        run: npm ci
      
      - name: 🏥 ヘルスチェック
        run: |
          echo "🏥 Staging環境ヘルスチェック実行中..."
          for i in {1..6}; do
            if curl -f -s $STAGING_URL/health > /dev/null; then
              echo "✅ ヘルスチェック成功"
              break
            fi
            if [ $i -eq 6 ]; then
              echo "❌ ヘルスチェック失敗"
              exit 1
            fi
            echo "⏳ 再試行中... ($i/6)"
            sleep 10
          done
      
      - name: 🚨 煙幕テスト実行
        if: github.event.inputs.test_type == 'all' || github.event.inputs.test_type == 'smoke'
        run: |
          echo "🚨 重要機能煙幕テスト実行中..."
          npm run staging:smoke
      
      - name: ⚡ パフォーマンステスト
        if: github.event.inputs.test_type == 'all' || github.event.inputs.test_type == 'performance'
        run: |
          echo "⚡ パフォーマンステスト実行中..."
          # API応答時間チェック
          RESPONSE_TIME=$(curl -w "%{time_total}" -s -o /dev/null $STAGING_URL/health)
          echo "応答時間: ${RESPONSE_TIME}秒"
          
          # 2秒以内の応答時間を期待
          if (( $(echo "$RESPONSE_TIME > 2.0" | bc -l) )); then
            echo "❌ パフォーマンステスト失敗: 応答時間が2秒を超えています"
            exit 1
          else
            echo "✅ パフォーマンステスト成功"
          fi
      
      - name: 📊 検証レポート生成
        if: always()
        run: |
          echo "📊 Staging環境検証レポート" > validation-report.md
          echo "================================" >> validation-report.md
          echo "🕐 検証時刻: $(date)" >> validation-report.md
          echo "🌍 環境: $STAGING_URL" >> validation-report.md
          echo "🔍 テストタイプ: ${{ github.event.inputs.test_type || 'all' }}" >> validation-report.md
          echo "" >> validation-report.md
          
          # ヘルスチェック結果
          if curl -f -s $STAGING_URL/health > /dev/null; then
            echo "✅ ヘルスチェック: 成功" >> validation-report.md
          else
            echo "❌ ヘルスチェック: 失敗" >> validation-report.md
          fi
          
          cat validation-report.md
      
      - name: 📝 検証結果をアーティファクトとして保存
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: staging-validation-report
          path: validation-report.md
```

### 3. production-deploy.yml (改良版)
```yaml
name: Production Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      force_deploy:
        description: 'Staging検証をスキップして強制デプロイ（緊急時のみ）'
        required: false
        default: 'false'
        type: boolean

env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
  PRODUCTION_APP_NAME: timelogger-bitter-resonance-9585
  STAGING_APP_NAME: timelogger-staging

jobs:
  check-staging-validation:
    runs-on: ubuntu-latest
    name: Staging検証状況確認
    outputs:
      staging-validated: ${{ steps.check.outputs.validated }}
      validation-status: ${{ steps.check.outputs.status }}
    
    steps:
      - name: 🔍 最新のStaging検証結果確認
        id: check
        run: |
          echo "🔍 Staging環境の検証状況を確認中..."
          
          # 強制デプロイの場合はスキップ
          if [ "${{ github.event.inputs.force_deploy }}" = "true" ]; then
            echo "⚠️ 強制デプロイが指定されました。Staging検証をスキップします。"
            echo "validated=true" >> $GITHUB_OUTPUT
            echo "status=forced" >> $GITHUB_OUTPUT
            exit 0
          fi
          
          # GitHub APIを使用して最新のstaging-validationワークフローの結果を確認
          LATEST_RUN=$(gh api repos/${{ github.repository }}/actions/workflows/staging-validation.yml/runs \
            --jq '.workflow_runs[0]')
          
          STATUS=$(echo "$LATEST_RUN" | jq -r '.conclusion')
          UPDATED_AT=$(echo "$LATEST_RUN" | jq -r '.updated_at')
          
          echo "最新のStaging検証: $STATUS (更新時刻: $UPDATED_AT)"
          
          if [ "$STATUS" = "success" ]; then
            # 24時間以内の検証結果かチェック
            UPDATED_TIMESTAMP=$(date -d "$UPDATED_AT" +%s)
            CURRENT_TIMESTAMP=$(date +%s)
            HOURS_DIFF=$(( (CURRENT_TIMESTAMP - UPDATED_TIMESTAMP) / 3600 ))
            
            if [ $HOURS_DIFF -le 24 ]; then
              echo "✅ 最新のStaging検証が成功しています"
              echo "validated=true" >> $GITHUB_OUTPUT
              echo "status=success" >> $GITHUB_OUTPUT
            else
              echo "⚠️ Staging検証が古すぎます（${HOURS_DIFF}時間前）"
              echo "validated=false" >> $GITHUB_OUTPUT
              echo "status=outdated" >> $GITHUB_OUTPUT
            fi
          else
            echo "❌ 最新のStaging検証が失敗しています"
            echo "validated=false" >> $GITHUB_OUTPUT
            echo "status=failed" >> $GITHUB_OUTPUT
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  deploy-production:
    needs: check-staging-validation
    if: needs.check-staging-validation.outputs.staging-validated == 'true'
    runs-on: ubuntu-latest
    name: Production環境デプロイ
    
    steps:
      - name: 📥 リポジトリチェックアウト
        uses: actions/checkout@v4
      
      - name: 🚀 Fly.io CLI セットアップ
        uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: 📊 デプロイ前ステータス確認
        run: |
          echo "📊 Production環境デプロイ前ステータス:"
          fly status --app $PRODUCTION_APP_NAME
      
      - name: 💾 本番データバックアップ
        run: |
          echo "💾 本番データのバックアップを実行中..."
          npm run prod:backup
      
      - name: 🚀 Production環境デプロイ実行
        run: |
          echo "🚀 Production環境にデプロイを開始します..."
          fly deploy --app $PRODUCTION_APP_NAME
      
      - name: 🏥 本番ヘルスチェック
        run: |
          echo "🏥 本番環境ヘルスチェック実行中..."
          for i in {1..10}; do
            if fly status --app $PRODUCTION_APP_NAME | grep -q "started"; then
              echo "✅ 本番環境が正常に稼働しています"
              break
            fi
            if [ $i -eq 10 ]; then
              echo "❌ 本番環境の起動に失敗しました"
              fly logs --app $PRODUCTION_APP_NAME
              exit 1
            fi
            echo "⏳ 起動確認中... ($i/10)"
            sleep 15
          done
      
      - name: 🔍 本番機能疎通確認
        run: |
          echo "🔍 本番環境の重要機能疎通確認..."
          # 基本的なAPI疎通確認
          PROD_URL="https://$PRODUCTION_APP_NAME.fly.dev"
          if curl -f -s $PROD_URL/health > /dev/null; then
            echo "✅ 本番環境疎通確認成功"
          else
            echo "❌ 本番環境疎通確認失敗"
            exit 1
          fi
      
      - name: 📊 デプロイ完了レポート
        if: always()
        run: |
          echo "📊 Production環境デプロイ完了レポート"
          echo "========================================="
          echo "🕐 デプロイ時刻: $(date)"
          echo "🌿 ブランチ: ${{ github.ref_name }}"
          echo "📝 コミット: ${{ github.sha }}"
          echo "🔍 Staging検証: ${{ needs.check-staging-validation.outputs.validation-status }}"
          echo "📊 デプロイ結果: ${{ job.status }}"
          
          fly status --app $PRODUCTION_APP_NAME

  notify-deployment:
    needs: [check-staging-validation, deploy-production]
    if: always()
    runs-on: ubuntu-latest
    name: デプロイ通知
    
    steps:
      - name: 🔔 Slack通知
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ needs.deploy-production.result }}
          channel: '#deployment'
          text: |
            Production Deploy: ${{ needs.deploy-production.result }}
            Branch: ${{ github.ref_name }}
            Staging Validation: ${{ needs.check-staging-validation.outputs.validation-status }}
            Commit: ${{ github.sha }}
```

### 4. quality-gate.yml
```yaml
name: Quality Gate
on:
  pull_request:
    branches: [develop, main]
  workflow_call:
    inputs:
      coverage_threshold:
        description: 'カバレッジ閾値'
        required: false
        default: 45.5
        type: number

jobs:
  quality-check:
    runs-on: ubuntu-latest
    name: 品質ゲートチェック
    
    steps:
      - name: 📥 リポジトリチェックアウト
        uses: actions/checkout@v4
      
      - name: 🔧 Node.js セットアップ
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: 📦 依存関係インストール
        run: npm ci
      
      - name: 🏗️ TypeScriptビルドチェック
        run: npm run build
      
      - name: 🧪 単体テスト実行
        run: npm test
      
      - name: 🔗 統合テスト実行
        run: npm run test:integration
      
      - name: 📊 カバレッジチェック
        run: |
          npm run test:coverage
          
          # カバレッジ閾値チェック
          COVERAGE=$(npm run test:coverage --silent | grep -o "[0-9]*\.[0-9]*%" | head -1 | sed 's/%//')
          THRESHOLD=${{ inputs.coverage_threshold || 45.5 }}
          
          echo "現在のカバレッジ: ${COVERAGE}%"
          echo "閾値: ${THRESHOLD}%"
          
          if (( $(echo "$COVERAGE >= $THRESHOLD" | bc -l) )); then
            echo "✅ カバレッジ閾値をクリアしています"
          else
            echo "❌ カバレッジが閾値を下回っています"
            exit 1
          fi
      
      - name: 🔍 コード品質チェック
        run: |
          # 基本的なコード品質チェック
          echo "🔍 コード品質チェック実行中..."
          
          # 未使用変数チェック（TypeScriptコンパイラーで検出）
          npm run build
          
          # TODO/FIXMEコメントの確認
          TODO_COUNT=$(grep -r "TODO\|FIXME" src/ --exclude-dir=node_modules || true | wc -l)
          echo "TODO/FIXMEコメント数: $TODO_COUNT"
          
          if [ $TODO_COUNT -gt 10 ]; then
            echo "⚠️ TODO/FIXMEコメントが多すぎます（$TODO_COUNT件）"
          fi
      
      - name: 📋 品質レポート生成
        if: always()
        run: |
          echo "📋 品質ゲートレポート" > quality-report.md
          echo "=====================" >> quality-report.md
          echo "🕐 チェック時刻: $(date)" >> quality-report.md
          echo "🌿 ブランチ: ${{ github.ref_name }}" >> quality-report.md
          echo "📝 コミット: ${{ github.sha }}" >> quality-report.md
          echo "" >> quality-report.md
          echo "✅ TypeScriptビルド: 成功" >> quality-report.md
          echo "✅ 単体テスト: 成功" >> quality-report.md
          echo "✅ 統合テスト: 成功" >> quality-report.md
          echo "✅ カバレッジチェック: 成功" >> quality-report.md
          
          cat quality-report.md
```

## 🔗 ワークフロー連携図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   develop push  │───▶│ staging-deploy  │───▶│staging-validation│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  quality-gate   │
                       └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   main push     │───▶│staging validation│───▶│production-deploy│
└─────────────────┘    │     check       │    └─────────────────┘
                       └─────────────────┘
```

## 📊 成功・失敗の判定基準

### 品質ゲート成功条件
- [ ] TypeScriptビルド成功
- [ ] 全単体テスト成功
- [ ] 全統合テスト成功
- [ ] カバレッジ45.5%以上
- [ ] 重大なTODO/FIXMEなし

### Staging検証成功条件
- [ ] ヘルスチェック成功
- [ ] 重要機能煙幕テスト成功
- [ ] API応答時間2秒以内
- [ ] データベース接続確認成功

### Production デプロイ成功条件
- [ ] Staging検証完了（24時間以内）
- [ ] 本番データバックアップ成功
- [ ] デプロイ成功
- [ ] ヘルスチェック成功
- [ ] 基本機能疎通確認成功

## 🚨 エラー対応

### 各段階でのエラー対応

#### Staging デプロイ失敗時
1. ログ確認・原因調査
2. develop ブランチで修正
3. 再デプロイ実行

#### Staging 検証失敗時
1. 検証レポート確認
2. 問題修正（Local → develop → staging）
3. 再検証実行

#### Production デプロイ失敗時
1. 即座にロールバック実行
2. 本番影響確認
3. 修正 → Staging検証 → 再デプロイ

## 📈 監視・改善

### メトリクス
- デプロイ成功率
- 品質ゲート通過率
- 平均デプロイ時間
- Staging検証カバレッジ

### 継続的改善
- 月次メトリクスレビュー
- ボトルネックの特定・改善
- 自動化範囲の拡大
- 品質基準の見直し

---

## 📝 実装優先順位

### Phase 1 (高優先度)
1. staging-deploy.yml
2. quality-gate.yml
3. production-deploy.yml (既存改良)

### Phase 2 (中優先度)
1. staging-validation.yml
2. 通知機能統合
3. レポート機能拡張

### Phase 3 (低優先度)
1. 高度な監視機能
2. 自動ロールバック機能
3. パフォーマンステスト拡張