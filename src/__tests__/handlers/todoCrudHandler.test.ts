/**
 * TodoCrudHandler のテスト
 * TODOコマンドの解析とCRUD操作の動作確認
 */

import { Message } from 'discord.js';
import { TodoCrudHandler } from '../../handlers/todoCrudHandler';
import { ITodoRepository } from '../../repositories/interfaces';
import { Todo, CreateTodoRequest } from '../../types/todo';

// モックインターフェース実装
class MockTodoRepository implements ITodoRepository {
  private todos: Todo[] = [];
  private nextId = 1;

  async createTodo(request: CreateTodoRequest): Promise<Todo> {
    const uniquePrefix = `${this.nextId.toString(36).padStart(8, '0')}`;
    const uuid = `${uniquePrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const todo: Todo = {
      id: uuid,
      userId: request.userId,
      content: request.content,
      status: 'pending',
      priority: request.priority || 0,
      dueDate: request.dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: undefined,
      sourceType: request.sourceType || 'manual',
      relatedActivityId: request.relatedActivityId,
      aiConfidence: request.aiConfidence
    };
    this.todos.push(todo);
    this.nextId++;
    return todo;
  }

  async getTodoById(id: string): Promise<Todo | null> {
    return this.todos.find(todo => todo.id === id) || null;
  }

  async getTodosByUserId(userId: string): Promise<Todo[]> {
    return this.todos.filter(todo => todo.userId === userId);
  }

  async updateTodo(id: string, update: any): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    Object.assign(todo, update);
    todo.updatedAt = new Date().toISOString();
  }

  async updateTodoStatus(id: string, status: any): Promise<void> {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;
    todo.status = status;
    todo.updatedAt = new Date().toISOString();
    if (status === 'completed') {
      todo.completedAt = new Date().toISOString();
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return;
    this.todos.splice(index, 1);
  }

  async searchTodos(userId: string, keyword: string): Promise<Todo[]> {
    return this.todos.filter(todo => 
      todo.userId === userId && 
      todo.content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async getTodoStats(userId: string) { 
    return { 
      total: 0, pending: 0, completed: 0, inProgress: 0,
      cancelled: 0, overdue: 0, todayCompleted: 0, weekCompleted: 0
    }; 
  }
  async getTodosWithDueDate() { return []; }
  async getTodosByActivityId() { return []; }
  async getTodosByDateRange() { return []; }
  async getTodosByStatusOptimized(userId: string, statuses: string[]) { 
    return this.todos.filter(todo => 
      todo.userId === userId && 
      statuses.includes(todo.status)
    ); 
  }
}

// Discord.jsオブジェクトのモック
const createMockMessage = (content: string, userId: string = 'test-user'): any => ({
  content,
  author: { id: userId },
  reply: jest.fn().mockResolvedValue({})
});

describe('TodoCrudHandler分離テスト', () => {
  let handler: TodoCrudHandler;
  let mockTodoRepo: MockTodoRepository;

  beforeEach(() => {
    mockTodoRepo = new MockTodoRepository();
    handler = new TodoCrudHandler(mockTodoRepo);
  });

  describe('コマンド解析機能', () => {
    test('TODO追加コマンドが正しく解析される', async () => {
      const message = createMockMessage('!todo add 新しいTODO', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add', '新しいTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✅ TODO「新しいTODO」を追加しました！');
      
      const todos = await mockTodoRepo.getTodosByUserId('test-user');
      expect(todos).toHaveLength(1);
      expect(todos[0].content).toBe('新しいTODO');
    });

    test('TODO完了コマンドが正しく解析される', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage(`!todo done ${todo.id}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', todo.id], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith(`🎉 TODO「${todo.content}」を完了しました！`);
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.status).toBe('completed');
    });

    test('不正なコマンドでエラーメッセージが表示される', async () => {
      const message = createMockMessage('!todo add', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['add'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyText = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyText).toContain('❌');
      expect(replyText).toContain('TODO内容を入力してください');
    });
  });

  describe('CRUD操作機能', () => {
    test('TODO一覧表示が正しく動作する', async () => {
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage('!todo', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODO一覧');
      
      // ボタンコンポーネントの存在を確認
      expect(replyCall).toHaveProperty('components');
      expect(replyCall.components).toBeDefined();
      // 1つのTODOがあるので1つのアクションボタン行がある
      expect(replyCall.components).toHaveLength(1);
    });

    test('11件以上のTODOでページネーション機能が有効になる', async () => {
      // 15件のTODOを作成
      for (let i = 1; i <= 15; i++) {
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: `TODO ${i}`
        });
      }

      const message = createMockMessage('!todo', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('components');
      
      // ページネーションボタン（1行）+ 番号ボタン（2行）= 3行
      expect(replyCall.components).toHaveLength(3);
      
      // 最初のコンポーネントがページネーションボタンであることを確認
      const paginationRow = replyCall.components[0];
      expect(paginationRow.components).toHaveLength(3); // 前・現在・次のページボタン
      
      // 2行目と3行目が番号ボタンであることを確認
      const numberRow1 = replyCall.components[1];
      expect(numberRow1.components).toHaveLength(5); // 1-5の番号ボタン
      const numberRow2 = replyCall.components[2];
      expect(numberRow2.components).toHaveLength(5); // 6-10の番号ボタン
    });

    test('TODO編集が正しく動作する', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '元のTODO'
      });

      const message = createMockMessage(`!todo edit ${todo.id} 編集されたTODO`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['edit', todo.id, '編集されたTODO'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('✏️ TODO「元のTODO」を「編集されたTODO」に編集しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(updatedTodo?.content).toBe('編集されたTODO');
    });

    test('TODO削除が正しく動作する', async () => {
      const todo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: 'テスト用TODO'
      });

      const message = createMockMessage(`!todo delete ${todo.id}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['delete', todo.id], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith(`🗑️ TODO「${todo.content}」を削除しました。`);
      
      const deletedTodo = await mockTodoRepo.getTodoById(todo.id);
      expect(deletedTodo).toBeNull();
    });

    test('TODO検索が正しく動作する', async () => {
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '資料を作成する'
      });
      
      await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '会議に参加する'
      });

      const message = createMockMessage('!todo search 資料', 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['search', '資料'], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('🔍 検索結果: "資料"');
    });
  });

  describe('ヘルプ機能', () => {
    test('ヘルプコマンドが正しく動作する', async () => {
      const message = createMockMessage('!todo help', 'test-user') as Message;
      
      await handler.showHelp(message);
      
      expect(message.reply).toHaveBeenCalled();
      const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
      expect(replyCall).toHaveProperty('embeds');
      expect(replyCall.embeds[0].data.title).toBe('📋 TODOコマンドヘルプ');
    });
  });

  describe('短縮ID対応', () => {
    test('短縮IDでTODO操作ができる', async () => {
      const testTodo = await mockTodoRepo.createTodo({
        userId: 'test-user',
        content: '短縮IDテスト',
        priority: 0,
      });

      const shortId = testTodo.id.substring(0, 8);
      const message = createMockMessage(`!todo done ${shortId}`, 'test-user') as Message;
      
      await handler.handleCommand(message, 'test-user', ['done', shortId], 'Asia/Tokyo');
      
      expect(message.reply).toHaveBeenCalledWith('🎉 TODO「短縮IDテスト」を完了しました！');
      
      const updatedTodo = await mockTodoRepo.getTodoById(testTodo.id);
      expect(updatedTodo?.status).toBe('completed');
    });
  });

  describe('優先度対応機能', () => {
    describe('優先度によるソート', () => {
      test('TODO一覧が優先度順にソートされる', async () => {
        // 異なる優先度のTODOを作成
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '低優先度タスク',
          priority: -1
        });
        
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '高優先度タスク',
          priority: 1
        });
        
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '普通優先度タスク',
          priority: 0
        });

        const message = createMockMessage('!todo', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', [], 'Asia/Tokyo');
        
        const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
        const embedDescription = replyCall.embeds[0].data.description;
        
        // リストはEmbedのdescriptionフィールドに格納される
        expect(embedDescription).toContain('高優先度タスク');
        expect(embedDescription).toContain('🔴');
        
        // その後に普通優先度、低優先度の順で表示される
        const lines = embedDescription.split('\n');
        
        // 1番目は高優先度（priority: 1）
        expect(lines[0]).toContain('高優先度タスク');
        // 2番目は普通優先度（priority: 0）
        expect(lines[1]).toContain('普通優先度タスク');
        // 3番目は低優先度（priority: -1）
        expect(lines[2]).toContain('低優先度タスク');
      });

      test('検索結果も優先度順にソートされる', async () => {
        // 同じキーワードを含む異なる優先度のTODOを作成
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '資料作成（低優先度）',
          priority: -1
        });
        
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '資料準備（高優先度）',
          priority: 1
        });
        
        await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '資料確認（普通優先度）',
          priority: 0
        });

        const message = createMockMessage('!todo search 資料', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['search', '資料'], 'Asia/Tokyo');
        
        const replyCall = (message.reply as jest.Mock).mock.calls[0][0];
        const embedDescription = replyCall.embeds[0].data.description;
        
        // 検索結果も優先度順にソートされている
        const lines = embedDescription.split('\n');
        
        // 1番目は高優先度
        expect(lines[0]).toContain('資料準備（高優先度）');
        // 2番目は普通優先度
        expect(lines[1]).toContain('資料確認（普通優先度）');
        // 3番目は低優先度
        expect(lines[2]).toContain('資料作成（低優先度）');
      });
    });

    describe('TODO追加時の優先度設定', () => {
      test('優先度を指定してTODOを追加できる', async () => {
        const message = createMockMessage('!todo add 高優先度タスク 1', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['add', '高優先度タスク', '1'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith(expect.stringContaining('✅ TODO「高優先度タスク」を追加しました！'));
        
        const todos = await mockTodoRepo.getTodosByUserId('test-user');
        const addedTodo = todos.find(t => t.content === '高優先度タスク');
        expect(addedTodo?.priority).toBe(1);
      });

      test('優先度を省略した場合はデフォルト値（0）になる', async () => {
        const message = createMockMessage('!todo add 通常タスク', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['add', '通常タスク'], 'Asia/Tokyo');
        
        const todos = await mockTodoRepo.getTodosByUserId('test-user');
        const addedTodo = todos.find(t => t.content === '通常タスク');
        expect(addedTodo?.priority).toBe(0);
      });

      test('無効な優先度値の場合はエラーメッセージを表示する', async () => {
        const message = createMockMessage('!todo add タスク 2', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['add', 'タスク', '2'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
      });
    });

    describe('TODO編集時の優先度変更', () => {
      let testTodo: Todo;

      beforeEach(async () => {
        testTodo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '編集テスト用TODO',
          priority: 0
        });
      });

      test('内容のみ編集（優先度は変更しない）', async () => {
        const message = createMockMessage(`!todo edit ${testTodo.id} 新しい内容`, 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['edit', testTodo.id, '新しい内容'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('✏️ TODO「編集テスト用TODO」を「新しい内容」に編集しました！');
        
        const updated = await mockTodoRepo.getTodoById(testTodo.id);
        expect(updated?.content).toBe('新しい内容');
        expect(updated?.priority).toBe(0); // 優先度は変更されない
      });

      test('内容と優先度を同時に編集', async () => {
        const message = createMockMessage(`!todo edit ${testTodo.id} 重要なタスク 1`, 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['edit', testTodo.id, '重要なタスク', '1'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('✏️ TODO「編集テスト用TODO」を「重要なタスク」に編集しました！（優先度: 高（🔴））');
        
        const updated = await mockTodoRepo.getTodoById(testTodo.id);
        expect(updated?.content).toBe('重要なタスク');
        expect(updated?.priority).toBe(1);
      });

      test('編集時の無効な優先度値はエラーになる', async () => {
        const message = createMockMessage(`!todo edit ${testTodo.id} 新しい内容 5`, 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['edit', testTodo.id, '新しい内容', '5'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
      });
    });

    describe('優先度のみ変更', () => {
      let testTodo: Todo;

      beforeEach(async () => {
        testTodo = await mockTodoRepo.createTodo({
          userId: 'test-user',
          content: '優先度変更テスト',
          priority: 0
        });
      });

      test('priorityコマンドで優先度のみ変更できる', async () => {
        const message = createMockMessage(`!todo priority ${testTodo.id} 1`, 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['priority', testTodo.id, '1'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('📊 TODO「優先度変更テスト」の優先度を「高（🔴）」に変更しました！');
        
        const updated = await mockTodoRepo.getTodoById(testTodo.id);
        expect(updated?.priority).toBe(1);
        expect(updated?.content).toBe('優先度変更テスト'); // 内容は変更されない
      });

      test('無効な優先度値はエラーになる', async () => {
        const message = createMockMessage(`!todo priority ${testTodo.id} abc`, 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['priority', testTodo.id, 'abc'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('❌ 優先度は 1（高）、0（普通）、-1（低）のいずれかを指定してください。');
      });

      test('存在しないTODOの優先度変更はエラーになる', async () => {
        const message = createMockMessage('!todo priority invalid-id 1', 'test-user') as Message;
        
        await handler.handleCommand(message, 'test-user', ['priority', 'invalid-id', '1'], 'Asia/Tokyo');
        
        expect(message.reply).toHaveBeenCalledWith('❌ 指定されたTODOが見つかりません。');
      });
    });
  });
});