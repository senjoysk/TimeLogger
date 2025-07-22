/**
 * 時刻シミュレーション機能のAPIルーター
 * 
 * 開発者がMockTimeProviderを使って任意の時刻を設定し、
 * 日次サマリー送信のテストを行うためのAPI
 */

import { Router, Request, Response } from 'express';
import { TimeSimulationService } from '../services/timeSimulationService';
import { MockTimeProvider } from '../../factories';
import { TimeSetRequest, TimePreset } from '../types/testing';
import { ActivityPromptRepository } from '../../repositories/activityPromptRepository';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { TaskLoggerBot } from '../../bot';
// Express Request型の拡張を読み込み
import '../middleware/timezoneMiddleware';

/**
 * 時刻シミュレーション用ルーター作成
 */
export function createTimeSimulationRouter(bot: TaskLoggerBot | null = null): Router {
  const router = Router();
  
  // TimeSimulationServiceはシングルトンのTimeProviderServiceを使用
  const timeSimulationService = new TimeSimulationService();
  
  // 手動リマインダー機能用のリポジトリ初期化
  let activityPromptRepository: ActivityPromptRepository | null = null;
  if (bot) {
    try {
      const repository = bot.getRepository();
      if (repository && repository.getDatabase) {
        activityPromptRepository = new ActivityPromptRepository(repository.getDatabase());
      }
    } catch (error) {
      console.warn('ActivityPromptRepository初期化に失敗:', error);
    }
  }

  /**
   * 現在の設定時刻を取得
   * GET /api/time-simulation/current
   */
  router.get('/current', async (req: Request, res: Response) => {
    try {
      const currentTime = timeSimulationService.getCurrentTime();
      
      // 現在時刻のタイムゾーン表示を計算（時刻設定は行わない）
      const now = timeSimulationService.getTimeProviderService().now();
      const timezoneDisplays = timeSimulationService.calculateTimezoneDisplaysPublic(now);

      res.json({
        success: true,
        currentTime,
        timezoneDisplays
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * 時刻を設定
   * POST /api/time-simulation/set
   */
  router.post('/set', async (req: Request, res: Response) => {
    try {
      const timeRequest: TimeSetRequest = req.body;
      
      // 入力検証
      if (!timeRequest.year || !timeRequest.month || !timeRequest.day || 
          timeRequest.hour === undefined || timeRequest.minute === undefined || 
          timeRequest.second === undefined || !timeRequest.timezone) {
        return res.status(400).json({
          success: false,
          error: '必須パラメータが不足しています（year, month, day, hour, minute, second, timezone）'
        });
      }

      const result = await timeSimulationService.setTime(timeRequest);
      
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
   * プリセット時刻を適用
   * POST /api/time-simulation/preset
   */
  router.post('/preset', async (req: Request, res: Response) => {
    try {
      const { presetName, timezone } = req.body;
      
      if (!presetName || !timezone) {
        return res.status(400).json({
          success: false,
          error: 'プリセット名とタイムゾーンが必要です'
        });
      }

      const presets = timeSimulationService.getTimePresets();
      const preset = presets.find(p => p.name === presetName);
      
      if (!preset) {
        return res.status(400).json({
          success: false,
          error: `プリセット「${presetName}」が見つかりません`
        });
      }

      const result = await timeSimulationService.applyPreset(preset, timezone);
      
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
   * 時刻設定をリセット（実時刻に戻す）
   * POST /api/time-simulation/reset
   */
  router.post('/reset', async (req: Request, res: Response) => {
    try {
      const result = timeSimulationService.resetTime();
      
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
   * プリセット時刻一覧を取得
   * GET /api/time-simulation/presets
   */
  router.get('/presets', async (req: Request, res: Response) => {
    try {
      const presets = timeSimulationService.getTimePresets();
      res.json({
        success: true,
        presets
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * サポートされるタイムゾーン一覧を取得
   * GET /api/time-simulation/timezones
   */
  router.get('/timezones', async (req: Request, res: Response) => {
    try {
      const timezones = timeSimulationService.getSupportedTimezones();
      res.json({
        success: true,
        timezones
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * リマインダー設定有効ユーザー一覧を取得
   * GET /api/time-simulation/reminder-test/users
   */
  router.get('/reminder-test/users', async (req: Request, res: Response) => {
    try {
      if (!activityPromptRepository) {
        return res.status(503).json({
          success: false,
          error: 'ActivityPromptRepositoryが初期化されていません'
        });
      }

      const users = await activityPromptRepository.getEnabledSettings();
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
   * 手動リマインダー送信
   * POST /api/time-simulation/reminder-test/send
   */
  router.post('/reminder-test/send', async (req: Request, res: Response) => {
    try {
      if (!bot) {
        return res.status(503).json({
          success: false,
          error: 'Discord Botが初期化されていません'
        });
      }

      if (!activityPromptRepository) {
        return res.status(503).json({
          success: false,
          error: 'ActivityPromptRepositoryが初期化されていません'
        });
      }

      const { userId } = req.body;
      
      // 送信対象ユーザーを決定
      let targetUsers: string[] = [];
      if (userId && userId !== 'all') {
        // 特定ユーザーの場合
        const userSettings = await activityPromptRepository.getSettings(userId);
        if (!userSettings || !userSettings.isEnabled) {
          return res.status(400).json({
            success: false,
            error: `ユーザー ${userId} はリマインダー設定が無効です`
          });
        }
        targetUsers = [userId];
      } else {
        // 全ユーザーの場合
        const enabledSettings = await activityPromptRepository.getEnabledSettings();
        targetUsers = enabledSettings.map(setting => setting.userId);
      }

      if (targetUsers.length === 0) {
        return res.json({
          success: true,
          message: 'リマインダー設定が有効なユーザーがいません',
          results: []
        });
      }

      // 各ユーザーにリマインダーを送信
      const results: Array<{
        userId: string;
        status: 'sent' | 'error';
        timezone: string;
        reason?: string;
      }> = [];

      for (const targetUserId of targetUsers) {
        try {
          // ユーザーのタイムゾーン情報を取得
          const repository = bot.getRepository();
          const users = await repository.getAllUsers();
          const user = users.find((u: any) => u.userId === targetUserId);
          const userTimezone = user?.timezone || 'Asia/Tokyo';

          // リマインダーを送信
          await bot.sendActivityPromptToUser(targetUserId, userTimezone);
          
          results.push({
            userId: targetUserId,
            status: 'sent',
            timezone: userTimezone
          });
        } catch (error) {
          results.push({
            userId: targetUserId,
            status: 'error',
            timezone: 'unknown',
            reason: error instanceof Error ? error.message : String(error)
          });
        }
      }

      const sentCount = results.filter(r => r.status === 'sent').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      res.json({
        success: true,
        message: `${sentCount}件送信成功、${errorCount}件エラー`,
        results,
        summary: {
          total: targetUsers.length,
          sent: sentCount,
          error: errorCount
        }
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