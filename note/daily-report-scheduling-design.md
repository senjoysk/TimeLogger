# 日次レポート送信機能 設計仕様書（動的cron対応版）

## 📋 要件概要

### 基本要件
- **目標**: ユーザーのタイムゾーンで毎日18:30に日次レポートを自動送信
- **対象**: 全てのアクティブユーザー（タイムゾーン自動対応）
- **精度**: タイムゾーン変更時の即座対応
- **拡張性**: 無制限のタイムゾーン自動対応

### アーキテクチャ方針
- **動的cron管理**: user_settings監視による自動cron作成/削除
- **完全自動化**: 新タイムゾーン検出時の自動対応
- **効率性**: 必要最小限のcronジョブのみ実行

## 🏗️ データベース設計

### 既存テーブル活用
```sql
-- user_settingsテーブル（既存）- 変更なし
CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',  -- これのみ使用
    suspend_hour INTEGER DEFAULT 0,
    wake_hour INTEGER DEFAULT 7,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);
```

### タイムゾーン変更監視テーブル（新規）
```sql
-- タイムゾーン変更通知テーブル（オプション）
CREATE TABLE IF NOT EXISTS timezone_change_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    old_timezone TEXT,
    new_timezone TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    processed BOOLEAN DEFAULT FALSE
);

-- 変更監視トリガー（オプション）
CREATE TRIGGER IF NOT EXISTS user_timezone_changed
    AFTER UPDATE OF timezone ON user_settings
    FOR EACH ROW
    WHEN OLD.timezone != NEW.timezone
BEGIN
    INSERT INTO timezone_change_notifications (
        id, user_id, old_timezone, new_timezone
    ) VALUES (
        lower(hex(randomblob(16))),
        NEW.user_id, 
        OLD.timezone, 
        NEW.timezone
    );
END;
```

### 設計方針
- **18:30固定**: ハードコードで18時30分に送信
- **タイムゾーンのみ**: user_settings.timezoneカラムのみ使用
- **最小変更**: 既存データベース構造をそのまま活用

## 🔧 動的cronアーキテクチャ設計

### 核心サービス: DynamicReportScheduler

```typescript
// src/services/dynamicReportScheduler.ts
class DynamicReportScheduler {
  private activeJobs: Map<string, cron.ScheduledTask> = new Map();
  private timezoneUserMap: Map<string, Set<string>> = new Map();
  
  /**
   * 初期化: 既存ユーザーのタイムゾーン分布を読み込み、必要なcronジョブを作成
   */
  async initialize(): Promise<void>;
  
  /**
   * タイムゾーン変更時の動的cron再設定
   */
  async onTimezoneChanged(userId: string, oldTimezone: string, newTimezone: string): Promise<void>;
  
  /**
   * 特定タイムゾーンに対するcronジョブ作成
   */
  private async setupCronForTimezone(timezone: string): Promise<void>;
  
  /**
   * 不要になったcronジョブの削除
   */
  private async removeCronForTimezone(timezone: string): Promise<void>;
  
  /**
   * UTC時刻からタイムゾーンの18:30を計算
   */
  private calculateUtcHourFor1830(timezone: string): number;
}
```

### タイムゾーン変更監視システム

```typescript
// src/services/timezoneChangeMonitor.ts
class TimezoneChangeMonitor {
  /**
   * Option A: 定期ポーリング監視
   */
  async startPollingMonitor(): Promise<void>;
  
  /**
   * Option B: 通知テーブル監視
   */
  async startNotificationProcessor(): Promise<void>;
  
  /**
   * TimezoneCommandHandlerとの統合
   */
  onTimezoneCommandUpdate(userId: string, oldTz: string, newTz: string): Promise<void>;
}
```

### cronジョブ管理システム

```typescript
// UTC時刻ベースでの効率的なジョブ管理
class CronJobManager {
  // UTC時刻 → タイムゾーンセットのマッピング
  private utcTimeToTimezones: Map<string, Set<string>>;
  
  /**
   * 新しいタイムゾーンの追加（必要に応じてcron作成）
   */
  async addTimezone(timezone: string): Promise<void>;
  
  /**
   * タイムゾーンの削除（不要になったcron削除）
   */
  async removeTimezone(timezone: string): Promise<void>;
  
  /**
   * 現在アクティブなcronスケジュール一覧
   */
  getActiveCronSchedule(): string[];
}
```

### 既存システムとの統合

```typescript
// src/handlers/timezoneCommandHandler.ts - 改修
class TimezoneCommandHandler {
  private dynamicScheduler: DynamicReportScheduler;
  
  async setTimezone(userId: string, newTimezone: string) {
    const oldSettings = await this.repository.getUserSettings(userId);
    
    // タイムゾーン更新
    await this.repository.updateTimezone(userId, newTimezone);
    
    // 動的cronスケジューラーに通知
    await this.dynamicScheduler.onTimezoneChanged(
      userId, 
      oldSettings.timezone, 
      newTimezone
    );
  }
}
```

## 🕐 動的cronスケジューリング戦略

### UTC時刻ベースでのcron最適化
```typescript
// 例: タイムゾーン分布に基づく動的cron作成
const currentTimezones = ['Asia/Tokyo', 'Asia/Kolkata', 'America/New_York'];

// 必要なUTC時刻を計算
const requiredUtcTimes = [
  { hour: 9, minute: 30 },   // Asia/Tokyo 18:30 = UTC 09:30
  { hour: 13, minute: 0 },   // Asia/Kolkata 18:30 = UTC 13:00
  { hour: 23, minute: 30 }   // America/New_York 18:30 = UTC 23:30
];

// 各UTC時刻でcronジョブを作成
requiredUtcTimes.forEach(time => {
  const pattern = `${time.minute} ${time.hour} * * *`;
  cron.schedule(pattern, async () => {
    await sendReportsForUtcTime(time.hour, time.minute);
  });
});
```

### タイムゾーン→UTC変換アルゴリズム
```typescript
function calculateUtcTimeFor1830(timezone: string): { hour: number, minute: number } {
  // 任意の日の18:30をタイムゾーンで作成
  const localTime = new Date('2024-01-01T18:30:00');
  
  // UTC時刻に変換
  const utcTime = toUtc(localTime, timezone);
  
  return {
    hour: utcTime.getHours(),
    minute: utcTime.getMinutes()
  };
}
```

### cronジョブのライフサイクル管理
```typescript
class CronLifecycleManager {
  async addTimezone(timezone: string) {
    const utcTime = calculateUtcTimeFor1830(timezone);
    const jobKey = `${utcTime.hour}:${utcTime.minute}`;
    
    if (!this.activeJobs.has(jobKey)) {
      // 新しいUTC時刻なので、cronジョブを作成
      const pattern = `${utcTime.minute} ${utcTime.hour} * * *`;
      const job = cron.schedule(pattern, () => this.handleReportTime(utcTime));
      
      this.activeJobs.set(jobKey, job);
      console.log(`✅ Created cron: ${pattern} for timezone ${timezone}`);
    }
    
    // タイムゾーン→ユーザーマッピングを更新
    this.addTimezoneToMapping(timezone);
  }
  
  async removeTimezone(timezone: string) {
    const utcTime = calculateUtcTimeFor1830(timezone);
    const jobKey = `${utcTime.hour}:${utcTime.minute}`;
    
    // このUTC時刻を使う他のタイムゾーンがあるかチェック
    if (!this.hasOtherTimezonesForUtcTime(utcTime)) {
      // 他にこの時刻を使うタイムゾーンがない場合は削除
      const job = this.activeJobs.get(jobKey);
      if (job) {
        job.destroy();
        this.activeJobs.delete(jobKey);
        console.log(`🗑️ Removed cron: ${jobKey}`);
      }
    }
  }
}
```

## 🧪 TDD実装計画（動的cron版）

### Phase 1: DynamicReportSchedulerコアテスト
```typescript
// 🔴 Red: 動的cron作成のテスト
describe('DynamicReportScheduler', () => {
  test('should create cron job for new timezone', async () => {
    const scheduler = new DynamicReportScheduler();
    
    // 初期状態: cronジョブなし
    expect(scheduler.getActiveJobCount()).toBe(0);
    
    // Asia/Tokyo追加
    await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
    
    // UTC 09:30用のcronジョブが作成される
    expect(scheduler.getActiveJobCount()).toBe(1);
    expect(scheduler.hasJobForUtcTime(9, 30)).toBe(true);
  });
  
  test('should reuse existing cron for same UTC time', async () => {
    const scheduler = new DynamicReportScheduler();
    
    // Asia/Tokyo (UTC 09:30)
    await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
    expect(scheduler.getActiveJobCount()).toBe(1);
    
    // Asia/Seoul (UTC 09:30) - 同じUTC時刻
    await scheduler.onTimezoneChanged('user2', null, 'Asia/Seoul');
    expect(scheduler.getActiveJobCount()).toBe(1); // 増えない
  });
  
  test('should remove cron when no users in timezone', async () => {
    const scheduler = new DynamicReportScheduler();
    
    // ユーザー追加
    await scheduler.onTimezoneChanged('user1', null, 'Asia/Tokyo');
    expect(scheduler.getActiveJobCount()).toBe(1);
    
    // ユーザーが別タイムゾーンに移動
    await scheduler.onTimezoneChanged('user1', 'Asia/Tokyo', 'America/New_York');
    expect(scheduler.hasJobForUtcTime(9, 30)).toBe(false); // Asia/Tokyo用が削除
    expect(scheduler.hasJobForUtcTime(23, 30)).toBe(true); // America/New_York用が作成
  });
});
```

### Phase 2: タイムゾーン変更監視テスト
```typescript
// 🔴 Red: タイムゾーン変更検出のテスト
describe('TimezoneChangeMonitor', () => {
  test('should detect timezone changes from database', async () => {
    const monitor = new TimezoneChangeMonitor();
    const mockScheduler = jest.fn();
    monitor.setScheduler(mockScheduler);
    
    // データベースでタイムゾーン変更
    await repository.updateTimezone('user1', 'America/New_York');
    
    // 変更検出と通知
    await monitor.processChanges();
    
    expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
      'user1', 
      'Asia/Tokyo',  // 古い値
      'America/New_York'  // 新しい値
    );
  });
  
  test('should handle timezone command integration', async () => {
    const handler = new TimezoneCommandHandler();
    const mockScheduler = jest.fn();
    handler.setDynamicScheduler(mockScheduler);
    
    // !timezone コマンド実行
    await handler.setTimezone('user1', 'Europe/London');
    
    // スケジューラーへの通知
    expect(mockScheduler.onTimezoneChanged).toHaveBeenCalledWith(
      'user1',
      'Asia/Tokyo',
      'Europe/London'
    );
  });
});
```

### Phase 3: UTC時刻計算テスト
```typescript
// 🔴 Red: タイムゾーン→UTC変換のテスト
describe('UTC Time Calculation', () => {
  test('should calculate correct UTC time for Asia/Tokyo', () => {
    const utcTime = calculateUtcTimeFor1830('Asia/Tokyo');
    expect(utcTime).toEqual({ hour: 9, minute: 30 });
  });
  
  test('should calculate correct UTC time for America/New_York', () => {
    const utcTime = calculateUtcTimeFor1830('America/New_York');
    expect(utcTime).toEqual({ hour: 23, minute: 30 });
  });
  
  test('should handle DST transitions correctly', () => {
    // 夏時間のテスト
    const summerTime = calculateUtcTimeFor1830('America/New_York', '2024-07-01');
    const winterTime = calculateUtcTimeFor1830('America/New_York', '2024-01-01');
    
    expect(summerTime.hour).not.toBe(winterTime.hour);
  });
});
```

### Phase 4: 統合テスト
```typescript
// 🔴 Red: エンドツーエンドテスト
describe('Dynamic Report System Integration', () => {
  test('should handle complete user timezone lifecycle', async () => {
    const system = new DynamicReportSystem();
    await system.initialize();
    
    // 1. 新ユーザー追加
    await system.addUser('user1', 'Asia/Tokyo');
    expect(system.getActiveJobCount()).toBe(1);
    
    // 2. タイムゾーン変更
    await system.changeUserTimezone('user1', 'Europe/London');
    expect(system.hasJobForUtcTime(18, 30)).toBe(true); // London
    expect(system.hasJobForUtcTime(9, 30)).toBe(false);  // Tokyo削除
    
    // 3. 複数ユーザーで同じタイムゾーン
    await system.addUser('user2', 'Europe/London');
    expect(system.getActiveJobCount()).toBe(1); // 同じUTC時刻なので増えない
    
    // 4. 最後のユーザーが離脱
    await system.changeUserTimezone('user1', 'Asia/Tokyo');
    await system.changeUserTimezone('user2', 'Asia/Tokyo');
    expect(system.hasJobForUtcTime(18, 30)).toBe(false); // London削除
    expect(system.hasJobForUtcTime(9, 30)).toBe(true);   // Tokyo作成
  });
});
```

## 🚀 実装ステップ（動的cron版）

### Step 1: DynamicReportSchedulerコア
1. **🔴 Red**: UTC時刻計算とcron作成のテスト作成
2. **🟢 Green**: `DynamicReportScheduler`サービス実装
3. **♻️ Refactor**: cronライフサイクル管理の最適化

### Step 2: タイムゾーン変更監視
1. **🔴 Red**: データベース変更検出のテスト作成
2. **🟢 Green**: `TimezoneChangeMonitor`実装
3. **♻️ Refactor**: ポーリング間隔とエラーハンドリング

### Step 3: 既存ハンドラー統合
1. **🔴 Red**: TimezoneCommandHandler統合のテスト作成
2. **🟢 Green**: 既存ハンドラーに動的スケジューラー連携追加
3. **♻️ Refactor**: エラー処理と通知ログ

### Step 4: システム初期化
1. **🔴 Red**: アプリ起動時の既存ユーザー読み込みテスト
2. **🟢 Green**: 初期化プロセスの実装
3. **♻️ Refactor**: 起動時間最適化

### Step 5: 統合テストと本番対応
1. **実タイムゾーンテスト**: 複数タイムゾーンでの動作確認
2. **負荷テスト**: 大量タイムゾーン変更での性能確認
3. **運用監視**: cronジョブ状態の可視化

## 🔧 パフォーマンス考慮事項（動的cron版）

### cronジョブ効率化
- **最小実行回数**: 必要なUTC時刻のみでcron実行
- **ジョブ管理**: Map構造による高速なcron検索・操作
- **メモリ効率**: 不要cronの即座削除でメモリ節約

### タイムゾーン処理最適化
- **UTC変換キャッシュ**: 同一タイムゾーンの変換結果をキャッシュ
- **夏時間対応**: date-fns-tzライブラリの効率的な使用
- **変更検出**: デルタ監視で無駄な処理を削減

### スケーラビリティ対策
- **ユーザー数増加**: O(1)での新タイムゾーン追加
- **タイムゾーン多様化**: UTC時刻の重複活用で効率化
- **メモリ使用量**: ユーザー数に比例しない設計

## 🛡️ 信頼性・セキュリティ考慮（動的cron版）

### cronジョブの堅牢性
```typescript
async function safeCronExecution(utcTime: UtcTime): Promise<void> {
  try {
    const eligibleUsers = await this.getUsersForUtcTime(utcTime);
    console.log(`📊 UTC ${utcTime.hour}:${utcTime.minute} - ${eligibleUsers.length} users`);
    
    for (const userId of eligibleUsers) {
      await withErrorHandling(async () => {
        await this.sendDailyReport(userId);
      });
    }
  } catch (error) {
    console.error(`❌ Cron execution failed for UTC ${utcTime.hour}:${utcTime.minute}`, error);
    // cronジョブ自体は継続、エラー通知のみ
  }
}
```

### 動的変更の安全性
- **原子性**: cron作成/削除の原子的操作
- **冪等性**: 同一タイムゾーンの重複追加でも安全
- **復旧機能**: アプリ再起動時の状態復元

### 運用監視
- **cronジョブ状態**: アクティブなジョブ一覧の監視
- **タイムゾーン分布**: ユーザー分布の可視化
- **送信実績**: UTC時刻別の送信成功率

## 🔮 将来拡張計画（動的cron基盤活用）

### 動的設定変更機能
```typescript
// 動的cronベースなので、任意時刻設定が容易
!report time 19:45    // 送信時刻変更 → 即座にcron再設定
!report multiple 8:00,19:00  // 複数時刻設定
!report timezone auto // 位置情報ベース自動設定
```

### スケーラブルな多機能対応
- **複数時刻**: 朝・昼・夜の複数送信も同じ仕組みで対応
- **条件付き送信**: 活動量閾値による動的on/off
- **グループ機能**: チーム単位での一斉送信

### AI主導の最適化
- **送信時刻最適化**: ユーザー活動パターン分析による提案
- **タイムゾーン予測**: 移動パターンからの自動調整
- **負荷分散AI**: システム負荷に応じた送信時刻調整

## 📊 成功指標（動的cron版）

### 効率性指標
- **cronジョブ数**: ユーザー数に関係なく最小限維持
- **CPU使用率**: 固定cron比で50%以上削減
- **応答性**: タイムゾーン変更の即座反映（<1秒）

### 拡張性指標
- **新タイムゾーン対応**: 自動対応100%
- **同時ユーザー数**: 10,000ユーザー対応可能
- **タイムゾーン多様性**: 無制限対応

### 運用指標
- **システム安定性**: 24時間無停止運用
- **自動復旧**: アプリ再起動時の完全状態復元
- **運用負荷**: 手動cronメンテナンス作業ゼロ

---

**作成日**: 2025-01-13  
**作成者**: Claude Code  
**バージョン**: 2.0（動的cron対応版）  
**次回更新予定**: DynamicReportScheduler実装完了後