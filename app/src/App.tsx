import { lazy, Suspense, type ReactElement } from 'react'
import { Route, Routes, useLocation } from 'react-router'
import ErrorBoundary from './components/ErrorBoundary'
import RequireAuth from './components/RequireAuth'
import ShareButton from './components/ShareButton'
import TabBar from './components/TabBar'
import { ToastProvider } from './components/Toast'

// 懒加载页面组件
const Home = lazy(() => import('./pages/Home'))
const PostPage = lazy(() => import('./pages/PostPage'))
const DepositPage = lazy(() => import('./pages/DepositPage'))
const QrPage = lazy(() => import('./pages/QrPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const MyPostsPage = lazy(() => import('./pages/MyPostsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const CirclesPage = lazy(() => import('./pages/CirclesPage'))
const CircleDetailPage = lazy(() => import('./pages/CircleDetailPage'))
const AntiFraudPage = lazy(() => import('./pages/AntiFraudPage'))

const HIDE_TAB_PATHS = ['/login', '/qr']

// 加载占位符组件 - 骨架屏风格
function LoadingFallback() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* 顶部搜索栏骨架 */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 2px 12px rgba(var(--color-text-dark-rgb), 0.06)',
          }}
        >
          <div className="flex gap-2 mb-3">
            <div
              className="h-9 flex-1 rounded-xl animate-pulse"
              style={{ background: 'var(--color-border)' }}
            />
            <div
              className="h-9 w-20 rounded-xl animate-pulse"
              style={{ background: 'var(--color-border)' }}
            />
          </div>
          {/* 快速标签骨架 */}
          <div className="flex flex-wrap gap-2">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-6 w-14 rounded-full animate-pulse"
                style={{ background: 'var(--color-border)', animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>
        </div>
        {/* 用户卡片骨架 */}
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-4 mb-3 animate-pulse"
            style={{
              background: 'rgba(255,255,255,0.9)',
              boxShadow: '0 2px 12px rgba(var(--color-text-dark-rgb), 0.06)',
              animationDelay: `${i * 100}ms`,
            }}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl" style={{ background: 'var(--color-border)' }} />
              <div className="flex-1">
                <div
                  className="h-4 w-24 rounded mb-2"
                  style={{ background: 'var(--color-border)' }}
                />
                <div
                  className="h-3 w-32 rounded mb-2"
                  style={{ background: 'var(--color-border)' }}
                />
                <div className="flex gap-1">
                  <div className="h-5 w-12 rounded" style={{ background: 'var(--color-border)' }} />
                  <div className="h-5 w-16 rounded" style={{ background: 'var(--color-border)' }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App(): ReactElement {
  const location = useLocation()
  const showTab = !HIDE_TAB_PATHS.some((p) => location.pathname.startsWith(p))

  return (
    <ToastProvider>
      <div className="min-h-screen pb-20" style={{ background: 'var(--color-bg-main)' }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/post"
                element={
                  <RequireAuth message="发布资料需要先登录" requireAuthToken>
                    <PostPage />
                  </RequireAuth>
                }
              />
              <Route path="/deposit" element={<DepositPage />} />
              <Route path="/qr" element={<QrPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfilePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/my-posts"
                element={
                  <RequireAuth>
                    <MyPostsPage />
                  </RequireAuth>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/circles" element={<CirclesPage />} />
              <Route path="/circle/:circleKey/:tag" element={<CircleDetailPage />} />
              <Route path="/anti-fraud" element={<AntiFraudPage />} />
              {/* 404 兜底：访问未注册路径时显示提示，避免一直卡在 LoadingFallback */}
              <Route
                path="*"
                element={
                  <div
                    className="min-h-screen flex items-center justify-center"
                    style={{ background: 'var(--color-bg-main)' }}
                  >
                    <div className="text-center px-4">
                      <p className="text-5xl mb-3" style={{ color: 'var(--color-text-light)' }}>
                        404
                      </p>
                      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                        页面不存在
                      </p>
                      <a
                        href="/"
                        className="inline-block px-5 py-2 rounded-xl text-sm text-white"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        返回首页
                      </a>
                    </div>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        {showTab && <TabBar />}
        {/* 全局扫码分享按钮:右下角悬浮,避开底部 TabBar */}
        {showTab && <ShareButton />}
      </div>
    </ToastProvider>
  )
}
