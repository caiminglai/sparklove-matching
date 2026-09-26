/**
 * 数据类型定义（纯类型，无业务逻辑）
 */

export interface Row {
  id: string
  user_id?: string
  deposit: number
  createdAt: number
  data?: {
    avatar?: string
    name: string
    gender: string
    age: number | string
    height: number | string
    weight: string
    skinTone: string
    zodiac: string
    bloodType: string
    city: string
    marriage: string
    children: string
    education: string
    job: string
    income: string
    house: string
    car: string
    faceType: string
    eyeType: string
    mouthType: string
    bodyType: string
    hobbies: string
    food: string
    sport: string
    music: string
    smoke: string
    drink: string
    religion: string
    pet: string
    personality: string
    expectation: string
    contact: string
    interestTags: string
    purpose: string
  }
}

export interface Column {
  key: string
  label: string
  type: 'text' | 'select' | 'tags'
  options?: string[]
  category?: string
}

export interface MatchCondition {
  column: string
  value: string
}

/** 评价数据 */
export interface Rating {
  rater_name?: string
  rating: number
  comment?: string
}

/** 自定义字段（管理员/用户扩展字段） */
export interface CustomField {
  field_key: string
  field_value: string
}

/** 管理员自定义字段配置（从后端 /custom-fields 获取） */
export interface AdminCustomField {
  id?: number
  field_key: string
  field_label: string
  options?: string[]
}

/** 扁平行数据（后端/旧localStorage中的扁平格式，字段在顶层而非 data 下） */
export type FlatRow = Row & {
  [K in keyof NonNullable<Row['data']>]?: NonNullable<Row['data']>[K]
}
