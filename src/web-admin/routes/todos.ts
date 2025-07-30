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

const router = Router();

// TODO管理サービスの初期化
let todoService: TodoManagementService;
let securityService: ISecurityService;
let isInitialized = false;

function initializeServices(databasePath: string) {
  if (!isInitialized) {
    const sqliteRepo = new PartialCompositeRepository(databasePath);
    const adminRepo = new AdminRepository(sqliteRepo);
    todoService = new TodoManagementService(adminRepo);
    securityService = new SecurityService();
    isInitialized = true;
  }
}

/**
 * TODO管理ダッシュボード
 */
router.get('/', asyncHandler(async (req, res) => {
    // サービス初期化を確実に実行
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    const userId = req.query.userId as string || 'all';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // 全ユーザーのTODO取得（一時的に最初のユーザーのTODOを表示）
    const sqliteRepo = new PartialCompositeRepository(req.app.get('databasePath'));
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
}));

/**
 * TODO作成フォーム表示
 */
router.get('/new', asyncHandler(async (req, res) => {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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

    const sqliteRepo = new PartialCompositeRepository(req.app.get('databasePath'));
    const users = await sqliteRepo.getAllUsers();

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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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

    const sqliteRepo = new PartialCompositeRepository(req.app.get('databasePath'));
    const users = await sqliteRepo.getAllUsers();

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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
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

export function createTodoRouter(databasePath: string): Router {
  initializeServices(databasePath);
  return router;
}