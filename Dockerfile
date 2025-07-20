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

# Web管理アプリのビューとスタティックファイルをコピー
COPY --from=builder /app/src/web-admin/views ./dist/web-admin/views
COPY --from=builder /app/src/web-admin/public ./dist/web-admin/public

# スキーマファイルをコピー
COPY src/database/newSchema.sql ./dist/database/

# マイグレーションスクリプトをコピー（現在必要なファイルのみ）
COPY scripts/production/safe-unified-migration.js ./scripts/production/

# データディレクトリを作成
RUN mkdir -p /app/data

# スクリプトに実行権限を付与
RUN chmod +x scripts/production/safe-unified-migration.js

# 非rootユーザーで実行
USER node

# ヘルスチェック用のエンドポイント（オプション）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('child_process').execSync('ps aux | grep -v grep | grep node || exit 1')"

# 安全な統一データベースマイグレーションを実行してからアプリケーション起動
CMD ["node", "scripts/production/safe-unified-migration.js"]