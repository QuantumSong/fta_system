import { create } from 'zustand'

interface UserInfo {
  id: number
  username: string
  email: string
  role: string
}

interface AuthState {
  token: string | null
  user: UserInfo | null
  isAuthenticated: boolean
  setAuth: (token: string, user: UserInfo) => void
  logout: () => void
  loadFromStorage: () => void
}

// 同步从 localStorage 读取初始状态，避免首次渲染时 isAuthenticated=false 导致闪跳登录页
function getInitialState(): { token: string | null; user: UserInfo | null; isAuthenticated: boolean } {
  try {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      const user = JSON.parse(userStr) as UserInfo
      return { token, user, isAuthenticated: true }
    }
  } catch {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }
  return { token: null, user: null, isAuthenticated: false }
}

const initialState = getInitialState()

const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setAuth: (token, user) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ token, user, isAuthenticated: true })
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
  },
}))

export default useAuthStore
