# テンプレートリポジトリ化とオープンソース戦略

## 📋 概要

Discord Bot TimeLoggerを汎用的なテンプレートリポジトリとして公開し、各ユーザーが独立してデプロイ・運用できるオープンソースプロジェクトとして整備する。

## 🎯 目的

- **オープンソース化**: 誰でも利用可能なテンプレートリポジトリ
- **プライバシー保護**: 個人情報の完全分離
- **スケーラビリティ**: 無制限ユーザー対応
- **コスト効率**: GitHub Actions無料枠での運用

## 🏗️ リポジトリ構成

### ディレクトリ構造
```
TimeLogger/
├── src/                      # アプリケーションソース
├── .github/
│   ├── workflows/
│   │   ├── bot-schedule.yml      # 夜間サスペンド用
│   │   ├── deploy.yml            # デプロイ用
│   │   └── health-check.yml      # 死活監視用
│   └── ISSUE_TEMPLATE/           # Issue テンプレート
├── docs/
│   ├── setup-guide.md           # セットアップガイド
│   ├── deployment.md            # デプロイ手順
│   ├── configuration.md         # 設定方法
│   └── troubleshooting.md       # トラブルシューティング
├── scripts/
│   ├── setup.sh                 # 自動セットアップ
│   └── migrate.sh               # データベース移行
├── .env.example                 # 環境変数テンプレート
├── config.example.js            # 設定ファイルテンプレート
├── fly.toml.example             # Fly.io設定テンプレート
├── README.md                    # プロジェクト概要
└── LICENSE                      # ライセンス
```

## 📄 設定ファイルテンプレート

### .env.example
```bash
# ==============================================
# Discord Bot Configuration
# ==============================================
NODE_ENV=production
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
TARGET_USER_ID=your_discord_user_id_here

# ==============================================
# Google Gemini API Configuration
# ==============================================
GOOGLE_API_KEY=your_google_gemini_api_key_here

# ==============================================
# Database Configuration
# ==============================================
DATABASE_PATH=./data/activity_logs.db

# ==============================================
# Timezone Configuration
# ==============================================
USER_TIMEZONE=Asia/Tokyo

# ==============================================
# Night Suspend Configuration
# ==============================================
NIGHT_SUSPEND_ENABLED=true
NIGHT_SUSPEND_START=0    # Hour (0-23)
NIGHT_SUSPEND_END=7      # Hour (0-23)

# ==============================================
# GitHub Actions Tokens (for night suspend)
# ==============================================
SHUTDOWN_TOKEN=your_secure_shutdown_token_here
WAKE_TOKEN=your_secure_wake_token_here
RECOVERY_TOKEN=your_secure_recovery_token_here

# ==============================================
# Fly.io Configuration
# ==============================================
FLY_APP_NAME=your-app-name
FLY_REGION=nrt  # Tokyo region

# ==============================================
# Notification Configuration
# ==============================================
DISCORD_WEBHOOK_URL=your_discord_webhook_url_here
```

### fly.toml.example
```toml
# fly.toml app configuration file
app = "YOUR_APP_NAME"  # Replace with your actual app name
primary_region = "nrt"  # Tokyo region

[build]
  image = "node:18-alpine"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[mounts]
  source = "data"
  destination = "/app/data"
```

## 🔧 GitHub Actions テンプレート

### .github/workflows/bot-schedule.yml
```yaml
name: Discord Bot Schedule Management

on:
  schedule:
    # JST 0:00 = UTC 15:00 (Stop)
    - cron: '0 15 * * *'
    # JST 7:00 = UTC 22:00 (Start)
    - cron: '0 22 * * *'
  workflow_dispatch:
    inputs:
      action:
        description: 'Action to perform'
        required: true
        default: 'status'
        type: choice
        options:
          - start
          - stop
          - status

jobs:
  manage-bot:
    runs-on: ubuntu-latest
    
    steps:
      - name: Determine action
        id: action
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "ACTION=${{ inputs.action }}" >> $GITHUB_OUTPUT
          else
            HOUR=$(date -u +%H)
            if [ "$HOUR" = "15" ]; then
              echo "ACTION=stop" >> $GITHUB_OUTPUT
            elif [ "$HOUR" = "22" ]; then
              echo "ACTION=start" >> $GITHUB_OUTPUT
            else
              echo "ACTION=status" >> $GITHUB_OUTPUT
            fi
          fi
      
      - name: Stop Bot (0:00 JST)
        if: steps.action.outputs.ACTION == 'stop'
        run: |
          echo "🌙 Stopping Discord bot for night suspension..."
          
          response=$(curl -s -X POST https://${{ secrets.FLY_APP_NAME }}.fly.dev/api/night-suspend \
            -H "Authorization: Bearer ${{ secrets.SHUTDOWN_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"action": "prepare_suspend"}')
          
          echo "Shutdown response: $response"
          
          sleep 30
          
          if curl -s -f https://${{ secrets.FLY_APP_NAME }}.fly.dev/health > /dev/null; then
            echo "⚠️ App is still running - this is expected for graceful shutdown"
          else
            echo "✅ App has been suspended"
          fi
      
      - name: Start Bot & Recovery (7:00 JST)
        if: steps.action.outputs.ACTION == 'start'
        run: |
          echo "🌅 Starting Discord bot with morning recovery..."
          
          # Wake up the app
          curl -s -X GET https://${{ secrets.FLY_APP_NAME }}.fly.dev/health || true
          
          # Wait for app to be ready
          for i in {1..24}; do
            if curl -s -f https://${{ secrets.FLY_APP_NAME }}.fly.dev/health > /dev/null; then
              echo "✅ App is running!"
              break
            fi
            echo "Waiting for app to start... ($i/24)"
            sleep 5
          done
          
          # Trigger message recovery
          recovery_response=$(curl -s -X POST https://${{ secrets.FLY_APP_NAME }}.fly.dev/api/morning-recovery \
            -H "Authorization: Bearer ${{ secrets.RECOVERY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"trigger": "github_actions"}')
          
          echo "Recovery response: $recovery_response"
      
      - name: Health Check
        if: steps.action.outputs.ACTION == 'status'
        run: |
          echo "🔍 Checking bot health..."
          
          if curl -s -f https://${{ secrets.FLY_APP_NAME }}.fly.dev/health > /dev/null; then
            echo "✅ Bot is healthy"
          else
            echo "❌ Bot is not responding"
            exit 1
          fi
      
      - name: Send notification
        if: failure()
        run: |
          curl -s -X POST ${{ secrets.DISCORD_WEBHOOK_URL }} \
            -H "Content-Type: application/json" \
            -d "{
              \"embeds\": [{
                \"title\": \"❌ Bot Schedule Action Failed\",
                \"description\": \"Action: ${{ steps.action.outputs.ACTION }}\\nCheck the logs for details.\",
                \"color\": 15158332,
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"
              }]
            }"
```

## 📚 ドキュメント

### README.md テンプレート
```markdown
# Discord Activity Logger Bot

A Discord bot that automatically logs your activities and manages TODOs with AI-powered analysis.

## ✨ Features

- 🤖 **AI-Powered Analysis**: Automatic activity categorization using Google Gemini
- 📋 **TODO Management**: Smart TODO creation and management
- 🌙 **Night Suspend**: Automatic cost-saving suspension (0:00-7:00 JST)
- 📊 **Smart Summaries**: Daily activity summaries
- 🔍 **Message Recovery**: Processes messages sent during suspension
- 💰 **Cost Efficient**: Optimized for minimal hosting costs

## 🚀 Quick Start

### 1. Use This Template

Click the "Use this template" button to create your own copy of this repository.

### 2. Set Up Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" tab and create a bot
4. Copy the bot token
5. Enable "Message Content Intent" in Bot settings

### 3. Set Up Google Gemini

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Copy the API key

### 4. Configure Environment

1. Copy `.env.example` to `.env`
2. Fill in all required values:
   ```bash
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_client_id
   TARGET_USER_ID=your_user_id
   GOOGLE_API_KEY=your_gemini_key
   ```

### 5. Deploy to Fly.io

1. Install [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/)
2. Login: `fly auth login`
3. Copy `fly.toml.example` to `fly.toml`
4. Update app name in `fly.toml`
5. Deploy: `fly deploy`

### 6. Set Up GitHub Actions (Optional)

For automatic night suspension:

1. Go to your repository's Settings → Secrets
2. Add the following secrets:
   - `FLY_APP_NAME`: Your Fly.io app name
   - `SHUTDOWN_TOKEN`: Random secure token
   - `WAKE_TOKEN`: Random secure token
   - `RECOVERY_TOKEN`: Random secure token
   - `DISCORD_WEBHOOK_URL`: Discord webhook for notifications

## 📖 Documentation

- [Setup Guide](docs/setup-guide.md)
- [Deployment Guide](docs/deployment.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

## 💰 Cost Optimization

With night suspension enabled:
- **Fly.io**: ~$1-2/month (70% savings)
- **GitHub Actions**: Free (unlimited for public repos)
- **APIs**: Pay-per-use

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```

## 🔒 セキュリティ考慮事項

### 個人情報の分離
```javascript
// config.js - 設定ファイル例
export const createConfig = () => ({
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    targetUserId: process.env.TARGET_USER_ID,
  },
  
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY,
  },
  
  database: {
    path: process.env.DATABASE_PATH || './data/activity_logs.db',
  },
  
  nightSuspend: {
    enabled: process.env.NIGHT_SUSPEND_ENABLED === 'true',
    startHour: parseInt(process.env.NIGHT_SUSPEND_START || '0'),
    endHour: parseInt(process.env.NIGHT_SUSPEND_END || '7'),
  },
  
  // デフォルト値は環境変数で上書き可能
  app: {
    timezone: process.env.USER_TIMEZONE || 'Asia/Tokyo',
    port: process.env.PORT || '8080',
  },
});
```

### GitHub Secrets管理
```yaml
# 必須シークレット
secrets:
  - DISCORD_TOKEN
  - DISCORD_CLIENT_ID
  - TARGET_USER_ID
  - GOOGLE_API_KEY
  - FLY_APP_NAME
  
# 夜間サスペンド用（オプション）
optional_secrets:
  - SHUTDOWN_TOKEN
  - WAKE_TOKEN
  - RECOVERY_TOKEN
  - DISCORD_WEBHOOK_URL
```

## 🛠️ 自動セットアップスクリプト

### scripts/setup.sh
```bash
#!/bin/bash

echo "🚀 Discord Activity Logger Bot Setup"
echo "===================================="

# 環境変数ファイルの生成
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "✅ .env file created. Please edit it with your credentials."
else
  echo "⚠️ .env file already exists."
fi

# Fly.io設定ファイルの生成
if [ ! -f fly.toml ]; then
  echo "📝 Creating fly.toml file..."
  cp fly.toml.example fly.toml
  echo "✅ fly.toml file created. Please update the app name."
else
  echo "⚠️ fly.toml file already exists."
fi

# 依存関係のインストール
echo "📦 Installing dependencies..."
npm install

# データベースディレクトリの作成
echo "📁 Creating database directory..."
mkdir -p data

# 設定確認
echo ""
echo "📋 Next Steps:"
echo "1. Edit .env file with your credentials"
echo "2. Edit fly.toml with your app name"
echo "3. Run 'npm run dev' to test locally"
echo "4. Run 'fly deploy' to deploy to Fly.io"
echo ""
echo "📚 See docs/setup-guide.md for detailed instructions"
```

## 📊 使用統計・分析

### 使用量追跡
```typescript
// Optional analytics (privacy-focused)
interface UsageStats {
  totalUsers: number;
  activeUsers: number;
  messageCount: number;
  suspensionSavings: number;
  
  // 個人情報は含まない
  anonymizedMetrics: {
    averageMessagesPerUser: number;
    popularTimezones: string[];
    suspensionEffectiveness: number;
  };
}
```

### プライバシー保護
```typescript
// データの匿名化
class AnonymizedAnalytics {
  static hashUserId(userId: string): string {
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }
  
  static collectAnonymizedStats(logs: ActivityLog[]): UsageStats {
    // 個人を特定できない統計のみ収集
    return {
      totalMessages: logs.length,
      averageLength: logs.reduce((sum, log) => sum + log.content.length, 0) / logs.length,
      popularHours: this.getPopularHours(logs),
      // userIdは含まない
    };
  }
}
```

## 🔄 アップデート戦略

### バージョン管理
```json
{
  "version": "1.0.0",
  "templateVersion": "1.0.0",
  "compatibility": {
    "minimumNodeVersion": "18.0.0",
    "flyioRuntime": "node:18-alpine"
  }
}
```

### 自動更新通知
```typescript
// Optional update checker
class UpdateChecker {
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const response = await fetch('https://api.github.com/repos/owner/TimeLogger/releases/latest');
      const latest = await response.json();
      
      const currentVersion = require('./package.json').version;
      
      if (this.isNewerVersion(latest.tag_name, currentVersion)) {
        return {
          version: latest.tag_name,
          releaseNotes: latest.body,
          downloadUrl: latest.html_url
        };
      }
      
      return null;
    } catch (error) {
      console.warn('Update check failed:', error);
      return null;
    }
  }
}
```

## 🎯 テンプレートリポジトリ設定

### GitHub設定
```yaml
# .github/settings.yml
repository:
  name: TimeLogger
  description: "Discord Activity Logger Bot Template"
  topics:
    - discord
    - bot
    - activity-tracker
    - todo-management
    - ai-powered
    - fly-io
    - github-actions
  
  is_template: true
  default_branch: main
  
  allow_merge_commit: true
  allow_squash_merge: true
  allow_rebase_merge: false
  
  enable_issues: true
  enable_projects: true
  enable_wiki: true
  
  enable_vulnerability_alerts: true
  enable_automated_security_fixes: true
```

### Issue テンプレート
```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Report a bug in the Discord Activity Logger Bot
title: "[Bug] "
labels: ["bug", "needs-triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting a bug! Please provide as much detail as possible.
  
  - type: dropdown
    id: environment
    attributes:
      label: Environment
      options:
        - Local development
        - Fly.io deployment
        - GitHub Actions
    validations:
      required: true
  
  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: A clear description of what the bug is.
    validations:
      required: true
  
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Steps to reproduce the behavior.
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true
  
  - type: textarea
    id: logs
    attributes:
      label: Logs
      description: Relevant log output (remove sensitive information).
      render: shell
```

## 🤝 コミュニティ・サポート

### 貢献ガイドライン
```markdown
# Contributing to Discord Activity Logger Bot

We welcome contributions! Here's how you can help:

## 🐛 Bug Reports
- Use the bug report template
- Include detailed reproduction steps
- Remove sensitive information from logs

## 💡 Feature Requests
- Use the feature request template
- Explain the use case
- Consider implementation complexity

## 🔧 Code Contributions
- Fork the repository
- Create a feature branch
- Write tests for new functionality
- Submit a pull request

## 📚 Documentation
- Improve setup guides
- Add troubleshooting tips
- Update configuration examples

## 🎯 Development Setup
1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env`
4. Start with `npm run dev`

## 📝 Code Style
- Use TypeScript
- Follow ESLint rules
- Write meaningful commit messages
- Add JSDoc comments for public APIs
```

## 🔍 品質保証

### テストカバレッジ
```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

### 品質チェック
```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "type-check": "tsc --noEmit",
    "pre-commit": "npm run lint && npm run type-check && npm run test"
  }
}
```

これらの設定により、Discord Activity Logger Botを汎用的で使いやすいテンプレートリポジトリとして提供し、多くのユーザーが独立してデプロイ・運用できるオープンソースプロジェクトとして成長させることができます。