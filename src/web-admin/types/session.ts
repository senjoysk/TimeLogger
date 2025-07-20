/**
 * Express セッション型定義拡張
 */

declare module 'express-session' {
  interface SessionData {
    adminTimezone?: string;
  }
}