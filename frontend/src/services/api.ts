import axios from 'axios'

const API_BASE_URL = '/api/v1'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 401 自动跳转登录
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

// 认证API
export const authApi = {
  register: (data: { username: string; email: string; password: string }): Promise<any> =>
    apiClient.post('/auth/register', data),

  login: (data: { username: string; password: string }): Promise<any> =>
    apiClient.post('/auth/login', data),

  getMe: (): Promise<any> => apiClient.get('/auth/me'),

  getUsers: (): Promise<any> => apiClient.get('/auth/users'),

  initAdmin: (): Promise<any> => apiClient.post('/auth/init-admin'),
}

// 故障树API
export const ftaApi = {
  getFaultTrees: (projectId?: number): Promise<any> =>
    apiClient.get('/fta/', { params: projectId ? { project_id: projectId } : {} }),

  getFaultTree: (id: number | string): Promise<any> => apiClient.get(`/fta/${id}`),

  createFaultTree: (data: any): Promise<any> => apiClient.post('/fta/', data),

  saveFaultTree: (data: any): Promise<any> =>
    apiClient.put(`/fta/${data.id}`, {
      structure: data.structure,
      ...(data.project_id != null ? { project_id: data.project_id } : {}),
    }),

  deleteFaultTree: (id: number): Promise<any> => apiClient.delete(`/fta/${id}`),

  generateFaultTree: (data: any): Promise<any> => apiClient.post('/fta/generate', data),

  validateFaultTree: (structure: any): Promise<any> =>
    apiClient.post('/validation/', { structure }),

  getSuggestions: (id: number): Promise<any> => apiClient.get(`/fta/${id}/suggestions`),
}

// 协作API
export const collabApi = {
  enableCollab: (projectId: number): Promise<any> =>
    apiClient.post(`/projects/${projectId}/collab/enable`),

  disableCollab: (projectId: number): Promise<any> =>
    apiClient.post(`/projects/${projectId}/collab/disable`),

  joinCollab: (code: string): Promise<any> =>
    apiClient.post('/collab/join', { code }),

  getMembers: (projectId: number): Promise<any> =>
    apiClient.get(`/projects/${projectId}/collab/members`),

  removeMember: (projectId: number, userId: number): Promise<any> =>
    apiClient.delete(`/projects/${projectId}/collab/members/${userId}`),

  getVersions: (treeId: number): Promise<any> =>
    apiClient.get(`/fault-trees/${treeId}/versions`),

  getVersionDetail: (treeId: number, versionId: number): Promise<any> =>
    apiClient.get(`/fault-trees/${treeId}/versions/${versionId}`),

  restoreVersion: (treeId: number, versionId: number): Promise<any> =>
    apiClient.post(`/fault-trees/${treeId}/versions/${versionId}/restore`),
}

// 文档API
export const documentApi = {
  uploadDocument: (file: File, projectId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_id', projectId || '')
    return apiClient.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  getDocuments: (projectId?: string): Promise<any> =>
    apiClient.get('/documents/', { params: projectId ? { project_id: projectId } : {} }),

  getDocument: (id: string): Promise<any> => apiClient.get(`/documents/${id}`),

  deleteDocument: (id: string): Promise<any> => apiClient.delete(`/documents/${id}`),
}

// 知识抽取API
export const extractionApi = {
  startExtraction: (documentIds: number[]): Promise<any> =>
    apiClient.post('/extraction/start', { document_ids: documentIds }),

  extractFromText: (text: string, projectId?: number): Promise<any> =>
    apiClient.post('/extraction/text', { text, project_id: projectId }),

  getDocumentStatus: (docId: number): Promise<any> =>
    apiClient.get(`/extraction/status/${docId}`),

  getExtractionProgress: (taskId: string): Promise<any> =>
    apiClient.get(`/extraction/progress/${taskId}`),

  getProjectStats: (projectId: number): Promise<any> =>
    apiClient.get(`/extraction/project/${projectId}/stats`),
}

// 知识图谱API
export const knowledgeApi = {
  searchEntities: (query: string, entityType?: string): Promise<any> =>
    apiClient.get('/knowledge/entities/search', { params: { q: query, entity_type: entityType } }),

  getEntity: (id: number): Promise<any> => apiClient.get(`/knowledge/entities/${id}`),

  getRelations: (entityId: number): Promise<any> =>
    apiClient.get(`/knowledge/entities/${entityId}/relations`),

  createEntity: (data: any): Promise<any> => apiClient.post('/knowledge/entities', data),

  createRelation: (data: any): Promise<any> => apiClient.post('/knowledge/relations', data),

  deleteEntity: (id: number): Promise<any> => apiClient.delete(`/knowledge/entities/${id}`),

  getGraph: (projectId?: number): Promise<any> =>
    apiClient.get('/knowledge/graph', { params: projectId ? { project_id: projectId } : {} }),

  getSubgraph: (query: string, projectId?: number): Promise<any> =>
    apiClient.get('/knowledge/subgraph', { params: { query, project_id: projectId } }),

  getStats: (projectId?: number): Promise<any> =>
    apiClient.get('/knowledge/stats', { params: projectId ? { project_id: projectId } : {} }),
}

// 项目API
export const projectApi = {
  getProjects: (): Promise<any> => apiClient.get('/projects/'),

  createProject: (data: any): Promise<any> => apiClient.post('/projects/', data),

  getProject: (id: number): Promise<any> => apiClient.get(`/projects/${id}`),

  updateProject: (id: number, data: any): Promise<any> => apiClient.put(`/projects/${id}`, data),

  deleteProject: (id: number): Promise<any> => apiClient.delete(`/projects/${id}`),
}

export default apiClient
