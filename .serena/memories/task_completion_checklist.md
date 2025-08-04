# Task Completion Checklist

## タスク完了前の必須確認事項

### 1. ビルド・テスト確認（必須）
```bash
# 以下のコマンドを順番に実行し、全て成功することを確認
npm run build                   # TypeScriptビルド確認
./scripts/test-analysis.sh      # テスト実行と失敗分析（推奨）
# または
npm test                        # 全テスト実行
npm run test:integration        # 統合テスト確認
```

### 2. コード品質チェック（必須）
```bash
# Pre-commitフック相当のチェック実行
./scripts/code-review/pre-commit-all-checks.sh

# または個別実行
./scripts/code-review/console-usage-check.sh      # console使用禁止
./scripts/code-review/srp-violation-check.sh      # SRP違反チェック
./scripts/code-review/type-safety-check.sh        # 型安全性
./scripts/code-review/layer-separation-check.sh   # レイヤ分離
./scripts/code-review/todo-comment-check.sh       # TODO/FIXME
npm run check:database-paths                      # DBパス妥当性
```

### 3. TDDサイクル完了確認
- [ ] **Red Phase完了**: テストが失敗することを確認
- [ ] **Green Phase完了**: テストが通ることを確認
- [ ] **Refactor Phase完了**: リファクタリング実施
- [ ] **コメント整理**: 🔴🟢♻️フェーズ表記を削除し、機能説明に変更

### 4. エラー処理確認
- [ ] **AppError使用**: 標準ErrorではなくAppError派生クラス使用
- [ ] **logger使用**: console.log/errorではなくloggerサービス使用
- [ ] **エラー再スロー**: catch節でエラーを握りつぶさない

### 5. データベース変更時の確認
- [ ] **マイグレーションファイル作成**: src/database/migrations/に追加
- [ ] **newSchema.sql更新**: スキーマ定義も同期更新
- [ ] **既存DBテスト**: マイグレーション動作確認

### 6. 型安全性確認
- [ ] **any型排除**: やむを得ない場合は`// ALLOW_ANY`コメント追加
- [ ] **関数型注釈**: 全関数に戻り値の型を明示
- [ ] **インターフェース定義**: 適切な型定義の追加

### 7. レイヤ分離確認
- [ ] **サービス層**: DB/API直接操作していないか確認
- [ ] **リポジトリパターン**: データアクセスは適切に抽象化
- [ ] **例外許可**: 必要な場合は`// ALLOW_LAYER_VIOLATION:`追加

### 8. 最終確認コマンド
```bash
# 全チェック成功を確認
echo "✅ 全テスト成功: タスク完了"

# 通知音再生（macOS）
afplay /System/Library/Sounds/Glass.aiff
```

### 9. コミット推奨メッセージ
```bash
# 機能追加
git commit -m "feat: 機能説明"

# バグ修正
git commit -m "fix: 修正内容"

# リファクタリング
git commit -m "refactor: 改善内容"

# テスト追加
git commit -m "test: テスト内容"

# ドキュメント
git commit -m "docs: ドキュメント更新"
```

## ⚠️ 重要な注意事項
- **絶対にconsole.log/errorを使わない**
- **any型は原則使用禁止**
- **TODO/FIXMEコメントは即座に対応または削除**
- **マイグレーション漏れによるスキーマエラーを防ぐ**
- **staging環境で統合テスト失敗を防ぐため、ローカルで全テスト成功を確認**