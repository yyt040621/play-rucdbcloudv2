import { describe, it, expect } from 'vitest';
import {
  splitStatements,
  removeComments,
  extractOperation,
  checkSqlAllowed,
  validateSql,
} from './sql-parser';

// ============================================================
// splitStatements
// ============================================================
describe('splitStatements', () => {
  it('单条语句', () => {
    expect(splitStatements('SELECT * FROM employees')).toEqual([
      'SELECT * FROM employees',
    ]);
  });

  it('多条语句用分号分隔', () => {
    expect(splitStatements('SELECT 1; SELECT 2; SELECT 3')).toEqual([
      'SELECT 1',
      ' SELECT 2',
      ' SELECT 3',
    ]);
  });

  it('字符串内分号不分隔', () => {
    expect(splitStatements("INSERT INTO t VALUES ('hello; world')")).toEqual([
      "INSERT INTO t VALUES ('hello; world')",
    ]);
  });

  it('双引号内分号不分隔', () => {
    expect(splitStatements('SELECT "a;b" FROM t')).toEqual([
      'SELECT "a;b" FROM t',
    ]);
  });

  it('反引号内分号不分隔', () => {
    expect(splitStatements('SELECT `col;name` FROM t')).toEqual([
      'SELECT `col;name` FROM t',
    ]);
  });

  it('空语句被过滤', () => {
    const result = splitStatements('SELECT 1;  ;  ;SELECT 2;');
    expect(result.length).toBe(4); // 包含两个空字符串
    const nonEmpty = result.filter((s) => s.trim());
    expect(nonEmpty.length).toBe(2);
  });

  it('末尾分号', () => {
    expect(splitStatements('SELECT 1;')).toEqual(['SELECT 1']);
  });

  it('只有分号', () => {
    expect(splitStatements(';').filter((s) => s.trim()).length).toBe(0);
  });
});

// ============================================================
// removeComments
// ============================================================
describe('removeComments', () => {
  it('去除单行注释', () => {
    const result = removeComments('SELECT 1 -- this is a comment');
    // 注释被替换为空格，只验证语义
    expect(result).toMatch(/^SELECT 1\s+$/);
  });

  it('去除块注释', () => {
    expect(removeComments('SELECT /* inline */ 1')).toBe('SELECT   1');
  });

  it('多行块注释', () => {
    const input = `SELECT
/*
  multi-line
  comment
*/
1 FROM t`;
    const result = removeComments(input);
    expect(result).toContain('SELECT');
    expect(result).toContain('1 FROM t');
  });

  it('字符串内的注释字符不被移除', () => {
    const input = "SELECT '-- not a comment' FROM t";
    const result = removeComments(input);
    expect(result).toBe("SELECT '-- not a comment' FROM t");
  });

  it('字符串内的块注释不被移除', () => {
    const input = "SELECT '/* not a comment */' FROM t";
    const result = removeComments(input);
    expect(result).toBe("SELECT '/* not a comment */' FROM t");
  });
});

// ============================================================
// extractOperation
// ============================================================
describe('extractOperation', () => {
  it('SELECT', () => {
    expect(extractOperation('SELECT * FROM t').composite).toBe('SELECT');
  });

  it('CREATE TABLE', () => {
    expect(extractOperation('CREATE TABLE t (id INT)').composite).toBe(
      'CREATE TABLE'
    );
  });

  it('DROP TABLE', () => {
    expect(extractOperation('DROP TABLE IF EXISTS t').composite).toBe(
      'DROP TABLE'
    );
  });

  it('DROP DATABASE', () => {
    expect(extractOperation('DROP DATABASE test').composite).toBe(
      'DROP DATABASE'
    );
  });

  it('INSERT', () => {
    expect(extractOperation('INSERT INTO t VALUES (1)').composite).toBe(
      'INSERT'
    );
  });

  it('空字符串', () => {
    expect(extractOperation('').topLevel).toBe('');
    expect(extractOperation('').composite).toBe('');
  });

  it('去除注释后提取', () => {
    const result = extractOperation('-- comment\nSELECT 1');
    expect(result.composite).toBe('SELECT');
  });
});

// ============================================================
// checkSqlAllowed — 正常 SQL
// ============================================================
describe('checkSqlAllowed — 允许的操作', () => {
  it('SELECT', () => {
    expect(checkSqlAllowed('SELECT * FROM employees')).toBeNull();
  });

  it('INSERT', () => {
    expect(checkSqlAllowed("INSERT INTO employees (name) VALUES ('test')")).toBeNull();
  });

  it('UPDATE', () => {
    expect(checkSqlAllowed("UPDATE employees SET name = 'x' WHERE id = 1")).toBeNull();
  });

  it('DELETE', () => {
    expect(checkSqlAllowed('DELETE FROM employees WHERE id = 1')).toBeNull();
  });

  it('CREATE TABLE', () => {
    expect(checkSqlAllowed('CREATE TABLE my_table (id INT PRIMARY KEY)')).toBeNull();
  });

  it('SHOW TABLES', () => {
    expect(checkSqlAllowed('SHOW TABLES')).toBeNull();
  });

  it('DESCRIBE', () => {
    expect(checkSqlAllowed('DESCRIBE employees')).toBeNull();
  });

  it('EXPLAIN', () => {
    expect(checkSqlAllowed('EXPLAIN SELECT * FROM employees')).toBeNull();
  });

  it('CTE (WITH)', () => {
    expect(checkSqlAllowed('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBeNull();
  });

  it('SET NAMES', () => {
    expect(checkSqlAllowed('SET NAMES utf8mb4')).toBeNull();
  });
});

// ============================================================
// checkSqlAllowed — 禁止操作
// ============================================================
describe('checkSqlAllowed — 禁止操作', () => {
  it('DROP DATABASE', () => {
    expect(checkSqlAllowed('DROP DATABASE test')).toContain('not allowed');
  });

  it('CREATE DATABASE', () => {
    expect(checkSqlAllowed('CREATE DATABASE test')).toContain('not allowed');
  });

  it('GRANT', () => {
    expect(checkSqlAllowed('GRANT ALL ON *.* TO user')).toContain('not allowed');
  });

  it('SHUTDOWN', () => {
    expect(checkSqlAllowed('SHUTDOWN')).toContain('not allowed');
  });

  it('LOAD DATA INFILE', () => {
    expect(checkSqlAllowed("LOAD DATA INFILE '/etc/passwd' INTO TABLE t")).toContain(
      'not allowed'
    );
  });

  it('INTO OUTFILE', () => {
    expect(checkSqlAllowed("SELECT * FROM t INTO OUTFILE '/tmp/dump'")).toContain(
      'not allowed'
    );
  });

  it('BEGIN TRANSACTION', () => {
    expect(checkSqlAllowed('BEGIN')).toContain('not allowed');
  });

  it('LOCK TABLES', () => {
    expect(checkSqlAllowed('LOCK TABLES employees READ')).toContain('not allowed');
  });

  it('CALL PROCEDURE', () => {
    expect(checkSqlAllowed('CALL my_proc()')).toContain('not allowed');
  });

  it('PREPARE / EXECUTE', () => {
    expect(checkSqlAllowed('PREPARE stmt FROM "SELECT 1"')).toContain('not allowed');
  });
});

// ============================================================
// checkSqlAllowed — 受保护表
// ============================================================
describe('checkSqlAllowed — 受保护表', () => {
  it('禁止 DROP TABLE employees', () => {
    const result = checkSqlAllowed('DROP TABLE employees');
    expect(result).toContain('protected table');
  });

  it('禁止 DROP TABLE orders', () => {
    const result = checkSqlAllowed('DROP TABLE orders');
    expect(result).toContain('protected table');
  });

  it('禁止 TRUNCATE TABLE employees', () => {
    const result = checkSqlAllowed('TRUNCATE TABLE employees');
    expect(result).toContain('protected table');
  });

  it('禁止 ALTER TABLE employees', () => {
    const result = checkSqlAllowed('ALTER TABLE employees ADD COLUMN x INT');
    expect(result).toContain('protected table');
  });

  it('允许 DROP TABLE my_table（用户自建表）', () => {
    const result = checkSqlAllowed('DROP TABLE my_table');
    expect(result).toBeNull();
  });

  it('允许 SELECT from employees', () => {
    const result = checkSqlAllowed('SELECT * FROM employees');
    expect(result).toBeNull();
  });

  it('允许 INSERT into employees', () => {
    const result = checkSqlAllowed(
      "INSERT INTO employees (first_name, last_name, email, department, salary, hire_date) VALUES ('Test', 'User', 'test@t.com', 'Tech', 10000, '2024-01-01')"
    );
    expect(result).toBeNull();
  });
});

// ============================================================
// checkSqlAllowed — USE 限制
// ============================================================
describe('checkSqlAllowed — USE 限制', () => {
  it('允许 USE sandbox_xxx', () => {
    expect(checkSqlAllowed('USE sandbox_abc123')).toBeNull();
  });

  it('禁止 USE 其他数据库', () => {
    const result = checkSqlAllowed('USE mysql');
    expect(result).toContain('sandbox');
  });

  it('禁止 USE playground_admin', () => {
    const result = checkSqlAllowed('USE playground_admin');
    expect(result).toContain('sandbox');
  });
});

// ============================================================
// validateSql — 多语句
// ============================================================
describe('validateSql — 多语句', () => {
  it('多条正常语句全部通过', () => {
    expect(validateSql('SELECT 1; SELECT 2; SELECT 3')).toEqual([]);
  });

  it('混合正常和禁止语句', () => {
    const errors = validateSql('SELECT 1; DROP DATABASE test; SELECT 2');
    expect(errors.length).toBeGreaterThan(0);
    // 第2条语句（DROP DATABASE）应被拒绝
    expect(errors[0]).toContain('Statement 2');
    expect(errors[0]).toContain('not allowed');
  });

  it('全部禁止', () => {
    const errors = validateSql('SHUTDOWN; GRANT ALL ON *.* TO user');
    expect(errors.length).toBe(2);
  });

  it('空语句不影响检查', () => {
    const errors = validateSql('SELECT 1;  ;DROP DATABASE x;');
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Statement 3');
  });
});

// ============================================================
// 安全边界测试
// ============================================================
describe('SQL 安全边界测试', () => {
  it('大小写混合的禁止操作', () => {
    const result = checkSqlAllowed('DrOp DaTaBaSe test');
    expect(result).toContain('not allowed');
  });

  it('多空白字符', () => {
    const result = checkSqlAllowed('DROP   \t\n   DATABASE   test');
    expect(result).toContain('not allowed');
  });

  it('带前导空格的禁止操作', () => {
    const result = checkSqlAllowed('   DROP DATABASE test');
    expect(result).toContain('not allowed');
  });

  it('含注释的禁止操作被拦截', () => {
    const result = checkSqlAllowed('DROP /* comment */ DATABASE test');
    // 去除注释后 "DROP DATABASE" 应被识别
    expect(result).toContain('not allowed');
  });

  it('受保护表名含混合大小写', () => {
    const result = checkSqlAllowed('DROP TABLE EMPLOYEES');
    expect(result).toContain('protected');
  });
});

// ============================================================
// 越权访问防护（新增安全修复）
// ============================================================
describe('数据库越权访问防护', () => {
  it('禁止访问 playground_admin 库', () => {
    const result = checkSqlAllowed('SELECT * FROM playground_admin.sandboxes');
    expect(result).toContain('Cannot access database');
  });

  it('禁止访问 playground_template 库', () => {
    const result = checkSqlAllowed('SELECT * FROM playground_template.employees');
    expect(result).toContain('Cannot access database');
  });

  it('禁止修改模板库', () => {
    const result = checkSqlAllowed("UPDATE playground_template.employees SET salary=1");
    expect(result).toContain('Cannot access database');
  });

  it('禁止删除审计日志', () => {
    const result = checkSqlAllowed('DELETE FROM playground_admin.query_logs');
    expect(result).toContain('Cannot access database');
  });

  it('禁止 DROP 管理库表', () => {
    const result = checkSqlAllowed('DROP TABLE playground_admin.sandboxes');
    expect(result).toContain('Cannot access database');
  });

  it('允许访问 sandbox 库', () => {
    expect(checkSqlAllowed('SELECT * FROM sandbox_abc123.my_table')).toBeNull();
  });

  it('允许访问反引号包裹的 sandbox 库', () => {
    expect(checkSqlAllowed('SELECT * FROM `sandbox_abc123`.`my_table`')).toBeNull();
  });

  it('字符串内的库名不误报', () => {
    const result = checkSqlAllowed("SELECT * FROM my_table WHERE note='playground_admin.test'");
    expect(result).toBeNull();
  });
});

// ============================================================
// 可执行注释防护
// ============================================================
describe('可执行注释 /*! */ 防护', () => {
  it('拒绝可执行注释', () => {
    const result = checkSqlAllowed('SELECT 1; /*! DROP DATABASE playground_admin */');
    expect(result).toContain('not allowed');
  });

  it('拒绝含可执行注释的单条语句', () => {
    const result = checkSqlAllowed('/*! SELECT 1 */');
    expect(result).toContain('not allowed');
  });
});

// ============================================================
// 反斜杠转义绕过防护
// ============================================================
describe('反斜杠转义绕过防护', () => {
  it('\\\' 后跟分号不能绕过拆分', () => {
    // '\\' 后跟 ; 再跟 DELETE —— 解析器应正确识别 DELETE 为第二条语句
    const result = validateSql("SELECT '\\\\'; DELETE FROM playground_admin.query_logs");
    expect(result.length).toBeGreaterThan(0);
    expect(result[1] || result[0]).toContain('Cannot access database');
  });

  it('双反斜杠后引号不结束字符串', () => {
    const result = checkSqlAllowed("SELECT 'a\\\\' FROM employees");
    expect(result).toBeNull();
  });
});
