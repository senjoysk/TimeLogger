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
import { createTimezoneMiddleware } from './middleware/timezoneMiddleware';
import { createRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { IDiscordBot } from '../interfaces/dependencies';

export class AdminServer {
  private app: express.Application;
  private adminService: IAdminService;
  private securityService: ISecurityService;
  private port: number;
  private databasePath: string;
  private sqliteRepo: IUnifiedRepository;

  constructor(databasePath: string, port: number = 3001, private bot?: IDiscordBot) {
    this.port = port;
    this.databasePath = databasePath;
    this.app = express();
    
    // サービスの初期化
    this.sqliteRepo = new PartialCompositeRepository(databasePath);
    console.log(`[AdminServer] Repository created for: ${databasePath}`);
    const adminRepo = new AdminRepository(this.sqliteRepo);
    this.adminService = new AdminService(adminRepo);
    this.securityService = new SecurityService();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * データベーススキーマを初期化（非同期）
   * サーバー起動前に必ず呼び出すこと
   */
  async initializeDatabase(): Promise<void> {
    try {
      // テスト環境では軽量なスキーマ初期化を使用
      if (process.env.NODE_ENV === 'test') {
        await this.sqliteRepo.ensureSchema();
      } else {
        await this.sqliteRepo.initializeDatabase();
      }
      console.log('✅ AdminServer: データベース初期化完了');
    } catch (error) {
      console.error('❌ AdminServer: データベース初期化エラー:', error);
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
          console.error('Authentication configuration error:', error);
          return false;
        }
      },
      challenge: true,
      realm: 'TimeLogger Admin Panel'
    });

    this.app.use(authMiddleware);

    // EJSテンプレートエンジン設定
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'views'));

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

  private setupRoutes(): void {
    // 環境情報をテンプレートで使用可能にする
    this.app.locals.environment = this.securityService.getEnvironment();
    
    // basePathを設定（開発環境では空文字列、本番環境では/admin）
    this.app.locals.basePath = '';
    
    // アプリケーション設定
    this.app.set('databasePath', this.databasePath);
    
    // ルーティング設定
    this.app.use('/', createRoutes(this.adminService, this.securityService, this.databasePath, this.bot));
    
    // エラーハンドラー（最後に設定）
    this.app.use(errorHandler);
  }
  
  public getExpressApp(): express.Application {
    return this.app;
  }


}