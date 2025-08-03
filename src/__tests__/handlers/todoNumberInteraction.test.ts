/**
 * 🔴 Red Phase: TODO番号ボタンインタラクションテスト
 * TDD開発: 番号ボタンクリック時の詳細表示機能のテスト
 */

import { ButtonInteraction, Message, EmbedBuilder } from 'discord.js';
import { TodoInteractionHandler } from '../../handlers/todoInteractionHandler';
import { ITodoRepository } from '../../repositories/interfaces';
import { Todo } from '../../types/todo';

// モックの作成
const mockTodoRepository = {
  getTodosByUserId: jest.fn(),
  getTodoById: jest.fn(),
  getTodosByStatusOptimized: jest.fn(),
} as unknown as ITodoRepository;

describe('🔴 Red Phase: TODO番号ボタンインタラクションテスト', () => {
  let handler: TodoInteractionHandler;
  let mockInteraction: ButtonInteraction;

  beforeEach(() => {
    handler = new TodoInteractionHandler(mockTodoRepository);
    jest.clearAllMocks();

    // ButtonInteractionのモック
    mockInteraction = {
      customId: '',
      user: { id: 'user123' },
      reply: jest.fn(),
      update: jest.fn(),
      deferReply: jest.fn(),
      editReply: jest.fn(),
      followUp: jest.fn(),
      ephemeral: false,
      replied: false,
      deferred: false,
    } as unknown as ButtonInteraction;
  });

  describe('番号ボタンクリック時の動作', () => {
    test('番号ボタン"1"をクリックすると、1番目のTODOの詳細が表示される', async () => {
      // Arrange
      const mockTodos: Todo[] = [
        {
          id: 'todo-001',
          userId: 'user123',
          content: '資料を作成する',
          status: 'pending',
          priority: 1,
          sourceType: 'manual' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'todo-002',
          userId: 'user123',
          content: 'メールを送信する',
          status: 'in_progress',
          priority: 0,
          sourceType: 'manual' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue(mockTodos);
      mockInteraction.customId = 'todo_number_1';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('TODO詳細 #1'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining('内容'),
                  value: expect.stringContaining('資料を作成する')
                })
              ])
            })
          })
        ]),
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  label: expect.stringContaining('完了'),
                  custom_id: 'todo_complete_todo-001'
                })
              })
            ])
          })
        ]),
        ephemeral: true
      }));
    });

    test('番号ボタン"5"をクリックすると、5番目のTODOの詳細が表示される', async () => {
      // Arrange
      const mockTodos: Todo[] = Array.from({ length: 10 }, (_, i) => ({
        id: `todo-${String(i + 1).padStart(3, '0')}`,
        userId: 'user123',
        content: `タスク${i + 1}`,
        status: i % 2 === 0 ? 'pending' : 'in_progress',
        priority: 0,
        sourceType: 'manual' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }));

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue(mockTodos);
      mockInteraction.customId = 'todo_number_5';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('TODO詳細 #5'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining('内容'),
                  value: expect.stringContaining('タスク5')
                })
              ])
            })
          })
        ]),
        ephemeral: true
      }));
    });

    test('存在しない番号のボタンをクリックするとエラーメッセージが表示される', async () => {
      // Arrange
      const mockTodos: Todo[] = [
        {
          id: 'todo-001',
          userId: 'user123',
          content: 'タスク1',
          status: 'pending',
          priority: 0,
          sourceType: 'manual' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue(mockTodos);
      mockInteraction.customId = 'todo_number_2';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('指定されたTODOが見つかりません'),
        ephemeral: true
      }));
    });

    test('TODOがない状態で番号ボタンをクリックするとエラーメッセージが表示される', async () => {
      // Arrange
      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue([]);
      mockInteraction.customId = 'todo_number_1';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('TODOが見つかりません'),
        ephemeral: true
      }));
    });
  });

  describe('詳細表示の内容', () => {
    test('TODO詳細には、内容、ステータス、優先度、作成日時が含まれる', async () => {
      // Arrange
      const mockTodo: Todo = {
        id: 'todo-001',
        userId: 'user123',
        content: 'プレゼン資料を作成する',
        status: 'in_progress',
        priority: 1,
        sourceType: 'manual' as const,
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
        dueDate: '2024-01-05'
      };

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue([mockTodo]);
      mockInteraction.customId = 'todo_number_1';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining('内容'),
                  value: expect.stringContaining('プレゼン資料を作成する')
                }),
                expect.objectContaining({
                  name: expect.stringContaining('ステータス'),
                  value: expect.stringContaining('🚀')
                }),
                expect.objectContaining({
                  name: expect.stringContaining('優先度'),
                  value: expect.stringContaining('🔴')
                }),
                expect.objectContaining({
                  name: expect.stringContaining('期日'),
                  value: expect.stringContaining('2024-01-05')
                })
              ])
            })
          })
        ])
      }));
    });

    test('ページ2で番号ボタン"11"をクリックすると、11番目のTODOの詳細が表示される', async () => {
      // Arrange
      const mockTodos: Todo[] = Array.from({ length: 20 }, (_, i) => ({
        id: `todo-${String(i + 1).padStart(3, '0')}`,
        userId: 'user123',
        content: `TODO項目 ${i + 1}`,
        status: (i + 1) % 2 === 0 ? 'in_progress' : 'pending',
        priority: i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : -1,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      } as Todo));

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue(mockTodos);
      mockInteraction.customId = 'todo_number_11';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('#11'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining('内容'),
                  value: 'TODO項目 11' // 11番目のTODOの内容
                }),
                expect.objectContaining({
                  name: expect.stringContaining('ステータス'),
                  value: expect.stringContaining('⏳') // pending
                })
              ])
            })
          })
        ])
      }));
    });

    test('番号ボタン"25"をクリックすると、25番目のTODOの詳細が表示される', async () => {
      // Arrange
      const mockTodos: Todo[] = Array.from({ length: 30 }, (_, i) => ({
        id: `todo-${String(i + 1).padStart(3, '0')}`,
        userId: 'user123',
        content: `タスク ${i + 1}`,
        status: 'pending',
        priority: 0,
        createdAt: new Date('2024-01-01').toISOString(),
        updatedAt: new Date('2024-01-01').toISOString(),
      } as Todo));

      (mockTodoRepository.getTodosByStatusOptimized as jest.Mock).mockResolvedValue(mockTodos);
      mockInteraction.customId = 'todo_number_25';

      // Act
      await handler.handleTodoNumberButton(mockInteraction, 'user123');

      // Assert
      expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('#25'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: expect.stringContaining('内容'),
                  value: 'タスク 25' // 25番目のTODOの内容
                })
              ])
            })
          })
        ])
      }));
    });
  });
});