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