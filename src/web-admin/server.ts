/**
 * 管理Webアプリケーションサーバー
 * Express + EJS + Basic認証
 */

import express from 'express';
import basicAuth from 'express-basic-auth';
const session = require('express-session');
import path from 'path';
import { AdminService } from './services/adminService';
import { SecurityService } from './services/securityService';
import { AdminRepository } from './repositories/adminRepository';
import { SqliteActivityLogRepository } from '../repositories/sqliteActivityLogRepository';
import { TimezoneService } from '../services/timezoneService';
import { createTimezoneMiddleware } from './middleware/timezoneMiddleware';
import { createRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';

export class AdminServer {
  private app: express.Application;
  private adminService: AdminService;
  private securityService: SecurityService;
  private timezoneService: TimezoneService;
  private port: number;
  private databasePath: string;
  private sqliteRepo: SqliteActivityLogRepository;

  constructor(databasePath: string, port: number = 3001, private bot?: any) {
    this.port = port;
    this.databasePath = databasePath;
    this.app = express();
    
    // サービスの初期化
    this.sqliteRepo = new SqliteActivityLogRepository(databasePath);
    const adminRepo = new AdminRepository(this.sqliteRepo);
    this.adminService = new AdminService(adminRepo);
    this.securityService = new SecurityService();
    
    // TimezoneServiceの初期化に必要な依存関係を提供
    const configService = {
      getSystemTimezone: () => process.env.TZ || 'Asia/Tokyo',
      getDefaultTimezone: () => 'Asia/Tokyo',
      getDiscordToken: () => process.env.DISCORD_TOKEN || '',
      getGeminiApiKey: () => process.env.GEMINI_API_KEY || '',
      getDatabasePath: () => this.databasePath,
      getServerPort: () => this.port,
      isDebugMode: () => process.env.NODE_ENV === 'development',
      getEnvironment: () => process.env.NODE_ENV || 'development',
      getLogLevel: () => process.env.LOG_LEVEL || 'info',
      validate: () => true
    };
    this.timezoneService = new TimezoneService(configService, this.sqliteRepo);
    
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

    // セッション設定
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'timelogger-admin-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // HTTP環境でも動作するよう設定
        maxAge: 24 * 60 * 60 * 1000 // 24時間
      }
    }));

    // タイムゾーンミドルウェア
    this.app.use(createTimezoneMiddleware(this.timezoneService));

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
    
    // basePathを設定（開発環境では空文字列、本番環境では/admin）
    this.app.locals.basePath = '';
    
    // アプリケーション設定
    this.app.set('databasePath', this.databasePath);
    
    // ルーティング設定
    this.app.use('/', createRoutes(this.adminService, this.securityService, this.databasePath, this.bot, this.timezoneService));
    
    // エラーハンドラー（最後に設定）
    this.app.use(errorHandler);
  }
  
  public getExpressApp(): express.Application {
    return this.app;
  }


}