import { Pool } from 'pg';
import { IDatabaseAdapter } from './database-adapter.interface';
import { config } from '../config';
import { ColumnInfo, IndexInfo, TableInfo } from '../types';

/**
 * PostgreSQL 适配器。
 * 沙箱隔离采用 Schema 模式：一个 database 内多个 schema（sandbox_x）。
 * 接口的 database 参数在本适配器解释为 schema 名。
 */
export class PostgreSQLAdapter implements IDatabaseAdapter {
  /** 管理连接池（超级用户，服务端内部用：建 schema/克隆/管理库） */
  private pool: Pool;
  /** 用户连接池（低权限账号，仅沙箱 schema 权限） */
  private userPool: Pool;
  /** 默认数据库（沙箱 schema 所在） */
  private readonly mainDb: string;

  constructor() {
    const host = config.pg.host;
    const port = config.pg.port;
    this.mainDb = config.pg.database;

    this.pool = new Pool({
      host,
      port,
      user: config.pg.user,
      password: config.pg.password,
      database: this.mainDb,
      max: 20,
    });

    // 低权限用户连接（仅沙箱 schema 权限）
    this.userPool = new Pool({
      host,
      port,
      user: config.pg.appUser,
      password: config.pg.appPassword,
      database: this.mainDb,
      max: 20,
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    await this.userPool.end();
  }

  // === 执行 ===

  async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
    // 兼容 MySQL 语法（反引号 + ? 占位符）
    const pgSql = this.convertSql(sql, params);
    const res = await this.pool.query(pgSql, params ? this.toPgParams(params) : undefined);
    return res.rows;
  }

  async executeUpdate(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId: number }> {
    const pgSql = this.convertSql(sql, params);
    const res = await this.pool.query(pgSql, params ? this.toPgParams(params) : undefined);
    return {
      affectedRows: res.rowCount ?? 0,
      insertId: 0,
    };
  }

  // === 用户 SQL（低权限连接）===

  async executeOnDatabase(schema: string, sql: string): Promise<unknown[]> {
    return this.executeUserOnDatabase(schema, sql);
  }

  async executeUserOnDatabase(schema: string, sql: string): Promise<unknown[]> {
    const client = await this.userPool.connect();
    try {
      await client.query(`SET search_path TO "${schema}"`);
      // MySQL 的 max_execution_time → PG 的 statement_timeout
      const res = await this.runUserSql(client, this.convertTimeout(sql));
      return res ? res.rows : [];
    } finally {
      client.release();
    }
  }

  async executeUserUpdate(sql: string): Promise<{ affectedRows: number; insertId: number }> {
    const client = await this.userPool.connect();
    try {
      // 兼容 MySQL 风格 "USE `db`; SQL" → 转为 SET search_path
      const pgSql = this.convertUseToSearchPath(sql);
      const res = await this.runUserSql(client, this.convertTimeout(pgSql));
      return {
        affectedRows: res?.rowCount ?? 0,
        insertId: 0,
      };
    } finally {
      client.release();
    }
  }

  // === Schema（沙箱）管理 ===

  async createDatabase(name: string): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${name}"`);
    // 授权低权限用户操作该 schema（建表/插删改）
    try {
      await this.pool.query(`GRANT ALL ON SCHEMA "${name}" TO "${config.pg.appUser}"`);
    } catch {
      // app 用户可能尚未创建，忽略（sandbox 内表权限在 cloneDatabase 中授予）
    }
  }

  async dropDatabase(name: string): Promise<void> {
    await this.pool.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
  }

  // === Schema 内表信息 ===

  async getTables(schema: string): Promise<TableInfo[]> {
    const res = await this.pool.query(
      `SELECT table_name AS name, 0 AS "rowCount", 'heap' AS engine
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schema]
    );
    const tables = res.rows as Array<{ name: string }>;
    // 逐个统计行数
    const result: TableInfo[] = [];
    for (const t of tables) {
      try {
        const cnt = await this.pool.query(`SELECT COUNT(*) AS c FROM "${schema}"."${t.name}"`);
        result.push({ name: t.name, rowCount: Number(cnt.rows[0]?.c || 0), engine: 'heap' });
      } catch {
        result.push({ name: t.name, rowCount: 0, engine: 'heap' });
      }
    }
    return result;
  }

  async getTableColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    const res = await this.pool.query(
      `SELECT column_name AS name, data_type AS type,
              is_nullable AS nullable, column_default AS default_value
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    return (res.rows as Array<Record<string, unknown>>).map((r) => ({
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable === 'YES',
      key: (r.default_value as string)?.includes('nextval') ? 'PRI' : '',
      default: r.default_value as string | null,
      extra: '',
    }));
  }

  async getTableIndexes(schema: string, table: string): Promise<IndexInfo[]> {
    const res = await this.pool.query(
      `SELECT indexname AS name, indexdef AS def
       FROM pg_indexes
       WHERE schemaname = $1 AND tablename = $2`,
      [schema, table]
    );
    return (res.rows as Array<Record<string, unknown>>).map((r) => ({
      name: r.name as string,
      columns: [(r.def as string) || ''],
      unique: (r.def as string)?.includes('UNIQUE'),
    }));
  }

  async cloneDatabase(source: string, target: string): Promise<void> {
    await this.createDatabase(target);
    // 获取源 schema 的所有表
    const res = await this.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [source]
    );
    const tables = res.rows as Array<{ table_name: string }>;

    for (const t of tables) {
      const name = t.table_name;
      // 复制表结构（含默认值/约束）+ 数据
      await this.pool.query(
        `CREATE TABLE "${target}"."${name}" (LIKE "${source}"."${name}" INCLUDING ALL)`
      );
      await this.pool.query(
        `INSERT INTO "${target}"."${name}" SELECT * FROM "${source}"."${name}"`
      );
    }

    // 授权低权限用户访问该 schema 的所有表/序列
    try {
      await this.pool.query(`GRANT ALL ON ALL TABLES IN SCHEMA "${target}" TO "${config.pg.appUser}"`);
      await this.pool.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA "${target}" TO "${config.pg.appUser}"`);
    } catch {
      // app 用户可能尚未创建，忽略
    }
  }

  async getDatabaseSize(schema: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0) / 1024 / 1024 AS size_mb
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'`,
      [schema]
    );
    return Number(res.rows[0]?.size_mb || 0);
  }

  async getTableCount(schema: string): Promise<number> {
    const res = await this.pool.query(
      `SELECT COUNT(*) AS cnt FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'`,
      [schema]
    );
    return Number(res.rows[0]?.cnt || 0);
  }

  // === 内部辅助 ===

  /** pg 参数占位符 $1/$2 与调用方 ? 兼容 */
  private toPgParams(params: unknown[]): unknown[] {
    return params;
  }

  /**
   * 把 MySQL 风格 SQL 转为 PostgreSQL：
   * - 反引号 `` ` `` → 双引号 `"`
   * - `?` 占位符 → `$1,$2,...`（仅当提供了 params）
   */
  private convertSql(sql: string, params?: unknown[]): string {
    let converted = sql.replace(/`/g, '"');
    if (params && params.length > 0) {
      let i = 0;
      converted = converted.replace(/\?/g, () => `$${++i}`);
    }
    return converted;
  }

  /** 把 MySQL 风格 "USE `db`; SQL" 转为 "SET search_path TO "db"; SQL" */
  private convertUseToSearchPath(sql: string): string {
    const m = sql.match(/USE\s+`?([\w]+)`?;/i);
    if (m) {
      const schema = m[1];
      const rest = sql.substring(m[0].length);
      return `SET search_path TO "${schema}"; ${rest}`;
    }
    return sql;
  }

  /** MySQL max_execution_time → PostgreSQL statement_timeout */
  private convertTimeout(sql: string): string {
    return sql.replace(/SET SESSION max_execution_time\s*=\s*(\d+)/gi, 'SET statement_timeout = $1');
  }

  /**
   * 在连接上执行 SQL：循环执行所有以 SET 开头的语句，最后执行主体。
   * 避免多语句拼在一条 query 里导致 rows 结果歧义。
   */
  private async runUserSql(
    client: import('pg').PoolClient,
    sql: string
  ): Promise<import('pg').QueryResult | null> {
    let current = sql.trim();
    while (/^SET\s+/i.test(current)) {
      const m = current.match(/^SET[^;]+;/i);
      if (!m) break;
      await client.query(m[0].trim());
      current = current.slice(m[0].length).trim();
    }
    if (current) return client.query(current);
    return null;
  }
}
