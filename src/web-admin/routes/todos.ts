/**
 * TODO管理ルーター
 * Phase 2: TODO CRUD機能のUI実装
 */

import { Router } from 'express';
import { TodoManagementService } from '../services/todoManagementService';
import { SecurityService } from '../services/securityService';
import { AdminRepository } from '../repositories/adminRepository';
import { SqliteActivityLogRepository } from '../../repositories/sqliteActivityLogRepository';
import { TodoTask } from '../../types/todo';

const router = Router();

// TODO管理サービスの初期化
let todoService: TodoManagementService;
let securityService: SecurityService;
let isInitialized = false;

function initializeServices(databasePath: string) {
  if (!isInitialized) {
    const sqliteRepo = new SqliteActivityLogRepository(databasePath);
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
    
    // デバッグ情報を追加
    console.log('[DEBUG] /todos route accessed');
    console.log('[DEBUG] Environment:', environment);
    const userId = req.query.userId as string || 'all';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // 全ユーザーのTODO取得（一時的に最初のユーザーのTODOを表示）
    const sqliteRepo = new SqliteActivityLogRepository(req.app.get('databasePath'));
    const users = await sqliteRepo.getAllUsers();
    
    let todos: TodoTask[] = [];
    if (userId === 'all' && users.length > 0) {
      // 全ユーザーのTODOを取得
      for (const user of users) {
        try {
          const userTodos = await todoService.getTodosByUser(user.userId, {}, { page, limit });
          todos.push(...userTodos);
          console.log(`[DEBUG] User ${user.userId}: ${userTodos.length} todos found`);
        } catch (error) {
          console.error(`[ERROR] Failed to get todos for user ${user.userId}:`, error);
        }
      }
    } else if (userId !== 'all') {
      try {
        todos = await todoService.getTodosByUser(userId, {}, { page, limit });
        console.log(`[DEBUG] User ${userId}: ${todos.length} todos found`);
      } catch (error) {
        console.error(`[ERROR] Failed to get todos for user ${userId}:`, error);
      }
    }
    
    console.log(`[DEBUG] Total todos found: ${todos.length}`);

    // 期限切れTODOの取得
    let overdueTodos: TodoTask[] = [];
    try {
      overdueTodos = await todoService.getOverdueTodos();
      console.log(`[DEBUG] Overdue todos found: ${overdueTodos.length}`);
    } catch (error) {
      console.error(`[ERROR] Failed to get overdue todos:`, error);
    }

    console.log(`[DEBUG] Rendering todo-dashboard with ${todos.length} todos and ${users.length} users`);
    
    res.render('todo-dashboard', {
      title: 'TODO管理',
      environment,
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
    
    console.log(`[DEBUG] Response sent successfully`);
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

    const sqliteRepo = new SqliteActivityLogRepository(req.app.get('databasePath'));
    const users = await sqliteRepo.getAllUsers();

    res.render('todo-form', {
      title: '新規TODO作成',
      environment,
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

    const { userId, title, description, priority, dueDate } = req.body;

    const newTodo = await todoService.createTodo({
      userId,
      title,
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

    const sqliteRepo = new SqliteActivityLogRepository(req.app.get('databasePath'));
    const users = await sqliteRepo.getAllUsers();

    res.render('todo-form', {
      title: 'TODO編集',
      environment,
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
    const { title, description, status, priority, dueDate } = req.body;

    await todoService.updateTodo(todoId, {
      title,
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
 * TODO削除処理
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
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    
    const updatedCount = await todoService.bulkUpdateStatus(ids, status);

    res.json({ success: true, updatedCount });
  } catch (error) {
    next(error);
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
    const ids = Array.isArray(todoIds) ? todoIds : [todoIds];
    
    const deletedCount = await todoService.bulkDelete(ids);

    res.json({ success: true, deletedCount });
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