import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  // MySQL connection
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // 低权用户连接（仅沙箱库权限，用于执行用户 SQL）
    appUser: process.env.DB_APP_USER || 'playground_app',
    appPassword: process.env.DB_APP_PASSWORD || '',
    adminDatabase: process.env.DB_ADMIN_DATABASE || 'playground_admin',
    templateDatabase: process.env.DB_TEMPLATE_DATABASE || 'playground_template',
  },

  // PostgreSQL 连接（演示沙箱 + TPC-C PostgreSQL）
  pg: {
    host: process.env.PG_HOST || 'postgres',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'playground',
    password: process.env.PG_PASSWORD || 'playground_pass',
    appUser: process.env.PG_APP_USER || 'playground_app',
    appPassword: process.env.PG_APP_PASSWORD || 'playground_app_pass',
    database: process.env.PG_DATABASE || 'rucdbcloud',
    templateSchema: process.env.PG_TEMPLATE_SCHEMA || 'playground_template',
    adminSchema: process.env.PG_ADMIN_SCHEMA || 'playground_admin',
  },

  // Session
  session: {
    ttlHours: parseInt(process.env.SESSION_TTL_HOURS || '24', 10),
  },

  // Security limits
  security: {
    maxRowsPerQuery: parseInt(process.env.MAX_ROWS_PER_QUERY || '1000', 10),
    maxDbSizeMB: parseInt(process.env.MAX_DB_SIZE_MB || '100', 10),
    maxTablesPerUser: parseInt(process.env.MAX_TABLES_PER_USER || '50', 10),
    maxSqlLengthKB: parseInt(process.env.MAX_SQL_LENGTH_KB || '10', 10),
    rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '300', 10),
    // 全局 IP 限流（所有用户合计，防批量请求）
    globalRatePerMinute: parseInt(process.env.GLOBAL_RATE_PER_MINUTE || '1200', 10),
    // 创建沙箱端点限流（防批量建库）
    createSessionPerMinute: parseInt(process.env.CREATE_SESSION_PER_MINUTE || '20', 10),
    // 活跃沙箱总配额（防资源耗尽）
    maxActiveSandboxes: parseInt(process.env.MAX_ACTIVE_SANDBOXES || '200', 10),
    queryTimeoutSeconds: parseInt(process.env.QUERY_TIMEOUT_SECONDS || '30', 10),
  },

  // Cleanup
  cleanup: {
    intervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '30', 10),
  },
};
