import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import { projectApi } from '@/services/api'

interface FtaState {
  // 当前故障树
  currentTreeId: number | null
  nodes: Node[]
  edges: Edge[]

  // 项目列表
  projects: any[]
  currentProjectId: number | null

  // 加载状态
  loading: boolean

  // Actions
  setCurrentTree: (id: number | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  loadProjects: () => Promise<void>
  setCurrentProject: (id: number | null) => void
}

export const useFtaStore = create<FtaState>((set) => ({
  currentTreeId: null,
  nodes: [],
  edges: [],
  projects: [],
  currentProjectId: null,
  loading: false,

  setCurrentTree: (id) => set({ currentTreeId: id }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setCurrentProject: (id) => set({ currentProjectId: id }),

  loadProjects: async () => {
    set({ loading: true })
    try {
      const data: any = await projectApi.getProjects()
      set({ projects: data.projects || [] })
    } catch {
      console.error('Failed to load projects')
    } finally {
      set({ loading: false })
    }
  },
}))
