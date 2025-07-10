# マルチステージビルドを使用
FROM node:20-slim AS builder

# 作業ディレクトリの設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 全ての依存関係をインストール（開発用も含む）
RUN npm ci

# アプリケーションファイルをコピー
COPY . .

# dist/databaseディレクトリを作成してからビルド
RUN mkdir -p dist/database

# TypeScriptをビルド
RUN npm run build

# 本番用イメージ
FROM node:20-slim

# 作業ディレクトリの設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 本番用の依存関係のみインストール
RUN npm ci --production

# ビルド済みのファイルをコピー
COPY --from=builder /app/dist ./dist

# マイグレーションスクリプトをコピー
COPY scripts/production/migration-entrypoint.js ./scripts/production/

# データディレクトリを作成
RUN mkdir -p /app/data

# スクリプトに実行権限を付与
RUN chmod +x scripts/production/migration-entrypoint.js

# 非rootユーザーで実行
USER node

# ヘルスチェック用のエンドポイント（オプション）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('child_process').execSync('ps aux | grep -v grep | grep node || exit 1')"

# マイグレーションを実行してからアプリケーション起動
CMD ["node", "scripts/production/migration-entrypoint.js"]