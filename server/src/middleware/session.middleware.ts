import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '../types';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * Session 中间件：从 X-Session-Id 请求头中提取并校验 session ID。
 * 如果格式无效，返回 401；如果未提供，生成一个新的临时 ID 放入 request。
 */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.headers['x-session-id'] as string | undefined;

  if (sessionId) {
    // 校验 UUID 格式
    if (!uuidValidate(sessionId)) {
      res.status(401).json({
        code: ErrorCode.INVALID_SESSION,
        message: 'Invalid session ID format',
      });
      return;
    }
  }

  // 将 sessionId 注入到 request 对象（扩展属性）
  (req as SessionRequest).resolvedSessionId = sessionId || null;

  next();
}

// 扩展 Express Request 类型
export interface SessionRequest extends Request {
  resolvedSessionId: string | null;
}
