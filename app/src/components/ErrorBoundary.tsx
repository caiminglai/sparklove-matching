import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 修复：原实现完全空，线上出错无任何线索。加 console.error 便于排查
    console.error('[ErrorBoundary] 捕获到未处理错误:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-main)' }}>
          <div className="text-center max-w-sm mx-auto px-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" 
              style={{ background: 'rgba(var(--color-primary-rgb), 0.08)' }}>
              <AlertTriangle size={28} style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
              页面出现了一些问题
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              请尝试刷新页面或返回首页
            </p>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white btn-primary"
            >
              <RefreshCw size={14} />
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
