# GitHub Actions ブランチ戦略明確化設計

## 📋 概要

GitHub Actionsの実行ログでブランチ名が混乱している問題を解決し、各ブランチから適切な環境へのデプロイを確実に行うための戦略設計。

## 🔍 現在の問題

### 確認された課題
1. **GitHub Actionsログでブランチ名が「develop」と表示される**
   - 実際の設定：fly-deploy.yml は `main` ブランチでトリガー
   - 手動実行（workflow_dispatch）時のデフォルトブランチ混乱
   - 実行履歴での表示が不明確

2. **ワークフロー名の不明確さ**
   - 現在：「Fly Deploy」→ どの環境か不明
   - 必要：環境別の明確な命名

3. **ブランチ戦略の文書化不足**
   - どのブランチがどの環境に対応するか不明確
   - 手動実行時の注意事項が不明

## 🎯 解決策

### 1. ワークフローファイルの明確化

#### A. 既存のfly-deploy.yml → production-deploy.yml
```yaml
name: Production Deploy  # 名前を明確に変更
on:
  push:
    branches:
      - main  # mainブランチのみ
  workflow_dispatch:
    inputs:
      confirm_production:
        description: '本番環境へのデプロイを確認してください'
        required: true
        default: false
        type: boolean
      environment:
        description: 'デプロイ環境'
        required: true
        default: 'production'
        type: choice
        options:
          - 'production'

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    environment: production  # GitHub環境保護
    
    steps:
      - name: 📊 デプロイ環境確認
        run: |
          echo "🌿 ブランチ: ${{ github.ref_name }}"
          echo "🏭 環境: production"
          echo "📱 アプリ: timelogger-bitter-resonance-9585"
          
      - name: ⚠️  本番デプロイ確認
        if: github.event.inputs.confirm_production != 'true' && github.event_name == 'workflow_dispatch'
        run: |
          echo "❌ 本番デプロイの確認が必要です"
          echo "confirm_production を true に設定してください"
          exit 1
```

#### B. 新規のstaging-deploy.yml
```yaml
name: Staging Deploy
on:
  push:
    branches:
      - develop  # developブランチのみ
  workflow_dispatch:
    inputs:
      environment:
        description: 'デプロイ環境'
        required: true
        default: 'staging'
        type: choice
        options:
          - 'staging'

jobs:
  deploy:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    environment: staging  # GitHub環境保護
    
    steps:
      - name: 📊 デプロイ環境確認
        run: |
          echo "🌿 ブランチ: ${{ github.ref_name }}"
          echo "🧪 環境: staging"
          echo "📱 アプリ: timelogger-staging"
```

### 2. GitHub環境保護設定

#### 環境設定 (GitHub Settings → Environments)
```
staging環境:
- Protection rules: なし（自動デプロイ）
- Secrets: STAGING_DISCORD_TOKEN, STAGING_GEMINI_API_KEY

production環境:
- Protection rules: Required reviewers（1人以上）
- Deployment branches: main ブランチのみ
- Secrets: DISCORD_TOKEN, GEMINI_API_KEY
```

### 3. ブランチ保護ルール強化

#### mainブランチ保護
```
- Require pull request reviews: 1人以上
- Require status checks: staging-deploy workflow成功
- Require branches to be up to date: ON
- Restrict pushes to matching branches: ON
```

#### developブランチ保護
```
- Require pull request reviews: （個人開発では任意）
- Allow force pushes: OFF
- Allow deletions: OFF
```

## 🔄 新しいリリースフロー

### 標準的な開発フロー
```
1. feature/xxx ブランチで開発
   ↓
2. feature/xxx → develop へPR・マージ
   ↓ (自動トリガー)
3. develop ブランチ → staging環境デプロイ
   ↓
4. staging環境での検証・テスト
   ↓
5. develop → main へPR・マージ
   ↓ (自動トリガー)
6. main ブランチ → production環境デプロイ
```

### ワークフロー実行結果の明確化
```
GitHub Actions履歴での表示:
✅ Staging Deploy - develop ブランチ
✅ Production Deploy - main ブランチ
```

## 📝 実装チェックリスト

### Phase 1: ワークフローファイル更新
- [ ] fly-deploy.yml → production-deploy.yml にリネーム
- [ ] production-deploy.yml の内容を明確化
- [ ] staging-deploy.yml を新規作成
- [ ] 各ワークフローにブランチ情報の明示的表示を追加

### Phase 2: GitHub設定
- [ ] GitHub環境（staging/production）を作成
- [ ] 環境保護ルールを設定
- [ ] ブランチ保護ルールを強化
- [ ] 環境別シークレットを設定

### Phase 3: ドキュメント更新
- [ ] README.mdにブランチ戦略を追記
- [ ] CLAUDE.mdのリリースフロー説明を更新
- [ ] 開発チームへの周知（個人開発では省略）

## 🚨 注意事項

### 手動実行時の注意
1. **ブランチの確認**
   - workflow_dispatch実行時は必ず対象ブランチを確認
   - staging: developブランチから実行
   - production: mainブランチから実行

2. **環境の確認**
   - 各ワークフローの環境設定を明確に表示
   - 実行前に対象環境を再確認

### 緊急時の対応
```bash
# 緊急時の本番デプロイ（staging検証スキップ）
# production-deploy.yml の force_deploy オプション使用
# または直接 fly deploy コマンド実行
```

## 📊 効果測定

### 期待される改善
1. **明確性の向上**
   - ワークフロー実行ログで環境・ブランチが明確
   - 誤デプロイのリスク削減

2. **安全性の向上**
   - 環境保護ルールによる誤操作防止
   - staging検証必須化

3. **トレーサビリティの向上**
   - どのブランチからどの環境にデプロイしたか追跡可能
   - デプロイ履歴の明確化

### 監視指標
- 誤デプロイ件数：月0件
- staging検証スキップ率：5%以下
- ワークフロー実行成功率：95%以上

## 🔗 関連ドキュメント

- [github-actions-workflows-design.md](./github-actions-workflows-design.md) - ワークフロー詳細設計
- [staging-environment-design.md](./staging-environment-design.md) - メイン設計書

---

## 📝 実装ロードマップ

### 即座に実装（今回のコミット）
1. ✅ ブランチ戦略の文書化
2. ✅ 問題の明確化と解決策の設計

### 次回実装（次のPR）
1. ワークフローファイルのリネーム・更新
2. GitHub環境・保護ルール設定
3. ドキュメント更新

この設計により、GitHub Actionsの実行ログでブランチ名が混乱する問題が解決され、明確な環境別デプロイが実現されます。