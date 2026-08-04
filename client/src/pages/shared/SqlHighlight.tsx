interface SqlHighlightProps {
  sql: string;
  className?: string;
}

// SQL 关键词分类 + 颜色（PostgreSQL 为主）
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'ILIKE', 'BETWEEN', 'IS', 'NULL',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP',
  'ALTER', 'ADD', 'COLUMN', 'INDEX', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
  'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'CROSS', 'ON', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
  'ASC', 'DESC', 'IF', 'EXISTS', 'INT', 'INTEGER', 'BIGINT', 'SERIAL', 'BIGSERIAL',
  'VARCHAR', 'CHAR', 'TEXT', 'BOOLEAN', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL',
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'SERIAL',
  'DEFAULT', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'CASCADE', 'TRUNCATE', 'RENAME',
  'REPLACE', 'INTO', 'USE', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH', 'UNION',
  'ALL', 'ANY', 'SOME', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'GENERATED', 'IDENTITY', 'RETURNING', 'SCHEMA', 'SEQUENCE', 'VIEW', 'TYPE',
]);

const BUILTIN_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'COALESCE', 'NULLIF',
  'CONCAT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'LENGTH', 'REPLACE',
  'NOW', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'DATE_PART', 'EXTRACT',
  'ARRAY_AGG', 'STRING_AGG',
]);

const TYPES = new Set([
  'INT', 'VARCHAR', 'TEXT', 'BOOLEAN', 'DECIMAL', 'FLOAT', 'DOUBLE',
  'DATE', 'DATETIME', 'TIMESTAMP', 'CHAR', 'BIGINT', 'SMALLINT', 'TINYINT',
  'ENUM', 'BLOB', 'JSON',
]);

export function SqlHighlight({ sql, className = '' }: SqlHighlightProps) {
  if (!sql) return null;

  // 按 token 拆分并着色
  const tokens = tokenize(sql);

  return (
    <pre className={`text-[13px] font-mono whitespace-pre-wrap break-all
      leading-relaxed select-all overflow-y-auto
      rounded-lg border border-[var(--border-color)]
      bg-[var(--bg-primary)] p-3 ${className}`}
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace" }}
    >
      {tokens.map((t, i) => {
        if (!t.text) return null;

        // 注释
        if (t.type === 'comment') {
          return <span key={i} className="italic text-[var(--sql-comment)]">{t.text}</span>;
        }

        const upper = t.text.toUpperCase();

        // 字符串
        if (t.type === 'string') {
          return <span key={i} className="text-[var(--sql-string)]">{t.text}</span>;
        }

        // 数字
        if (t.type === 'number') {
          return <span key={i} className="text-[var(--sql-number)]">{t.text}</span>;
        }

        // 关键词
        if (KEYWORDS.has(upper)) {
          return <span key={i} className="text-[var(--sql-keyword)] font-semibold">{t.text}</span>;
        }

        // 类型
        if (TYPES.has(upper)) {
          return <span key={i} className="text-[var(--sql-type)]">{t.text}</span>;
        }

        // 函数
        if (BUILTIN_FUNCTIONS.has(upper)) {
          return <span key={i} className="text-[var(--sql-function)]">{t.text}</span>;
        }

        // 标识符 (反引号)
        if (t.type === 'identifier') {
          return <span key={i} className="text-[var(--sql-identifier)]">{t.text}</span>;
        }

        // 操作符/标点
        if (/^[;,()=<>!+\-*/%]+$/.test(t.text.trim())) {
          return <span key={i} className="text-[var(--text-secondary)]">{t.text}</span>;
        }

        // 普通文本（表名、列名等）
        return <span key={i}>{t.text}</span>;
      })}
    </pre>
  );
}

// Token 类型
type TokenType = 'keyword' | 'string' | 'number' | 'comment' | 'identifier' | 'operator' | 'text';

interface Token {
  text: string;
  type: TokenType;
}

/**
 * 简易 SQL 词法分析：拆分为 token 串
 */
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    // 空白
    if (/\s/.test(sql[i])) {
      let ws = '';
      while (i < sql.length && /\s/.test(sql[i])) { ws += sql[i]; i++; }
      tokens.push({ text: ws, type: 'text' });
      continue;
    }

    // 单行注释 --
    if (sql[i] === '-' && sql[i + 1] === '-') {
      let comment = '';
      while (i < sql.length && sql[i] !== '\n') { comment += sql[i]; i++; }
      tokens.push({ text: comment, type: 'comment' });
      continue;
    }

    // 块注释 /* */
    if (sql[i] === '/' && sql[i + 1] === '*') {
      let comment = '/*';
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) {
        comment += sql[i]; i++;
      }
      comment += '*/';
      i += 2;
      tokens.push({ text: comment, type: 'comment' });
      continue;
    }

    // 字符串 ''
    if (sql[i] === "'") {
      let str = "'";
      i++;
      while (i < sql.length && sql[i] !== "'") {
        if (sql[i] === '\\') { str += sql[i]; i++; }
        str += sql[i]; i++;
      }
      if (i < sql.length) { str += "'"; i++; }
      tokens.push({ text: str, type: 'string' });
      continue;
    }

    // 字符串 ""
    if (sql[i] === '"') {
      let str = '"';
      i++;
      while (i < sql.length && sql[i] !== '"') {
        if (sql[i] === '\\') { str += sql[i]; i++; }
        str += sql[i]; i++;
      }
      if (i < sql.length) { str += '"'; i++; }
      tokens.push({ text: str, type: 'string' });
      continue;
    }

    // 反引号标识符 ``
    if (sql[i] === '`') {
      let id = '`';
      i++;
      while (i < sql.length && sql[i] !== '`') { id += sql[i]; i++; }
      if (i < sql.length) { id += '`'; i++; }
      tokens.push({ text: id, type: 'identifier' });
      continue;
    }

    // 数字
    if (/\d/.test(sql[i]) || (sql[i] === '.' && i + 1 < sql.length && /\d/.test(sql[i + 1]))) {
      let num = '';
      while (i < sql.length && /[\d.]/.test(sql[i])) { num += sql[i]; i++; }
      tokens.push({ text: num, type: 'number' });
      continue;
    }

    // 操作符/标点
    if (/[;,()=<>!+\-*/%]/.test(sql[i])) {
      tokens.push({ text: sql[i], type: 'operator' });
      i++;
      continue;
    }

    // 普通单词
    let word = '';
    while (i < sql.length && !/[\s;,()=<>!+\-*/%'"`]/.test(sql[i])) {
      word += sql[i]; i++;
    }
    if (word) {
      tokens.push({ text: word, type: 'text' });
    }
  }

  return tokens;
}
