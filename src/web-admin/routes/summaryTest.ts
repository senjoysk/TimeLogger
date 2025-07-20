/**
 * サマリーテスト機能のAPIルーター
 * 
 * 開発者が日次サマリー送信のテストを行うためのAPI
 * ドライランモードと実際送信モードをサポート
 */

import { Router, Request, Response } from 'express';
import { SummaryTestService } from '../services/summaryTestService';
import { TaskLoggerBot } from '../../bot';
import { MockTimeProvider, MockLogger } from '../../factories';
import { SummaryTestRequest } from '../types/testing';
// Express Request型の拡張を読み込み
import '../middleware/timezoneMiddleware';

/**
 * サマリーテスト用ルーター作成
 */
export function createSummaryTestRouter(bot: TaskLoggerBot | null): Router {
  const router = Router();
  
  // サービス初期化
  const mockTimeProvider = new MockTimeProvider();
  const mockLogger = new MockLogger();
  const summaryTestService = new SummaryTestService(bot, mockTimeProvider, mockLogger);

  /**
   * サマリーテストを実行
   * POST /api/summary-test/execute
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const rawRequest = req.body;
      
      // dryRunを正しくbooleanに変換
      const testRequest: SummaryTestRequest = {
        ...rawRequest,
        dryRun: rawRequest.dryRun === true || rawRequest.dryRun === 'true'
      };
      
      // 入力検証
      if (testRequest.dryRun === undefined) {
        return res.status(400).json({
          success: false,
          error: 'dryRunパラメータが必要です'
        });
      }

      // デフォルト値設定
      if (!testRequest.testDateTime) {
        testRequest.testDateTime = new Date().toISOString();
      }
      if (!testRequest.testTimezone) {
        testRequest.testTimezone = req.adminTimezone || 'Asia/Tokyo';
      }

      const result = await summaryTestService.executeTest(testRequest);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * 登録ユーザー一覧を取得
   * GET /api/summary-test/users
   */
  router.get('/users', async (req: Request, res: Response) => {
    try {
      if (!bot) {
        return res.status(503).json({
          success: false,
          error: 'Discord Botが初期化されていません'
        });
      }

      const users = await bot.getRegisteredUsers();
      res.json({
        success: true,
        users
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * 指定ユーザーのサマリープレビューを取得
   * GET /api/summary-test/preview/:userId
   */
  router.get('/preview/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'ユーザーIDが必要です'
        });
      }

      if (!bot) {
        return res.status(503).json({
          success: false,
          error: 'Discord Botが初期化されていません'
        });
      }

      const summaryPreview = await bot.generateSummaryPreview(userId);
      res.json({
        success: true,
        userId,
        summaryPreview
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * テスト設定のバリデーション
   * POST /api/summary-test/validate
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const testRequest: SummaryTestRequest = req.body;
      
      // 基本的なバリデーション
      const validationErrors: string[] = [];
      
      if (testRequest.dryRun === undefined) {
        validationErrors.push('dryRunパラメータが必要です');
      }

      if (testRequest.testDateTime) {
        const testDate = new Date(testRequest.testDateTime);
        if (isNaN(testDate.getTime())) {
          validationErrors.push('testDateTimeの形式が無効です');
        }
      }

      if (testRequest.targetUsers && testRequest.targetUsers.length > 0) {
        // 対象ユーザーの存在確認
        if (bot) {
          try {
            const registeredUsers = await bot.getRegisteredUsers();
            const registeredUserIds = registeredUsers.map(u => u.userId);
            const nonExistentUsers = testRequest.targetUsers.filter(
              id => !registeredUserIds.includes(id)
            );
            
            if (nonExistentUsers.length > 0) {
              validationErrors.push(
                `存在しないユーザーが指定されました: ${nonExistentUsers.join(', ')}`
              );
            }
          } catch (error) {
            validationErrors.push('ユーザー情報の取得に失敗しました');
          }
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: validationErrors
        });
      }

      res.json({
        success: true,
        message: 'テスト設定は有効です'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * テスト実行状況を取得
   * GET /api/summary-test/status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const botStatus = bot ? {
        isInitialized: bot.isSystemInitialized(),
        clientReady: bot.getClient().readyAt !== null,
        uptime: process.uptime()
      } : {
        isInitialized: false,
        clientReady: false,
        uptime: 0
      };

      res.json({
        success: true,
        botStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}