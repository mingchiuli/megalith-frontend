export interface Visitor {
  dayVisit: number
  weekVisit: number
  monthVisit: number
  yearVisit: number
}

export interface BlogsDesc {
  id: number
  title: string
  description: string
  created: string
  link: string
  content?: string
  score?: number
  highlight?: SearchStruct,
  value?: SearchStruct
}

export interface BlogsSys {
  id: number
  title: string
  description: string
  created: string
  content: string
  readCount: number
  recentReadCount: number
  status: number
}

export interface BlogsEdit {
  id: number
  title: string
  description: string
  content: string
  link: string
  status: number
}


export interface BlogExhibit {
  title: string
  description: string
  created: string
  content: string
  avatar: string
  readCount: number
  nickname: string
}

interface SearchStruct {
  title: string[]
  description: string[]
  content: string[]
}

export interface LoginStruct {
  username: string
  password: string
}

export interface Token {
  accessToken: string
  refreshToken: string
}

export interface UserInfo {
  nickname: string
  avatar: string
}

export interface Tab {
  title: string
  name: string
}

export interface Menu {
  menuId: number
  component?: string
  url?: string
  icon: string
  orderNum: number
  name: string
  parentId: number
  status: number
  title: string
  type: number
  children: Menu[]
}

export interface JWTStruct {
  role: string
  sub: string
  iat: number
  exp: number
}

export interface CatalogueLabel {
  id: string
  label: string
  dist: number
  children: CatalogueLabel[]
}

export interface RefreshStruct {
  accessToken: string
}

export interface Hot {
  id: number
  title: string
  readCount: number
}
export interface PageAdapter<T> {
  content: T[]
  pageSize: number
  totalElements: number
  pageNumber: number
}

export interface Data<T> {
  msg: string
  data: T
}