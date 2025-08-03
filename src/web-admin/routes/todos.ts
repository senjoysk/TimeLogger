/**
 * TODO管理ルーター
 * Phase 2: TODO CRUD機能のUI実装
 */

import { logger } from '../../utils/logger';
import { Router } from 'express';
import { asyncHandler } from '../../utils/expressErrorHandler';
import { TodoManagementService, BulkCreateTodoRequest } from '../services/todoManagementService';
import { SecurityService, ISecurityService } from '../services/securityService';
import { AdminRepository } from '../repositories/adminRepository';
import { PartialCompositeRepository } from '../../repositories/PartialCompositeRepository';
import { TodoTask } from '../../types/todo';
import { SharedRepositoryManager } from '../../repositories/SharedRepositoryManager';
import { ConfigurationError } from '../../errors';

const router = Router();

// TODO管理サービスの初期化
// パスごとにサービスをキャッシュ
const serviceCache = new Map<string, {
  todoService: TodoManagementService;
  securityService: ISecurityService;
  sqliteRepo: PartialCompositeRepository;
}>();

async function getServices(databasePath: string): Promise<{
  todoService: TodoManagementService;
  securityService: ISecurityService;
  sqliteRepo: PartialCompositeRepository;
}> {
  // パスごとにサービスをキャッシュ
  if (!serviceCache.has(databasePath)) {
    try {
      logger.info('TODO_ROUTES', `サービス初期化開始: ${databasePath}`);
      const repoManager = SharedRepositoryManager.getInstance();
      const sqliteRepo = await repoManager.getRepository(databasePath);
      const adminRepo = new AdminRepository(sqliteRepo);
      const todoService = new TodoManagementService(adminRepo);
      const securityService = new SecurityService();
      
      serviceCache.set(databasePath, {
        todoService,
        securityService,
        sqliteRepo
      });
      logger.info('TODO_ROUTES', `サービス初期化完了: ${databasePath}`);
    } catch (error) {
      logger.error('TODO_ROUTES', `サービス初期化エラー: ${databasePath}`, error as Error);
      throw error;
    }
  }
  return serviceCache.get(databasePath)!;
}

/**
 * TODO管理ダッシュボード
 */
router.get('/', asyncHandler(async (req, res) => {
    try {
      // デバッグ情報を追加
      let databasePath = req.app.get('databasePath');
      
      // IntegratedServerの場合、親アプリケーションからdatabasePathを取得
      if (!databasePath && req.baseUrl.startsWith('/admin')) {
        // req.appは子アプリケーション、req.app.parent は親アプリケーション
        const parentApp = (req.app as any).parent; // ALLOW_ANY: Express子アプリケーションの親アプリケーション参照のため
        if (parentApp) {
          databasePath = parentApp.get('databasePath');
        }
      }
      
      if (!databasePath) {
        throw new ConfigurationError('Database path not set in Express app');
      }
      
      // サービスを取得
      const { todoService, securityService, sqliteRepo } = await getServices(databasePath);
      const environment = securityService.getEnvironment();
      
      const userId = req.query.userId as string || 'all';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // 全ユーザーのTODO取得（一時的に最初のユーザーのTODOを表示）
      const users = await sqliteRepo.getAllUsers();
      
      let todos: TodoTask[] = [];
      if (userId === 'all' && users.length > 0) {
        // 全ユーザーのTODOを取得
        for (const user of users) {
          const userTodos = await todoService.getTodosByUser(user.userId, {}, { page, limit });
          todos.push(...userTodos);
        }
      } else if (userId !== 'all') {
        todos = await todoService.getTodosByUser(userId, {}, { page, limit });
      }
      
      // 期限切れTODOの取得
      const overdueTodos = await todoService.getOverdueTodos();

      res.render('todo-dashboard', {
        title: 'TODO管理',
        environment,
        basePath: req.app.locals.basePath || '',
        supportedTimezones: res.locals.supportedTimezones,
        adminTimezone: res.locals.adminTimezone,
        todos,
        overdueTodos,
        users,
        selectedUserId: userId,
        pagination: {
          page,
          limit,
          total: todos.length,
          totalPages: Math.ceil(todos.length / limit)
        }
      });
    } catch (error) {
      logger.error('TODO_ROUTES', 'TODOダッシュボードエラー:', error as Error);
      throw error;
    }
}));

/**
 * TODO作成フォーム表示
 */
router.get('/new', asyncHandler(async (req, res) => {
    let databasePath = req.app.get('databasePath');
    if (!databasePath && req.baseUrl.startsWith('/admin')) {
      const parentApp = (req.app as any).parent; // ALLOW_ANY: Express子アプリケーションの親アプリケーション参照のため
      if (parentApp) {
        databasePath = parentApp.get('databasePath');
      }
    }
    const { todoService, securityService } = await getServices(databasePath || req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).render('error', {
        title: 'アクセス拒否',
        message: 'Production環境では作成操作は許可されていません',
        code: 'READONLY_MODE',
        environment
      });
      return;
    }

    const { sqliteRepo: repo } = await getServices(req.app.get('databasePath'));
    const users = await repo.getAllUsers();

    res.render('todo-form', {
      title: '新規TODO作成',
      environment,
      basePath: req.app.locals.basePath || '',
      supportedTimezones: res.locals.supportedTimezones,
      adminTimezone: res.locals.adminTimezone,
      users,
      todo: null, // 新規作成の場合
      action: `${req.app.locals.basePath || ''}/todos`
    });
}));

/**
 * TODO作成処理
 */
router.post('/', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'Production環境では作成操作は許可されていません' });
      return;
    }

    const { userId, content, description, priority, dueDate } = req.body;

    const newTodo = await todoService.createTodo({
      userId,
      content,
      description,
      priority,
      dueDate
    });

    res.redirect(`${req.app.locals.basePath || ''}/todos`);
}));

/**
 * TODO編集フォーム表示
 */
router.get('/:id/edit', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).render('error', {
        title: 'アクセス拒否',
        message: 'Production環境では編集操作は許可されていません',
        code: 'READONLY_MODE',
        environment
      });
      return;
    }

    const todoId = req.params.id;
    const todo = await todoService.getTodoById(todoId);

    if (!todo) {
      res.status(404).render('error', {
        title: 'Not Found',
        message: 'TODOが見つかりません',
        code: 'TODO_NOT_FOUND',
        environment
      });
      return;
    }

    const { sqliteRepo: repo } = await getServices(req.app.get('databasePath'));
    const users = await repo.getAllUsers();

    res.render('todo-form', {
      title: 'TODO編集',
      environment,
      basePath: req.app.locals.basePath || '',
      supportedTimezones: res.locals.supportedTimezones,
      adminTimezone: res.locals.adminTimezone,
      users,
      todo,
      action: `${req.app.locals.basePath || ''}/todos/${todoId}`
    });
}));

/**
 * TODO更新処理
 */
router.post('/:id', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'Production環境では更新操作は許可されていません' });
      return;
    }

    const todoId = req.params.id;
    const { content, description, status, priority, dueDate } = req.body;

    await todoService.updateTodo(todoId, {
      content,
      description,
      status,
      priority,
      dueDate
    });

    res.redirect(`${req.app.locals.basePath || ''}/todos`);
}));

/**
 * TODO一括ステータス更新
 */
router.post('/bulk/status', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'Production環境では更新操作は許可されていません' });
      return;
    }

    const { todoIds, status } = req.body;
    
    // バリデーション
    if (!todoIds || (!Array.isArray(todoIds) && typeof todoIds !== 'string')) {
      res.status(400).json({ error: 'todoIds is required and must be an array or string' });
      return;
    }
    
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    
    const updatedCount = await todoService.bulkUpdateStatus(ids, status);

    res.json({ success: true, updatedCount });
}));

/**
 * TODO一括削除
 */
router.post('/bulk/delete', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'Production環境では削除操作は許可されていません' });
      return;
    }

    const { todoIds } = req.body;
    
    // バリデーション
    if (!todoIds || (!Array.isArray(todoIds) && typeof todoIds !== 'string')) {
      res.status(400).json({ error: 'todoIds is required and must be an array or string' });
      return;
    }
    
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    const deletedCount = await todoService.bulkDelete(ids);

    res.json({ success: true, deletedCount });
}));

/**
 * TODO一括作成（開発環境限定）
 */
router.post('/bulk/create', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'この機能は開発環境でのみ利用可能です' });
      return;
    }

    // production環境では機能を無効化
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'この機能は開発環境でのみ利用可能です' });
      return;
    }

    const { userId, baseName, count, priority } = req.body;

    const request: BulkCreateTodoRequest = {
      userId,
      baseName,
      count: parseInt(count, 10),
      priority
    };

    const createdTodos = await todoService.bulkCreateTodos(request);

    res.redirect(`${req.app.locals.basePath || ''}/todos`);
}));

/**
 * TODO削除処理（個別削除）
 * 注意: 一括処理ルートの後に配置して、ルートの競合を避ける
 */
router.post('/:id/delete', asyncHandler(async (req, res) => {
    const { todoService, securityService } = await getServices(req.app.get('databasePath'));
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      res.status(403).json({ error: 'Production環境では削除操作は許可されていません' });
      return;
    }

    const todoId = req.params.id;
    await todoService.deleteTodo(todoId);

    res.redirect(`${req.app.locals.basePath || ''}/todos`);
}));

// テスト用ルート
router.get('/test', (req, res) => {
  res.json({
    message: 'TODO router is working!',
    timestamp: new Date().toISOString(),
    databasePath: req.app.get('databasePath')
  });
});

export async function createTodoRouter(databasePath: string): Promise<Router> {
  // databasePathをルーター全体で使えるように設定
  router.use((req, res, next) => {
    // リクエストごとにdatabasePathを設定
    req.app.set('databasePath', databasePath);
    next();
  });
  
  return router;
}