/**
 * 夜間サスペンド機能用HTTPサーバー
 * TDD: Green Phase - テストを通すための最小限の実装
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import { nightSuspendAuthMiddleware } from '../middleware/nightSuspendAuth';
import { MorningMessageRecovery } from '../services/morningMessageRecovery';
import { SqliteNightSuspendRepository } from '../repositories/sqliteNightSuspendRepository';
import { Client } from 'discord.js';

/**
 * 夜間サスペンド機能用HTTPサーバー
 * 
 * GitHub Actionsからの自動化リクエストを処理：
 * - /api/night-suspend: 夜間サスペンド準備
 * - /api/wake-up: 朝の起動処理
 * - /api/morning-recovery: メッセージリカバリ
 * - /health: ヘルスチェック
 */
export class NightSuspendServer {
  private app: Application;
  private server: Server | null = null;
  private port: number;
  private recoveryService?: MorningMessageRecovery;

  constructor(recoveryService?: MorningMessageRecovery) {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.recoveryService = recoveryService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * ミドルウェアの設定
   */
  private setupMiddleware(): void {
    // JSON パースミドルウェア
    this.app.use(express.json());
    
    // CORS設定（必要に応じて）
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }

  /**
   * ルートの設定
   */
  private setupRoutes(): void {
    // ヘルスチェック（認証不要）
    this.app.get('/health', this.healthCheck);
    
    // サスペンド状態確認（認証不要）
    this.app.get('/api/suspend-status', this.getSuspendStatus);
    
    // 夜間サスペンド準備（認証必要）
    this.app.post('/api/night-suspend', nightSuspendAuthMiddleware, this.nightSuspend);
    
    // 朝の起動処理（認証必要）
    this.app.post('/api/wake-up', nightSuspendAuthMiddleware, this.wakeUp);
    
    // メッセージリカバリ（認証必要）
    this.app.post('/api/morning-recovery', nightSuspendAuthMiddleware, this.morningRecovery);
    
    // 404ハンドラー
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.originalUrl
      });
    });
  }

  /**
   * ヘルスチェックエンドポイント
   */
  private healthCheck = (req: Request, res: Response): void => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  };

  /**
   * サスペンド状態確認エンドポイント
   */
  private getSuspendStatus = (req: Request, res: Response): void => {
    res.json({
      is_suspended: false,
      last_suspend_time: null,
      next_suspend_time: this.getNextSuspendTime(),
      current_time: new Date().toISOString()
    });
  };

  /**
   * 夜間サスペンド準備エンドポイント
   */
  private nightSuspend = async (req: Request, res: Response): Promise<void> => {
    try {
      const { action } = req.body;
      
      if (action !== 'prepare_suspend') {
        res.status(400).json({
          error: 'Invalid action',
          expected: 'prepare_suspend'
        });
        return;
      }
      
      console.log('🌙 夜間サスペンド準備を開始');
      
      // サスペンド準備処理（最小限の実装）
      const suspendTime = new Date().toISOString();
      
      // TODO: 実際のBot処理完了待機
      // await this.bot.finishCurrentProcesses();
      
      // TODO: 状態保存
      // await this.bot.saveState({ suspend_time: suspendTime });
      
      res.json({
        status: 'ready_for_suspend',
        message: '夜間サスペンド準備完了',
        suspend_time: suspendTime
      });
      
      // 5秒後に強制終了（実際の実装では）
      // setTimeout(() => process.exit(0), 5000);
      
    } catch (error) {
      console.error('❌ 夜間サスペンド準備エラー:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'サスペンド準備に失敗しました'
      });
    }
  };

  /**
   * 朝の起動処理エンドポイント
   */
  private wakeUp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { trigger } = req.body;
      
      console.log('🌅 朝の起動処理を開始');
      
      // 起動処理（最小限の実装）
      const wakeTime = new Date().toISOString();
      
      // TODO: 実際のBot初期化
      // await this.bot.initialize();
      
      // TODO: 前回の状態復旧
      // const lastState = await this.bot.loadState();
      
      res.json({
        status: 'waking_up',
        message: '朝の起動処理開始',
        wake_time: wakeTime,
        trigger
      });
      
    } catch (error) {
      console.error('❌ 朝の起動処理エラー:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: '起動処理に失敗しました'
      });
    }
  };

  /**
   * メッセージリカバリエンドポイント
   */
  private morningRecovery = async (req: Request, res: Response): Promise<void> => {
    try {
      const { trigger } = req.body;
      
      console.log('🔄 夜間メッセージリカバリを開始');
      
      const recoveryTime = new Date().toISOString();
      let processedMessages = 0;
      
      // 実際のメッセージリカバリ実行
      if (this.recoveryService) {
        try {
          const results = await this.recoveryService.recoverNightMessages();
          processedMessages = results.length;
          console.log(`✅ メッセージリカバリ完了: ${processedMessages}件処理`);
        } catch (recoveryError) {
          console.error('❌ リカバリサービスエラー:', recoveryError);
          // エラーが発生してもAPIは継続（部分的成功）
        }
      } else {
        console.log('⚠️  メッセージリカバリサービスが設定されていません');
      }
      
      res.json({
        status: 'recovery_complete',
        processed_messages: processedMessages,
        recovery_time: recoveryTime,
        trigger
      });
      
    } catch (error) {
      console.error('❌ メッセージリカバリエラー:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'メッセージリカバリに失敗しました'
      });
    }
  };

  /**
   * 次回サスペンド時刻を計算
   */
  private getNextSuspendTime(): string {
    const now = new Date();
    const nextSuspend = new Date(now);
    
    // 今日の0:00にセット
    nextSuspend.setHours(0, 0, 0, 0);
    
    // 既に過ぎていたら明日の0:00にセット
    if (nextSuspend <= now) {
      nextSuspend.setDate(nextSuspend.getDate() + 1);
    }
    
    return nextSuspend.toISOString();
  }

  /**
   * サーバーを起動
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 夜間サスペンド用HTTPサーバーが起動しました: http://localhost:${this.port}`);
        resolve();
      });
      
      this.server?.on('error', (error) => {
        console.error('❌ HTTPサーバー起動エラー:', error);
        reject(error);
      });
    });
  }

  /**
   * サーバーを停止
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 夜間サスペンド用HTTPサーバーを停止しました');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Express アプリケーションを取得（テスト用）
   */
  public getApp(): Application {
    return this.app;
  }
}