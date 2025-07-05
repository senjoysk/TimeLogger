# TODO機能仕様書

## 📋 概要

TimeLoggerBotにTODO管理機能を追加し、活動ログと統合された総合的な生産性管理システムを実現する。

## 🎯 基本方針

### 1. 統合アーキテクチャ
- **単一Bot**: 既存のTimeLoggerBotに機能追加
- **統合DB**: 活動ログと同一データベースでTODO管理
- **統合分析**: 活動ログとTODOの相関分析を実現

### 2. ユーザー体験の設計
- **コマンドレス入力**: LLMによる自動判定で操作を簡素化
- **直感的操作**: ボタンインタラクションによる確認・実行
- **統合ビュー**: 活動ログとTODOの一元管理

## 🔧 技術仕様

### データベース設計

#### todo_tasks テーブル
```sql
CREATE TABLE IF NOT EXISTS todo_tasks (
    id TEXT PRIMARY KEY,                    -- UUID
    user_id TEXT NOT NULL,                  -- Discord User ID
    content TEXT NOT NULL,                  -- TODO内容
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority INTEGER DEFAULT 0,            -- 優先度 (0: 通常, 1: 高, -1: 低)
    due_date TEXT,                         -- 期日 (ISO 8601)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    completed_at TEXT,                     -- 完了日時
    source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_suggested', 'activity_derived')),
    related_activity_id TEXT,              -- 関連する活動ログID
    ai_confidence REAL,                    -- AI判定の信頼度 (0.0-1.0)
    FOREIGN KEY (related_activity_id) REFERENCES activity_logs(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_todo_tasks_user_id ON todo_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_status ON todo_tasks(status);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_due_date ON todo_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_tasks_created_at ON todo_tasks(created_at);
```

### LLM判定システム

#### 判定フロー
1. **メッセージ受信**: ユーザーがDMでメッセージ送信
2. **AI分析**: GeminiServiceで内容を分析
3. **判定結果表示**: 分析結果とボタンを表示
4. **ユーザー確認**: ボタンクリックで最終決定
5. **データ保存**: 確定した分類でデータベースに保存

#### 判定プロンプト
```typescript
const classificationPrompt = `
以下のメッセージを分析して、以下の4つのカテゴリに分類してください：

1. **TODO**: 将来実行予定のタスク・作業
   - 例: "資料を作成する", "会議の準備をする", "〇〇を完了させる"
   
2. **ACTIVITY_LOG**: 現在・過去の活動記録
   - 例: "資料作成中", "会議に参加した", "〇〇を完了した"
   
3. **MEMO**: 参考情報・メモ
   - 例: "〇〇について調べた結果", "参考リンク", "アイデア"
   
4. **UNCERTAIN**: 判定が困難な場合

メッセージ: "${message}"

以下のJSON形式で回答してください：
{
  "classification": "TODO|ACTIVITY_LOG|MEMO|UNCERTAIN",
  "confidence": 0.85,
  "reason": "判定理由",
  "suggested_action": "推奨アクション",
  "priority": 0,
  "due_date_suggestion": null
}
`;
```

### インタラクティブUI

#### 判定結果表示
```typescript
// ボタンコンポーネント
const classificationButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_todo')
            .setLabel('✅ TODO登録')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('confirm_activity')
            .setLabel('📝 活動ログ')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('confirm_memo')
            .setLabel('📄 メモ')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ignore')
            .setLabel('❌ 無視')
            .setStyle(ButtonStyle.Danger)
    );

// 判定結果メッセージ
const embed = new EmbedBuilder()
    .setTitle('🤖 AI判定結果')
    .setDescription(`**分類**: ${classification}`)
    .addFields(
        { name: '信頼度', value: `${confidence * 100}%`, inline: true },
        { name: '理由', value: reason, inline: false }
    )
    .setColor(classification === 'TODO' ? 0x00ff00 : 0x0099ff);
```

#### TODO一覧表示
```typescript
// TODO一覧の表示形式
const todoListEmbed = new EmbedBuilder()
    .setTitle('📋 TODO一覧')
    .setDescription('現在のTODOリストです')
    .setColor(0x00ff00);

// 各TODO項目にボタンを追加
todos.forEach((todo, index) => {
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`todo_done_${todo.id}`)
                .setLabel('✅ 完了')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`todo_edit_${todo.id}`)
                .setLabel('✏️ 編集')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`todo_delete_${todo.id}`)
                .setLabel('🗑️ 削除')
                .setStyle(ButtonStyle.Danger)
        );
});
```

## 🔄 ユーザーフロー

### 1. TODO登録フロー
```
1. ユーザー: "プレゼン資料を作成する"
2. Bot: 🤖 これはTODOのようです (信頼度: 85%)
   [✅ TODO登録] [📝 活動ログ] [📄 メモ] [❌ 無視]
3. ユーザー: [✅ TODO登録] をクリック
4. Bot: ✅ TODO「プレゼン資料を作成する」を登録しました
```

### 2. TODO完了フロー
```
1. ユーザー: !todo (またはメッセージ判定で一覧表示)
2. Bot: 📋 TODO一覧
   1. プレゼン資料を作成する [✅ 完了] [✏️ 編集] [🗑️ 削除]
   2. 会議の準備をする [✅ 完了] [✏️ 編集] [🗑️ 削除]
3. ユーザー: [✅ 完了] をクリック
4. Bot: 🎉 TODO「プレゼン資料を作成する」を完了しました！
   → 活動ログに「TODO: プレゼン資料を作成する を完了」を自動記録
```

### 3. 統合分析フロー
```
1. ユーザー: !summary (既存コマンド)
2. Bot: 📊 今日の活動サマリー
   ✅ 完了したTODO: 3件
   📝 活動ログ: 8件
   ⏱️ 推定作業時間: 6時間
   🎯 TODO達成率: 75%
```

## 🎯 コマンド仕様

### 明示的コマンド
```
!todo                    # TODO一覧表示
!todo add [内容]         # TODO追加
!todo done [ID]          # TODO完了
!todo edit [ID]          # TODO編集
!todo delete [ID]        # TODO削除
!todo priority [ID] [優先度] # 優先度設定
!todo due [ID] [期日]    # 期日設定
!todo search [キーワード] # TODO検索
```

### 自動判定 (コマンドレス)
```
# AI判定によるコマンドレス操作
"明日までに資料を完成させる"  → TODO判定
"資料作成を完了した"         → 活動ログ判定
"参考になるリンクを保存"     → メモ判定
```

## 📊 統合分析機能

### 活動ログとTODOの相関分析
```typescript
// 統合分析のデータ構造
interface IntegratedAnalysis {
  date: string;
  todoStats: {
    created: number;
    completed: number;
    completionRate: number;
    averageCompletionTime: number;
  };
  activityStats: {
    totalEntries: number;
    estimatedWorkTime: number;
    mainCategories: string[];
  };
  correlations: {
    todoToActivityRatio: number;
    productivityScore: number;
    recommendations: string[];
  };
}
```

### 生産性指標
- **TODO達成率**: 完了/作成 × 100
- **作業効率**: 推定時間/実際時間
- **タスク分散度**: TODOカテゴリの多様性
- **計画精度**: 期日設定の適切性

## 🔧 実装コンポーネント

### 1. データアクセス層
```typescript
// ITodoRepository
interface ITodoRepository {
  createTodo(todo: CreateTodoRequest): Promise<Todo>;
  getTodosByUserId(userId: string): Promise<Todo[]>;
  updateTodoStatus(id: string, status: TodoStatus): Promise<void>;
  deleteTodo(id: string): Promise<void>;
  getTodoById(id: string): Promise<Todo | null>;
  searchTodos(userId: string, keyword: string): Promise<Todo[]>;
}

// SqliteTodoRepository (SqliteActivityLogRepositoryに統合)
class SqliteActivityLogRepository implements IActivityLogRepository, ITodoRepository {
  // 既存のactivity_logs機能
  // + 新しいtodo_tasks機能
}
```

### 2. サービス層
```typescript
// TodoService
class TodoService {
  constructor(
    private repository: ITodoRepository,
    private aiService: GeminiService
  ) {}

  async classifyMessage(message: string): Promise<MessageClassification>;
  async createTodo(request: CreateTodoRequest): Promise<Todo>;
  async completeTodo(id: string): Promise<void>;
  async generateTodoFromActivity(activityLog: ActivityLog): Promise<Todo[]>;
}

// MessageClassificationService
class MessageClassificationService {
  async classifyMessage(content: string): Promise<MessageClassification>;
  async improveClassificationAccuracy(
    content: string, 
    actualClass: string
  ): Promise<void>;
}
```

### 3. ハンドラー層
```typescript
// TodoCommandHandler
class TodoCommandHandler {
  async handleTodoCommand(message: Message): Promise<void>;
  async handleTodoInteraction(interaction: ButtonInteraction): Promise<void>;
  async handleMessageClassification(message: Message): Promise<void>;
}
```

### 4. 統合層
```typescript
// ActivityLoggingIntegration (既存クラスを拡張)
class ActivityLoggingIntegration {
  private todoService: TodoService;
  private classificationService: MessageClassificationService;

  // 既存の活動ログ機能
  // + 新しいTODO機能
  // + メッセージ自動分類機能
}
```

## 🧪 テスト戦略

### TDD開発サイクル
1. **Red**: 失敗するテストを書く
2. **Green**: 最小限の実装でテストを通す
3. **Refactor**: 品質を向上させる

### テストカバレッジ目標
- **ユニットテスト**: 90%以上
- **統合テスト**: 80%以上
- **E2Eテスト**: 主要フローを100%カバー

### 重要なテストケース
```typescript
describe('TODO機能', () => {
  describe('メッセージ分類', () => {
    test('TODO判定の精度', async () => {
      // AI判定の精度テスト
    });
    
    test('活動ログとの区別', async () => {
      // 活動ログとの分類精度テスト
    });
  });

  describe('TODOライフサイクル', () => {
    test('TODO作成・完了・削除', async () => {
      // CRUD操作テスト
    });
  });

  describe('統合分析', () => {
    test('活動ログとTODOの相関分析', async () => {
      // 統合分析機能テスト
    });
  });
});
```

## 🚀 実装フェーズ

### Phase 1: 基盤構築
- [ ] データベーススキーマ設計・実装
- [ ] ITodoRepository インターフェース定義
- [ ] SqliteActivityLogRepository へのTODO機能統合
- [ ] 基本的なTODO CRUD操作

### Phase 2: AI判定システム
- [ ] MessageClassificationService 実装
- [ ] GeminiService の拡張
- [ ] 判定精度の向上・学習機能
- [ ] 分類結果のUIコンポーネント

### Phase 3: インタラクティブUI
- [ ] Discord.js ボタンインタラクション
- [ ] TODO一覧表示・操作UI
- [ ] 確認ダイアログ・フィードバック
- [ ] エラーハンドリング・ユーザビリティ

### Phase 4: 統合機能
- [ ] ActivityLoggingIntegration への統合
- [ ] 活動ログとTODOの相関分析
- [ ] 統合サマリー機能
- [ ] 生産性指標・レコメンデーション

### Phase 5: 品質向上
- [ ] 包括的なテスト実装
- [ ] パフォーマンス最適化
- [ ] ユーザーフィードバック対応
- [ ] ドキュメント整備

## 📝 運用考慮事項

### データバックアップ
- 既存の活動ログと同様のバックアップ戦略
- TODO完了履歴の長期保存

### プライバシー・セキュリティ
- TODO内容の機密性を考慮
- AI分析時のデータ保護

### スケーラビリティ
- 大量のTODO項目への対応
- 長期間の履歴データ管理

### 監視・メンテナンス
- AI判定精度の監視
- ユーザー操作パターンの分析
- システム負荷の監視

---

## 🎯 成功指標

### 技術指標
- **テストカバレッジ**: 90%以上
- **AI判定精度**: 85%以上
- **レスポンス時間**: 2秒以内
- **システム稼働率**: 99.9%以上

### ユーザー体験指標
- **操作完了率**: 95%以上
- **エラー発生率**: 1%未満
- **機能利用率**: 週1回以上
- **満足度**: 4.5/5以上

### ビジネス指標
- **生産性向上**: TODO達成率向上
- **時間短縮**: 操作時間50%削減
- **統合効果**: 活動ログとTODOの相関分析活用
- **継続利用**: 月間アクティブ利用

---

この仕様書は、TDD開発方針に基づいて段階的に実装し、各フェーズで十分なテストを行いながら品質を確保していく予定です。