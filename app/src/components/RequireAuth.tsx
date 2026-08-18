/**
 * 路由级鉴权守卫
 * 替代各页面内重复的 `if (!userId) navigate('/login')` 逻辑
 *
 * 用法：
 *   <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
 *   <Route path="/post" element={<RequireAuth message="发布资料需要先登录" requireAuthToken><PostPage /></RequireAuth>} />
 */
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from './Toast';

interface RequireAuthProps {
  children: ReactNode;
  /** 未登录时的提示消息（不传则静默重定向） */
  message?: string;
  /** 是否同时要求 auth_token 存在（默认只检查 user_id） */
  requireAuthToken?: boolean;
}

/**
 * 鉴权守卫组件
 * - 未登录时重定向到 /login
 * - 可选 message 在重定向前 toast 提示
 * - 可选 requireAuthToken 同时校验 token 存在
 */
export default function RequireAuth({ children, message, requireAuthToken = false }: RequireAuthProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const userId = localStorage.getItem('user_id');
  const authToken = localStorage.getItem('auth_token');
  const authed = requireAuthToken ? (!!userId && !!authToken) : !!userId;

  useEffect(() => {
    if (!authed) {
      if (message) toast(message, 'error');
      navigate('/login');
    }
  }, [authed, message, toast, navigate]);

  // 未登录时不渲染子组件，避免页面闪一下再跳转
  if (!authed) return null;
  return <>{children}</>;
}
