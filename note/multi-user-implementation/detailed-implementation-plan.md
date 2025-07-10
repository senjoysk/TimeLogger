# マルチユーザー対応 - 詳細実装計画書

## 🔄 ブランチ戦略

### featureブランチ作成
```bash
git checkout develop
git checkout -b feature/multi-user-implementation
```

### コミット戦略
- 機能単位での細かいコミット
- 巻き戻し可能な区切りでのコミット
- 最終的にプルリクエストで統合

## 📋 Phase 1: 基本マルチユーザー対応

### 1.1 ユーザー制限の削除

**ファイル**: `src/integration/activityLoggingIntegration.ts`
**行数**: 242-246

**削除するコード**:
```typescript
// 対象ユーザーのみ処理
if (userId !== this.config.targetUserId) {
  console.log(`  ↳ [活動記録] 対象外ユーザー (受信: ${userId}, 期待: ${this.config.targetUserId})`);
  return false;
}
```

**TDDアプローチ**:
1. **Red**: 複数ユーザーの処理を期待するテストを作成（失敗させる）
2. **Green**: 上記コードを削除して制限を解除
3. **Refactor**: コードの整理と最適化

### 1.2 ユーザー管理インターフェースの定義

**新規ファイル**: `src/repositories/interfaces.ts` (拡張)

**追加インターフェース**:
```typescript
/**
 * ユーザー管理機能の抽象化インターフェース
 */
export interface IUserRepository {
  // ユーザー存在確認
  userExists(userId: string): Promise<boolean>;
  
  // ユーザー登録
  registerUser(userId: string, username: string): Promise<void>;
  
  // ユーザー情報取得
  getUserInfo(userId: string): Promise<UserInfo | null>;
  
  // ユーザー統計取得
  getUserStats(userId: string): Promise<UserStats>;
  
  // 最終利用日時更新
  updateLastSeen(userId: string): Promise<void>;
}

/**
 * ユーザー情報
 */
export interface UserInfo {
  userId: string;
  username?: string;
  timezone: string;
  firstSeen: string;
  lastSeen: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * ユーザー統計情報
 */
export interface UserStats {
  userId: string;
  totalLogs: number;
  thisMonthLogs: number;
  thisWeekLogs: number;
  todayLogs: number;
  avgLogsPerDay: number;
  mostActiveHour: number;
  totalMinutesLogged: number;
}
```

### 1.3 Repository実装の拡張

**ファイル**: `src/repositories/sqliteActivityLogRepository.ts`

**クラス宣言の更新**:
```typescript
export class SqliteActivityLogRepository 
  implements IActivityLogRepository, IApiCostRepository, ITodoRepository, 
             IMessageClassificationRepository, IUserRepository {
```

**新規メソッド追加**:
```typescript
/**
 * ユーザーが存在するかチェック
 */
async userExists(userId: string): Promise<boolean> {
  try {
    const result = await this.queryDatabase(
      'SELECT user_id FROM user_settings WHERE user_id = ?',
      [userId]
    );
    return result.length > 0;
  } catch (error) {
    console.error('❌ ユーザー存在確認エラー:', error);
    return false;
  }
}

/**
 * 新規ユーザーを登録
 */
async registerUser(userId: string, username: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    
    // user_settingsに登録
    await this.executeQuery(`
      INSERT INTO user_settings (user_id, username, timezone, first_seen, last_seen, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, username, 'Asia/Tokyo', now, now, true, now, now]);
    
    console.log(`✅ 新規ユーザー登録完了: ${userId} (${username})`);
  } catch (error) {
    console.error('❌ ユーザー登録エラー:', error);
    throw new ActivityLogError('ユーザー登録に失敗しました', 'USER_REGISTRATION_ERROR', { userId, username, error });
  }
}

/**
 * ユーザー情報を取得
 */
async getUserInfo(userId: string): Promise<UserInfo | null> {
  try {
    const result = await this.queryDatabase(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    if (result.length === 0) {
      return null;
    }
    
    const row = result[0];
    return {
      userId: row.user_id,
      username: row.username,
      timezone: row.timezone,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error) {
    console.error('❌ ユーザー情報取得エラー:', error);
    throw new ActivityLogError('ユーザー情報の取得に失敗しました', 'USER_INFO_ERROR', { userId, error });
  }
}
```

### 1.4 ActivityLoggingIntegrationの自動登録機能

**ファイル**: `src/integration/activityLoggingIntegration.ts`

**handleMessageメソッドの修正**:
```typescript
async handleMessage(message: Message): Promise<boolean> {
  try {
    const userId = message.author.id;
    const content = message.content;
    
    console.log(`📨 [活動記録] メッセージ受信: "${content}" (ユーザー: ${userId})`);
    
    // 自動ユーザー登録
    await this.ensureUserRegistered(userId, message.author.username);
    
    // 既存の処理を継続
    // ... 残りの処理
  } catch (error) {
    // ... エラーハンドリング
  }
}

/**
 * ユーザーの登録状態を確認し、未登録の場合は自動登録
 */
private async ensureUserRegistered(userId: string, username: string): Promise<void> {
  try {
    const userExists = await this.repository.userExists(userId);
    
    if (!userExists) {
      await this.repository.registerUser(userId, username);
      console.log(`🎉 新規ユーザー自動登録: ${userId} (${username})`);
    } else {
      // 最終利用日時を更新
      await this.repository.updateLastSeen(userId);
    }
  } catch (error) {
    console.error('❌ ユーザー登録確認エラー:', error);
    // 登録エラーは処理を止めない（ログ記録は継続）
  }
}

/**
 * ウェルカムメッセージの生成
 */
private getWelcomeMessage(): string {
  return `
🎉 **TimeLoggerへようこそ！**

アカウントを自動作成しました。

📊 **アカウント情報**
タイムゾーン: Asia/Tokyo
登録日: ${new Date().toLocaleDateString('ja-JP')}

📝 **使い方**
- 活動記録: そのままメッセージを送信
- 今日のサマリー: \`!summary\`
- プロファイル確認: \`!profile\`
- コマンド一覧: \`!help\`

さっそく今日の活動を記録してみましょう！
  `.trim();
}
```

## 📋 Phase 2: プロファイル管理機能

### 2.1 ユーザープロファイル型定義

**新規ファイル**: `src/types/userProfile.ts`

```typescript
/**
 * ユーザープロファイル関連の型定義
 */

export interface UserProfile {
  userId: string;
  username?: string;
  timezone: string;
  registrationDate: string;
  lastSeenAt: string;
  isActive: boolean;
  stats: UserActivityStats;
}

export interface UserActivityStats {
  totalLogs: number;
  thisMonthLogs: number;
  thisWeekLogs: number;
  todayLogs: number;
  avgLogsPerDay: number;
  mostActiveHour: number;
  totalMinutesLogged: number;
  longestActiveDay: {
    date: string;
    logCount: number;
  };
}

export interface ProfileDisplayOptions {
  includeStats: boolean;
  includeSettings: boolean;
  includeRecentActivity: boolean;
  compact: boolean;
}
```

### 2.2 ProfileCommandHandler実装

**新規ファイル**: `src/handlers/profileCommandHandler.ts`

```typescript
import { Message } from 'discord.js';
import { IUserRepository } from '../repositories/interfaces';
import { UserProfile, ProfileDisplayOptions } from '../types/userProfile';
import { withErrorHandling, AppError } from '../utils/errorHandler';

/**
 * プロファイル表示コマンドハンドラー
 */
export class ProfileCommandHandler {
  private repository: IUserRepository;

  constructor(repository: IUserRepository) {
    this.repository = repository;
  }

  /**
   * !profileコマンドの処理
   */
  async handleProfileCommand(message: Message, args: string[]): Promise<void> {
    await withErrorHandling(async () => {
      const userId = message.author.id;
      
      // オプション解析
      const options = this.parseOptions(args);
      
      // ユーザー情報とプロファイルを取得
      const userInfo = await this.repository.getUserInfo(userId);
      if (!userInfo) {
        await message.reply('❌ ユーザー情報が見つかりません。初回利用の場合は何かメッセージを送信してください。');
        return;
      }
      
      const stats = await this.repository.getUserStats(userId);
      
      const profile: UserProfile = {
        ...userInfo,
        stats
      };
      
      // プロファイル表示
      const profileText = this.formatProfile(profile, options);
      await message.reply(profileText);
      
    }, 'ProfileCommand', { userId: message.author.id });
  }

  /**
   * プロファイル表示オプションの解析
   */
  private parseOptions(args: string[]): ProfileDisplayOptions {
    return {
      includeStats: !args.includes('--no-stats'),
      includeSettings: !args.includes('--no-settings'),
      includeRecentActivity: args.includes('--recent'),
      compact: args.includes('--compact')
    };
  }

  /**
   * プロファイル情報のフォーマット
   */
  private formatProfile(profile: UserProfile, options: ProfileDisplayOptions): string {
    const sections: string[] = [];
    
    // 基本情報
    sections.push('📊 **プロファイル情報**\n');
    
    sections.push('👤 **基本情報**');
    sections.push(`ユーザーID: \`${profile.userId}\``);
    if (profile.username) {
      sections.push(`ユーザー名: ${profile.username}`);
    }
    sections.push(`登録日: ${this.formatDate(profile.registrationDate)}`);
    sections.push(`最終利用: ${this.formatDate(profile.lastSeenAt)}`);
    sections.push('');
    
    // 設定情報
    if (options.includeSettings) {
      sections.push('⚙️ **設定**');
      sections.push(`タイムゾーン: ${profile.timezone}`);
      sections.push('');
    }
    
    // 統計情報
    if (options.includeStats) {
      const stats = profile.stats;
      sections.push('📈 **統計**');
      sections.push(`総ログ数: ${stats.totalLogs.toLocaleString()}件`);
      sections.push(`今月のログ数: ${stats.thisMonthLogs.toLocaleString()}件`);
      sections.push(`今週のログ数: ${stats.thisWeekLogs.toLocaleString()}件`);
      sections.push(`今日のログ数: ${stats.todayLogs.toLocaleString()}件`);
      
      if (!options.compact) {
        sections.push(`1日平均: ${stats.avgLogsPerDay.toFixed(1)}件`);
        sections.push(`最も活発な時間: ${stats.mostActiveHour}時台`);
        sections.push(`総記録時間: ${Math.round(stats.totalMinutesLogged / 60)}時間`);
        
        if (stats.longestActiveDay.logCount > 0) {
          sections.push(`最大ログ日: ${stats.longestActiveDay.date} (${stats.longestActiveDay.logCount}件)`);
        }
      }
    }
    
    return sections.join('\n');
  }

  /**
   * 日付のフォーマット
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
```

### 2.3 ActivityLoggingIntegrationへの統合

**ファイル**: `src/integration/activityLoggingIntegration.ts`

```typescript
import { ProfileCommandHandler } from '../handlers/profileCommandHandler';

export class ActivityLoggingIntegration {
  private profileHandler: ProfileCommandHandler;
  
  constructor(config: ActivityLoggingConfig) {
    // ... 既存の初期化
    this.profileHandler = new ProfileCommandHandler(this.repository);
  }
  
  /**
   * Discordコマンドの処理
   */
  private async handleCommand(message: Message): Promise<boolean> {
    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    
    switch (command) {
      case 'profile':
        await this.profileHandler.handleProfileCommand(message, args);
        return true;
        
      // ... 既存のコマンド処理
      
      default:
        return false;
    }
  }
}
```

## 📋 Phase 3: データベース拡張

### 3.1 マイグレーション作成

**新規ファイル**: `src/database/migrations/002_user_settings_enhancement.sql`

```sql
-- user_settingsテーブルの拡張
-- ユーザー名、初回・最終利用日時、アクティブ状態フラグを追加

ALTER TABLE user_settings ADD COLUMN username TEXT;
ALTER TABLE user_settings ADD COLUMN first_seen TEXT;
ALTER TABLE user_settings ADD COLUMN last_seen TEXT;
ALTER TABLE user_settings ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- インデックスの追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_user_settings_last_seen ON user_settings(last_seen);
CREATE INDEX IF NOT EXISTS idx_user_settings_is_active ON user_settings(is_active);
```

### 3.2 統計取得用のユーティリティメソッド

**Repository拡張**:

```typescript
/**
 * ユーザー統計を取得
 */
async getUserStats(userId: string): Promise<UserStats> {
  try {
    const [
      totalLogs,
      thisMonthLogs,
      thisWeekLogs,
      todayLogs,
      avgLogs,
      mostActiveHour,
      totalMinutes,
      longestActiveDay
    ] = await Promise.all([
      this.getTotalLogsCount(userId),
      this.getLogsCountByPeriod(userId, 'month'),
      this.getLogsCountByPeriod(userId, 'week'),
      this.getLogsCountByPeriod(userId, 'today'),
      this.getAverageLogsPerDay(userId),
      this.getMostActiveHour(userId),
      this.getTotalMinutesLogged(userId),
      this.getLongestActiveDay(userId)
    ]);
    
    return {
      userId,
      totalLogs,
      thisMonthLogs,
      thisWeekLogs,
      todayLogs,
      avgLogsPerDay: avgLogs,
      mostActiveHour,
      totalMinutesLogged: totalMinutes,
      longestActiveDay
    };
  } catch (error) {
    console.error('❌ ユーザー統計取得エラー:', error);
    throw new ActivityLogError('ユーザー統計の取得に失敗しました', 'USER_STATS_ERROR', { userId, error });
  }
}
```

## 📋 Phase 4: テスト実装

### 4.1 マルチユーザー統合テスト

**新規ファイル**: `src/__tests__/integration/multiUser.test.ts`

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestIntegration } from '../../integration';
import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';

describe('Multi-user Support Integration Tests', () => {
  let integration: ActivityLoggingIntegration;
  
  beforeEach(async () => {
    integration = await createTestIntegration();
  });
  
  afterEach(async () => {
    await integration.shutdown();
  });
  
  test('複数ユーザーが同時に利用可能', async () => {
    const user1Id = 'test-user-1';
    const user2Id = 'test-user-2';
    
    // 両ユーザーが独立してログを記録
    const message1 = createMockMessage(user1Id, 'プロジェクトA開始');
    const message2 = createMockMessage(user2Id, '会議参加');
    
    await integration.handleMessage(message1);
    await integration.handleMessage(message2);
    
    // データが分離されていることを確認
    const user1Logs = await integration.getRepository().getActivityLogs(user1Id);
    const user2Logs = await integration.getRepository().getActivityLogs(user2Id);
    
    expect(user1Logs).toHaveLength(1);
    expect(user2Logs).toHaveLength(1);
    expect(user1Logs[0].content).toBe('プロジェクトA開始');
    expect(user2Logs[0].content).toBe('会議参加');
  });
  
  test('新規ユーザーの自動登録', async () => {
    const newUserId = 'new-user-test';
    const username = 'TestUser';
    
    // 初回メッセージ送信
    const message = createMockMessage(newUserId, 'はじめてのメッセージ', username);
    await integration.handleMessage(message);
    
    // ユーザーが登録されていることを確認
    const userExists = await integration.getRepository().userExists(newUserId);
    expect(userExists).toBe(true);
    
    // ユーザー情報が正しく設定されていることを確認
    const userInfo = await integration.getRepository().getUserInfo(newUserId);
    expect(userInfo).not.toBeNull();
    expect(userInfo!.userId).toBe(newUserId);
    expect(userInfo!.username).toBe(username);
    expect(userInfo!.timezone).toBe('Asia/Tokyo');
  });
  
  test('プロファイル表示機能', async () => {
    const userId = 'profile-test-user';
    const username = 'ProfileUser';
    
    // ユーザー登録
    await integration.getRepository().registerUser(userId, username);
    
    // プロファイル取得
    const userInfo = await integration.getRepository().getUserInfo(userId);
    expect(userInfo).not.toBeNull();
    expect(userInfo!.username).toBe(username);
  });
});

// テストヘルパー関数
function createMockMessage(userId: string, content: string, username: string = 'TestUser') {
  return {
    author: {
      id: userId,
      username: username
    },
    content: content,
    reply: jest.fn()
  } as any;
}
```

## 🔄 TDD実装手順

### Red-Green-Refactorサイクル

1. **Red Phase**: 失敗するテストの作成
   - マルチユーザー処理のテスト作成
   - 現在のシングルユーザー制限により失敗

2. **Green Phase**: 最小限の実装
   - ユーザー制限コードの削除
   - 基本的な自動登録機能の実装

3. **Refactor Phase**: コードの改善
   - エラーハンドリングの強化
   - パフォーマンスの最適化
   - コード構造の整理

## 📊 実装チェックリスト

### Phase 1: 基本マルチユーザー対応
- [ ] ユーザー制限コードの削除
- [ ] IUserRepositoryインターフェースの定義
- [ ] SqliteActivityLogRepositoryの拡張
- [ ] 自動ユーザー登録機能の実装
- [ ] ウェルカムメッセージの実装
- [ ] 基本的なマルチユーザーテストの作成

### Phase 2: プロファイル機能
- [ ] UserProfile型定義の作成
- [ ] ProfileCommandHandlerの実装
- [ ] !profileコマンドの統合
- [ ] ユーザー統計機能の実装
- [ ] プロファイル表示テストの作成

### Phase 3: データベース拡張
- [ ] user_settings拡張マイグレーションの作成
- [ ] 統計取得メソッドの実装
- [ ] インデックスの追加
- [ ] マイグレーションテストの作成

### Phase 4: 統合テスト
- [ ] マルチユーザー統合テストの完成
- [ ] データ分離テストの実装
- [ ] パフォーマンステストの作成
- [ ] エラーケーステストの実装

## 🚨 注意事項

### セキュリティ
- 全てのユーザー入力をサニタイズ
- SQLインジェクション対策を確実に実施
- ユーザー間データアクセス制御の徹底

### パフォーマンス
- 大量ユーザー時のクエリ最適化
- 適切なインデックスの設定
- キャッシュ戦略の検討

### 既存データ保護
- 現在のTARGET_USER_IDユーザーのデータ保持
- マイグレーション時のデータ検証
- ロールバック機能の確保

## 📝 最終確認項目

実装完了後の確認事項：

1. **機能テスト**
   - 複数ユーザーの同時利用
   - 新規ユーザー自動登録
   - プロファイル表示
   - データ分離

2. **パフォーマンステスト**
   - 大量ログ処理
   - 同時アクセス
   - メモリ使用量

3. **セキュリティテスト**
   - 不正アクセス防止
   - データプライバシー
   - 入力検証

4. **後方互換性**
   - 既存ユーザーの継続利用
   - 既存コマンドの動作
   - データ整合性