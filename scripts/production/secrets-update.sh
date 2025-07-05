#!/bin/bash

# 本番環境 環境変数更新スクリプト
APP_NAME="timelogger-bitter-resonance-9585"

echo "🔐 本番環境の環境変数を更新します"
echo "🌐 アプリ: $APP_NAME"

# .env.production.example ファイルの存在確認
if [ ! -f ".env.production.example" ]; then
    echo "❌ エラー: .env.production.example ファイルが見つかりません"
    echo "📝 環境変数の例ファイルを作成してください"
    exit 1
fi

echo ""
echo "📝 設定可能な環境変数一覧:"
echo "----------------------------------------"
grep -v "^#" .env.production.example | grep -v "^$" | cut -d'=' -f1 | sort
echo "----------------------------------------"

echo ""
echo "🔧 環境変数を個別に設定します"
echo "📌 現在の環境変数一覧:"
fly secrets list --app "$APP_NAME"

echo ""
echo "💡 使用方法:"
echo "  1. 設定したい環境変数名を入力"
echo "  2. 値を入力（入力内容は表示されません）"
echo "  3. 'done' を入力して完了"
echo ""

while true; do
    echo -n "環境変数名を入力 (done で終了): "
    read key
    
    if [ "$key" = "done" ]; then
        break
    fi
    
    if [ -z "$key" ]; then
        echo "❌ 環境変数名を入力してください"
        continue
    fi
    
    echo -n "値を入力: "
    read -s value
    echo ""
    
    if [ -z "$value" ]; then
        echo "❌ 値を入力してください"
        continue
    fi
    
    echo "🔄 設定中: $key"
    fly secrets set "$key=$value" --app "$APP_NAME"
    
    if [ $? -eq 0 ]; then
        echo "✅ $key を設定しました"
    else
        echo "❌ $key の設定に失敗しました"
    fi
    echo ""
done

echo "📤 環境変数の更新をデプロイ中..."
fly secrets deploy --app "$APP_NAME"

echo "✅ 環境変数の更新が完了しました"
echo "🔍 確認: fly secrets list --app $APP_NAME"