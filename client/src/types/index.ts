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

export interface ResetSessionInfo {
  sessionId: string;
  dbName: string;
  recreated: boolean;
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

// === App State ===

export type Theme = 'light' | 'dark';

export interface AppState {
  sessionId: string | null;
  dbName: string | null;
  tables: TableInfo[];
  selectedTable: string | null;
  tableSchema: TableSchema | null;
  queryResults: QueryResult[];
  isLoading: boolean;
  theme: Theme;
}
