# Suspend機能削除プロジェクト

## 概要
TimeLoggerの夜間自動suspend機能を完全削除するプロジェクトです。

### 削除理由
- 実際の使用実績なし（suspend_statesテーブルが空）
- 0-7時間帯のユーザーアクティビティなし
- コードベースの約10%（1,500行）を占める複雑な機能
- GitHub Actions月720回の無駄な実行
- 保守コストに見合わない

## ドキュメント構成

### 📋 [DETAILED_DESIGN.md](./DETAILED_DESIGN.md)
削除対象の詳細設計書
- 削除対象ファイルリスト（14ファイル）
- 修正対象ファイルリスト（6ファイル）
- データベース変更内容
- 環境変数削除リスト
- 実行順序と影響分析

### 🔧 [MIGRATION_SCRIPT.md](./MIGRATION_SCRIPT.md)
実行用スクリプト集
- データベースマイグレーション
- バックアップ・ロールバック
- 段階的削除スクリプト
- 検証スクリプト

## クイックスタート

### 1. 現状確認
```bash
# suspend機能の使用状況確認
sqlite3 data/activity_logs.db "SELECT COUNT(*) FROM suspend_states;"
sqlite3 data/activity_logs.db "SELECT user_id, suspend_hour, wake_hour FROM user_settings;"
```

### 2. Phase 1: 機能無効化（即座に実施）
```bash
# GitHub Actions無効化
# GitHub UIで .github/workflows/night-suspend-automation.yml を無効化

# コマンド無効化は次のコミットで実施
```

### 3. Phase 2: コード削除（1週間後）
```bash
# 完全削除スクリプト実行
./execute_complete_removal.sh
```

### 4. Phase 3: クリーンアップ（2週間後）
```bash
# GitHub Secretsを手動削除
# - SHUTDOWN_TOKEN
# - WAKE_TOKEN
# - RECOVERY_TOKEN
```

## 削除による効果

### 📊 メトリクス
- **削除コード**: 約1,500行（10%削減）
- **削除ファイル**: 14ファイル
- **GitHub Actions**: 月720回 → 0回
- **保守負荷**: 大幅削減

### ✅ メリット
- システムの簡素化
- テストカバレッジ向上
- セキュリティリスク軽減
- 開発効率向上

### ⚠️ リスク
- なし（未使用機能のため）

## 進捗管理

- [ ] Phase 1: 機能無効化
  - [ ] GitHub Actions無効化
  - [ ] コマンドハンドラー削除
- [ ] Phase 2: コード削除
  - [ ] テストファイル削除
  - [ ] 本体コード削除
  - [ ] 統合部分の修正
- [ ] Phase 3: クリーンアップ
  - [ ] データベーススキーマ更新
  - [ ] 環境変数削除
  - [ ] ドキュメント更新

## ロールバック

問題が発生した場合：
```bash
# データベースロールバック
./rollback_migration.sh

# コードロールバック
git revert HEAD
```

## 連絡先
問題や質問がある場合は、このプロジェクトのissueを作成してください。