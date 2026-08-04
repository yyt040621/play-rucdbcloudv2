import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Toast } from './components/common/Toast';
import { LoadingOverlay } from './components/common/Loading';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { useSession } from './hooks/useSession';
import { useSchema } from './hooks/useSchema';

// 路由级代码分割（减小首屏 bundle，按需加载页面）
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const TestPage = lazy(() => import('./pages/TestPage').then((m) => ({ default: m.TestPage })));
const DemoPage = lazy(() => import('./pages/DemoPage').then((m) => ({ default: m.DemoPage })));
const CreatePage = lazy(() => import('./pages/CreatePage').then((m) => ({ default: m.CreatePage })));
const SelectPage = lazy(() => import('./pages/SelectPage').then((m) => ({ default: m.SelectPage })));
const UpdatePage = lazy(() => import('./pages/UpdatePage').then((m) => ({ default: m.UpdatePage })));
const DeletePage = lazy(() => import('./pages/DeletePage').then((m) => ({ default: m.DeletePage })));

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastCounter = 0;

export default function App() {
  const { isLoading: sessionLoading, error: sessionError, resetSession } = useSession();
  const { tables, selectedTable, fetchTables, selectTable } = useSchema();

  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const initialLoadDone = useRef(false);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // 初始化加载表列表（失败自动重试，最多 3 次）
  useEffect(() => {
    if (sessionLoading || initialLoadDone.current) return;
    initialLoadDone.current = true;

    let retries = 0;
    const loadTables = async () => {
      const result = await fetchTables();
      if (result.length === 0) {
        if (retries < 3) {
          retries++;
          setTimeout(loadTables, 1000);
        } else {
          // 重试后仍无表：沙箱可能已损坏/被清理，提示用户重置恢复初始数据
          addToast('未检测到数据表，点击右上角「重置沙箱」可恢复初始示例数据', 'error');
        }
      }
    };
    loadTables();
  }, [sessionLoading, fetchTables, addToast]);

  // Session 错误提示
  useEffect(() => {
    if (sessionError) {
      addToast(sessionError, 'error');
    }
  }, [sessionError, addToast]);

  // 刷新表（传递给子页面）
  const handleRefreshTables = useCallback(async () => {
    await fetchTables();
    if (selectedTable) selectTable(selectedTable);
  }, [fetchTables, selectedTable, selectTable]);

  // 重置沙箱
  const handleResetClick = useCallback(() => setShowResetConfirm(true), []);

  const handleResetConfirm = useCallback(async () => {
    setShowResetConfirm(false);
    if (isResetting) return;
    setIsResetting(true);
    try {
      const info = await resetSession();
      if (info) {
        await fetchTables();
        addToast('沙箱已重置，数据已恢复为初始状态', 'success');
      }
    } catch {
      addToast('重置失败，请重试', 'error');
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, resetSession, fetchTables, addToast]);

  const handleResetCancel = useCallback(() => setShowResetConfirm(false), []);

  // === Session 加载中 ===
  if (sessionLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)]">
        <LoadingOverlay message="正在初始化沙箱环境..." />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      <Header
        onReset={handleResetClick}
        isResetting={isResetting}
      />

      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingOverlay message="加载中..." />}>
          <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/create" element={
            <CreatePage tables={tables} onRefreshTables={handleRefreshTables} />
          } />
          <Route path="/select" element={
            <SelectPage tables={tables} />
          } />
          <Route path="/update" element={
            <UpdatePage onRefreshTables={handleRefreshTables} />
          } />
          <Route path="/delete" element={
            <DeletePage onRefreshTables={handleRefreshTables} />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="重置沙箱"
        message="重置将清空所有数据和自定义表，恢复为初始的 employees 和 orders 示例数据。此操作不可撤销。"
        confirmLabel="确认重置"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleResetConfirm}
        onCancel={handleResetCancel}
      />

      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
