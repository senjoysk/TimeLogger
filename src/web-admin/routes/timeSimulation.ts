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
// Express Request型の拡張を読み込み
import '../middleware/timezoneMiddleware';

/**
 * 時刻シミュレーション用ルーター作成
 */
export function createTimeSimulationRouter(): Router {
  const router = Router();
  
  // TimeSimulationServiceはシングルトンのTimeProviderServiceを使用
  const timeSimulationService = new TimeSimulationService();

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

  return router;
}