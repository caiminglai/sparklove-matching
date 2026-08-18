import { NavLink } from 'react-router';
import { Home, Plus, User, Compass, Shield } from 'lucide-react';

const tabs = [
  { path: '/', label: '首页', icon: Home },
  { path: '/circles', label: '圈子', icon: Compass },
  { path: '/post', label: '发布', icon: Plus, isCenter: true },
  { path: '/anti-fraud', label: '安全', icon: Shield },
  { path: '/profile', label: '我的', icon: User },
];

export default function TabBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 glass-nav" style={{
      borderTop: '1px solid rgba(var(--color-border-warm-rgb), 0.4)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div className="max-w-3xl mx-auto flex items-center justify-around py-2 px-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isCenter = tab.isCenter;

          if (isCenter) {
            return (
              <NavLink key={tab.path} to={tab.path}
                className="flex flex-col items-center -mt-5"
                style={{ textDecoration: 'none' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center btn-primary"
                  style={{ borderRadius: '16px' }}>
                  <Icon size={22} color="white" strokeWidth={2.5} />
                </div>
                <span className="text-xs font-medium mt-1" style={{ color: 'var(--color-primary)' }}>{tab.label}</span>
              </NavLink>
            );
          }

          return (
            <NavLink key={tab.path} to={tab.path}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
              style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div className="flex flex-col items-center gap-0.5 transition-all duration-200 relative">
                  <div className="p-1.5 rounded-xl transition-all duration-200"
                    style={{ background: isActive ? 'rgba(var(--color-primary-rgb), 0.08)' : 'transparent' }}>
                    <Icon size={20} style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} strokeWidth={isActive ? 2.2 : 1.8} />
                  </div>
                  <span className="text-xs font-medium transition-colors duration-200" style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}>
                    {tab.label}
                  </span>
                </div>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
