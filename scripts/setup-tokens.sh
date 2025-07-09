#!/bin/bash

# 夜間サスペンド機能用認証トークン生成・設定スクリプト

set -e

echo "🔐 夜間サスペンド機能用認証トークンの生成・設定"
echo "================================================"

# 関数: 安全なトークン生成
generate_token() {
    openssl rand -base64 32
}

# トークン生成
SHUTDOWN_TOKEN=$(generate_token)
WAKE_TOKEN=$(generate_token)
RECOVERY_TOKEN=$(generate_token)

echo "✅ 認証トークンを生成しました"
echo ""

# 環境変数の設定方法を表示
echo "📋 環境変数設定方法:"
echo "==================="
echo ""
echo "1. ローカル開発環境 (.env ファイル):"
echo "-----------------------------------"
echo "SHUTDOWN_TOKEN=\"$SHUTDOWN_TOKEN\""
echo "WAKE_TOKEN=\"$WAKE_TOKEN\""
echo "RECOVERY_TOKEN=\"$RECOVERY_TOKEN\""
echo ""

echo "2. Fly.io本番環境 (secrets設定):"
echo "--------------------------------"
echo "flyctl secrets set SHUTDOWN_TOKEN=\"$SHUTDOWN_TOKEN\""
echo "flyctl secrets set WAKE_TOKEN=\"$WAKE_TOKEN\""
echo "flyctl secrets set RECOVERY_TOKEN=\"$RECOVERY_TOKEN\""
echo ""

echo "3. GitHub Actions (Repository Secrets):"
echo "---------------------------------------"
echo "以下をGitHub Repository → Settings → Secrets and variables → Actions で設定:"
echo "SHUTDOWN_TOKEN: $SHUTDOWN_TOKEN"
echo "WAKE_TOKEN: $WAKE_TOKEN"
echo "RECOVERY_TOKEN: $RECOVERY_TOKEN"
echo ""

# 自動設定オプション
echo "🚀 自動設定オプション:"
echo "====================="
echo ""

read -p "ローカル .env ファイルを自動更新しますか? (y/n): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # .env ファイルが存在しない場合は .env.example をコピー
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            echo "✅ .env.example から .env ファイルを作成しました"
        else
            echo "❌ .env.example ファイルが見つかりません"
            exit 1
        fi
    fi
    
    # トークンを .env ファイルに設定
    sed -i.bak "s/SHUTDOWN_TOKEN=.*/SHUTDOWN_TOKEN=\"$SHUTDOWN_TOKEN\"/" .env
    sed -i.bak "s/WAKE_TOKEN=.*/WAKE_TOKEN=\"$WAKE_TOKEN\"/" .env
    sed -i.bak "s/RECOVERY_TOKEN=.*/RECOVERY_TOKEN=\"$RECOVERY_TOKEN\"/" .env
    
    # バックアップファイルを削除
    rm -f .env.bak
    
    echo "✅ .env ファイルにトークンを設定しました"
fi

echo ""
read -p "Fly.io本番環境に自動設定しますか? (y/n): " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Fly.io CLI の存在確認
    if ! command -v flyctl &> /dev/null; then
        echo "❌ flyctl コマンドが見つかりません"
        echo "💡 Fly.io CLI をインストールしてください: https://fly.io/docs/hands-on/install-flyctl/"
        exit 1
    fi
    
    # アプリ名の確認
    APP_NAME=$(grep "app = " fly.toml | cut -d"'" -f2)
    if [ -z "$APP_NAME" ]; then
        echo "❌ fly.toml からアプリ名を取得できませんでした"
        exit 1
    fi
    
    echo "📡 Fly.io アプリ '$APP_NAME' にトークンを設定中..."
    
    # Fly.io secrets設定
    flyctl secrets set SHUTDOWN_TOKEN="$SHUTDOWN_TOKEN" --app "$APP_NAME"
    flyctl secrets set WAKE_TOKEN="$WAKE_TOKEN" --app "$APP_NAME"
    flyctl secrets set RECOVERY_TOKEN="$RECOVERY_TOKEN" --app "$APP_NAME"
    
    echo "✅ Fly.io本番環境にトークンを設定しました"
fi

echo ""
echo "🎉 夜間サスペンド機能用認証トークンの設定が完了しました！"
echo ""
echo "🔒 セキュリティ上の注意:"
echo "• トークンは安全に保管してください"
echo "• 定期的にトークンを更新することを推奨します"
echo "• トークンが漏洩した場合は直ちに再生成してください"
echo ""
echo "📖 詳細な設定方法は docs/DEPLOYMENT.md を参照してください"