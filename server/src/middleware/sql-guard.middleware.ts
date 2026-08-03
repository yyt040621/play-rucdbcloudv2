import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../types';
import { validateSql } from '../services/sql-parser';
import { config } from '../config';

/**
 * SQL 安全检查中间件。
 * 对所有 /api/v1/query 请求的 SQL 文本做白名单校验。
 */
export function sqlGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
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

  // 使用共享的 SQL 解析器做完整校验
  const errors = validateSql(sql);

  if (errors.length > 0) {
    res.status(403).json({
      code: ErrorCode.SQL_NOT_ALLOWED,
      message: errors.join('; '),
    });
    return;
  }

  next();
}
