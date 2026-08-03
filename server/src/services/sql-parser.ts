/**
 * 共享 SQL 解析工具。
 * 被 sql-guard 中间件和 sql-executor 共用，避免逻辑重复。
 */

// === 常量定义 ===

/** 允许的顶级 SQL 操作（白名单） */
export const ALLOWED_OPERATIONS = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE',
  'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
  'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN',
  'USE', 'SET',
  'WITH',  // CTE
]);

/** 禁止的 SQL 关键字（黑名单，优先级高于白名单） */
export const FORBIDDEN_KEYWORDS = new Set([
  'GRANT', 'REVOKE', 'SHUTDOWN', 'FLUSH',
  'RENAME',                // RENAME TABLE / RENAME USER
  'CREATE USER', 'DROP USER',
  'DROP DATABASE', 'CREATE DATABASE', 'ALTER DATABASE',
  'CREATE PROCEDURE', 'CREATE FUNCTION',
  'CREATE TRIGGER', 'CREATE EVENT', 'CREATE VIEW',
  'LOAD DATA', 'LOAD FILE', 'LOAD XML',
  'INTO OUTFILE', 'INTO DUMPFILE',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'START TRANSACTION',
  'LOCK TABLES', 'UNLOCK TABLES',
  'CALL',
  'KILL',
  'RESET', 'PURGE', 'CHANGE',
  'STOP SLAVE', 'START SLAVE',
  'HANDLER', 'HELP',
  'BINLOG', 'CACHE INDEX',
  'CHECKSUM TABLE',
  'ANALYZE TABLE', 'CHECK TABLE', 'OPTIMIZE TABLE', 'REPAIR TABLE',
  'INSTALL', 'UNINSTALL',
  'PREPARE', 'EXECUTE', 'DEALLOCATE PREPARE',
  'XA',
  'SAVEPOINT', 'RELEASE SAVEPOINT',
]);

/** 受保护的表（模板表，不允许 DROP / ALTER / TRUNCATE / RENAME） */
export const PROTECTED_TABLES = ['employees', 'orders'];

/** 受保护表的危险操作 */
const PROTECTED_TABLE_FORBIDDEN_OPS = new Set([
  'DROP', 'DROP TABLE',
  'ALTER', 'ALTER TABLE',
  'TRUNCATE', 'TRUNCATE TABLE',
  'RENAME', 'RENAME TABLE',
]);

// === 解析函数 ===

/**
 * 按分号拆分 SQL 语句。正确处理字符串字面量内部的分号。
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];

    if (ch === "'" && !inDoubleQuote && !inBacktick && !isEscaped(sql, i)) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote && !inBacktick && !isEscaped(sql, i)) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === '`' && !inSingleQuote && !inDoubleQuote && !isEscaped(sql, i)) {
      inBacktick = !inBacktick;
    } else if (ch === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      statements.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) {
    statements.push(current);
  }

  return statements;
}

/**
 * 判断位置 index 的引号是否被反斜杠转义。
 * 统计引号前连续反斜杠数量：偶数个则未转义，奇数个则已转义。
 * 与 MySQL 行为一致（\\ 表示一个普通反斜杠，不转义后续引号）。
 */
function isEscaped(sql: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && sql[i] === '\\'; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * 去除 SQL 注释（单行 -- 和块注释），保留字符串内的 "注释" 字符。
 */
export function removeComments(sql: string): string {
  const result: string[] = [];
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  while (i < sql.length) {
    const ch = sql[i];

    // 字符串状态切换
    if (ch === "'" && !inDoubleQuote && !inBacktick && !isEscaped(sql, i)) {
      inSingleQuote = !inSingleQuote;
      result.push(ch);
      i++;
      continue;
    }
    if (ch === '"' && !inSingleQuote && !inBacktick && !isEscaped(sql, i)) {
      inDoubleQuote = !inDoubleQuote;
      result.push(ch);
      i++;
      continue;
    }
    if (ch === '`' && !inSingleQuote && !inDoubleQuote && !isEscaped(sql, i)) {
      inBacktick = !inBacktick;
      result.push(ch);
      i++;
      continue;
    }

    // 在字符串内部 → 不处理注释
    if (inSingleQuote || inDoubleQuote || inBacktick) {
      result.push(ch);
      i++;
      continue;
    }

    // 单行注释 --
    if (ch === '-' && sql[i + 1] === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n' || sql[i + 2] === '\r' || i + 2 >= sql.length)) {
      // 跳到行尾
      while (i < sql.length && sql[i] !== '\n') i++;
      result.push(' '); // 保留空白分隔
      continue;
    }

    // 块注释
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2; // 跳过 /*
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2; // 跳过 */
      result.push(' '); // 保留空白分隔
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('');
}

/**
 * 从单条 SQL 语句中提取操作关键字。
 * 先去除注释，再按空白分割取前两个词组合判断。
 * 返回 [顶级操作, 复合操作?]
 */
export function extractOperation(sql: string): { topLevel: string; composite: string } {
  const cleaned = removeComments(sql).trim();
  if (!cleaned) return { topLevel: '', composite: '' };

  const words = cleaned.split(/\s+/);
  const first = (words[0] || '').toUpperCase();
  const second = (words[1] || '').toUpperCase();

  // 复合操作（CREATE TABLE, DROP DATABASE, ALTER TABLE 等）
  const compositeWords = [
    'TABLE', 'INDEX', 'DATABASE', 'USER', 'PROCEDURE', 'FUNCTION',
    'TRIGGER', 'EVENT', 'VIEW', 'TABLESPACE', 'SERVER',
    'SLAVE', 'TABLES', 'DATA', 'FILE', 'OUTFILE', 'DUMPFILE',
    'LOGFILE', 'PREPARE',
  ];

  const composite = compositeWords.includes(second) ? `${first} ${second}` : first;

  return { topLevel: first, composite };
}

/**
 * 检查单条 SQL 是否被禁止。
 * @param allowedDb 当前会话的沙箱库名（库名引用必须指向它）
 * 返回 null 表示通过检查，返回 string 表示拒绝原因。
 */
export function checkSqlAllowed(sql: string, allowedDb?: string): string | null {
  // 0. 拒绝可执行注释 /*! ... */ — 其内容会被 MySQL 真实执行
  if (/\/\*!/.test(sql)) {
    return `Operation not allowed: executable comment (/*! ... */)`;
  }

  const { topLevel, composite } = extractOperation(sql);

  // 空语句
  if (!topLevel) return null;

  // 0. 扫描语句中任意位置的危险关键字（如 SELECT ... INTO OUTFILE）
  const midStmtError = checkMidStatementDangerous(sql);
  if (midStmtError) return midStmtError;

  // 0.5 禁止 SHOW DATABASES（泄露所有库名，用户只需操作自己的沙箱）
  if (topLevel === 'SHOW' && /\bSHOW\s+DATABASES\b/i.test(sql)) {
    return `Operation not allowed: SHOW DATABASES`;
  }

  // 1. 检查黑名单（精确匹配复合操作优先）
  if (FORBIDDEN_KEYWORDS.has(composite)) {
    return `Operation not allowed: ${composite}`;
  }
  if (FORBIDDEN_KEYWORDS.has(topLevel)) {
    return `Operation not allowed: ${topLevel}`;
  }

  // 2. 检查白名单
  if (!ALLOWED_OPERATIONS.has(topLevel)) {
    return `Unknown or unsupported operation: ${topLevel}`;
  }

  // 3. 检查受保护的表
  if (PROTECTED_TABLE_FORBIDDEN_OPS.has(composite) ||
      PROTECTED_TABLE_FORBIDDEN_OPS.has(topLevel)) {
    if (referencesProtectedTable(sql)) {
      return `Cannot modify protected tables (${PROTECTED_TABLES.join(', ')})`;
    }
  }

  // 4. USE 语句只允许切换到当前会话的沙箱库
  if (topLevel === 'USE') {
    const match = sql.match(/USE\s+`?(\w+)`?/i);
    if (match) {
      const targetDb = match[1];
      if (!allowedDb || targetDb !== allowedDb) {
        return `USE is only allowed on your own sandbox database (${allowedDb})`;
      }
    }
  }

  // 5. 库名访问检查（绑定当前会话库 + 系统库黑名单 + 空白/注释规范化）
  if (allowedDb) {
    const dbErr = checkDatabaseAccess(sql, allowedDb);
    if (dbErr) return dbErr;
  }

  return null;
}

/**
 * 系统/管理库黑名单（用户绝不可访问）
 */
const SYSTEM_DATABASES = [
  'mysql', 'information_schema', 'performance_schema', 'sys',
  'playground_admin', 'playground_template', 'tpcc_benchmark',
];

/**
 * 检查 SQL 引用的库名。
 * 返回错误字符串（拒绝）或 null（放行）。
 *
 * 策略：
 * - 系统/管理库 → 拒绝
 * - 其他 sandbox_* 库（非当前会话库）→ 拒绝（跨租户隔离）
 * - 其余（表名.字段 / 别名.字段，如 employees.id、e.first_name）→ 放行
 *   （用户无法创建任意库，非 sandbox 库名必然是表名/别名）
 */
function checkDatabaseAccess(sql: string, allowedDb: string): string | null {
  // 规范化：去注释 → 去字符串 → 压缩空白（修复 mysql . user / /**/ 绕过）
  const cleaned = stripStringLiterals(removeComments(sql)).replace(/\s+/g, ' ');

  // 匹配 db.table（允许 db 与 . 之间有空白/注释）
  const pattern = /`?([A-Za-z0-9_]+)`?\s*\.\s*`?[A-Za-z0-9_*]+`?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const db = match[1].toLowerCase();
    // 系统库 → 拒绝
    if (SYSTEM_DATABASES.includes(db)) {
      return `Cannot access database: ${match[1]}`;
    }
    // 其他沙箱库（跨租户）→ 拒绝
    if (db.startsWith('sandbox_') && db !== allowedDb.toLowerCase()) {
      return `Cannot access other user's sandbox: ${match[1]}`;
    }
  }
  return null;
}

/**
 * 扫描 SQL 中任意位置的危险关键字。
 * 某些关键字（如 INTO OUTFILE）可能出现在语句中间而非开头，
 * 必须全语句扫描。
 */
const MID_STMT_DANGEROUS = [
  'INTO OUTFILE', 'INTO DUMPFILE',
  'LOAD DATA', 'LOAD FILE', 'LOAD XML',
];

function checkMidStatementDangerous(sql: string): string | null {
  // 规范化空白，修复 "INTO  OUTFILE"（双空格）绕过
  const cleaned = stripStringLiterals(removeComments(sql)).replace(/\s+/g, ' ').toUpperCase();

  for (const keyword of MID_STMT_DANGEROUS) {
    if (cleaned.includes(keyword)) {
      return `Operation not allowed: ${keyword}`;
    }
  }

  return null;
}

/**
 * 去除 SQL 中的字符串字面量内容（替换为空格），
 * 避免字符串内部的关键字触发误报。
 */
function stripStringLiterals(sql: string): string {
  const result: string[] = [];
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "'" && !inDouble && !isEscaped(sql, i)) {
      inSingle = !inSingle;
      result.push(' ');
      i++;
      continue;
    }
    if (ch === '"' && !inSingle && !isEscaped(sql, i)) {
      inDouble = !inDouble;
      result.push(' ');
      i++;
      continue;
    }

    if (inSingle || inDouble) {
      result.push(' ');
    } else {
      result.push(ch);
    }
    i++;
  }

  return result.join('');
}

/**
 * 检查 SQL 是否引用了受保护表。
 * 使用词边界匹配，避免 "my_orders" 匹配 "orders"。
 */
function referencesProtectedTable(sql: string): boolean {
  const upperSQL = removeComments(sql).toUpperCase();

  for (const table of PROTECTED_TABLES) {
    const pattern = new RegExp(`\\b${table.toUpperCase()}\\b`, 'i');
    if (pattern.test(upperSQL)) return true;
  }

  return false;
}

/**
 * 对完整 SQL 文本做安全检查（可含多条语句）。
 * @param allowedDb 当前会话沙箱库名（库名引用必须指向它）
 * 返回拒绝原因数组，空数组表示全部通过。
 */
export function validateSql(sql: string, allowedDb?: string): string[] {
  const errors: string[] = [];

  const statements = splitStatements(sql);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;

    const error = checkSqlAllowed(stmt, allowedDb);
    if (error) {
      errors.push(`Statement ${i + 1}: ${error}`);
    }
  }

  return errors;
}
