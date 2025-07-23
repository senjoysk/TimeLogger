-- 活動促し通知設定をuser_settingsテーブルに追加
-- ActivityPromptRepositoryが期待するカラムを追加

-- prompt_enabled カラムを追加（通知有効/無効）
ALTER TABLE user_settings ADD COLUMN prompt_enabled BOOLEAN DEFAULT FALSE;

-- prompt_start_hour カラムを追加（開始時刻の時）
ALTER TABLE user_settings ADD COLUMN prompt_start_hour INTEGER DEFAULT 8;

-- prompt_start_minute カラムを追加（開始時刻の分）
ALTER TABLE user_settings ADD COLUMN prompt_start_minute INTEGER DEFAULT 30;

-- prompt_end_hour カラムを追加（終了時刻の時）
ALTER TABLE user_settings ADD COLUMN prompt_end_hour INTEGER DEFAULT 18;

-- prompt_end_minute カラムを追加（終了時刻の分）
ALTER TABLE user_settings ADD COLUMN prompt_end_minute INTEGER DEFAULT 0;

-- インデックスを追加（通知が有効なユーザーを効率的に検索するため）
CREATE INDEX IF NOT EXISTS idx_user_settings_prompt_enabled 
ON user_settings(prompt_enabled) WHERE prompt_enabled = TRUE;

-- スケジュールベースのインデックス
CREATE INDEX IF NOT EXISTS idx_user_settings_prompt_schedule 
ON user_settings(prompt_start_hour, prompt_start_minute, prompt_end_hour, prompt_end_minute) 
WHERE prompt_enabled = TRUE;