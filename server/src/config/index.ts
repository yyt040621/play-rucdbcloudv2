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
    queryTimeoutSeconds: parseInt(process.env.QUERY_TIMEOUT_SECONDS || '30', 10),
  },

  // Cleanup
  cleanup: {
    intervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '30', 10),
  },
};
