import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * 基于 Session ID 的限流中间件。
 * 每个用户每分钟最多 N 次请求。
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000, // 1 分钟窗口
  max: config.security.rateLimitPerMinute,
  keyGenerator: (req) => {
    const sessionId = req.headers['x-session-id'] as string;
    return sessionId || req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 1006,
    message: 'Too many requests. Please try again later.',
  },
});
