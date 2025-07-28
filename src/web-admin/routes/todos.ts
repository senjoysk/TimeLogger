/**
 * TODO管理ルーター
 * Phase 2: TODO CRUD機能のUI実装
 */

import { Router } from 'express';
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
router.get('/', async (req, res, next) => {
  try {
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
        try {
          const userTodos = await todoService.getTodosByUser(user.userId, {}, { page, limit });
          todos.push(...userTodos);
        } catch (error) {
          console.error(`[ERROR] Failed to get todos for user ${user.userId}:`, error);
        }
      }
    } else if (userId !== 'all') {
      try {
        todos = await todoService.getTodosByUser(userId, {}, { page, limit });
      } catch (error) {
        console.error(`[ERROR] Failed to get todos for user ${userId}:`, error);
      }
    }
    
    
    // 期限切れTODOの取得
    let overdueTodos: TodoTask[] = [];
    try {
      overdueTodos = await todoService.getOverdueTodos();
    } catch (error) {
      console.error(`[ERROR] Failed to get overdue todos:`, error);
    }

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
    next(error);
  }
});

/**
 * TODO作成フォーム表示
 */
router.get('/new', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).render('error', {
        title: 'アクセス拒否',
        message: 'Production環境では作成操作は許可されていません',
        code: 'READONLY_MODE',
        environment
      });
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
  } catch (error) {
    next(error);
  }
});

/**
 * TODO作成処理
 */
router.post('/', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'Production環境では作成操作は許可されていません' });
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
  } catch (error) {
    next(error);
  }
});

/**
 * TODO編集フォーム表示
 */
router.get('/:id/edit', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).render('error', {
        title: 'アクセス拒否',
        message: 'Production環境では編集操作は許可されていません',
        code: 'READONLY_MODE',
        environment
      });
    }

    const todoId = req.params.id;
    const todo = await todoService.getTodoById(todoId);

    if (!todo) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'TODOが見つかりません',
        code: 'TODO_NOT_FOUND',
        environment
      });
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
  } catch (error) {
    next(error);
  }
});

/**
 * TODO更新処理
 */
router.post('/:id', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'Production環境では更新操作は許可されていません' });
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
  } catch (error) {
    next(error);
  }
});

/**
 * TODO一括ステータス更新
 */
router.post('/bulk/status', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'Production環境では更新操作は許可されていません' });
    }

    const { todoIds, status } = req.body;
    
    // バリデーション
    if (!todoIds || (!Array.isArray(todoIds) && typeof todoIds !== 'string')) {
      return res.status(400).json({ error: 'todoIds is required and must be an array or string' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    
    const updatedCount = await todoService.bulkUpdateStatus(ids, status);

    res.json({ success: true, updatedCount });
  } catch (error) {
    console.error('一括ステータス更新エラー:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '一括ステータス更新に失敗しました' });
  }
});

/**
 * TODO一括削除
 */
router.post('/bulk/delete', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'Production環境では削除操作は許可されていません' });
    }

    const { todoIds } = req.body;
    
    // バリデーション
    if (!todoIds || (!Array.isArray(todoIds) && typeof todoIds !== 'string')) {
      return res.status(400).json({ error: 'todoIds is required and must be an array or string' });
    }
    
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    const deletedCount = await todoService.bulkDelete(ids);

    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('一括削除エラー:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '一括削除に失敗しました' });
  }
});

/**
 * TODO一括作成（開発環境限定）
 */
router.post('/bulk/create', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'この機能は開発環境でのみ利用可能です' });
    }

    // production環境では機能を無効化
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'この機能は開発環境でのみ利用可能です' });
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
  } catch (error) {
    next(error);
  }
});

/**
 * TODO削除処理（個別削除）
 * 注意: 一括処理ルートの後に配置して、ルートの競合を避ける
 */
router.post('/:id/delete', async (req, res, next) => {
  try {
    if (!isInitialized) {
      initializeServices(req.app.get('databasePath'));
    }
    const environment = securityService.getEnvironment();
    
    if (environment.isReadOnly) {
      return res.status(403).json({ error: 'Production環境では削除操作は許可されていません' });
    }

    const todoId = req.params.id;
    await todoService.deleteTodo(todoId);

    res.redirect(`${req.app.locals.basePath || ''}/todos`);
  } catch (error) {
    next(error);
  }
});

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