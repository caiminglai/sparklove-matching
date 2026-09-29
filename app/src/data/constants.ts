/**
 * 常量配置（纯数据，无业务逻辑，无 API 调用）
 */

import type { Column } from './types'

// 外貌与个人属性
export const SKIN_TONE_OPTIONS = ['白皙', '偏白', '自然', '小麦色', '偏黑', '健康色']
export const ZODIAC_OPTIONS = [
  '白羊座',
  '金牛座',
  '双子座',
  '巨蟹座',
  '狮子座',
  '处女座',
  '天秤座',
  '天蝎座',
  '射手座',
  '摩羯座',
  '水瓶座',
  '双鱼座',
]
export const BLOOD_TYPE_OPTIONS = ['A型', 'B型', 'AB型', 'O型']
export const GENDER_OPTIONS = ['男', '女']
export const MARRIAGE_OPTIONS = ['未婚', '离异', '丧偶']
export const CHILDREN_OPTIONS = ['无', '1个', '2个', '2个以上']
export const EDUCATION_OPTIONS = ['初中', '高中', '专科', '本科', '硕士', '博士']
export const INCOME_OPTIONS = ['5万以下', '5-10万', '10-20万', '20-30万', '30-50万', '50万以上']
export const HOUSE_OPTIONS = ['无房', '租房', '与父母同住', '有房(贷款)', '有房(全款)']
export const CAR_OPTIONS = ['无车', '有车(贷款)', '有车(全款)']
export const FACE_TYPE_OPTIONS = ['圆脸', '方脸', '瓜子脸', '鹅蛋脸', '长脸', '菱形脸', '三角脸']
export const EYE_TYPE_OPTIONS = [
  '杏眼',
  '桃花眼',
  '丹凤眼',
  '圆眼',
  '细长眼',
  '下垂眼',
  '单眼皮',
  '双眼皮',
]
export const MOUTH_TYPE_OPTIONS = ['樱桃嘴', '薄唇', '厚唇', '微笑唇', '嘟嘟唇']
export const BODY_TYPE_OPTIONS = ['纤细', '匀称', '丰满', '健硕', '偏瘦', '偏胖', '运动型']
export const SMOKE_OPTIONS = ['否', '偶尔', '经常']
export const DRINK_OPTIONS = ['否', '偶尔', '经常']
export const RELIGION_OPTIONS = ['无', '佛教', '基督教', '伊斯兰教', '道教', '其他']
export const PET_OPTIONS = ['无', '猫', '狗', '鱼', '鸟', '仓鼠', '其他']
export const PERSONALITY_OPTIONS = [
  '温柔',
  '开朗',
  '内向',
  '幽默',
  '沉稳',
  '活泼',
  '直爽',
  '细腻',
  '独立',
  '随和',
]

// 城市
export const CITY_OPTIONS = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '成都',
  '武汉',
  '南京',
  '西安',
  '重庆',
  '苏州',
  '郑州',
  '长沙',
  '青岛',
  '沈阳',
  '宁波',
  '东莞',
  '无锡',
  '合肥',
  '佛山',
  '大连',
  '福州',
  '厦门',
  '哈尔滨',
  '济南',
  '昆明',
  '温州',
  '石家庄',
  '长春',
  '常州',
]

// 兴趣爱好
export const HOBBY_OPTIONS = [
  '动漫',
  '游戏',
  '看书',
  '摄影',
  '旅行',
  '美食',
  '电影',
  '音乐',
  '绘画',
  '书法',
  '手工',
  'DIY',
  '收藏',
  '烹饪',
  '烘焙',
  '园艺',
  '宠物',
  '钓鱼',
  '露营',
  '徒步',
  '桌游',
  '剧本杀',
  'K歌',
  '跳舞',
  '乐器',
  '天文',
  '科技',
  '编程',
  '投资',
  '理财',
]

export const FOOD_OPTIONS = [
  '火锅',
  '烧烤',
  '川菜',
  '粤菜',
  '日料',
  '西餐',
  '韩餐',
  '甜品',
  '小吃',
  '海鲜',
  '面食',
  '湘菜',
  '东北菜',
  '江浙菜',
  '西北菜',
  '素食',
  '快餐',
  '下午茶',
  '咖啡',
  '奶茶',
]

export const SPORT_OPTIONS = [
  '跑步',
  '游泳',
  '篮球',
  '足球',
  '羽毛球',
  '乒乓球',
  '网球',
  '瑜伽',
  '健身',
  '骑行',
  '登山',
  '滑雪',
  '冲浪',
  '潜水',
  '高尔夫',
  '保龄球',
  '攀岩',
  '击剑',
  '拳击',
  '武术',
]

export const MUSIC_OPTIONS = [
  '流行',
  '摇滚',
  '民谣',
  '古典',
  '爵士',
  '电子',
  'R&B',
  '嘻哈',
  '古风',
  '轻音乐',
  '重金属',
  '朋克',
  '蓝调',
  '乡村',
  '拉丁',
  '世界音乐',
  '纯音乐',
  '影视原声',
  '动漫音乐',
  '说唱',
]

export const PURPOSE_OPTIONS = [
  '相亲交友',
  '拓展圈子',
  '兴趣交流',
  '运动伙伴',
  '学习搭子',
  '同城活动',
  '寻找知己',
  '人生伴侣',
  '恋爱结婚',
  '先交朋友',
  '找个伴',
  '同城约会',
  '周末玩伴',
  '一起旅行',
  '一起运动',
  '一起学习',
  '一起吃饭',
  '一起看电影',
  '一起打游戏',
  '一起健身',
]

// ===== 扩展字段选项（与 field_mappings 表同步） =====
export const RELATIONSHIP_STATUS_OPTIONS = [
  '单身',
  '暧昧中',
  '恋爱中',
  '已婚',
  '离异',
  '丧偶',
  '不想透露',
]
export const HAIRSTYLE_OPTIONS = [
  '长发',
  '短发',
  '中长发',
  '卷发',
  '直发',
  '马尾',
  '丸子头',
  '寸头',
  '光头',
  '其他',
]
export const GLASSES_OPTIONS = ['不戴', '近视镜', '隐形眼镜', '墨镜', '其他']
export const ATTACHMENT_STYLE_OPTIONS = ['安全型', '焦虑型', '回避型', '混乱型']
export const LOVE_LANGUAGE_OPTIONS = [
  '肯定的言辞',
  '精心的时刻',
  '接受礼物',
  '服务的行动',
  '身体的接触',
]
export const WANT_CHILDREN_OPTIONS = ['想要', '不想要', '还没想好', '随缘']
export const SLEEP_SCHEDULE_OPTIONS = ['早睡早起', '晚睡晚起', '不规律', '看情况']
export const SOCIAL_FREQUENCY_OPTIONS = ['宅家派', '偶尔出门', '社交达人', '看心情']
export const MOST_VALUES_OPTIONS = [
  '颜值',
  '才华',
  '经济条件',
  '性格',
  '三观',
  '家庭背景',
  '共同语言',
  '幽默感',
]
export const GAME_PREFERENCE_OPTIONS = ['手游', '端游', '主机游戏', '桌游', '派对游戏', '不玩游戏']
export const SOCIAL_APPS_OPTIONS = [
  '微信',
  'QQ',
  '微博',
  '小红书',
  '抖音',
  'B站',
  '知乎',
  '豆瓣',
  'Instagram',
  'Twitter',
  '其他',
]
export const SPENDING_HABITS_OPTIONS = ['节俭型', '理性消费', '享受型', '月光族', '投资型']
export const TRAVEL_FREQUENCY_OPTIONS = ['经常旅行', '偶尔旅行', '很少旅行', '宅家不出门']
export const MUSIC_PLATFORM_OPTIONS = [
  '网易云音乐',
  'QQ音乐',
  '酷狗音乐',
  'Apple Music',
  'Spotify',
  'YouTube Music',
  '其他',
]
export const SHOW_PREFERENCE_OPTIONS = [
  '国产剧',
  '美剧',
  '韩剧',
  '日剧',
  '泰剧',
  '动漫',
  '纪录片',
  '综艺',
  '电影',
  '不怎么看',
]
export const READING_PREFERENCE_OPTIONS = [
  '小说',
  '社科',
  '科技',
  '历史',
  '哲学',
  '漫画',
  '杂志',
  '不怎么看',
]

// 字段标签映射
export const FIELD_LABELS: Record<string, string> = {
  name: '昵称',
  gender: '性别',
  age: '年龄',
  height: '身高',
  weight: '体重',
  skinTone: '肤色',
  zodiac: '星座',
  bloodType: '血型',
  city: '城市',
  marriage: '婚姻',
  children: '子女',
  education: '学历',
  job: '职业',
  income: '收入',
  house: '住房',
  car: '购车',
  faceType: '脸型',
  eyeType: '眼型',
  mouthType: '嘴型',
  bodyType: '身材',
  hobbies: '兴趣爱好',
  food: '美食偏好',
  sport: '运动爱好',
  music: '音乐偏好',
  smoke: '吸烟',
  drink: '饮酒',
  religion: '宗教信仰',
  pet: '宠物',
  personality: '性格',
  expectation: '期望',
  contact: '联系方式',
  interestTags: '兴趣标签',
  purpose: '目的',
}

// 分类
export const CATEGORIES = [
  { key: '基本', label: '基本信息' },
  { key: '外貌', label: '外貌特征' },
  { key: '属性', label: '个人属性' },
  { key: '个性', label: '个性爱好' },
  { key: '兴趣', label: '兴趣爱好' },
  { key: '其他', label: '其他' },
]

// 默认列配置（user.service 和 field-mapping.service 共用）
export const DEFAULT_COLUMNS: Column[] = [
  { key: 'purpose', label: '目的', type: 'select', options: PURPOSE_OPTIONS, category: '基本' },
  { key: 'name', label: '昵称', type: 'text', category: '基本' },
  { key: 'gender', label: '性别', type: 'select', options: GENDER_OPTIONS, category: '基本' },
  { key: 'age', label: '年龄', type: 'text', category: '基本' },
  { key: 'height', label: '身高', type: 'text', category: '基本' },
  { key: 'weight', label: '体重', type: 'text', category: '基本' },
  { key: 'city', label: '城市', type: 'select', options: CITY_OPTIONS, category: '基本' },
  { key: 'skinTone', label: '肤色', type: 'select', options: SKIN_TONE_OPTIONS, category: '外貌' },
  { key: 'faceType', label: '脸型', type: 'select', options: FACE_TYPE_OPTIONS, category: '外貌' },
  { key: 'eyeType', label: '眼型', type: 'select', options: EYE_TYPE_OPTIONS, category: '外貌' },
  {
    key: 'mouthType',
    label: '嘴型',
    type: 'select',
    options: MOUTH_TYPE_OPTIONS,
    category: '外貌',
  },
  { key: 'bodyType', label: '身材', type: 'select', options: BODY_TYPE_OPTIONS, category: '外貌' },
  { key: 'zodiac', label: '星座', type: 'select', options: ZODIAC_OPTIONS, category: '属性' },
  {
    key: 'bloodType',
    label: '血型',
    type: 'select',
    options: BLOOD_TYPE_OPTIONS,
    category: '属性',
  },
  { key: 'marriage', label: '婚姻', type: 'select', options: MARRIAGE_OPTIONS, category: '属性' },
  { key: 'children', label: '子女', type: 'select', options: CHILDREN_OPTIONS, category: '属性' },
  { key: 'education', label: '学历', type: 'select', options: EDUCATION_OPTIONS, category: '属性' },
  { key: 'job', label: '职业', type: 'text', category: '属性' },
  { key: 'income', label: '收入', type: 'select', options: INCOME_OPTIONS, category: '属性' },
  { key: 'house', label: '住房', type: 'select', options: HOUSE_OPTIONS, category: '属性' },
  { key: 'car', label: '购车', type: 'select', options: CAR_OPTIONS, category: '属性' },
  {
    key: 'personality',
    label: '性格',
    type: 'select',
    options: PERSONALITY_OPTIONS,
    category: '个性',
  },
  { key: 'smoke', label: '吸烟', type: 'select', options: SMOKE_OPTIONS, category: '个性' },
  { key: 'drink', label: '饮酒', type: 'select', options: DRINK_OPTIONS, category: '个性' },
  {
    key: 'religion',
    label: '宗教信仰',
    type: 'select',
    options: RELIGION_OPTIONS,
    category: '个性',
  },
  { key: 'pet', label: '宠物', type: 'select', options: PET_OPTIONS, category: '个性' },
  { key: 'hobbies', label: '兴趣爱好', type: 'tags', options: HOBBY_OPTIONS, category: '兴趣' },
  { key: 'food', label: '美食偏好', type: 'tags', options: FOOD_OPTIONS, category: '兴趣' },
  { key: 'sport', label: '运动爱好', type: 'tags', options: SPORT_OPTIONS, category: '兴趣' },
  { key: 'music', label: '音乐偏好', type: 'tags', options: MUSIC_OPTIONS, category: '兴趣' },
  {
    key: 'interestTags',
    label: '兴趣标签',
    type: 'tags',
    options: [...HOBBY_OPTIONS, ...SPORT_OPTIONS],
    category: '兴趣',
  },
  { key: 'expectation', label: '期望', type: 'text', category: '其他' },
  { key: 'contact', label: '联系方式', type: 'text', category: '其他' },
]
