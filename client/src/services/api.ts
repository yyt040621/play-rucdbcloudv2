import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  ApiResponse,
  SessionInfo,
  ResetSessionInfo,
  ExecuteQueryResponse,
  TableInfo,
  TableSchema,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 35000, // 略大于后端 30s 查询超时
    });

    // 请求拦截器：自动附加 Session ID
    this.client.interceptors.request.use((config) => {
      const sessionId = localStorage.getItem('sqlplayground_session_id');
      if (sessionId) {
        config.headers['X-Session-Id'] = sessionId;
      }
      return config;
    });

    // 响应拦截器：统一错误处理
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          if (status === 429) {
            // 透出服务端配额提示（如「每个 IP 最多同时创建 3 个沙箱」），
            // 否则统一文案会掩盖限流原因，用户无法判断是频率超限还是沙箱配额触顶
            const serverMsg = data?.message;
            return Promise.reject(new Error(serverMsg || '请求过于频繁，请稍后再试'));
          }
          return Promise.reject(new Error(data?.message || `请求失败 (${status})`));
        }
        if (error.code === 'ECONNABORTED') {
          return Promise.reject(new Error('请求超时，请检查网络或简化查询'));
        }
        return Promise.reject(new Error('网络连接失败，请检查后端服务是否启动'));
      }
    );
  }

  // === Session ===

  async createSession(existingId?: string): Promise<SessionInfo> {
    const config = existingId
      ? { headers: { 'X-Session-Id': existingId } }
      : {};
    const res = await this.client.post<ApiResponse<SessionInfo>>('/session', {}, config);
    return res.data.data!;
  }

  async resetSession(): Promise<ResetSessionInfo> {
    const res = await this.client.delete<ApiResponse<ResetSessionInfo>>('/session');
    return res.data.data!;
  }

  // === Query ===

  async executeQuery(sql: string): Promise<ExecuteQueryResponse> {
    const res = await this.client.post<ApiResponse<ExecuteQueryResponse>>('/query', { sql });
    return res.data.data!;
  }

  // === Schema ===

  async getTables(): Promise<TableInfo[]> {
    const res = await this.client.get<ApiResponse<{ tables: TableInfo[] }>>('/schema/tables');
    return res.data.data!.tables;
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const res = await this.client.get<ApiResponse<TableSchema>>(
      `/schema/tables/${encodeURIComponent(tableName)}`
    );
    return res.data.data!;
  }
  async getQueryLogs(limit = 15, offset = 0): Promise<QueryLogEntry[]> {
    const res = await this.client.get<ApiResponse<{ logs: QueryLogEntry[] }>>(
      `/query/logs?limit=${limit}&offset=${offset}`
    );
    return res.data.data!.logs;
  }

  // === TPC-C ===

  async tpccStart(database: string, scale: string, durationSec: number): Promise<TPCStatus> {
    const res = await this.client.post<ApiResponse<{ status: TPCStatus }>>(
      '/tpcc/start', { database, scale, durationSec }
    );
    return res.data.data!.status;
  }

  async tpccStatus(database: string): Promise<TPCStatus> {
    const res = await this.client.get<ApiResponse<TPCStatus>>(`/tpcc/status?database=${database}`);
    return res.data.data!;
  }

  async tpccHistory(database: string): Promise<TPCHistoryEntry[]> {
    const res = await this.client.get<ApiResponse<{ history: TPCHistoryEntry[] }>>(`/tpcc/history?database=${database}`);
    return res.data.data!.history;
  }

  async tpccStop(database: string): Promise<boolean> {
    const res = await this.client.post<ApiResponse<{ stopped: boolean }>>('/tpcc/stop', { database });
    return res.data.data!.stopped;
  }
}

// === TPC-C 类型 ===

export interface TPCStatus {
  running: boolean;
  ready: boolean;
  database: string;
  scale: 'small' | 'medium' | 'large' | null;
  progress: number;
  elapsedSec: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  breakdown: TPCTransactionResult[];
  message: string | null;
}

export interface TPCTransactionResult {
  name: string;
  count: number;
  avgLatencyMs: number;
}

export interface TPCHistoryEntry {
  id: string;
  database: string;
  scale: 'small' | 'medium' | 'large';
  durationSec: number;
  warehouse: number;
  totalTransactions: number;
  tpm: number;
  avgLatencyMs: number;
  finishedAt: string;
}

export interface QueryLogEntry {
  sqlText: string;
  isAllowed: boolean;
  errorMessage: string | null;
  executedAt: string;
}

export const api = new ApiService();
