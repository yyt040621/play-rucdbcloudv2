import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../types';
import { validateSql } from '../services/sql-parser';
import { config } from '../config';
import { SandboxManager } from '../services/sandbox-manager';
import { SessionRequest } from './session.middleware';

/**
 * SQL 安全检查中间件工厂。
 * 对所有 /api/v1/query 请求的 SQL 文本做白名单校验。
 * 需要 SandboxManager 以获取当前会话的沙箱库名（库名引用必须指向它）。
 */
export function createSqlGuardMiddleware(sandboxManager: SandboxManager) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { sql } = req.body as { sql?: string };

    // 非 SQL 执行请求放行（由路由层做参数校验）
    if (!sql || typeof sql !== 'string') {
      next();
      return;
    }

    // 长度检查
    const maxLength = config.security.maxSqlLengthKB * 1024;
    if (sql.length > maxLength) {
      res.status(400).json({
        code: ErrorCode.SQL_NOT_ALLOWED,
        message: `SQL text exceeds maximum length of ${config.security.maxSqlLengthKB}KB`,
      });
      return;
    }

    // 获取当前会话沙箱库名（用于绑定库名引用）
    const sessionReq = req as SessionRequest;
    const sessionId = sessionReq.resolvedSessionId;
    if (!sessionId) {
      next(); // 无 session 由路由层处理
      return;
    }

    try {
      const record = await sandboxManager.getOrCreateSandbox(sessionId);
      const errors = validateSql(sql, record.dbName);

      if (errors.length > 0) {
        res.status(403).json({
          code: ErrorCode.SQL_NOT_ALLOWED,
          message: errors.join('; '),
        });
        return;
      }

      next();
    } catch {
      // 沙箱获取失败交给路由层处理
      next();
    }
  };
}
