/**
 * 管理Webアプリケーションサーバー
 * Express + EJS + Basic認証
 */

import express from 'express';
import basicAuth from 'express-basic-auth';
import path from 'path';
import { AdminService } from './services/adminService';
import { SecurityService } from './services/securityService';
import { AdminRepository } from './repositories/adminRepository';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { createRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';

export class AdminServer {
  private app: express.Application;
  private adminService: AdminService;
  private securityService: SecurityService;
  private port: number;

  constructor(databasePath: string, port: number = 3001) {
    this.port = port;
    this.app = express();
    
    // サービスの初期化
    const sqliteRepo = new SqliteActivityLogRepository(databasePath);
    const adminRepo = new AdminRepository(sqliteRepo);
    this.adminService = new AdminService(adminRepo);
    this.securityService = new SecurityService();
    
    this.setupMiddleware();
    this.setupRoutes();
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

    // セキュリティヘッダー
    this.app.use((req, res, next) => {
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
      });
      next();
    });
  }

  private setupRoutes(): void {
    // 環境情報をテンプレートで使用可能にする
    this.app.locals.environment = this.securityService.getEnvironment();
    
    // ルーティング設定
    this.app.use('/', createRoutes(this.adminService, this.securityService));
    
    // エラーハンドラー（最後に設定）
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.app.listen(this.port, () => {
          console.log(`Admin Web App started on port ${this.port}`);
          console.log(`Environment: ${this.securityService.getEnvironment().env}`);
          console.log(`Read-only mode: ${this.securityService.getEnvironment().isReadOnly}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}