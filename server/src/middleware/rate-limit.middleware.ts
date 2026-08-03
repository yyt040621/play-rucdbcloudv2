import rateLimit from 'express-rate-limit';
import { config } from '../config';

const windowMs = 60 * 1000; // 1 分钟窗口

/**
 * 基于 Session ID 的限流。
 * 每个会话每分钟最多 N 次请求（可伪造 UUID 绕过，需配合全局 IP 限流）。
 */
export const sessionRateLimit = rateLimit({
  windowMs,
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

/**
 * 基于 IP 的全局限流。
 * 防止伪造 UUID 绕过每会话限流，批量创建沙箱/压测。
 * 注意：Docker 内网下 req.ip 为 client 容器 IP，此限流为全用户共享总量保护。
 */
export const globalIpRateLimit = rateLimit({
  windowMs,
  max: config.security.globalRatePerMinute,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 1006,
    message: 'Too many requests from this network. Please try again later.',
  },
});

/**
 * 创建沙箱端点专用限流（更严格，防批量建库耗尽资源）。
 */
export const createSessionRateLimit = rateLimit({
  windowMs,
  max: config.security.createSessionPerMinute,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 1006,
    message: 'Too many sandbox creation requests. Please try again later.',
  },
});
