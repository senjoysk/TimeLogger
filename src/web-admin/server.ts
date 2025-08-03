/**
 * 管理Webアプリケーションサーバー
 * Express + EJS + Basic認証
 */

import express from 'express';
import basicAuth from 'express-basic-auth';
import path from 'path';
import { AdminService } from './services/adminService';
import { IAdminService } from './interfaces/adminInterfaces';
import { SecurityService, ISecurityService } from './services/securityService';
import { AdminRepository } from './repositories/adminRepository';
import { PartialCompositeRepository } from '../repositories/PartialCompositeRepository';
import { IUnifiedRepository } from '../repositories/interfaces';
import { SharedRepositoryManager } from '../repositories/SharedRepositoryManager';
import { createTimezoneMiddleware } from './middleware/timezoneMiddleware';
import { createRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { expressErrorHandler, notFoundHandler } from '../utils/expressErrorHandler';
import { IDiscordBot } from '../interfaces/dependencies';
import { logger } from '../utils/logger';

export class AdminServer {
  private app: express.Application;
  private adminService!: IAdminService;
  private securityService: ISecurityService;
  private port: number;
  private databasePath: string;
  private sqliteRepo!: IUnifiedRepository;
  private routesInitialized: boolean = false;

  constructor(databasePath: string, port: number = 3001, private bot?: IDiscordBot) {
    this.port = port;
    this.databasePath = databasePath;
    this.app = express();
    
    // SecurityServiceの初期化（リポジトリ非依存）
    this.securityService = new SecurityService();
    
    // ミドルウェアのみ設定（ルーティングは初期化後）
    this.setupMiddleware();
  }

  /**
   * データベーススキーマを初期化（非同期）
   * サーバー起動前に必ず呼び出すこと
   */
  async initializeDatabase(): Promise<void> {
    try {
      // 共有リポジトリマネージャーを使用
      const repoManager = SharedRepositoryManager.getInstance();
      this.sqliteRepo = await repoManager.getRepository(this.databasePath);
      logger.info('WEB_ADMIN', '✅ AdminServer: 共有リポジトリ取得完了');
      
      // サービスの初期化
      const adminRepo = new AdminRepository(this.sqliteRepo);
      this.adminService = new AdminService(adminRepo);
      
      // アプリケーション設定（ルーティング前に設定）
      this.app.set('databasePath', this.databasePath);
      
      // ルーティング設定（リポジトリ初期化後）
      if (!this.routesInitialized) {
        await this.setupRoutes();
        this.routesInitialized = true;
      }
    } catch (error) {
      logger.error('WEB_ADMIN', '❌ AdminServer: リポジトリ取得エラー:', error as Error);
      throw error;
    }
  }

  private setupMiddleware(): void {
    // Basic認証設定
    const authMiddleware = basicAuth({
      authorizer: (username: string, password: string) => {
        try {
          return this.securityService.validateAuth(username, password);
        } catch (error) {
          logger.error('WEB_ADMIN', 'Authentication configuration error:', error as Error);
          return false;
        }
      },
      challenge: true,
      realm: 'TimeLogger Admin Panel'
    });

    this.app.use(authMiddleware);

    // EJSテンプレートエンジン設定
    this.app.set('view engine', 'ejs');
    const viewsPath = path.join(__dirname, 'views');
    this.app.set('views', viewsPath);
    logger.info('WEB_ADMIN', `Views path set to: ${viewsPath}`);

    // 静的ファイル
    this.app.use('/static', express.static(path.join(__dirname, 'public')));

    // JSONパース
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Cookie解析（タイムゾーン設定用）
    this.app.use(require('cookie-parser')());
    
    // タイムゾーンミドルウェア（Cookieベース）
    this.app.use(createTimezoneMiddleware());

    // セキュリティヘッダー
    this.app.use((req, res, next) => {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        // キャッシュ無効化（開発環境のみ）
        'Cache-Control': process.env.NODE_ENV === 'development' ? 'no-store, no-cache, must-revalidate' : 'private',
        'Pragma': process.env.NODE_ENV === 'development' ? 'no-cache' : undefined,
        'Expires': process.env.NODE_ENV === 'development' ? '0' : undefined
      });
      next();
    });
  }

  private async setupRoutes(): Promise<void> {
    // 環境情報をテンプレートで使用可能にする
    this.app.locals.environment = this.securityService.getEnvironment();
    
    // basePathを設定（開発環境では空文字列、本番環境では/admin）
    this.app.locals.basePath = '';
    
    // ルーティング設定
    const routes = await createRoutes(this.adminService, this.securityService, this.databasePath, this.bot);
    this.app.use('/', routes);
    
    // 404ハンドラー
    this.app.use(notFoundHandler);
    
    // 統一エラーハンドラー（最後に設定）
    this.app.use(expressErrorHandler);
    
    // 既存のエラーハンドラー（後方互換性のため残す）
    this.app.use(errorHandler);
  }
  
  public getExpressApp(): express.Application {
    return this.app;
  }


}