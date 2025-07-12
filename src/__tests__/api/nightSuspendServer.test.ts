/**
 * NightSuspendServer API テスト
 * TDD: Red Phase - 失敗するテストを書く
 */

import request from 'supertest';
import { NightSuspendServer } from '../../api/nightSuspendServer';
import { ActivityLoggingIntegration } from '../../integration/activityLoggingIntegration';

describe('NightSuspendServer API', () => {
  let server: NightSuspendServer;
  let app: any;
  let mockActivityIntegration: jest.Mocked<ActivityLoggingIntegration>;

  beforeEach(() => {
    // ActivityLoggingIntegrationのモック作成
    mockActivityIntegration = {
      checkSuspendSchedule: jest.fn()
    } as any;

    server = new NightSuspendServer(undefined, mockActivityIntegration);
    app = server.getApp();
  });

  describe('GET /api/schedule-check', () => {
    test('正常な場合にスケジュール情報を返す', async () => {
      // Arrange
      const mockScheduleResult = {
        shouldSuspend: false,
        shouldWake: false,
        suspendUsers: [],
        wakeUsers: [],
        currentUtc: new Date()
      };
      mockActivityIntegration.checkSuspendSchedule.mockResolvedValue(mockScheduleResult);

      // Act
      const response = await request(app)
        .get('/api/schedule-check')
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        shouldSuspend: false,
        shouldWake: false,
        suspendUsers: [],
        wakeUsers: [],
        currentUtc: mockScheduleResult.currentUtc.toISOString(),
        timestamp: expect.any(String)
      });
      expect(mockActivityIntegration.checkSuspendSchedule).toHaveBeenCalledWith(30);
    });

    test('ActivityLoggingIntegrationが未初期化の場合に503エラーを返す', async () => {
      // Arrange
      const serverWithoutIntegration = new NightSuspendServer();
      const appWithoutIntegration = serverWithoutIntegration.getApp();

      // Act & Assert
      const response = await request(appWithoutIntegration)
        .get('/api/schedule-check')
        .expect(503);

      expect(response.body).toEqual({
        error: 'Service unavailable',
        message: 'システムが初期化されていません'
      });
    });

    test('checkSuspendScheduleがエラーを投げる場合に500エラーを返す', async () => {
      // Arrange - この失敗するテストが現在の問題を再現
      mockActivityIntegration.checkSuspendSchedule.mockRejectedValue(
        new Error('データベースのsuspend_hourがNULLです')
      );

      // Act & Assert
      const response = await request(app)
        .get('/api/schedule-check')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'スケジュール判定に失敗しました'
      });
    });
  });
});