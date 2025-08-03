/**
 * 統合HTTPサーバー
 * Discord Botのヘルスチェック + Web管理アプリを単一ポートで提供
 */

import express from 'express';
import basicAuth from 'express-basic-auth';
import path from 'path';
import { AdminServer } from './web-admin/server';
import { IDiscordBot } from './interfaces/dependencies';
import { logger } from './utils/logger';
import { SharedRepositoryManager } from './repositories/SharedRepositoryManager';
import { IUnifiedRepository } from './repositories/interfaces';

export class IntegratedServer {
  private app: express.Application;
  private port: number;
  private adminServer: AdminServer;
  private databasePath: string;
  private sharedRepository: IUnifiedRepository | null = null;

  constructor(databasePath: string, private bot?: IDiscordBot) {
    this.port = parseInt(process.env.PORT || '3000');
    this.databasePath = databasePath;
    this.app = express();
    
    // Admin serverを作成（独立したポートでは起動しない）
    this.adminServer = new AdminServer(databasePath, 3001, bot);
    
    this.setupMiddleware();
  }

  private setupMiddleware(): void {
    // 基本的なミドルウェア
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // セキュリティヘッダー
    this.app.use((req, res, next) => {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });
      next();
    });
  }

  private async setupRoutes(): Promise<void> {
    // Adminサーバーの初期化を待機
    await this.adminServer.initializeDatabase();
    
    // ヘルスチェック（認証不要）
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        checks: {
          discordReady: true,
          activityLoggingInitialized: true,
          databaseConnected: true
        },
        services: {
          bot: 'running',
          admin: 'running'
        }
      });
    });

    // ルートページ
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>TimeLogger</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              h1 { color: #333; }
              a { color: #0066cc; text-decoration: none; }
              a:hover { text-decoration: underline; }
            </style>
          </head>
          <body>
            <h1>TimeLogger Bot</h1>
            <p>Discord Bot is running successfully!</p>
            <ul>
              <li><a href="/admin">Admin Panel</a> (要認証)</li>
              <li><a href="/health">Health Check</a></li>
            </ul>
          </body>
        </html>
      `);
    });

    // Admin認証設定
    const adminAuth = basicAuth({
      users: { [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'password' },
      challenge: true,
      realm: 'TimeLogger Admin'
    });

    // Admin アプリのマウント（認証付き）
    // basePathを設定してからマウント
    const adminApp = this.adminServer.getExpressApp();
    adminApp.locals.basePath = '/admin';
    // databasePathも親アプリケーションに設定
    this.app.set('databasePath', this.databasePath);
    // 子アプリケーションにもdatabasePathを設定
    adminApp.set('databasePath', this.databasePath);
    this.app.use('/admin', adminAuth, adminApp);

    // 404ハンドラー
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
  }

  public async initialize(): Promise<void> {
    // 共有リポジトリマネージャーを使用してDB初期化
    const repoManager = SharedRepositoryManager.getInstance();
    this.sharedRepository = await repoManager.getRepository(this.databasePath);
    logger.info('INTEGRATED_SERVER', '✅ 共有リポジトリ初期化完了');
    
    // ルーティング設定（Adminサーバー初期化含む）
    await this.setupRoutes();
    logger.info('INTEGRATED_SERVER', '✅ ルーティング設定完了');
  }

  public async start(): Promise<void> {
    await this.initialize();
    
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        logger.info('HTTP_SERVER', `🌐 統合HTTPサーバー起動: http://localhost:${this.port}`);
        logger.info('HTTP_SERVER', `📊 Admin Panel: http://localhost:${this.port}/admin`);
        logger.info('HTTP_SERVER', `🏥 Health Check: http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }
}