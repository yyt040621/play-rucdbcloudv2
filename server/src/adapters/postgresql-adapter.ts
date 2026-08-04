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
      // 方言转换（反引号→双引号、AUTO_INCREMENT→IDENTITY）+ MySQL 超时语法→PG statement_timeout
      const res = await this.runUserSql(
        client,
        this.convertTimeout(this.convertDialect(sql))
      );
      return res ? res.rows : [];
    } finally {
      client.release();
    }
  }

  async executeUserUpdate(sql: string): Promise<{ affectedRows: number; insertId: number }> {
    const client = await this.userPool.connect();
    try {
      // 兼容 MySQL 风格 "USE `db`; SQL" → 转为 SET search_path，再做方言转换
      const pgSql = this.convertUseToSearchPath(sql);
      const converted = this.convertTimeout(this.convertDialect(pgSql));

      // 单条 INSERT 追加 RETURNING *，回填自增主键（修复 1.9 insertId=0）
      const insertable = this.tryAddReturning(converted);

      const res = await this.runUserSql(client, insertable.sql);
      return {
        affectedRows: res?.rowCount ?? 0,
        insertId: insertable.capture ? this.extractInsertId(res) : 0,
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

  async databaseExists(name: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [name]
    );
    return res.rows.length > 0;
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
              is_nullable AS nullable, column_default AS default_value,
              is_identity AS is_identity
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    return (res.rows as Array<Record<string, unknown>>).map((r) => {
      // 自动生成值的列（GENERATED ALWAYS AS IDENTITY / SERIAL nextval 默认值）
      // 标记为 auto_increment，前端插入表单据此自动跳过，避免把主键当普通列填写
      const autoGenerated =
        r.is_identity === 'YES' || String(r.default_value ?? '').includes('nextval');
      return {
        name: r.name as string,
        type: r.type as string,
        nullable: r.nullable === 'YES',
        key: (r.default_value as string)?.includes('nextval') ? 'PRI' : '',
        default: r.default_value as string | null,
        extra: autoGenerated ? 'auto_increment' : '',
      };
    });
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
      // 模板表主键是 GENERATED ALWAYS AS IDENTITY（或 SERIAL），显式拷贝主键值必须
      // OVERRIDING SYSTEM VALUE，否则 PG 报 "cannot insert a non-DEFAULT value"。
      // 非 identity 表上该子句是无害的 no-op。拷贝后由 fixSerialDefaults 重置序列到 max+1。
      await this.pool.query(
        `INSERT INTO "${target}"."${name}" OVERRIDING SYSTEM VALUE SELECT * FROM "${source}"."${name}"`
      );
      // 修复 SERIAL 类默认值：LIKE 克隆会把 nextval(...) 指向源 schema 的共享序列，
      // 导致低权限账号无 USAGE 权限（5.5 回归）。为每个自增列重建本沙箱专属序列。
      await this.fixSerialDefaults(target, name);
    }

    // 授权低权限用户访问该 schema 的所有表/序列
    try {
      await this.pool.query(`GRANT ALL ON ALL TABLES IN SCHEMA "${target}" TO "${config.pg.appUser}"`);
      await this.pool.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA "${target}" TO "${config.pg.appUser}"`);
      await this.pool.query(`GRANT USAGE ON SCHEMA "${target}" TO "${config.pg.appUser}"`);
    } catch {
      // app 用户可能尚未创建，忽略
    }
  }

  /**
   * 修复克隆后自增列的序列归属。
   * LIKE ... INCLUDING ALL 对 SERIAL 列复制的默认值是 nextval('源schema序列')，
   * 会让沙箱表共享模板序列（且低权限账号无 USAGE 权限）。
   * 这里为每个自增列在本沙箱内重建专属序列并绑定默认值。
   * 对 GENERATED AS IDENTITY 列（is_identity='YES'）跳过——其序列随 LIKE 克隆时已自动创建于本 schema。
   */
  private async fixSerialDefaults(target: string, table: string): Promise<void> {
    // 覆盖两类自增列：
    // - SERIAL：column_default = nextval('...seq')，LIKE 克隆会把默认值指向源 schema 的共享序列
    // - GENERATED ALWAYS AS IDENTITY：column_default 为 NULL（用 is_identity='YES' 识别），
    //   LIKE 克隆已在本 schema 内创建专属序列
    // 两者在 OVERRIDING SYSTEM VALUE 拷入显式 id 后，序列都不会自动前进，需统一重置到 max(id)+1。
    const res = await this.pool.query(
      `SELECT column_name, column_default, is_identity
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
         AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`,
      [target, table]
    );
    for (const row of res.rows as Array<{ column_name: string; column_default: string | null; is_identity: string }>) {
      if (row.is_identity === 'YES') {
        // IDENTITY：序列已随 LIKE 克隆创建于本 schema，只需重置到 max+1
        await this.resetIdentitySequence(target, table, row.column_name);
        continue;
      }
      if (!row.column_default) continue;
      const seqMatch = row.column_default.match(/nextval\('([^']+)'/);
      if (!seqMatch) continue;
      const refSeq = seqMatch[1];
      // 取序列基础名（可能是 "schema.seq" 或未限定的 "seq"）
      const seqBase = refSeq.replace(/"/g, '').split('.').pop() || '';

      // 若目标 schema 内已存在同名序列，说明默认值已指向本 schema，无需处理
      const exists = await this.pool.query(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'S' AND c.relname = $1 AND n.nspname = $2`,
        [seqBase, target]
      );
      if (exists.rows.length > 0) continue;

      const newSeq = seqBase || `${table}_${row.column_name}_seq`;
      try {
        await this.pool.query(`CREATE SEQUENCE IF NOT EXISTS "${target}"."${newSeq}"`);
        await this.pool.query(
          `ALTER SEQUENCE "${target}"."${newSeq}" OWNED BY "${target}"."${table}"."${row.column_name}"`
        );
        // 序列起点设为当前 max(id)+1，避免与已克隆数据冲突
        const maxRes = await this.pool.query(
          `SELECT COALESCE(MAX("${row.column_name}"), 0) + 1 AS n FROM "${target}"."${table}"`
        );
        const nextVal = Number(maxRes.rows[0]?.n || 1);
        await this.pool.query(
          `ALTER SEQUENCE "${target}"."${newSeq}" START WITH ${nextVal} RESTART WITH ${nextVal}`
        );
        await this.pool.query(
          `ALTER TABLE "${target}"."${table}" ALTER COLUMN "${row.column_name}" SET DEFAULT nextval('"${target}"."${newSeq}"'::regclass)`
        );
        await this.pool.query(
          `GRANT ALL ON SEQUENCE "${target}"."${newSeq}" TO "${config.pg.appUser}"`
        ).catch(() => {});
      } catch (err) {
        console.warn(`fixSerialDefaults(${target}.${table}.${row.column_name}) failed: ${err}`);
      }
    }
  }

  /**
   * 重置 IDENTITY 列的序列到 max+1。
   * OVERRIDING SYSTEM VALUE 拷入显式 id 后，IDENTITY 序列仍停留在 1，
   * 不重置会导致后续自动插入主键冲突。is_called=false 让下一次 nextval 返回 max+1。
   */
  private async resetIdentitySequence(target: string, table: string, column: string): Promise<void> {
    try {
      // 注意：pg_get_serial_sequence 的列名参数必须是「明文」（带双引号会按字面列名查找而报错），
      // 表名参数则可带引号。列名由 information_schema 返回，常规小写列名直接传入即可。
      const seqRes = await this.pool.query(
        `SELECT pg_get_serial_sequence($1, $2) AS seq`,
        [`"${target}"."${table}"`, column]
      );
      const seq = seqRes.rows[0]?.seq as string | undefined;
      if (!seq) return;
      await this.pool.query(
        `SELECT setval($1, GREATEST((SELECT COALESCE(MAX("${column}"), 0) + 1 FROM "${target}"."${table}"), 1), false)`,
        [seq]
      );
    } catch (err) {
      console.warn(`resetIdentitySequence(${target}.${table}.${column}) failed: ${err}`);
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

  /**
   * 把用户输入的 MySQL 风格 SQL 适配为 PostgreSQL 方言（修复 1.7）：
   * - 反引号 → 双引号
   * - 列定义 AUTO_INCREMENT → GENERATED ALWAYS AS IDENTITY
   * - 移除 MySQL 表选项（ENGINE / DEFAULT CHARSET / CHARSET / COLLATE / AUTO_INCREMENT=n）
   * - SET NAMES utf8mb4 → SET client_encoding TO 'UTF8'
   */
  private convertDialect(sql: string): string {
    let s = sql.replace(/`/g, '"');
    // 先移除表选项形式的 AUTO_INCREMENT=N，再转换列定义形式
    s = s.replace(/\bAUTO_INCREMENT\s*=\s*\d+/gi, '');
    s = s.replace(/\bAUTO_INCREMENT\b/gi, 'GENERATED ALWAYS AS IDENTITY');
    // MySQL 表选项（表尾），PG 无对应语法
    s = s.replace(/\s+(?:ENGINE|DEFAULT\s+CHARSET|CHARSET|COLLATE)\s*=\s*[A-Za-z0-9_]+/gi, '');
    // SET NAMES → client_encoding
    s = s.replace(/^SET\s+NAMES\s+[A-Za-z0-9_]+/i, "SET client_encoding TO 'UTF8'");
    return s;
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
   * 若语句是单条 INSERT（且未含 RETURNING），追加 RETURNING * 以回填自增主键。
   * 任何不确定的情况（非 INSERT / 已含 RETURNING）都不改动原语句。
   */
  private tryAddReturning(sql: string): { sql: string; capture: boolean } {
    const body = sql
      .replace(/^SET\s+search_path\s+TO\s+"[^"]*";/i, '')
      .trim()
      .replace(/;\s*$/, '');
    if (/^INSERT\s+INTO\b/i.test(body) && !/\bRETURNING\b/i.test(body)) {
      return { sql: `${sql.replace(/;\s*$/, '')} RETURNING *;`, capture: true };
    }
    return { sql, capture: false };
  }

  /** 从 RETURNING 结果中提取自增主键（优先 id，否则取第一列数值） */
  private extractInsertId(res: import('pg').QueryResult | null): number {
    if (res && Array.isArray(res.rows) && res.rows.length > 0) {
      const row = res.rows[0] as Record<string, unknown>;
      const raw = (row?.id !== undefined ? row.id : Object.values(row)[0]) as unknown;
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  /**
   * 在连接上执行 SQL：循环执行所有以 SET 开头的语句，最后执行主体。
   * 避免多语句拼在一条 query 里导致 rows 结果歧义。
   *
   * 安全加固（修复 6.4）：无论调用方是否已设置超时，都先保证 statement_timeout
   * 生效，防止 pg_sleep 等慢语句耗尽连接池（DoS）。
   */
  private async runUserSql(
    client: import('pg').PoolClient,
    sql: string
  ): Promise<import('pg').QueryResult | null> {
    let current = sql.trim();

    // 保证 statement_timeout（若语句未显式设置）
    if (!/^SET\s+statement_timeout\s*=/i.test(current)) {
      await client.query(`SET statement_timeout = ${config.security.queryTimeoutSeconds * 1000}`);
    }

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
