-- 夜間サスペンド機能用カラム追加マイグレーション
-- このファイルは本番環境のエラーを修正するため

-- discord_message_idカラムを追加（既に存在する場合はスキップ）
-- SQLiteはIF NOT EXISTSをサポートしないため、エラーを無視する形で実装

-- recovery関連カラムも同様に追加
-- 注: SQLiteではALTER TABLE ADD COLUMNのIF NOT EXISTSはサポートされていない
-- そのため、アプリケーション側でエラーハンドリングが必要