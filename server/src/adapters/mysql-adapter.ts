import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { IDatabaseAdapter } from './database-adapter.interface';
import { config } from '../config';
import { ColumnInfo, IndexInfo, TableInfo } from '../types';

export class MySQLAdapter implements IDatabaseAdapter {
  private pool: Pool;

  constructor() {
    this.pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      charset: 'utf8mb4',
      multipleStatements: true,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }

  async connect(): Promise<void> {
    const conn = await this.pool.getConnection();
    await conn.ping();
    conn.release();
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
  }

  async executeOnDatabase(database: string, sql: string): Promise<unknown[]> {
    const conn = await this.pool.getConnection();
    try {
      await conn.query(`USE \`${database}\``);
      const [rows] = await conn.query<RowDataPacket[] | RowDataPacket[][]>(sql);
      // 多语句时 mysql2 返回数组，取最后一个结果集（实际的查询结果）
      if (Array.isArray(rows)) {
        // 每个元素可能是 RowDataPacket[] 或 ResultSetHeader
        const resultSets = rows.filter((r) => Array.isArray(r));
        if (resultSets.length > 0) {
          return resultSets[resultSets.length - 1] as RowDataPacket[];
        }
      }
      return rows as RowDataPacket[];
    } finally {
      conn.release();
    }
  }

  /**
   * 获取到指定数据库的连接
   */
  private async getConnection(database?: string): Promise<PoolConnection> {
    const conn = await this.pool.getConnection();
    if (database) {
      await conn.query(`USE \`${database}\``);
    }
    return conn;
  }

  async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
    const conn = await this.pool.getConnection();
    try {
      const [rows] = await conn.query<RowDataPacket[]>(sql, params);
      return rows;
    } finally {
      conn.release();
    }
  }

  async executeUpdate(
    sql: string,
    params?: unknown[]
  ): Promise<{ affectedRows: number; insertId: number }> {
    const conn = await this.pool.getConnection();
    try {
      const [result] = await conn.query<ResultSetHeader>(sql, params);

      // 多条语句时 mysql2 可能返回数组，取最后一个 DML 结果
      if (Array.isArray(result)) {
        const last = result[result.length - 1] as ResultSetHeader;
        return {
          affectedRows: last.affectedRows ?? 0,
          insertId: last.insertId ?? 0,
        };
      }

      return {
        affectedRows: result.affectedRows,
        insertId: result.insertId,
      };
    } finally {
      conn.release();
    }
  }

  async createDatabase(name: string): Promise<void> {
    await this.execute(`CREATE DATABASE IF NOT EXISTS \`${name}\`
      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.execute(`DROP DATABASE IF EXISTS \`${name}\``);
  }

  async getTables(database: string): Promise<TableInfo[]> {
    const rows = await this.execute(
      `SELECT
        TABLE_NAME AS name,
        TABLE_ROWS AS rowCount,
        ENGINE AS engine
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
      [database]
    );
    return (rows as RowDataPacket[]).map((row) => ({
      name: row.name,
      rowCount: row.rowCount ?? 0,
      engine: row.engine ?? 'InnoDB',
    }));
  }

  async getTableColumns(database: string, table: string): Promise<ColumnInfo[]> {
    const rows = await this.execute(
      `SELECT
        COLUMN_NAME AS name,
        COLUMN_TYPE AS type,
        IS_NULLABLE AS nullable,
        COLUMN_KEY AS \`key\`,
        COLUMN_DEFAULT AS \`default\`,
        EXTRA AS extra
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
      [database, table]
    );
    return (rows as RowDataPacket[]).map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      key: row.key,
      default: row.default,
      extra: row.extra,
    }));
  }

  async getTableIndexes(database: string, table: string): Promise<IndexInfo[]> {
    const rows = await this.execute(
      `SELECT
        INDEX_NAME AS name,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
        NOT NON_UNIQUE AS \`unique\`
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME`,
      [database, table]
    );
    return (rows as RowDataPacket[]).map((row) => ({
      name: row.name,
      columns: (row.columns as string).split(','),
      unique: !!row.unique,
    }));
  }

  async cloneDatabase(source: string, target: string): Promise<void> {
    const conn = await this.pool.getConnection();
    try {
      // 获取源库中的所有表
      const [tables] = await conn.query<RowDataPacket[]>(
        `SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [source]
      );

      // 确保目标库存在，并作为默认库，SHOW CREATE TABLE 生成的 DDL 才能直接执行
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${target}\`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await conn.query(`USE \`${target}\``);

      for (const table of tables) {
        const tableName = table.TABLE_NAME;
        // 用 SHOW CREATE TABLE 获取建表语句（含外键定义）
        const [createRows] = await conn.query<RowDataPacket[]>(
          `SHOW CREATE TABLE \`${source}\`.\`${tableName}\``
        );
        let createSql = (createRows[0] as Record<string, unknown>)['Create Table'] as string;

        // 重写库名引用：把源库名替换为目标库名，
        // 使外键等约束指向克隆后的表（本沙箱自身），而非模板库
        createSql = createSql
          .split(`\`${source}\`.`).join(`\`${target}\`.`)
          .replace(new RegExp(`\`${source}\``, 'g'), `\`${target}\``);

        // 执行建表（已在 USE target 上下文中）
        await conn.query(createSql);

        // 导入数据
        await conn.query(
          `INSERT INTO \`${target}\`.\`${tableName}\`
           SELECT * FROM \`${source}\`.\`${tableName}\``
        );
      }
    } finally {
      conn.release();
    }
  }

  async getDatabaseSize(database: string): Promise<number> {
    const rows = await this.execute(
      `SELECT
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?`,
      [database]
    );
    const result = rows as RowDataPacket[];
    return result[0]?.size_mb ?? 0;
  }

  async getTableCount(database: string): Promise<number> {
    const rows = await this.execute(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [database]
    );
    const result = rows as RowDataPacket[];
    return result[0]?.cnt ?? 0;
  }
}
