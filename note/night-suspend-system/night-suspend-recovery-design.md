# 夜間サスペンド＆朝のメッセージリカバリ設計

## 📋 概要

Discord BotのFly.io運用において、0:00-7:00の間を完全サスペンドし、7:00の起動時に夜間のメッセージを遡って処理するシステム設計。

### 🎯 目的
- **コスト削減**: 夜間の7時間サスペンドで約70%のコスト削減
- **メッセージ保全**: 夜間メッセージも確実に処理
- **運用自動化**: GitHub Actionsによる完全自動化

## 🏗️ システムアーキテクチャ

### タイムライン
```
23:59 → 通常稼働
00:00 → GitHub Actions: 終了処理実行
00:01 → Fly.io: 完全サスペンド
  ↓
06:59 → サスペンド継続
07:00 → GitHub Actions: 起動処理実行
07:01 → Fly.io: アプリケーション起動
07:02 → Bot: Discord接続確立
07:03 → Bot: 夜間メッセージリカバリ開始
07:10 → Bot: 通常稼働モード
```

## 🔄 処理フロー詳細

### 1. 終了処理 (00:00 JST)

#### GitHub Actions ワークフロー
```yaml
name: Night Suspend
on:
  schedule:
    - cron: '0 15 * * *'  # JST 0:00 = UTC 15:00

jobs:
  shutdown:
    runs-on: ubuntu-latest
    steps:
      - name: Graceful shutdown
        run: |
          # Bot に終了通知
          curl -X POST https://${FLY_APP_NAME}.fly.dev/api/night-suspend \
            -H "Authorization: Bearer ${SHUTDOWN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d '{"action": "prepare_suspend"}'
          
          # 30秒待機（処理完了待ち）
          sleep 30
          
          # アプリ停止確認
          curl -X POST https://${FLY_APP_NAME}.fly.dev/api/shutdown \
            -H "Authorization: Bearer ${SHUTDOWN_TOKEN}"
```

#### Bot側の終了処理
```typescript
// /api/night-suspend エンドポイント
app.post('/api/night-suspend', authMiddleware, async (req, res) => {
  try {
    console.log('🌙 夜間サスペンド準備を開始');
    
    // 現在の処理を完了
    await bot.finishCurrentProcesses();
    
    // 状態を保存
    await bot.saveState({
      suspend_time: new Date().toISOString(),
      next_recovery_time: getTomorrowSevenAM()
    });
    
    // Discord接続をクリーンアップ
    await bot.prepareDisconnect();
    
    res.json({ status: 'ready_for_suspend' });
    
    // 5秒後に強制終了
    setTimeout(() => {
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('❌ 夜間サスペンド準備エラー:', error);
    res.status(500).json({ error: 'suspend_preparation_failed' });
  }
});
```

### 2. 起動処理 (07:00 JST)

#### GitHub Actions ワークフロー
```yaml
name: Morning Recovery
on:
  schedule:
    - cron: '0 22 * * *'  # JST 7:00 = UTC 22:00

jobs:
  startup:
    runs-on: ubuntu-latest
    steps:
      - name: Wake up and recover
        run: |
          # アプリケーション起動
          curl -X POST https://${FLY_APP_NAME}.fly.dev/api/wake-up \
            -H "Authorization: Bearer ${WAKE_TOKEN}" \
            -H "Content-Type: application/json" \
            -d '{"trigger": "morning_recovery"}'
          
          # 起動待機（最大2分）
          for i in {1..12}; do
            if curl -f https://${FLY_APP_NAME}.fly.dev/health; then
              echo "✅ アプリケーション起動完了"
              break
            fi
            sleep 10
          done
          
          # メッセージリカバリ開始
          curl -X POST https://${FLY_APP_NAME}.fly.dev/api/morning-recovery \
            -H "Authorization: Bearer ${RECOVERY_TOKEN}"
```

#### Bot側の起動処理
```typescript
// /api/wake-up エンドポイント
app.post('/api/wake-up', authMiddleware, async (req, res) => {
  try {
    console.log('🌅 朝の起動処理を開始');
    
    // Discord Bot初期化
    await bot.initialize();
    
    // 前回の状態を復旧
    const lastState = await bot.loadState();
    
    res.json({ 
      status: 'waking_up',
      last_suspend: lastState?.suspend_time 
    });
    
  } catch (error) {
    console.error('❌ 起動処理エラー:', error);
    res.status(500).json({ error: 'wake_up_failed' });
  }
});

// /api/morning-recovery エンドポイント
app.post('/api/morning-recovery', authMiddleware, async (req, res) => {
  try {
    console.log('🔄 夜間メッセージリカバリを開始');
    
    const recoveryService = new MorningMessageRecovery(
      bot.client,
      bot.repository,
      bot.config
    );
    
    const results = await recoveryService.recoverNightMessages();
    
    res.json({
      status: 'recovery_complete',
      processed_messages: results.length,
      recovery_time: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ メッセージリカバリエラー:', error);
    res.status(500).json({ error: 'recovery_failed' });
  }
});
```

## 📱 Discord メッセージリカバリ実装

### MorningMessageRecovery クラス
```typescript
export class MorningMessageRecovery {
  constructor(
    private client: Client,
    private repository: IActivityLogRepository,
    private config: ActivityLoggingConfig
  ) {}

  async recoverNightMessages(): Promise<ActivityLog[]> {
    const now = new Date();
    const sevenAM = new Date();
    sevenAM.setHours(7, 0, 0, 0);
    
    const midnight = new Date(sevenAM);
    midnight.setHours(0, 0, 0, 0);
    
    console.log(`🔍 夜間メッセージを検索: ${midnight.toISOString()} ~ ${sevenAM.toISOString()}`);
    
    // ユーザーとのDMチャンネルを取得
    const user = await this.client.users.fetch(this.config.targetUserId);
    const dmChannel = await user.createDM();
    
    // 夜間メッセージを取得
    const messages = await this.fetchMessagesBetween(
      dmChannel,
      midnight,
      sevenAM
    );
    
    console.log(`📬 夜間メッセージ ${messages.size}件を検出`);
    
    // 未処理メッセージを抽出して処理
    const processedLogs: ActivityLog[] = [];
    
    for (const [id, message] of messages) {
      if (await this.isUnprocessedMessage(message)) {
        try {
          const log = await this.processMessage(message);
          processedLogs.push(log);
          
          // API制限対策
          await this.delay(1000);
          
        } catch (error) {
          console.error(`❌ メッセージ処理失敗 ${message.id}:`, error);
        }
      }
    }
    
    // 処理結果をユーザーに通知
    await this.sendRecoveryReport(processedLogs);
    
    return processedLogs;
  }

  private async fetchMessagesBetween(
    channel: DMChannel,
    startTime: Date,
    endTime: Date
  ): Promise<Collection<string, Message>> {
    const allMessages = new Map<string, Message>();
    let lastId: string | undefined;
    
    while (true) {
      const options: { limit: number; before?: string } = {
        limit: 100
      };
      
      if (lastId) {
        options.before = lastId;
      }
      
      const batch = await channel.messages.fetch(options);
      if (batch.size === 0) break;
      
      let shouldContinue = true;
      
      batch.forEach((message) => {
        const messageTime = message.createdAt;
        
        if (messageTime >= startTime && messageTime < endTime) {
          allMessages.set(message.id, message);
        }
        
        if (messageTime < startTime) {
          shouldContinue = false;
        }
      });
      
      if (!shouldContinue) break;
      
      lastId = batch.last()?.id;
    }
    
    return new Collection(allMessages);
  }

  private async isUnprocessedMessage(message: Message): Promise<boolean> {
    // Botメッセージは除外
    if (message.author.bot) return false;
    
    // 対象ユーザー以外は除外
    if (message.author.id !== this.config.targetUserId) return false;
    
    // DBに存在チェック
    const exists = await this.repository.existsByDiscordMessageId(message.id);
    return !exists;
  }

  private async processMessage(message: Message): Promise<ActivityLog> {
    const logData = {
      user_id: message.author.id,
      content: message.content,
      input_timestamp: message.createdAt.toISOString(),
      business_date: this.getBusinessDate(message.createdAt),
      discord_message_id: message.id,
      recovery_processed: true,
      recovery_timestamp: new Date().toISOString()
    };
    
    const log = await this.repository.createLog(logData);
    
    // AI分析は後で実行（重い処理）
    setImmediate(async () => {
      try {
        await this.processWithAI(log);
      } catch (error) {
        console.error('❌ AI処理エラー:', error);
      }
    });
    
    return log;
  }

  private async sendRecoveryReport(logs: ActivityLog[]): Promise<void> {
    const user = await this.client.users.fetch(this.config.targetUserId);
    
    const reportMessage = `🌅 **朝のメッセージリカバリ完了**\n\n` +
      `📊 **処理結果**\n` +
      `• 処理済みメッセージ: ${logs.length}件\n` +
      `• 処理時刻: ${new Date().toLocaleString('ja-JP')}\n\n` +
      `${logs.length > 0 ? '✅ 夜間のメッセージを正常に処理しました。' : '📝 夜間の新規メッセージはありませんでした。'}`;
    
    await user.send(reportMessage);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getBusinessDate(date: Date): string {
    const businessDate = new Date(date);
    if (businessDate.getHours() < 5) {
      businessDate.setDate(businessDate.getDate() - 1);
    }
    return businessDate.toISOString().split('T')[0];
  }
}
```

## 🗄️ データベース拡張

### スキーマ変更
```sql
-- Discord メッセージID管理
ALTER TABLE activity_logs ADD COLUMN discord_message_id TEXT UNIQUE;
ALTER TABLE activity_logs ADD COLUMN recovery_processed BOOLEAN DEFAULT FALSE;
ALTER TABLE activity_logs ADD COLUMN recovery_timestamp TEXT;

-- サスペンド状態管理
CREATE TABLE IF NOT EXISTS suspend_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  suspend_time TEXT NOT NULL,
  expected_recovery_time TEXT NOT NULL,
  actual_recovery_time TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_discord_message_id ON activity_logs(discord_message_id);
CREATE INDEX IF NOT EXISTS idx_recovery_processed ON activity_logs(recovery_processed);
CREATE INDEX IF NOT EXISTS idx_suspend_states_user_id ON suspend_states(user_id);
```

### リポジトリメソッド拡張
```typescript
interface IActivityLogRepository {
  // 既存メソッド...
  
  // Discord メッセージID関連
  existsByDiscordMessageId(messageId: string): Promise<boolean>;
  getByDiscordMessageId(messageId: string): Promise<ActivityLog | null>;
  
  // リカバリ処理関連
  getUnprocessedMessages(userId: string, timeRange: { start: Date; end: Date }): Promise<ActivityLog[]>;
  markAsRecoveryProcessed(logId: string): Promise<void>;
  
  // サスペンド状態管理
  saveSuspendState(state: SuspendState): Promise<void>;
  getLastSuspendState(userId: string): Promise<SuspendState | null>;
}
```

## 🔐 セキュリティ考慮事項

### 認証ミドルウェア
```typescript
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  // 操作別のトークン検証
  const requiredToken = {
    '/api/night-suspend': process.env.SHUTDOWN_TOKEN,
    '/api/wake-up': process.env.WAKE_TOKEN,
    '/api/morning-recovery': process.env.RECOVERY_TOKEN
  }[req.path];
  
  if (token !== requiredToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  next();
};
```

### 環境変数管理
```bash
# GitHub Secrets
SHUTDOWN_TOKEN=secure_shutdown_token_here
WAKE_TOKEN=secure_wake_token_here
RECOVERY_TOKEN=secure_recovery_token_here
FLY_APP_NAME=your-app-name
DISCORD_WEBHOOK_URL=webhook_for_notifications
```

## 📊 パフォーマンス最適化

### バッチ処理
```typescript
class BatchProcessor {
  private static readonly BATCH_SIZE = 10;
  private static readonly DELAY_MS = 1000;
  
  async processBatch<T>(items: T[], processor: (item: T) => Promise<void>): Promise<void> {
    const batches = this.chunkArray(items, BatchProcessor.BATCH_SIZE);
    
    for (const batch of batches) {
      await Promise.all(batch.map(item => processor(item)));
      await this.delay(BatchProcessor.DELAY_MS);
    }
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

## 🚨 エラーハンドリング

### リトライ機構
```typescript
class RetryHandler {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ 試行 ${attempt}/${maxRetries} 失敗:`, error);
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        await this.delay(delayMs * attempt);
      }
    }
    
    throw lastError!;
  }
}
```

## 📈 監視とログ

### 通知システム
```typescript
class NotificationService {
  async sendDiscordNotification(
    webhookUrl: string,
    title: string,
    message: string,
    color: number = 0x00ff00
  ): Promise<void> {
    const payload = {
      embeds: [{
        title,
        description: message,
        color,
        timestamp: new Date().toISOString()
      }]
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}
```

## 🎯 実装チェックリスト

### Bot側実装
- [ ] APIエンドポイント追加 (`/api/night-suspend`, `/api/wake-up`, `/api/morning-recovery`)
- [ ] 認証ミドルウェア実装
- [ ] MorningMessageRecoveryクラス実装
- [ ] データベーススキーマ更新
- [ ] 状態管理機能実装

### GitHub Actions実装
- [ ] 終了処理ワークフロー作成
- [ ] 起動処理ワークフロー作成
- [ ] 通知機能実装
- [ ] エラーハンドリング追加

### テスト・検証
- [ ] 終了処理テスト
- [ ] 起動処理テスト
- [ ] メッセージリカバリテスト
- [ ] エラーケーステスト

### 運用準備
- [ ] 監視ダッシュボード構築
- [ ] ログ分析システム
- [ ] アラート設定
- [ ] ドキュメント整備

## 💡 今後の拡張可能性

### 時間帯カスタマイズ
```typescript
interface SuspendSchedule {
  suspendTime: string; // HH:MM format
  resumeTime: string;  // HH:MM format
  timezone: string;    // IANA timezone
}
```

### 複数ユーザー対応
```typescript
interface UserSuspendConfig {
  userId: string;
  schedule: SuspendSchedule;
  enabled: boolean;
}
```

### 条件付きサスペンド
```typescript
interface SuspendCondition {
  skipSuspendOnWeekends: boolean;
  skipSuspendOnHolidays: boolean;
  minimumActivityThreshold: number;
}
```