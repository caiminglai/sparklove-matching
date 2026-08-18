import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Heart, Users, Sparkles, Music, Utensils, Dumbbell, MapPin, ChevronRight, Search } from 'lucide-react';
import { API_BASE_URL, normalizeAvatarUrl } from '../api/config';
import type { Row } from '../data/types';
import { getAuthToken, getAuthHeaders } from '../utils/auth';
import { hexToRgba } from '../utils/color';

const CIRCLE_CONFIGS = [
  { key: 'hobbies', label: '兴趣圈', icon: Sparkles, color: '#E87A5D', desc: '因兴趣相聚' },
  { key: 'food', label: '美食圈', icon: Utensils, color: '#D4A054', desc: '以美食会友' },
  { key: 'sport', label: '运动圈', icon: Dumbbell, color: '#6BAF7D', desc: '一起动起来' },
  { key: 'music', label: '音乐圈', icon: Music, color: '#7B8CDE', desc: '用音乐连接' },
  { key: 'city', label: '同城圈', icon: MapPin, color: '#C47BAF', desc: '身边的朋友' },
  { key: 'personality', label: '性格圈', icon: Heart, color: '#E87A5D', desc: '同频相吸' },
];

const CIRCLE_TAG_MAP: Record<string, string[]> = {
  hobbies: ['动漫', '游戏', '摄影', '旅行', '看书', '电影', '音乐', '绘画', '手工', '露营', '徒步', '桌游', '剧本杀', 'K歌', '跳舞', '乐器', '科技', '编程'],
  food: ['火锅', '烧烤', '川菜', '粤菜', '日料', '西餐', '韩餐', '甜品', '海鲜', '咖啡', '奶茶'],
  sport: ['跑步', '游泳', '篮球', '足球', '羽毛球', '网球', '瑜伽', '健身', '骑行', '登山', '滑雪'],
  music: ['流行', '摇滚', '民谣', '古典', '爵士', '电子', 'R&B', '嘻哈', '古风', '轻音乐', '说唱'],
  city: ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '重庆', '苏州', '长沙'],
  personality: ['温柔', '开朗', '内向', '幽默', '沉稳', '活泼', '直爽', '细腻', '独立', '随和'],
};

interface CircleGroup {
  tag: string;
  count: number;
  users: Row[];
}

export default function CirclesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCircle, setActiveCircle] = useState(CIRCLE_CONFIGS[0].key);
  const [searchTag, setSearchTag] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = getAuthHeaders();

    fetch(`${API_BASE_URL}/users?limit=200`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setRows(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const circleGroups = useMemo(() => {
    const tags = CIRCLE_TAG_MAP[activeCircle] || [];
    const groups: CircleGroup[] = [];

    for (const tag of tags) {
      const matched = rows.filter(r => {
        const val = String(r.data?.[activeCircle as keyof typeof r.data] || '');
        return val.includes(tag);
      });
      if (matched.length > 0) {
        groups.push({ tag, count: matched.length, users: matched });
      }
    }

    groups.sort((a, b) => b.count - a.count);
    return groups;
  }, [rows, activeCircle]);

  const filteredGroups = useMemo(() => {
    if (!searchTag) return circleGroups;
    return circleGroups.filter(g => g.tag.includes(searchTag));
  }, [circleGroups, searchTag]);

  const activeConfig = CIRCLE_CONFIGS.find(c => c.key === activeCircle) || CIRCLE_CONFIGS[0];
  const ActiveIcon = activeConfig.icon;

  const totalPeople = rows.length;
  const totalCircles = circleGroups.length;

  return (
    <div className="min-h-screen pb-20" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${activeConfig.color}, ${hexToRgba(activeConfig.color, 0.8)})`, boxShadow: `0 2px 8px ${hexToRgba(activeConfig.color, 0.25)}` }}>
              <ActiveIcon size={18} color="white" />
            </div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)', letterSpacing: '0.02em' }}>
              圈子
            </h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            每个人既是自己的圈子，又是别人的圈子
          </p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{totalPeople} 位圈友</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{totalCircles} 个圈子</span>
          </div>
        </div>

        {/* Circle Tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {CIRCLE_CONFIGS.map(config => {
            const Icon = config.icon;
            const isActive = activeCircle === config.key;
            return (
              <button
                key={config.key}
                onClick={() => { setActiveCircle(config.key); setSearchTag(''); }}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: isActive ? `linear-gradient(135deg, ${config.color}, ${hexToRgba(config.color, 0.8)})` : 'var(--color-bg-card)',
                  color: isActive ? 'white' : 'var(--color-text-muted)',
                  border: isActive ? 'none' : '1px solid var(--color-border-light)',
                  boxShadow: isActive ? `0 2px 8px ${hexToRgba(config.color, 0.2)}` : 'none',
                }}
              >
                <Icon size={14} />
                {config.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)', color: 'var(--color-text-primary)', outline: 'none' }}
            placeholder={`搜索${activeConfig.label}标签...`}
            value={searchTag}
            onChange={e => setSearchTag(e.target.value)}
          />
        </div>

        {/* Circle Description */}
        <div className="rounded-xl p-3 mb-4 flex items-center gap-2"
          style={{ background: hexToRgba(activeConfig.color, 0.03), border: `1px solid ${hexToRgba(activeConfig.color, 0.12)}` }}>
          <ActiveIcon size={14} style={{ color: activeConfig.color }} />
          <span className="text-xs" style={{ color: activeConfig.color }}>{activeConfig.desc}</span>
          <span className="text-xs ml-auto" style={{ color: 'var(--color-text-secondary)' }}>点击圈子查看圈友</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>加载圈子中...</p>
          </div>
        )}

        {/* Circle Groups */}
        {!loading && (
          <div className="space-y-2">
            {filteredGroups.map(group => (
              <div key={group.tag}
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border-light)',
                }}
                onClick={() => navigate(`/circle/${activeCircle}/${encodeURIComponent(group.tag)}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = hexToRgba(activeConfig.color, 0.25); e.currentTarget.style.boxShadow = `0 2px 12px ${hexToRgba(activeConfig.color, 0.06)}`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border-light)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold"
                      style={{ background: hexToRgba(activeConfig.color, 0.07), color: activeConfig.color, border: `1px solid ${hexToRgba(activeConfig.color, 0.15)}` }}>
                      {group.tag[0]}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{group.tag}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: hexToRgba(activeConfig.color, 0.03), color: activeConfig.color, border: `1px solid ${hexToRgba(activeConfig.color, 0.1)}` }}>
                      {group.count}人
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--color-text-muted)' }} />
                  </div>
                </div>

                {/* Preview avatars */}
                <div className="flex items-center gap-1">
                  {group.users.slice(0, 8).map(user => (
                    <div key={user.id} className="w-6 h-6 rounded-full flex items-center justify-center text-xs overflow-hidden relative"
                      style={{ background: hexToRgba(activeConfig.color, 0.03), color: activeConfig.color, border: `1px solid ${hexToRgba(activeConfig.color, 0.1)}`, fontSize: '10px' }}>
                      {/* 总是显示名字首字母作为背景 */}
                      <span className="absolute inset-0 flex items-center justify-center">{String(user.data?.name || '?')[0]}</span>
                      
                      {/* 如果有头像，显示在最上面 */}
                      {user.data?.avatar && (
                        <img 
                          src={normalizeAvatarUrl(user.data.avatar) || undefined} 
                          alt={user.data?.name || '用户头像'} 
                          className="w-full h-full object-cover absolute inset-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.onerror = null;
                            target.style.display = 'none';
                          }} 
                        />
                      )}
                    </div>
                  ))}
                  {group.count > 8 && (
                    <span className="text-xs ml-1" style={{ color: 'var(--color-text-secondary)' }}>+{group.count - 8}</span>
                  )}
                </div>
              </div>
            ))}

            {filteredGroups.length === 0 && (
              <div className="text-center py-12">
                <Users size={28} style={{ color: 'var(--color-border-light)', margin: '0 auto' }} />
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {searchTag ? '没有找到匹配的圈子' : '暂无圈子数据'}
                </p>
                <Link to="/post" className="inline-block mt-3 text-sm px-4 py-2 rounded-lg text-white"
                  style={{ background: `linear-gradient(135deg, ${activeConfig.color}, ${hexToRgba(activeConfig.color, 0.8)})` }}>
                  发布资料加入圈子
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
