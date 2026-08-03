import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--error)]/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--error)]" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
              页面出错了
            </h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              {this.state.error?.message || '发生了未知错误'}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)]
              rounded-md hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
