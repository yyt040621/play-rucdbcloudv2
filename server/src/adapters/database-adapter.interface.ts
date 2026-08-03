import { ColumnInfo, IndexInfo, TableInfo } from '../types';

/**
 * 数据库适配器接口。
 * 当前由 MySQLAdapter 实现，未来可替换为自建数据库的适配器。
 */
export interface IDatabaseAdapter {
  /** 建立连接 */
  connect(): Promise<void>;

  /** 断开连接 */
  disconnect(): Promise<void>;

  /** 执行 SQL 语句，返回结果行 */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;

  /** 执行修改类 SQL（INSERT / UPDATE / DELETE / DDL），返回影响信息 */
  executeUpdate(sql: string, params?: unknown[]): Promise<{
    affectedRows: number;
    insertId: number;
  }>;

  /** 在指定数据库上执行查询类 SQL，返回结果行 */
  executeOnDatabase(database: string, sql: string): Promise<unknown[]>;

  /**
   * 以低权限用户（仅沙箱库权限）在指定数据库执行查询。
   * 用于执行用户提交的 SELECT，避免用 root 高权限连接。
   */
  executeUserOnDatabase(database: string, sql: string): Promise<unknown[]>;

  /**
   * 以低权限用户执行修改/DDL 类 SQL（用户提交的 INSERT/UPDATE/DELETE/CREATE）。
   * SQL 需已包含 USE 数据库前缀。
   */
  executeUserUpdate(sql: string): Promise<{ affectedRows: number; insertId: number }>;

  /** 创建数据库 */
  createDatabase(name: string): Promise<void>;

  /** 删除数据库 */
  dropDatabase(name: string): Promise<void>;

  /** 获取数据库中所有用户表 */
  getTables(database: string): Promise<TableInfo[]>;

  /** 获取指定表的字段信息 */
  getTableColumns(database: string, table: string): Promise<ColumnInfo[]>;

  /** 获取指定表的索引信息 */
  getTableIndexes(database: string, table: string): Promise<IndexInfo[]>;

  /** 克隆数据库结构和数据 */
  cloneDatabase(source: string, target: string): Promise<void>;

  /** 获取数据库大小（MB） */
  getDatabaseSize(database: string): Promise<number>;

  /** 获取数据库中的表数量 */
  getTableCount(database: string): Promise<number>;
}
