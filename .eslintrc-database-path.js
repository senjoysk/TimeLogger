/**
 * ESLint規則: 禁止されたデータベースパスの使用を検出
 */

module.exports = {
  rules: {
    'no-forbidden-database-paths': {
      create(context) {
        const FORBIDDEN_PATTERNS = [
          'activity_logs.db',
          'activity_logs',
          './data/activity_logs.db',
          '/app/data/activity_logs.db'
        ];

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              for (const pattern of FORBIDDEN_PATTERNS) {
                if (node.value.includes(pattern)) {
                  context.report({
                    node,
                    message: `🚨 禁止されたデータベースパス '${pattern}' が使用されています。utils/databasePath.js の getSafeDatabasePath() を使用してください。`,
                  });
                }
              }
            }
          },
        };
      },
    },
  },
};