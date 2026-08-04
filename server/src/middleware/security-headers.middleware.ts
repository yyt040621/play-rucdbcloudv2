import { Request, Response, NextFunction } from 'express';

/**
 * 安全响应头中间件。
 * 为所有响应添加 CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy。
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // CSP：script 仅 self（Vite 构建为外部 JS），style 允许 inline（CodeMirror），
  // connect 同源（API），frame-ancestors none（防点击劫持）
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'"
  );

  // 防点击劫持
  res.setHeader('X-Frame-Options', 'DENY');

  // 防 MIME 嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 限制 Referer 泄露
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS（仅 HTTPS 时生效；nginx 终止 TLS 时通过 X-Forwarded-Proto 识别）
  if (_req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 防缓存泄露会话（API 响应不缓存）
  res.setHeader('Cache-Control', 'no-store');

  next();
}
