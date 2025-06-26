# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発方針
TDDの方式で、t_wadaの推奨する進め方に従ってください。

### コーディング規約
- **コメントの徹底**: 可能な限りコード上にコメントを残すこと
- **コメント言語**: すべてのコメントは日本語で記述すること
- **コメント対象**:
  - 関数・メソッドの目的と動作
  - 複雑なロジックの説明
  - なぜそのような実装になったかの理由
  - TODO、FIXME、HACKなどの注意事項
  - 外部APIやライブラリの使用方法

## 技術スタック
- **言語**: Node.js + TypeScript
- **Discord**: discord.js v14
- **AI**: Google Gemini 1.5 Flash
- **データベース**: SQLite3
- **スケジューラー**: node-cron

## 開発環境セットアップ
1. `nvm use` でNode.js仮想環境を使用（.nvmrcファイルでNode.js 20を指定）
2. `npm install` で依存関係をインストール（仮想環境内）
3. `.env.example` を参考に `.env` ファイルを作成
4. Discord Bot Token と Google Gemini API Key を設定

## プロジェクト構造
```
src/
├── index.ts              # アプリケーションエントリーポイント
├── config.ts             # 環境変数管理
├── types.ts              # TypeScript型定義
├── bot.ts                # Discord Bot メインクラス
├── scheduler.ts          # スケジュール管理
├── database/
│   ├── database.ts       # データベース操作
│   └── schema.sql        # データベーススキーマ
├── services/
│   ├── geminiService.ts  # Gemini API統合
│   ├── activityService.ts # 活動記録管理
│   └── summaryService.ts # サマリー生成
└── utils/
    └── timeUtils.ts      # 時間関連ユーティリティ
```

## 主要コマンド
- `npm run dev`: 開発モードで実行
- `npm run build`: TypeScriptをビルド
- `npm start`: 本番モードで実行
- `npm run watch`: ファイル変更を監視して自動再起動
- `npm test`: テストを実行
- `npm run test:watch`: テストをwatchモードで実行
- `npm run test:coverage`: カバレッジレポート付きでテスト実行


## アーキテクチャ概要


### 主要コンポーネント

