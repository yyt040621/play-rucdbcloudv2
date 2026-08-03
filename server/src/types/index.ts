// === API Response ===

export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message: string;
}

// === Session ===

export interface SessionInfo {
  sessionId: string;
  dbName: string;
  isNew: boolean;
  expiresAt: string;
}

// === Query ===

export type QueryResultType = 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'error';

export interface QueryResult {
  type: QueryResultType;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  affectedRows?: number;
  insertId?: number;
  message?: string;
  executionTimeMs: number;
}

export interface ExecuteQueryResponse {
  results: QueryResult[];
  totalTimeMs: number;
}

// === Schema ===

export interface TableInfo {
  name: string;
  rowCount: number;
  engine: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  default: string | null;
  extra: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

// === Error Codes ===

export enum ErrorCode {
  SUCCESS = 0,
  INVALID_SESSION = 1001,
  SQL_SYNTAX_ERROR = 1002,
  SQL_NOT_ALLOWED = 1003,
  ROW_LIMIT_EXCEEDED = 1004,
  DB_SIZE_EXCEEDED = 1005,
  RATE_LIMITED = 1006,
  INTERNAL_ERROR = 5000,
}
