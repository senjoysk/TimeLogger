/**
 * 🔴 Red Phase: MessageSelectionHandlerの最初の失敗するテスト
 * 
 * TDDサイクル：
 * 1. 🔴 Red - 失敗するテストを書く
 * 2. 🟢 Green - テストを通す最小限の実装
 * 3. ♻️ Refactor - リファクタリング
 */

import { MessageSelectionHandler } from '../../handlers/messageSelectionHandler';

describe('MessageSelectionHandlerの基本機能テスト', () => {
  test('MessageSelectionHandlerクラスが存在する', () => {
    // 最小限の実装により、テストが通る
    expect(() => {
      new MessageSelectionHandler();
    }).not.toThrow();
  });
});

describe('ユーザー選択肢UI表示機能テスト', () => {
  test('showSelectionUIメソッドが存在する', () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    expect(typeof handler.showSelectionUI).toBe('function');
  });

  test('showSelectionUIメソッドはDiscordメッセージを受け取る', () => {
    // 引数を受け取る実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockMessage = { reply: jest.fn() } as any;
    const mockUserId = 'test-user-123';
    const mockContent = 'テストメッセージ';
    
    expect(() => {
      handler.showSelectionUI(mockMessage, mockUserId, mockContent);
    }).not.toThrow();
  });

  test('showSelectionUIメソッドは実際にDiscordメッセージを送信する', async () => {
    // EmbedとButtonを含むUIが正しく表示される
    const handler = new MessageSelectionHandler();
    const mockMessage = { reply: jest.fn().mockResolvedValue({}) } as any;
    const mockUserId = 'test-user-123';
    const mockContent = 'テストメッセージ';
    
    await handler.showSelectionUI(mockMessage, mockUserId, mockContent);
    
    expect(mockMessage.reply).toHaveBeenCalledWith({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            title: '📝 メッセージの種類を選択してください'
          })
        })
      ]),
      components: expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                label: '📋 TODO'
              })
            })
          ])
        })
      ])
    });
  });
});

describe('ボタンインタラクション処理テスト', () => {
  test('handleButtonInteractionメソッドが存在する', () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    expect(typeof handler.handleButtonInteraction).toBe('function');
  });

  test('handleButtonInteractionメソッドは必要な引数を受け取る', () => {
    // 引数を受け取る実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockInteraction = { 
      customId: 'select_TODO',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({})
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    expect(() => {
      handler.handleButtonInteraction(mockInteraction, mockUserId, mockTimezone);
    }).not.toThrow();
  });

  test('🟢 Green Phase: TODO選択時にインタラクションを更新する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockInteraction = { 
      customId: 'select_TODO',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({}),
      editReply: jest.fn().mockResolvedValue({})
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    await handler.handleButtonInteraction(mockInteraction, mockUserId, mockTimezone);
    
    // 最初に処理中メッセージが表示される
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: '📋 TODO作成中...',
      embeds: [],
      components: []
    });
    
    // その後、完了メッセージが表示される
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: '📋 TODOとして登録しました！'
    });
  });

  test('🟢 Green Phase: 活動ログ選択時にインタラクションを更新する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockInteraction = { 
      customId: 'select_ACTIVITY_LOG',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({}),
      editReply: jest.fn().mockResolvedValue({})
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    await handler.handleButtonInteraction(mockInteraction, mockUserId, mockTimezone);
    
    // 最初に処理中メッセージが表示される
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: '📝 活動ログ記録中...',
      embeds: [],
      components: []
    });
    
    // その後、完了メッセージが表示される
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: '📝 活動ログとして記録しました！'
    });
  });

  test('🟢 Green Phase: メモ選択時にインタラクションを更新する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockInteraction = { 
      customId: 'select_MEMO',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({}),
      editReply: jest.fn().mockResolvedValue({})
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    await handler.handleButtonInteraction(mockInteraction, mockUserId, mockTimezone);
    
    // 新しい2段階処理に対応：まず「保存中...」で更新
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: '📄 メモ保存中...',
      embeds: [],
      components: []
    });
    
    // その後「保存完了」で編集
    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: '📄 メモとして保存しました！'
    });
  });

  test('🟢 Green Phase: キャンセル選択時にインタラクションを更新する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockInteraction = { 
      customId: 'select_CANCEL',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({})
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    await handler.handleButtonInteraction(mockInteraction, mockUserId, mockTimezone);
    
    expect(mockInteraction.update).toHaveBeenCalledWith({
      content: 'キャンセルしました。',
      embeds: [],
      components: []
    });
  });
});

describe('メッセージ内容保存テスト', () => {
  test('🟢 Green Phase: showSelectionUI呼び出し時にメッセージ内容を保存する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockMessage = { reply: jest.fn().mockResolvedValue({}) } as any;
    const mockUserId = 'test-user-123';
    const mockContent = 'テストメッセージ内容';
    
    await handler.showSelectionUI(mockMessage, mockUserId, mockContent);
    
    // メッセージ内容が保存されていることを確認
    expect(handler.getStoredMessage(mockUserId)).toBe(mockContent);
  });

  test('🟢 Green Phase: ボタン選択時に保存されたメッセージ内容を取得する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockUserId = 'test-user-123';
    const mockContent = 'テストメッセージ内容';
    
    // 事前にメッセージ内容を保存
    await handler.showSelectionUI({ reply: jest.fn() } as any, mockUserId, mockContent);
    
    const mockInteraction = { 
      customId: 'select_TODO',
      user: { id: mockUserId },
      update: jest.fn().mockResolvedValue({})
    } as any;
    
    // ボタン処理前にメッセージ内容を確認
    const storedMessageBefore = handler.getStoredMessage(mockUserId);
    expect(storedMessageBefore).toBe(mockContent);
    
    await handler.handleButtonInteraction(mockInteraction, mockUserId, 'Asia/Tokyo');
    
    // 処理完了後、メッセージは削除される
    const storedMessageAfter = handler.getStoredMessage(mockUserId);
    expect(storedMessageAfter).toBeUndefined();
  });
});

describe('ActivityLoggingIntegration統合テスト', () => {
  test('🟢 Green Phase: AI分類の代わりにMessageSelectionHandlerを使用する', async () => {
    // 最小限の実装により、テストが通る
    const handler = new MessageSelectionHandler();
    const mockMessage = { 
      reply: jest.fn().mockResolvedValue({}),
      content: 'テストメッセージ内容'
    } as any;
    const mockUserId = 'test-user-123';
    const mockTimezone = 'Asia/Tokyo';
    
    // ActivityLoggingIntegrationのprocessMessage相当の動作をテスト
    const result = await handler.processNonCommandMessage(mockMessage, mockUserId, mockTimezone);
    
    // AI分類ではなく、ユーザー選択UIが表示されることを確認
    expect(mockMessage.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: '📝 メッセージの種類を選択してください'
            })
          })
        ])
      })
    );
    expect(result).toBe(true); // 処理成功
  });
});

describe('実際の処理統合テスト', () => {
  test('🟢 Green Phase: TODO選択時に依存サービスでTODO作成する', async () => {
    // 最小限の実装により、テストが通る
    const mockTodoRepository = {
      createTodo: jest.fn().mockResolvedValue({ id: 'todo-123' })
    };
    
    const handler = new MessageSelectionHandler();
    handler.setTodoRepository(mockTodoRepository as any);
    
    // 事前にメッセージ内容を保存
    await handler.showSelectionUI({ reply: jest.fn() } as any, 'test-user-123', 'テストメッセージ内容');
    
    const mockInteraction = { 
      customId: 'select_TODO',
      user: { id: 'test-user-123' },
      update: jest.fn().mockResolvedValue({}),
      editReply: jest.fn().mockResolvedValue({})
    } as any;
    
    await handler.handleButtonInteraction(mockInteraction, 'test-user-123', 'Asia/Tokyo');
    
    // 実際にTODO作成処理が呼ばれることを確認
    expect(mockTodoRepository.createTodo).toHaveBeenCalledWith({
      userId: 'test-user-123',
      content: 'テストメッセージ内容',
      status: 'pending',
      priority: 'medium',
      dueDate: null,
      timezone: 'Asia/Tokyo'
    });
  });
});