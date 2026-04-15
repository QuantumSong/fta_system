import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  Panel,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Space, Card, Input, Form, Modal, message, Tooltip, Drawer, List, Tag, Popconfirm, Badge, Timeline, Progress, Segmented, Switch, Dropdown, Popover, Select, Slider, ColorPicker, Descriptions, Alert, Tabs, Empty, Divider } from 'antd'
import {
  DeleteOutlined,
  SaveOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExportOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  HistoryOutlined,
  RollbackOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  LinkOutlined,
  CopyOutlined,
  ScissorOutlined,
  SnippetsOutlined,
  UndoOutlined,
  RedoOutlined,
  ApartmentOutlined,
  AlignCenterOutlined,
  ColumnWidthOutlined,
  ColumnHeightOutlined,
  DashOutlined,
  FormatPainterOutlined,
  DragOutlined,
  SelectOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
  AuditOutlined,
  BranchesOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import type { Connection, Node, Edge } from '@xyflow/react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { ftaApi, collabApi, documentApi, multidocApi, expertApi, projectApi } from '@/services/api'
import useAuthStore from '@/stores/authStore'
import useCollabWs from '@/hooks/useCollabWs'
import TopEventNode from '@/components/nodes/TopEventNode'
import MiddleEventNode from '@/components/nodes/MiddleEventNode'
import BasicEventNode from '@/components/nodes/BasicEventNode'
import HouseEventNode from '@/components/nodes/HouseEventNode'
import UndevelopedEventNode from '@/components/nodes/UndevelopedEventNode'
import AndGateNode from '@/components/gates/AndGateNode'
import OrGateNode from '@/components/gates/OrGateNode'
import NotGateNode from '@/components/gates/NotGateNode'
import XorGateNode from '@/components/gates/XorGateNode'
import PriorityAndGateNode from '@/components/gates/PriorityAndGateNode'
import InhibitGateNode from '@/components/gates/InhibitGateNode'
import VotingGateNode from '@/components/gates/VotingGateNode'
import TransferNode from '@/components/gates/TransferNode'
import MultiDocWizard from '@/components/multidoc/MultiDocWizard'
import DocCompositionPanel from '@/components/multidoc/DocCompositionPanel'
import NodePropertyPanel from '@/components/NodePropertyPanel'
import ValidationPanel, { type ValidationData } from '@/components/ValidationPanel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
  topEvent: TopEventNode,
  middleEvent: MiddleEventNode,
  basicEvent: BasicEventNode,
  houseEvent: HouseEventNode,
  undevelopedEvent: UndevelopedEventNode,
  andGate: AndGateNode,
  orGate: OrGateNode,
  notGate: NotGateNode,
  xorGate: XorGateNode,
  priorityAndGate: PriorityAndGateNode,
  inhibitGate: InhibitGateNode,
  votingGate: VotingGateNode,
  transferSymbol: TransferNode,
}

/* ===================== 元件面板配置 ===================== */
interface PaletteItem {
  type: string
  label: string
  category: 'event' | 'gate'
  color: string
  icon: React.ReactNode
}

const PALETTE_ITEMS: PaletteItem[] = [
  // 事件
  {
    type: 'topEvent', label: '顶事件', category: 'event', color: '#ef4444',
    icon: <svg width="32" height="24" viewBox="0 0 32 24"><rect x="1" y="1" width="30" height="22" rx="3" fill="#ef4444" stroke="#dc2626" strokeWidth="1.5"/><text x="16" y="15" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">TOP</text></svg>,
  },
  {
    type: 'middleEvent', label: '中间事件', category: 'event', color: '#f59e0b',
    icon: <svg width="32" height="24" viewBox="0 0 32 24"><rect x="1" y="1" width="30" height="22" rx="3" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5"/><text x="16" y="15" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">MID</text></svg>,
  },
  {
    type: 'basicEvent', label: '底事件', category: 'event', color: '#10b981',
    icon: <svg width="32" height="24" viewBox="0 0 32 24"><circle cx="16" cy="12" r="10" fill="#10b981" stroke="#059669" strokeWidth="1.5"/><text x="16" y="15" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">BE</text></svg>,
  },
  {
    type: 'houseEvent', label: '外部事件', category: 'event', color: '#6366f1',
    icon: <svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,1 30,10 30,23 2,23 2,10" fill="#6366f1" stroke="#4f46e5" strokeWidth="1.5"/><text x="16" y="18" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">HE</text></svg>,
  },
  {
    type: 'undevelopedEvent', label: '未展开事件', category: 'event', color: '#8b5cf6',
    icon: <svg width="32" height="24" viewBox="0 0 32 24"><polygon points="16,1 31,12 16,23 1,12" fill="#8b5cf6" stroke="#7c3aed" strokeWidth="1.5"/><text x="16" y="15" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold">UE</text></svg>,
  },
  // 逻辑门
  {
    type: 'andGate', label: '与门', category: 'gate', color: '#1890ff',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><path d="M5,30 L5,10 Q5,2 13,2 L37,2 Q45,2 45,10 L45,30 Q45,48 25,48 Q5,48 5,30 Z" fill="#e6f4ff" stroke="#1890ff" strokeWidth="2.5"/><text x="25" y="28" textAnchor="middle" fontSize="11" fill="#1890ff" fontWeight="bold">AND</text></svg>,
  },
  {
    type: 'orGate', label: '或门', category: 'gate', color: '#52c41a',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><path d="M5,5 Q15,5 25,20 Q35,5 45,5 Q40,25 25,48 Q10,25 5,5 Z" fill="#f6ffed" stroke="#52c41a" strokeWidth="2.5"/><text x="25" y="24" textAnchor="middle" fontSize="11" fill="#52c41a" fontWeight="bold">OR</text></svg>,
  },
  {
    type: 'notGate', label: '非门', category: 'gate', color: '#ff4d4f',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><polygon points="10,5 40,25 10,45" fill="#fff1f0" stroke="#ff4d4f" strokeWidth="2.5"/><circle cx="43" cy="25" r="4" fill="#fff1f0" stroke="#ff4d4f" strokeWidth="2"/><text x="20" y="28" textAnchor="middle" fontSize="9" fill="#ff4d4f" fontWeight="bold">NOT</text></svg>,
  },
  {
    type: 'xorGate', label: '异或门', category: 'gate', color: '#722ed1',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><path d="M8,5 Q18,5 25,20 Q32,5 42,5 Q37,25 25,48 Q13,25 8,5 Z" fill="#f9f0ff" stroke="#722ed1" strokeWidth="2.5"/><path d="M5,5 Q15,25 5,45" fill="none" stroke="#722ed1" strokeWidth="2"/><text x="25" y="24" textAnchor="middle" fontSize="9" fill="#722ed1" fontWeight="bold">XOR</text></svg>,
  },
  {
    type: 'priorityAndGate', label: '优先与门', category: 'gate', color: '#13c2c2',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><path d="M5,30 L5,10 Q5,2 13,2 L37,2 Q45,2 45,10 L45,30 Q45,48 25,48 Q5,48 5,30 Z" fill="#e6fffb" stroke="#13c2c2" strokeWidth="2.5"/><text x="25" y="28" textAnchor="middle" fontSize="8" fill="#13c2c2" fontWeight="bold">PAND</text></svg>,
  },
  {
    type: 'inhibitGate', label: '禁止门', category: 'gate', color: '#fa8c16',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><polygon points="25,2 47,14 47,38 25,48 3,38 3,14" fill="#fff7e6" stroke="#fa8c16" strokeWidth="2.5"/><text x="25" y="28" textAnchor="middle" fontSize="7" fill="#fa8c16" fontWeight="bold">INHIB</text></svg>,
  },
  {
    type: 'votingGate', label: '表决门', category: 'gate', color: '#eb2f96',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><path d="M5,30 L5,10 Q5,2 13,2 L37,2 Q45,2 45,10 L45,30 Q45,48 25,48 Q5,48 5,30 Z" fill="#fff0f6" stroke="#eb2f96" strokeWidth="2.5"/><text x="25" y="28" textAnchor="middle" fontSize="9" fill="#eb2f96" fontWeight="bold">k/n</text></svg>,
  },
  {
    type: 'transferSymbol', label: '转移符号', category: 'gate', color: '#597ef7',
    icon: <svg width="32" height="28" viewBox="0 0 50 50"><polygon points="25,2 48,48 2,48" fill="#f0f5ff" stroke="#597ef7" strokeWidth="2.5"/><text x="25" y="36" textAnchor="middle" fontSize="10" fill="#597ef7" fontWeight="bold">T</text></svg>,
  },
]

const LABEL_MAP: Record<string, string> = {
  topEvent: '顶事件', middleEvent: '中间事件', basicEvent: '底事件',
  houseEvent: '外部事件', undevelopedEvent: '未展开事件',
  andGate: 'AND', orGate: 'OR', notGate: 'NOT', xorGate: 'XOR',
  priorityAndGate: 'PAND', inhibitGate: 'INHIBIT', votingGate: '2/3', transferSymbol: 'T',
}

const BG_OPTIONS = [
  { label: '空白', value: 'none' },
  { label: '点阵', value: 'dots' },
  { label: '网格', value: 'lines' },
]

/* ---- 连线样式配置 ---- */
interface EdgeStyleConfig {
  type: 'smoothstep' | 'default' | 'straight' | 'step'
  stroke: string
  strokeWidth: number
  animated: boolean
  markerEnd: 'arrow' | 'arrowclosed' | 'none'
}

const EDGE_TYPE_OPTIONS = [
  { label: '平滑', value: 'smoothstep' },
  { label: '贝塞尔', value: 'default' },
  { label: '直线', value: 'straight' },
  { label: '折线', value: 'step' },
]

const EDGE_MARKER_OPTIONS = [
  { label: '实心箭头', value: 'arrowclosed' },
  { label: '空心箭头', value: 'arrow' },
  { label: '无箭头', value: 'none' },
]

const EDGE_COLORS = ['#64748b', '#1890ff', '#52c41a', '#f5222d', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#000000']

const EditorInner: React.FC = () => {
  const { treeId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [bgVariant, setBgVariant] = useState<string>('dots')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  // 放置模式: 单击面板元件后进入，鼠标附带虚化预览，画布上单击放置
  const [pendingNodeType, setPendingNodeType] = useState<string | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // 快捷连接
  const [quickConnectEnabled, setQuickConnectEnabled] = useState(false)
  const [quickConnectSource, setQuickConnectSource] = useState<string | null>(null)
  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null)
  // 剪贴板
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[]; cut: boolean } | null>(null)
  const generateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 撤销/重做
  const historyRef = useRef<{ past: { nodes: Node[]; edges: Edge[] }[]; future: { nodes: Node[]; edges: Edge[] }[] }>({ past: [], future: [] })
  const skipHistoryRef = useRef(false)
  // snap-to-grid
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [snapGrid] = useState<[number, number]>([16, 16])
  // 连线样式
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyleConfig>({
    type: 'smoothstep', stroke: '#64748b', strokeWidth: 2, animated: false, markerEnd: 'arrowclosed',
  })
  // 连线右键菜单
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null)
  // 画布模式：选择 vs 拖拽
  const [panMode, setPanMode] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationData | null>(null)
  const [isAutoFixing, setIsAutoFixing] = useState(false)
  const [fixProgress, setFixProgress] = useState(0)
  const [ignoredIssues, setIgnoredIssues] = useState<Set<string>>(new Set())
  const [currentTreeId, setCurrentTreeId] = useState<number | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null)
  const [autoSaveInterval, setAutoSaveInterval] = useState<number>(() => {
    const stored = localStorage.getItem('fta_autosave_interval')
    return stored ? Number(stored) : 60
  })
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return localStorage.getItem('fta_autosave_enabled') !== 'false'
  })
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [form] = Form.useForm()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { getNodes, getEdges, screenToFlowPosition } = useReactFlow()

  // 已保存故障树列表
  const [savedTreeDrawerOpen, setSavedTreeDrawerOpen] = useState(false)
  const [savedTrees, setSavedTrees] = useState<any[]>([])
  const [loadingSavedTrees, setLoadingSavedTrees] = useState(false)

  // 版本历史
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  // 证据追溯
  const [evidenceData, setEvidenceData] = useState<any>(null)
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false)
  const [evidenceTarget, setEvidenceTarget] = useState<{ type: 'node' | 'edge'; id: string } | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [chunkPreview, setChunkPreview] = useState<{ open: boolean; docId: number | null; docName: string; chunks: any[]; highlightChunkId: number | null }>({ open: false, docId: null, docName: '', chunks: [], highlightChunkId: null })

  // 节点属性面板
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(false)
  const [propertyPanelNode, setPropertyPanelNode] = useState<any>(null)

  // 多文档联合建树
  const [multiDocWizardOpen, setMultiDocWizardOpen] = useState(false)
  const [docComposition, setDocComposition] = useState<any>(null)
  const [docCompositionOpen, setDocCompositionOpen] = useState(false)

  // 协同工作 WebSocket
  const { token, user } = useAuthStore()
  const isRemoteUpdate = useRef(false)
  const [collabEnabled, setCollabEnabled] = useState(false)

  // 当 projectId 变化时，查询该项目是否开启协同
  useEffect(() => {
    if (!currentProjectId) { setCollabEnabled(false); return }
    projectApi.getProject(currentProjectId).then((p: any) => {
      setCollabEnabled(!!p?.collab_enabled)
    }).catch(() => setCollabEnabled(false))
  }, [currentProjectId])

  const { connected: wsConnected, onlineCount, sendTreeUpdate } = useCollabWs({
    projectId: collabEnabled ? currentProjectId : null,
    token,
    username: user?.username || '匿名',
    onTreeUpdate: useCallback((msg: any) => {
      if (msg.structure) {
        isRemoteUpdate.current = true
        const remoteNodes = (msg.structure.nodes || []).map((n: any) => ({
          ...n,
          position: n.position || { x: 0, y: 0 },
          data: n.data || { label: '未命名' },
        }))
        const remoteEdges = (msg.structure.links || []).map((e: any) => ({
          ...e,
          id: e.id || `e-${e.source}-${e.target}`,
        }))
        setNodes([])
        setEdges([])
        requestAnimationFrame(() => {
          setNodes(remoteNodes)
          requestAnimationFrame(() => { setEdges(remoteEdges) })
        })
        message.info(`${msg.from} 更新了故障树`, 2)
        setTimeout(() => { isRemoteUpdate.current = false }, 200)
      }
    }, [setNodes, setEdges]),
    onUserJoin: useCallback((msg: any) => {
      message.success(`${msg.username} 加入了协同编辑`, 2)
    }, []),
    onUserLeave: useCallback((msg: any) => {
      message.warning(`${msg.username} 离开了协同编辑`, 2)
    }, []),
  })

  // 从 URL 参数初始化 projectId，并自动加载该项目的故障树
  useEffect(() => {
    const pid = searchParams.get('project')
    if (pid) {
      const numPid = Number(pid)
      setCurrentProjectId(numPid)
      // 自动加载该项目已保存的故障树
      if (!treeId) {
        loadProjectTrees(numPid)
      }
    }
  }, [searchParams])

  const cacheRestoredRef = useRef(false)
  useEffect(() => {
    if (treeId) {
      loadFaultTree(treeId)
    } else if (!cacheRestoredRef.current) {
      // 没有 treeId 时尝试从缓存恢复画布（仅执行一次）
      const cached = sessionStorage.getItem('fta_canvas_cache')
      if (cached) {
        try {
          const { nodes: cn, edges: ce, treeId: ct, projectId: cp } = JSON.parse(cached)
          if (cn?.length > 0) {
            cacheRestoredRef.current = true
            setNodes([])
            setEdges([])
            requestAnimationFrame(() => {
              setNodes(cn)
              requestAnimationFrame(() => { setEdges(ce || []) })
            })
            if (ct) setCurrentTreeId(ct)
            if (cp) setCurrentProjectId(cp)
            message.info('已恢复上次编辑的画布', 2)
          }
        } catch {}
      }
    }
  }, [treeId])

  // 加载已保存的故障树列表（按项目筛选）
  const loadSavedTrees = async () => {
    try {
      setLoadingSavedTrees(true)
      const data: any = await ftaApi.getFaultTrees(currentProjectId ?? undefined)
      setSavedTrees(data.fault_trees || [])
    } catch {
      message.error('加载故障树列表失败')
    } finally {
      setLoadingSavedTrees(false)
    }
  }

  // 从项目进入时自动加载故障树
  const loadProjectTrees = async (projectId: number) => {
    try {
      setLoadingSavedTrees(true)
      const data: any = await ftaApi.getFaultTrees(projectId)
      const trees = data.fault_trees || []
      setSavedTrees(trees)
      if (trees.length === 1) {
        // 只有一棵故障树，直接打开
        loadFaultTree(String(trees[0].id))
      } else if (trees.length > 1) {
        // 多棵故障树，打开抽屉让用户选择
        setSavedTreeDrawerOpen(true)
      }
    } catch {
      message.error('加载项目故障树失败')
    } finally {
      setLoadingSavedTrees(false)
    }
  }

  const handleOpenSavedTrees = () => {
    setSavedTreeDrawerOpen(true)
    loadSavedTrees()
  }

  const handleOpenTree = (id: number) => {
    setSavedTreeDrawerOpen(false)
    navigate(`/editor/${id}`)
  }

  const handleDeleteTree = async (id: number) => {
    try {
      await ftaApi.deleteFaultTree(id)
      message.success('删除成功')
      loadSavedTrees()
      if (currentTreeId === id) {
        setCurrentTreeId(null)
        setNodes([])
        setEdges([])
        navigate('/editor')
      }
    } catch {
      message.error('删除失败')
    }
  }

  // 给节点注入 onLabelChange / onSizeChange / evidenceLevel 回调
  const nodesWithCallbacks = nodes.map((node) => {
    const evLevel = evidenceData?.node_evidence?.[node.id]?.evidence_level
    return {
      ...node,
      data: {
        ...node.data,
        evidenceLevel: evLevel || undefined,
        onLabelChange: (newLabel: string) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === node.id ? { ...n, data: { ...n.data, label: newLabel } } : n
            )
          )
        },
        onSizeChange: (w: number, h: number) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === node.id ? { ...n, data: { ...n.data, nodeWidth: w, nodeHeight: h } } : n
            )
          )
        },
      },
    }
  })

  const loadFaultTree = async (id: string) => {
    try {
      const data = (await ftaApi.getFaultTree(id)) as any
      if (data.structure) {
        const loadedNodes = (data.structure.nodes || []).map((n: any) => ({
          ...n,
          position: n.position || { x: 0, y: 0 },
          data: n.data || { label: n.name || '未命名' },
        }))
        const loadedEdges = (data.structure.links || []).map((e: any) => ({
          ...e,
          id: e.id || `e-${e.source}-${e.target}`,
        }))
        // 先清空再设置节点，确保 ReactFlow 内部 store 同步
        setNodes([])
        setEdges([])
        // 延迟一帧设置节点，再延迟一帧设置边，避免 ReactFlow 因节点未注册而丢弃边
        requestAnimationFrame(() => {
          setNodes(loadedNodes)
          requestAnimationFrame(() => {
            setEdges(loadedEdges)
          })
        })
        setCurrentTreeId(data.id)
        setEvidenceData(null)
        setDocComposition(data.doc_composition || null)
        if (data.project_id) {
          setCurrentProjectId(data.project_id)
        }
      }
    } catch {
      message.error('加载故障树失败')
    }
  }

  // 根据 edgeStyle 构建 edge props
  const buildEdgeProps = useCallback((style: EdgeStyleConfig) => {
    const marker = style.markerEnd !== 'none'
      ? { type: style.markerEnd === 'arrowclosed' ? MarkerType.ArrowClosed : MarkerType.Arrow, color: style.stroke, width: 18, height: 18 }
      : undefined
    return {
      type: style.type,
      animated: style.animated,
      style: { stroke: style.stroke, strokeWidth: style.strokeWidth },
      markerEnd: marker,
    }
  }, [])

  const onConnect = useCallback(
    (params: Connection) => {
      const props = buildEdgeProps(edgeStyle)
      setEdges((eds) => addEdge({ ...params, ...props }, eds))
    },
    [setEdges, edgeStyle, buildEdgeProps]
  )

  // 更新单条边样式
  const updateEdgeStyle = useCallback((edgeId: string, patch: Partial<EdgeStyleConfig>) => {
    setEdges((eds) => eds.map(e => {
      if (e.id !== edgeId) return e
      const cur: EdgeStyleConfig = {
        type: (e.type as EdgeStyleConfig['type']) || 'smoothstep',
        stroke: (e.style as any)?.stroke || '#64748b',
        strokeWidth: (e.style as any)?.strokeWidth || 2,
        animated: e.animated || false,
        markerEnd: e.markerEnd ? ((e.markerEnd as any).type === MarkerType.ArrowClosed ? 'arrowclosed' : 'arrow') : 'none',
      }
      const merged = { ...cur, ...patch }
      const props = buildEdgeProps(merged)
      return { ...e, ...props }
    }))
  }, [setEdges, buildEdgeProps])

  // 应用当前默认样式到所有连线
  const applyStyleToAllEdges = useCallback(() => {
    const props = buildEdgeProps(edgeStyle)
    setEdges((eds) => eds.map(e => ({ ...e, ...props })))
    message.success('已应用到所有连线', 1)
  }, [setEdges, edgeStyle, buildEdgeProps])

  // 边右键菜单
  const handleEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault()
    setEdgeContextMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id })
    setContextMenu(null)
  }, [])

  const handleAddNode = useCallback((type: string, position?: { x: number; y: number }) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type,
      position: position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: { label: LABEL_MAP[type] || type },
    }
    setNodes((nds) => [...nds, newNode])
  }, [setNodes])

  // 拖拽放置处理
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/reactflow')
    if (!type) return
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    handleAddNode(type, position)
  }, [screenToFlowPosition, handleAddNode])

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  // ---- 放置模式: 面板单击 → 进入放置模式 → 画布单击放置 ----
  const handlePaletteClick = useCallback((type: string) => {
    setPendingNodeType(type)
    setQuickConnectSource(null) // 取消快捷连接的半选状态
    setContextMenu(null)
  }, [])

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    setContextMenu(null)
    setEdgeContextMenu(null)
    setPropertyPanelOpen(false)
    if (pendingNodeType) {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      handleAddNode(pendingNodeType, position)
      setPendingNodeType(null)
      return
    }
  }, [pendingNodeType, screenToFlowPosition, handleAddNode])

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    if (pendingNodeType) {
      setGhostPos({ x: event.clientX, y: event.clientY })
    }
  }, [pendingNodeType])

  // ESC 取消放置模式
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingNodeType) {
        setPendingNodeType(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingNodeType])

  // ---- 节点属性面板 ----
  // 保持 propertyPanelNode 与最新 nodes 数据同步
  useEffect(() => {
    if (propertyPanelNode) {
      const latest = nodes.find(n => n.id === propertyPanelNode.id)
      if (latest && latest.data !== propertyPanelNode.data) {
        setPropertyPanelNode(latest)
      }
    }
  }, [nodes, propertyPanelNode])

  const handleNodePropertyChange = useCallback((nodeId: string, data: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n))
  }, [setNodes])

  // ---- 快捷连接: 点两个节点自动连线 ----
  const handleNodeClickForConnect = useCallback((_event: React.MouseEvent, node: Node) => {
    setContextMenu(null)
    // 打开属性面板
    setPropertyPanelNode(node)
    setPropertyPanelOpen(true)
    if (!quickConnectEnabled) return
    if (!quickConnectSource) {
      // 检查该节点是否还能连出新边（是否存在至少一个未连接的目标）
      const existingTargets = new Set(edges.filter(e => e.source === node.id).map(e => e.target))
      const possibleTargets = nodes.filter(n => n.id !== node.id && !existingTargets.has(n.id))
      if (possibleTargets.length === 0) {
        message.warning(`「${(node.data as any)?.label || node.id}」已与所有其他节点连接，无可用目标`, 2)
        return
      }
      setQuickConnectSource(node.id)
      message.info(`已选中「${(node.data as any)?.label || node.id}」，请点击目标节点完成连线`, 2)
    } else {
      if (quickConnectSource === node.id) {
        setQuickConnectSource(null)
        return
      }
      // 检查是否已存在相同连线
      const duplicate = edges.some(e =>
        (e.source === quickConnectSource && e.target === node.id) ||
        (e.source === node.id && e.target === quickConnectSource)
      )
      if (duplicate) {
        message.warning('这两个节点之间已存在连线', 2)
        setQuickConnectSource(null)
        return
      }
      setEdges((eds) => addEdge({ source: quickConnectSource, target: node.id, sourceHandle: null, targetHandle: null }, eds))
      message.success('连线成功', 1)
      setQuickConnectSource(null)
    }
  }, [quickConnectEnabled, quickConnectSource, setEdges, edges, nodes])

  // ---- 删除选中节点和边 ----
  const handleDeleteNode = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected)
    const selectedEdges = edges.filter((e) => e.selected)
    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      message.warning('请先选择要删除的节点或连线')
      return
    }
    const nodeIds = new Set(selectedNodes.map((n) => n.id))
    const edgeIds = new Set(selectedEdges.map((e) => e.id))
    setNodes((nds) => nds.filter((n) => !nodeIds.has(n.id)))
    setEdges((eds) =>
      eds.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target))
    )
  }, [nodes, edges, setNodes, setEdges])

  // ---- 删除指定节点 ----
  const handleDeleteSpecificNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    setContextMenu(null)
  }, [setNodes, setEdges])

  // ---- 右键菜单 ----
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id })
  }, [])

  const handlePaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    const hasSelection = nodes.some(n => n.selected)
    if (hasSelection || clipboardRef.current) {
      setContextMenu({ x: event.clientX, y: event.clientY })
    }
  }, [nodes])

  // ---- 复制 / 剪切 / 粘贴 ----
  const handleCopy = useCallback((cut = false) => {
    const selectedNodes = nodes.filter((n) => n.selected)
    if (selectedNodes.length === 0 && contextMenu) {
      const n = nodes.find((nd) => nd.id === contextMenu.nodeId)
      if (n) {
        clipboardRef.current = { nodes: [n], edges: [], cut }
        if (cut) handleDeleteSpecificNode(n.id)
        message.success(cut ? '已剪切' : '已复制', 1)
        setContextMenu(null)
        return
      }
    }
    if (selectedNodes.length === 0) { message.warning('无选中节点'); return }
    const ids = new Set(selectedNodes.map((n) => n.id))
    const relatedEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    clipboardRef.current = { nodes: selectedNodes, edges: relatedEdges, cut }
    if (cut) {
      const idArr = [...ids]
      setNodes((nds) => nds.filter((n) => !ids.has(n.id)))
      setEdges((eds) => eds.filter((e) => !idArr.includes(e.source) && !idArr.includes(e.target)))
    }
    message.success(cut ? '已剪切' : '已复制', 1)
    setContextMenu(null)
  }, [nodes, edges, contextMenu, setNodes, setEdges, handleDeleteSpecificNode])

  const handlePaste = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) {
      message.warning('剪贴板为空')
      return
    }
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current
    const idMap = new Map<string, string>()
    const now = Date.now()
    const newNodes = clipNodes.map((n, i) => {
      const newId = `node-${now}-${i}`
      idMap.set(n.id, newId)
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: false,
      }
    })
    const newEdges = clipEdges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e, i) => ({
        ...e,
        id: `e-paste-${now}-${i}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }))
    setNodes((nds) => [...nds, ...newNodes])
    setEdges((eds) => [...eds, ...newEdges])
    message.success('已粘贴', 1)
    setContextMenu(null)
  }, [setNodes, setEdges])

  // ---- 撤销/重做 ----
  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return
    historyRef.current.past.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    if (historyRef.current.past.length > 50) historyRef.current.past.shift()
    historyRef.current.future = []
  }, [nodes, edges])

  // 每次 nodes/edges 变化时记录历史
  const prevSnapshot = useRef<string>('')
  useEffect(() => {
    if (skipHistoryRef.current) return
    const snap = JSON.stringify({ n: nodes.map(n => ({ id: n.id, type: n.type, x: Math.round(n.position.x), y: Math.round(n.position.y) })), e: edges.map(e => e.id) })
    if (snap !== prevSnapshot.current && prevSnapshot.current !== '') {
      pushHistory()
    }
    prevSnapshot.current = snap
  }, [nodes, edges, pushHistory])

  const handleUndo = useCallback(() => {
    const { past } = historyRef.current
    if (past.length === 0) { message.info('没有可撤销的操作', 1); return }
    const prev = past.pop()!
    historyRef.current.future.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    skipHistoryRef.current = true
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [nodes, edges, setNodes, setEdges])

  const handleRedo = useCallback(() => {
    const { future } = historyRef.current
    if (future.length === 0) { message.info('没有可重做的操作', 1); return }
    const next = future.pop()!
    historyRef.current.past.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
    skipHistoryRef.current = true
    setNodes(next.nodes)
    setEdges(next.edges)
    setTimeout(() => { skipHistoryRef.current = false }, 50)
  }, [nodes, edges, setNodes, setEdges])

  // ---- 自动布局 (树形 top-down) ----
  const handleAutoLayout = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    if (currentNodes.length === 0) { message.warning('画布为空'); return }
    // 构建邻接表
    const children: Record<string, string[]> = {}
    const hasParent = new Set<string>()
    currentNodes.forEach(n => { children[n.id] = [] })
    currentEdges.forEach(e => {
      if (children[e.source]) children[e.source].push(e.target)
      hasParent.add(e.target)
    })
    // 找根节点
    const roots = currentNodes.filter(n => !hasParent.has(n.id))
    if (roots.length === 0) { message.warning('未找到根节点，无法自动布局'); return }
    // BFS 分层
    const H_GAP = 160
    const V_GAP = 120
    const positions: Record<string, { x: number; y: number }> = {}
    const widthOf = (id: string): number => {
      const kids = children[id] || []
      if (kids.length === 0) return 1
      return kids.reduce((sum, kid) => sum + widthOf(kid), 0)
    }
    const layoutTree = (rootId: string, startX: number, depth: number) => {
      const w = widthOf(rootId)
      positions[rootId] = { x: startX + (w * H_GAP) / 2 - H_GAP / 2, y: depth * V_GAP }
      let offset = startX
      for (const kid of (children[rootId] || [])) {
        const kidW = widthOf(kid)
        layoutTree(kid, offset, depth + 1)
        offset += kidW * H_GAP
      }
    }
    let xOffset = 0
    roots.forEach(root => {
      const w = widthOf(root.id)
      layoutTree(root.id, xOffset, 0)
      xOffset += w * H_GAP + H_GAP
    })
    setNodes(nds => nds.map(n => positions[n.id] ? { ...n, position: positions[n.id] } : n))
    message.success('自动布局完成', 1)
  }, [getNodes, getEdges, setNodes])

  // ---- 对齐工具 ----
  const handleAlignCenter = useCallback(() => {
    const selected = nodes.filter(n => n.selected)
    if (selected.length < 2) { message.warning('请至少选择2个节点'); return }
    const avgX = selected.reduce((s, n) => s + n.position.x, 0) / selected.length
    const ids = new Set(selected.map(n => n.id))
    setNodes(nds => nds.map(n => ids.has(n.id) ? { ...n, position: { ...n.position, x: avgX } } : n))
  }, [nodes, setNodes])

  const handleDistributeH = useCallback(() => {
    const selected = nodes.filter(n => n.selected)
    if (selected.length < 3) { message.warning('请至少选择3个节点'); return }
    const sorted = [...selected].sort((a, b) => a.position.x - b.position.x)
    const minX = sorted[0].position.x
    const maxX = sorted[sorted.length - 1].position.x
    const gap = (maxX - minX) / (sorted.length - 1)
    const posMap = new Map<string, number>()
    sorted.forEach((n, i) => posMap.set(n.id, minX + i * gap))
    setNodes(nds => nds.map(n => posMap.has(n.id) ? { ...n, position: { ...n.position, x: posMap.get(n.id)! } } : n))
  }, [nodes, setNodes])

  const handleDistributeV = useCallback(() => {
    const selected = nodes.filter(n => n.selected)
    if (selected.length < 3) { message.warning('请至少选择3个节点'); return }
    const sorted = [...selected].sort((a, b) => a.position.y - b.position.y)
    const minY = sorted[0].position.y
    const maxY = sorted[sorted.length - 1].position.y
    const gap = (maxY - minY) / (sorted.length - 1)
    const posMap = new Map<string, number>()
    sorted.forEach((n, i) => posMap.set(n.id, minY + i * gap))
    setNodes(nds => nds.map(n => posMap.has(n.id) ? { ...n, position: { ...n.position, y: posMap.get(n.id)! } } : n))
  }, [nodes, setNodes])

  // ---- 全局键盘快捷键 ----
  const handleSaveRef = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 不在输入框中时才响应
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); handleSaveRef.current() }
        if (e.key === 'c') { e.preventDefault(); handleCopy(false) }
        if (e.key === 'x') { e.preventDefault(); handleCopy(true) }
        if (e.key === 'v') { e.preventDefault(); handlePaste() }
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
        if (e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo() }
        if (e.key === 'Z') { e.preventDefault(); handleRedo() }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteNode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleCopy, handlePaste, handleUndo, handleRedo, handleDeleteNode])


  const handleSave = async () => {
    // 获取最新的节点状态（包含拖拽后的位置）
    const currentNodes = getNodes()
    try {
      const structure = {
        nodes: currentNodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        links: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        })),
      }

      if (currentTreeId) {
        await ftaApi.saveFaultTree({ id: currentTreeId, structure, project_id: currentProjectId })
      } else {
        // 找到顶事件名称作为故障树名称
        const topNode = currentNodes.find((n) => n.type === 'topEvent')
        const treeName = (topNode?.data as any)?.label || '未命名故障树'
        const result = (await ftaApi.createFaultTree({
          name: treeName,
          project_id: currentProjectId,
          structure,
        })) as any
        if (result.id) {
          setCurrentTreeId(result.id)
          navigate(`/editor/${result.id}`, { replace: true })
        }
      }
      message.success('保存成功')

      // 广播给协作伙伴
      if (currentTreeId && currentProjectId && !isRemoteUpdate.current) {
        sendTreeUpdate(currentTreeId, structure)
      }
    } catch {
      message.error('保存失败')
    }
  }
  handleSaveRef.current = handleSave

  // ---- 画布缓存：每次 nodes/edges 变化时写入 sessionStorage ----
  useEffect(() => {
    // 防止初始空状态覆盖缓存
    if (nodes.length === 0 && edges.length === 0) return
    const cacheData = {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      treeId: currentTreeId,
      projectId: currentProjectId,
      ts: Date.now(),
    }
    sessionStorage.setItem('fta_canvas_cache', JSON.stringify(cacheData))
  }, [nodes, edges, currentTreeId, currentProjectId])

  // ---- 自动保存定时器 ----
  useEffect(() => {
    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    if (!autoSaveEnabled || autoSaveInterval <= 0) return
    autoSaveTimerRef.current = setInterval(async () => {
      const currentNodes = getNodes()
      if (currentNodes.length === 0) return
      if (!currentTreeId) return // 只对已保存过的树自动保存
      try {
        const structure = {
          nodes: currentNodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
          links: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        }
        await ftaApi.saveFaultTree({ id: currentTreeId, structure, project_id: currentProjectId })
        setLastAutoSave(new Date().toLocaleTimeString('zh-CN'))
      } catch {
        // 自动保存静默失败，不打扰用户
        console.warn('自动保存失败')
      }
    }, autoSaveInterval * 1000)
    return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
  }, [autoSaveEnabled, autoSaveInterval, currentTreeId, currentProjectId, edges, getNodes])

  // 持久化自动保存设置
  useEffect(() => {
    localStorage.setItem('fta_autosave_interval', String(autoSaveInterval))
    localStorage.setItem('fta_autosave_enabled', String(autoSaveEnabled))
  }, [autoSaveInterval, autoSaveEnabled])

  // 版本历史
  const loadVersions = async () => {
    if (!currentTreeId) {
      message.warning('请先保存或打开一棵故障树')
      return
    }
    try {
      setLoadingVersions(true)
      setVersionDrawerOpen(true)
      const res: any = await collabApi.getVersions(currentTreeId)
      setVersions(res.versions || [])
    } catch {
      message.error('加载版本历史失败')
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleRestoreVersion = async (versionId: number) => {
    if (!currentTreeId) return
    Modal.confirm({
      title: '确认回溯',
      content: '回溯将用历史版本覆盖当前故障树，当前版本会自动备份。',
      okText: '确认回溯',
      cancelText: '取消',
      onOk: async () => {
        try {
          await collabApi.restoreVersion(currentTreeId, versionId)
          message.success('版本已恢复')
          setVersionDrawerOpen(false)
          loadFaultTree(String(currentTreeId))
        } catch {
          message.error('回溯失败')
        }
      },
    })
  }

  const handleGenerate = async (values: any) => {
    try {
      setIsGenerating(true)
      setGenerateProgress(0)
      generateTimerRef.current = setInterval(() => {
        setGenerateProgress(prev => {
          if (prev >= 90) { if (generateTimerRef.current) clearInterval(generateTimerRef.current); return 90 }
          return prev + Math.random() * 12
        })
      }, 800)
      const result = (await ftaApi.generateFaultTree({
        project_id: currentProjectId || null,
        top_event: {
          name: values.topEventName,
          description: values.description,
          device_type: values.deviceType,
        },
      })) as any

      if (result.structure) {
        const genNodes = (result.structure.nodes || []).map((n: any) => ({
          ...n,
          position: n.position || { x: 0, y: 0 },
          data: n.data || { label: n.name || '未命名' },
        }))
        const genEdges = (result.structure.links || []).map((e: any) => ({
          ...e,
          id: e.id || `e-${e.source}-${e.target}`,
        }))
        setNodes([])
        setEdges([])
        requestAnimationFrame(() => {
          setNodes(genNodes)
          requestAnimationFrame(() => { setEdges(genEdges) })
        })
        if (result.tree_id) {
          setCurrentTreeId(result.tree_id)
        }
        // 显示增强信息
        const aug = result.augmentation_info
        const parts = [`${result.statistics?.node_count || 0} 个节点, ${result.statistics?.link_count || 0} 条连线`]
        if (aug) {
          if (aug.kg_entities_used > 0) parts.push(`知识图谱: ${aug.kg_entities_used} 实体`)
          if (aug.rag_chunks_used > 0) parts.push(`RAG: ${aug.rag_chunks_used} 片段`)
          if (aug.similar_trees_used > 0) parts.push(`参考: ${aug.similar_trees_used} 棵历史树`)
        }
        message.success(`生成成功: ${parts.join(' | ')}`)
      }
      if (generateTimerRef.current) clearInterval(generateTimerRef.current)
      setGenerateProgress(100)
      setTimeout(() => {
        setIsGenerateModalOpen(false)
        form.resetFields()
        setGenerateProgress(0)
      }, 400)
    } catch (error: any) {
      if (generateTimerRef.current) clearInterval(generateTimerRef.current)
      const detail = error?.response?.data?.detail || '生成失败，请检查DeepSeek API配置'
      message.error(detail)
    } finally {
      setIsGenerating(false)
      setTimeout(() => setGenerateProgress(0), 600)
    }
  }

  // 多文档联合建树结果回调
  const handleMultiDocGenerated = useCallback((result: any) => {
    setMultiDocWizardOpen(false)
    if (result.structure) {
      const genNodes = (result.structure.nodes || []).map((n: any) => ({
        ...n,
        position: n.position || { x: 0, y: 0 },
        data: n.data || { label: n.name || '未命名' },
      }))
      const genEdges = (result.structure.links || []).map((e: any) => ({
        ...e,
        id: e.id || `e-${e.source}-${e.target}`,
      }))
      setNodes([])
      setEdges([])
      requestAnimationFrame(() => {
        setNodes(genNodes)
        requestAnimationFrame(() => { setEdges(genEdges) })
      })
      if (result.tree_id) setCurrentTreeId(result.tree_id)
      if (result.doc_composition) setDocComposition(result.doc_composition)
    }
  }, [setNodes, setEdges])

  // 手动刷新文档构成（用于已有树未内联 doc_composition 的情况）
  useEffect(() => {
    if (currentTreeId && !docComposition) {
      multidocApi.getTreeComposition(currentTreeId).then((res: any) => {
        if (res && res.documents && res.documents.length > 0) {
          setDocComposition(res)
        }
      }).catch(() => { /* no composition */ })
    }
  }, [currentTreeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const _buildStructure = useCallback(() => ({
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, data: n.data,
      name: (n.data as any)?.label,
    })),
    links: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
    })),
  }), [nodes, edges])

  const handleValidate = async () => {
    try {
      setIsValidating(true)
      // 合并专家库忽略规则
      let mergedIgnored = [...ignoredIssues]
      if (currentProjectId) {
        try {
          const eset: any = await expertApi.getIgnoredSet(currentProjectId)
          if (eset?.ignored_issues) mergedIgnored = [...new Set([...mergedIgnored, ...eset.ignored_issues])]
        } catch { /* ignore */ }
      }
      const structure = _buildStructure()
      const result: any = await ftaApi.validateFaultTree(structure, {
        ignored_issues: mergedIgnored,
      })
      setValidationResult(result)
      if (result.is_valid && (result.issues?.length || 0) === 0) {
        message.success(`校验通过，质量分数 ${result.quality_score ?? 100}`)
      } else {
        message.warning(`发现 ${result.issues?.length || 0} 个问题，质量分数 ${result.quality_score ?? '—'}`)
      }
    } catch {
      message.error('校验失败')
    } finally {
      setIsValidating(false)
    }
  }

  const handleIgnoreIssue = useCallback(async (ruleId: string, nodeId?: string) => {
    const key = nodeId ? `${ruleId}::${nodeId}` : ruleId
    setIgnoredIssues(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    // 同步持久化到专家模式
    try {
      await expertApi.createRule({
        name: `忽略 ${ruleId}${nodeId ? ` (${nodeId})` : ''}`,
        description: '从校验面板一键忽略',
        rule_type: 'ignore',
        scope: currentProjectId ? 'project' : 'global',
        project_id: currentProjectId || undefined,
        target_rule_id: ruleId,
        target_node_pattern: nodeId || undefined,
        priority: 0,
        enabled: true,
      })
      message.success('已忽略该问题，已同步至专家模式规则库')
    } catch {
      message.info('已忽略该问题，重新校验后生效')
    }
  }, [currentProjectId])

  const handleAutoFix = useCallback(async (issueIndices: number[]) => {
    try {
      setIsAutoFixing(true)
      setFixProgress(5)
      const structure = _buildStructure()
      // 模拟进度：发请求前先推到 20%
      setFixProgress(20)
      const progressTimer = setInterval(() => {
        setFixProgress(prev => prev < 85 ? prev + Math.random() * 8 : prev)
      }, 800)

      const res: any = await ftaApi.autoFixTree({
        structure, issue_indices: issueIndices,
        ignored_issues: [...ignoredIssues],
      })

      clearInterval(progressTimer)
      setFixProgress(90)

      if (res.fixed && res.structure) {
        // 应用修复后的结构
        const fixedNodes = (res.structure.nodes || []).map((n: any, i: number) => ({
          id: n.id,
          type: n.type || 'basicEvent',
          position: n.position || { x: 200 + (i % 5) * 200, y: 100 + Math.floor(i / 5) * 160 },
          data: n.data || { label: n.name || '' },
        }))
        const fixedEdges = (res.structure.links || []).map((lk: any, i: number) => ({
          id: lk.id || `fix-edge-${i}`,
          source: lk.source,
          target: lk.target,
        }))
        setNodes([])
        setEdges([])
        requestAnimationFrame(() => {
          setNodes(fixedNodes)
          requestAnimationFrame(() => { setEdges(fixedEdges) })
        })
        setFixProgress(95)
        // 自动树形布局
        setTimeout(() => {
          handleAutoLayout()
          setFixProgress(100)
          message.success(`AI 修复完成：${res.issues_before} → ${res.issues_after} 个问题，分数 ${res.score_before} → ${res.score_after}`)
          // 自动重新校验
          setTimeout(handleValidate, 600)
          setTimeout(() => setFixProgress(0), 1500)
        }, 200)
      } else {
        setFixProgress(0)
        message.warning(res.reason || 'AI 无法自动修复')
      }
    } catch {
      setFixProgress(0)
      message.error('AI 自动修复失败')
    } finally {
      setIsAutoFixing(false)
    }
  }, [_buildStructure, ignoredIssues, setNodes, setEdges, handleAutoLayout]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocateNode = useCallback((nodeId: string) => {
    const target = nodes.find(n => n.id === nodeId)
    if (target) {
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })))
      // 打开属性面板
      setPropertyPanelNode(target)
      setPropertyPanelOpen(true)
    }
  }, [nodes, setNodes])

  // ---- 证据追溯 ----
  const loadEvidence = async () => {
    if (!currentTreeId) {
      message.warning('请先保存故障树后再查看证据')
      return null
    }
    try {
      setEvidenceLoading(true)
      const data: any = await ftaApi.getEvidence(currentTreeId)
      setEvidenceData(data)
      return data
    } catch {
      message.error('加载证据失败')
      return null
    } finally {
      setEvidenceLoading(false)
    }
  }

  const handleNodeEvidence = async (nodeId: string) => {
    if (!currentTreeId) { message.warning('请先保存故障树'); return }
    const data = evidenceData || await loadEvidence()
    if (!data) return
    setEvidenceTarget({ type: 'node', id: nodeId })
    setEvidenceDrawerOpen(true)
  }

  const handleEdgeEvidence = async (edgeId: string) => {
    if (!currentTreeId) return
    const data = evidenceData || await loadEvidence()
    if (!data) return
    setEvidenceTarget({ type: 'edge', id: edgeId })
    setEvidenceDrawerOpen(true)
  }

  const handleEvidenceJump = async (docId: number, docName: string, chunkId?: number | null) => {
    if (!docId) { message.warning('无关联文档'); return }
    try {
      const res: any = await documentApi.getDocumentChunks(docId)
      setChunkPreview({ open: true, docId, docName: docName || res.filename, chunks: res.chunks || [], highlightChunkId: chunkId || null })
      if (chunkId) {
        setTimeout(() => {
          const el = document.getElementById(`chunk-${chunkId}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    } catch {
      message.error('加载文档片段失败')
    }
  }

  const handleExportEvidenceTable = async () => {
    const data = evidenceData || await loadEvidence()
    if (!data) return
    const nodeEv = data.node_evidence || {}
    const edgeEv = data.edge_evidence || {}

    const LEVEL_LABEL: Record<string, string> = { none: '无证据', single: '单证据', strong: '强证据', multi_doc: '多文档证据' }
    const TYPE_LABEL: Record<string, string> = {
      topEvent: '顶事件', middleEvent: '中间事件', basicEvent: '底事件',
      houseEvent: '外部事件', undevelopedEvent: '未展开事件',
      andGate: '与门', orGate: '或门', notGate: '非门', xorGate: '异或门',
      priorityAndGate: '优先与门', inhibitGate: '禁止门', votingGate: '表决门', transferSymbol: '转移符号',
    }

    let csv = '\uFEFF类型,ID,名称,节点/边类型,证据等级,来源数量,来源文档,置信度,证据文本\n'
    for (const nid of Object.keys(nodeEv)) {
      const ne = nodeEv[nid]
      const docs = (ne.sources || []).map((s: any) => s.document_name || '').filter(Boolean).join('; ')
      const confs = (ne.sources || []).map((s: any) => s.confidence ?? '').join('; ')
      const texts = (ne.sources || []).map((s: any) => (s.evidence_text || '').replace(/[\n\r,]/g, ' ').slice(0, 100)).join('; ')
      csv += `节点,${nid},"${ne.label}",${TYPE_LABEL[ne.node_type] || ne.node_type},${LEVEL_LABEL[ne.evidence_level] || ne.evidence_level},${(ne.sources || []).length},"${docs}","${confs}","${texts}"\n`
    }
    for (const eid of Object.keys(edgeEv)) {
      const ee = edgeEv[eid]
      const docs = (ee.sources || []).map((s: any) => s.document_name || '').filter(Boolean).join('; ')
      const confs = (ee.sources || []).map((s: any) => s.confidence ?? '').join('; ')
      const texts = (ee.sources || []).map((s: any) => (s.evidence_text || '').replace(/[\n\r,]/g, ' ').slice(0, 100)).join('; ')
      const relTypes = (ee.sources || []).map((s: any) => s.relation_type || '').join('; ')
      csv += `边,${eid},"${ee.source_node} → ${ee.target_node}","${relTypes}",${LEVEL_LABEL[ee.evidence_level] || ee.evidence_level},${(ee.sources || []).length},"${docs}","${confs}","${texts}"\n`
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `证据清单_${new Date().toLocaleDateString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success('证据清单已导出')
  }

  // 当前证据数据
  const currentEvidence = evidenceTarget
    ? evidenceTarget.type === 'node'
      ? evidenceData?.node_evidence?.[evidenceTarget.id]
      : evidenceData?.edge_evidence?.[evidenceTarget.id]
    : null

  const EVIDENCE_LEVEL_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    none: { color: '#d9d9d9', label: '无证据', icon: <WarningOutlined style={{ color: '#bfbfbf' }} /> },
    single: { color: '#faad14', label: '单证据', icon: <FileTextOutlined style={{ color: '#faad14' }} /> },
    strong: { color: '#52c41a', label: '强证据', icon: <SafetyCertificateOutlined style={{ color: '#52c41a' }} /> },
    multi_doc: { color: '#1890ff', label: '多文档证据', icon: <AuditOutlined style={{ color: '#1890ff' }} /> },
  }

  const handleExportImage = async () => {
    const currentNodes = getNodes()
    if (currentNodes.length === 0) {
      message.warning('画布为空，无法导出')
      return
    }

    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement
    if (!viewportEl) {
      message.error('导出失败：找不到画布元素')
      return
    }

    try {
      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: (node: Element) => {
          // 排除 minimap 和 controls
          if (node?.classList?.contains('react-flow__minimap')) return false
          if (node?.classList?.contains('react-flow__controls')) return false
          return true
        },
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `故障树_${new Date().toLocaleDateString()}.png`
      a.click()
      message.success('导出成功')
    } catch {
      message.error('导出失败')
    }
  }

  // ---- 多格式导出 ----
  const buildExportStructure = () => {
    const currentNodes = getNodes()
    if (currentNodes.length === 0) { message.warning('画布为空，无法导出'); return null }
    return {
      nodes: currentNodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      links: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    }
  }

  const handleExportJSON = () => {
    const structure = buildExportStructure()
    if (!structure) return
    const topNode = structure.nodes.find(n => n.type === 'topEvent')
    const json = JSON.stringify({
      format: 'fta-system-v1',
      name: (topNode?.data as any)?.label || '未命名故障树',
      exportedAt: new Date().toISOString(),
      treeId: currentTreeId,
      projectId: currentProjectId,
      structure,
    }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `故障树_${new Date().toLocaleDateString()}.json`; a.click()
    URL.revokeObjectURL(url)
    message.success('JSON 导出成功')
  }

  const handleExportOpenPSA = () => {
    const structure = buildExportStructure()
    if (!structure) return
    const topNode = structure.nodes.find(n => n.type === 'topEvent')
    const topName = (topNode?.data as any)?.label || 'TopEvent'
    // 构建 OpenPSA MEF XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<opsa-mef>\n  <define-fault-tree name="${topName}">\n`
    // 递归构建门和事件
    const nodeMap = new Map(structure.nodes.map(n => [n.id, n]))
    const childrenMap = new Map<string, string[]>()
    structure.links.forEach(l => {
      const kids = childrenMap.get(l.source) || []
      kids.push(l.target)
      childrenMap.set(l.source, kids)
    })
    const gateTypeMap: Record<string, string> = { andGate: 'and', orGate: 'or', notGate: 'not', xorGate: 'xor', priorityAndGate: 'and', inhibitGate: 'inhibit', votingGate: 'atleast' }
    const visited = new Set<string>()
    const emitNode = (id: string, indent: string): string => {
      if (visited.has(id)) return ''
      visited.add(id)
      const node = nodeMap.get(id)
      if (!node) return ''
      const label = ((node.data as any)?.label || id).replace(/[<>&"]/g, '_')
      const children = childrenMap.get(id) || []
      const isGate = node.type && gateTypeMap[node.type]
      if (isGate && children.length > 0) {
        const gateTag = gateTypeMap[node.type!]
        let out = `${indent}<define-gate name="${label}">\n${indent}  <${gateTag}>\n`
        children.forEach(cid => {
          const cnode = nodeMap.get(cid)
          if (!cnode) return
          const clabel = ((cnode.data as any)?.label || cid).replace(/[<>&"]/g, '_')
          const cchildren = childrenMap.get(cid) || []
          if (cnode.type && gateTypeMap[cnode.type] && cchildren.length > 0) {
            out += `${indent}    <gate name="${clabel}"/>\n`
          } else {
            out += `${indent}    <basic-event name="${clabel}"/>\n`
          }
        })
        out += `${indent}  </${gateTag}>\n${indent}</define-gate>\n`
        children.forEach(cid => { out += emitNode(cid, indent) })
        return out
      } else if (children.length === 0) {
        return `${indent}<define-basic-event name="${label}"/>\n`
      }
      return ''
    }
    if (topNode) xml += emitNode(topNode.id, '    ')
    xml += `  </define-fault-tree>\n</opsa-mef>\n`
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `故障树_${new Date().toLocaleDateString()}.xml`; a.click()
    URL.revokeObjectURL(url)
    message.success('OpenPSA XML 导出成功')
  }

  const handleExportCSV = () => {
    const structure = buildExportStructure()
    if (!structure) return
    let csv = '\uFEFF'  // BOM for Excel
    csv += '类型,ID,名称,层级\n'
    // BFS compute levels
    const childrenMap = new Map<string, string[]>()
    structure.links.forEach(l => {
      const kids = childrenMap.get(l.source) || []
      kids.push(l.target)
      childrenMap.set(l.source, kids)
    })
    const parentSet = new Set(structure.links.map(l => l.target))
    const roots = structure.nodes.filter(n => !parentSet.has(n.id))
    const levels = new Map<string, number>()
    const queue = roots.map(r => { levels.set(r.id, 0); return r.id })
    while (queue.length > 0) {
      const cur = queue.shift()!
      const lvl = levels.get(cur) || 0
      ;(childrenMap.get(cur) || []).forEach(cid => { if (!levels.has(cid)) { levels.set(cid, lvl + 1); queue.push(cid) } })
    }
    structure.nodes.forEach(n => {
      const label = ((n.data as any)?.label || '').replace(/,/g, '，')
      csv += `${LABEL_MAP[n.type || ''] || n.type},${n.id},${label},${levels.get(n.id) ?? '—'}\n`
    })
    csv += '\n边: 源ID,目标ID\n'
    structure.links.forEach(l => { csv += `${l.source},${l.target}\n` })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `故障树_${new Date().toLocaleDateString()}.csv`; a.click()
    URL.revokeObjectURL(url)
    message.success('CSV 导出成功')
  }

  const exportMenuItems = [
    { key: 'png', label: 'PNG 图片', icon: <ExportOutlined />, onClick: handleExportImage },
    { key: 'json', label: 'JSON 结构', icon: <FileTextOutlined />, onClick: handleExportJSON },
    { key: 'xml', label: 'OpenPSA XML', icon: <FileTextOutlined />, onClick: handleExportOpenPSA },
    { key: 'csv', label: 'CSV 表格', icon: <DownloadOutlined />, onClick: handleExportCSV },
  ]

  // ---- 导入故障树 ----
  const importFileRef = useRef<HTMLInputElement>(null)

  const parseOpenPSAXml = (xmlStr: string): { nodes: any[]; links: any[] } | null => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xmlStr, 'application/xml')
      if (doc.querySelector('parsererror')) return null

      const nodes: any[] = []
      const links: any[] = []
      let nodeIdx = 0
      const nameToId = new Map<string, string>()

      const gateTagToType: Record<string, string> = {
        and: 'andGate', or: 'orGate', not: 'notGate', xor: 'xorGate', atleast: 'votingGate', inhibit: 'inhibitGate',
      }

      const ensureNode = (name: string, type: string, depth: number) => {
        if (nameToId.has(name)) return nameToId.get(name)!
        const id = `imp_${nodeIdx++}`
        nameToId.set(name, id)
        nodes.push({ id, type, position: { x: 0, y: depth * 140 }, data: { label: name } })
        return id
      }

      // 遍历 define-gate
      const gates = doc.querySelectorAll('define-gate')
      gates.forEach((gate) => {
        const gateName = gate.getAttribute('name') || `gate_${nodeIdx}`
        // 判断门类型
        let gateType = 'orGate'
        for (const tag of Object.keys(gateTagToType)) {
          if (gate.querySelector(`:scope > ${tag}`)) { gateType = gateTagToType[tag]; break }
        }
        const depth = gate.closest('define-fault-tree') ? 1 : 2
        const gateId = ensureNode(gateName, gateType, depth)

        // 子元素
        const gateEl = gate.querySelector('and, or, not, xor, atleast, inhibit')
        if (gateEl) {
          gateEl.querySelectorAll(':scope > gate, :scope > basic-event, :scope > house-event, :scope > undeveloped-event').forEach(child => {
            const childName = child.getAttribute('name') || `node_${nodeIdx}`
            let childType = 'basicEvent'
            if (child.tagName === 'gate') childType = 'middleEvent'
            else if (child.tagName === 'house-event') childType = 'houseEvent'
            else if (child.tagName === 'undeveloped-event') childType = 'undevelopedEvent'
            const childId = ensureNode(childName, childType, depth + 1)
            links.push({ id: `e_${links.length}`, source: gateId, target: childId })
          })
        }
      })

      // 如果有 define-fault-tree name → 作为顶事件
      const ftEl = doc.querySelector('define-fault-tree')
      if (ftEl) {
        const topName = ftEl.getAttribute('name') || '顶事件'
        const topId = ensureNode(topName, 'topEvent', 0)
        // 链接到第一个 gate
        if (gates.length > 0) {
          const firstGateName = gates[0].getAttribute('name') || ''
          const firstGateId = nameToId.get(firstGateName)
          if (firstGateId && firstGateId !== topId) {
            links.push({ id: `e_${links.length}`, source: topId, target: firstGateId })
          }
        }
      }

      if (nodes.length === 0) return null
      return { nodes, links }
    } catch { return null }
  }

  const autoLayout = (structure: { nodes: any[]; links: any[] }) => {
    // 简单层级自动布局
    const childrenMap = new Map<string, string[]>()
    structure.links.forEach(l => {
      const kids = childrenMap.get(l.source) || []
      kids.push(l.target)
      childrenMap.set(l.source, kids)
    })
    const parentSet = new Set(structure.links.map(l => l.target))
    const roots = structure.nodes.filter(n => !parentSet.has(n.id))
    const levels = new Map<string, number>()
    const queue = roots.map(r => { levels.set(r.id, 0); return r.id })
    while (queue.length > 0) {
      const cur = queue.shift()!
      const lvl = levels.get(cur) || 0
      ;(childrenMap.get(cur) || []).forEach(cid => {
        if (!levels.has(cid)) { levels.set(cid, lvl + 1); queue.push(cid) }
      })
    }
    // 按层分组
    const byLevel = new Map<number, string[]>()
    structure.nodes.forEach(n => {
      const lv = levels.get(n.id) ?? 0
      const arr = byLevel.get(lv) || []
      arr.push(n.id)
      byLevel.set(lv, arr)
    })
    const nodeMap = new Map(structure.nodes.map(n => [n.id, n]))
    const H_GAP = 180, V_GAP = 140
    byLevel.forEach((ids, lv) => {
      const totalW = (ids.length - 1) * H_GAP
      const startX = 400 - totalW / 2
      ids.forEach((id, i) => {
        const node = nodeMap.get(id)
        if (node) node.position = { x: startX + i * H_GAP, y: lv * V_GAP }
      })
    })
    return structure
  }

  const handleImportTree = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (!content) { message.error('文件读取失败'); return }

      let imported: { nodes: any[]; links: any[] } | null = null
      const fileName = file.name.toLowerCase()

      // 解析 nodeList/linkList 格式（第三方FTA工具导出）
      const parseNodeListFormat = (json: any): { nodes: any[]; links: any[] } | null => {
        if (!json.nodeList || !Array.isArray(json.nodeList)) return null
        const typeMap: Record<string, string> = { '1': 'topEvent', '2': 'middleEvent', '3': 'basicEvent', '4': 'houseEvent', '5': 'undevelopedEvent' }
        const gateMap: Record<string, string> = { '1': 'andGate', '2': 'orGate', '3': 'xorGate', '4': 'votingGate', '5': 'priorityAndGate', '6': 'inhibitGate', '7': 'notGate' }
        // 先收集所有非底事件节点的 gate 类型
        const nodeGateType = new Map<string, string>()
        json.nodeList.forEach((n: any) => { if (n.gate) nodeGateType.set(n.id, n.gate) })
        // 解析链接（sourceId→targetId 表示子→父）
        const rawLinks: { childId: string; parentId: string }[] = (json.linkList || []).map((l: any) => ({
          childId: l.sourceId, parentId: l.targetId,
        }))
        // 哪些节点有子节点 → 需要插入门节点
        const childrenOfParent = new Map<string, string[]>()
        rawLinks.forEach(l => {
          const kids = childrenOfParent.get(l.parentId) || []
          kids.push(l.childId)
          childrenOfParent.set(l.parentId, kids)
        })
        const nodes: any[] = []
        const links: any[] = []
        let gateIdx = 0
        const SCALE = 1.6
        json.nodeList.forEach((n: any) => {
          const eventType = typeMap[n.type] || 'basicEvent'
          nodes.push({
            id: n.id,
            type: eventType,
            position: { x: (n.x || 0) * SCALE, y: (n.y || 0) * SCALE },
            data: {
              label: n.name || '未命名',
              ...(n.event?.probability ? { probability: n.event.probability } : {}),
              ...(n.event?.description ? { description: n.event.description } : {}),
            },
          })
        })
        // 为有子节点的父节点插入门节点
        childrenOfParent.forEach((children, parentId) => {
          const parentNode = json.nodeList.find((n: any) => n.id === parentId)
          const gt = parentNode?.gate || '2'
          const gateType = gateMap[gt] || 'orGate'
          const gateId = `gate_${gateIdx++}`
          const pn = nodes.find(n => n.id === parentId)
          const px = pn ? pn.position.x : 0
          const py = pn ? pn.position.y : 0
          nodes.push({
            id: gateId, type: gateType,
            position: { x: px, y: py + 70 },
            data: { label: LABEL_MAP[gateType] || gateType.replace('Gate', '').toUpperCase() },
          })
          links.push({ id: `e_${links.length}`, source: parentId, target: gateId })
          children.forEach(childId => {
            links.push({ id: `e_${links.length}`, source: gateId, target: childId })
          })
        })
        return { nodes, links }
      }

      // 通用 JSON 解析入口
      const tryParseJson = (text: string): { nodes: any[]; links: any[] } | null => {
        try {
          const json = JSON.parse(text)
          // fta-system-v1 格式
          if (json.format === 'fta-system-v1' && json.structure) return json.structure
          // nodeList/linkList 第三方格式
          if (json.nodeList) return parseNodeListFormat(json)
          // 通用 {nodes, links} 或 {nodes, edges}
          if (json.nodes && (json.links || json.edges)) return { nodes: json.nodes, links: json.links || json.edges }
          // {structure: {nodes, links}}
          if (json.structure?.nodes) return json.structure
          return null
        } catch { return null }
      }

      // 1. 尝试 JSON
      if (fileName.endsWith('.json')) {
        imported = tryParseJson(content)
        if (!imported) { message.error('JSON 格式无法识别'); return }
      }

      // 2. 尝试 XML (OpenPSA)
      else if (fileName.endsWith('.xml') || fileName.endsWith('.opsa')) {
        imported = parseOpenPSAXml(content)
        if (!imported) { message.error('XML 格式无法识别，请确认为 OpenPSA MEF 格式'); return }
      }

      // 3. 其他后缀尝试自动检测
      else {
        imported = tryParseJson(content) || parseOpenPSAXml(content)
        if (!imported) { message.error('无法识别的文件格式，支持 JSON / OpenPSA XML'); return }
      }

      if (!imported || imported.nodes.length === 0) {
        message.error('文件中未找到有效的故障树节点')
        return
      }

      // 补全节点字段
      imported.nodes = imported.nodes.map((n: any) => ({
        id: n.id || `n_${Math.random().toString(36).slice(2, 8)}`,
        type: n.type || 'basicEvent',
        position: n.position || { x: 0, y: 0 },
        data: n.data || { label: n.label || n.name || n.id || '未命名' },
      }))
      imported.links = (imported.links || []).map((e: any, i: number) => ({
        id: e.id || `e_${i}`,
        source: e.source,
        target: e.target,
      }))

      // 始终自动布局为树形
      autoLayout(imported)

      setNodes([])
      setEdges([])
      requestAnimationFrame(() => {
        setNodes(imported.nodes)
        requestAnimationFrame(() => { setEdges(imported.links) })
      })
      setCurrentTreeId(null) // 导入的是新树
      message.success(`成功导入 ${imported.nodes.length} 个节点、${imported.links.length} 条连线`)

      // 导入后自动保存为新故障树
      setTimeout(async () => {
        try {
          const topNode = imported!.nodes.find((n: any) => n.type === 'topEvent')
          const treeName = (topNode?.data as any)?.label || '导入的故障树'
          const structure = {
            nodes: imported!.nodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
            links: imported!.links.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
          }
          const result = (await ftaApi.createFaultTree({
            name: treeName,
            project_id: currentProjectId,
            structure,
          })) as any
          if (result.id) {
            setCurrentTreeId(result.id)
            navigate(`/editor/${result.id}`, { replace: true })
            message.success('已自动保存')
          }
        } catch { /* 静默 */ }
      }, 300)
    }
    reader.readAsText(file)
  }

  const eventItems = PALETTE_ITEMS.filter(i => i.category === 'event')
  const gateItems = PALETTE_ITEMS.filter(i => i.category === 'gate')

  // 右键菜单项
  const contextMenuItems = contextMenu ? [
    ...(contextMenu.nodeId ? [{ key: 'evidence', label: '查看证据', icon: <FileSearchOutlined /> }] : []),
    ...(contextMenu.nodeId ? [{ type: 'divider' as const }] : []),
    { key: 'copy', label: '复制', icon: <CopyOutlined />, extra: 'Ctrl+C' },
    { key: 'cut', label: '剪切', icon: <ScissorOutlined />, extra: 'Ctrl+X' },
    { key: 'paste', label: '粘贴', icon: <SnippetsOutlined />, extra: 'Ctrl+V', disabled: !clipboardRef.current },
    { type: 'divider' as const },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
  ] : []

  return (
    <div className="fta-editor">
      <div className="fta-editor-toolbar">
        <Space wrap size={4}>
          {/* 选择/拖拽模式切换 */}
          <Tooltip title={panMode ? '当前：拖拽模式（左键平移画布），点击切换为选择模式' : '当前：选择模式（左键框选），点击切换为拖拽模式'}>
            <Button
              size="small"
              type={panMode ? 'primary' : 'default'}
              icon={panMode ? <DragOutlined /> : <SelectOutlined />}
              onClick={() => setPanMode(m => !m)}
            >
              {panMode ? '拖拽' : '选择'}
            </Button>
          </Tooltip>
          <div className="toolbar-divider" />
          {/* 快捷连接开关 */}
          <Tooltip title="开启后，依次点击两个节点即可自动连线">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <LinkOutlined style={{ fontSize: 14, color: quickConnectEnabled ? 'var(--primary)' : 'var(--text-tertiary)' }} />
              <Switch
                size="small"
                checked={quickConnectEnabled}
                onChange={(v) => { setQuickConnectEnabled(v); setQuickConnectSource(null) }}
              />
              <span style={{ fontSize: 12, color: quickConnectEnabled ? 'var(--primary)' : 'var(--text-tertiary)' }}>快捷连接</span>
            </div>
          </Tooltip>
          <div className="toolbar-divider" />
          <Tooltip title="撤销 (Ctrl+Z)">
            <Button icon={<UndoOutlined />} size="small" onClick={handleUndo} />
          </Tooltip>
          <Tooltip title="重做 (Ctrl+Shift+Z)">
            <Button icon={<RedoOutlined />} size="small" onClick={handleRedo} />
          </Tooltip>
          <div className="toolbar-divider" />
          <Tooltip title="选中节点后删除">
            <Button danger icon={<DeleteOutlined />} size="small" onClick={handleDeleteNode}>
              删除
            </Button>
          </Tooltip>
          <div className="toolbar-divider" />
          <Tooltip title="自动树形布局">
            <Button icon={<ApartmentOutlined />} size="small" onClick={handleAutoLayout}>
              布局
            </Button>
          </Tooltip>
          <Tooltip title="居中对齐选中节点">
            <Button icon={<AlignCenterOutlined />} size="small" onClick={handleAlignCenter} />
          </Tooltip>
          <Tooltip title="水平等距分布">
            <Button icon={<ColumnWidthOutlined />} size="small" onClick={handleDistributeH} />
          </Tooltip>
          <Tooltip title="垂直等距分布">
            <Button icon={<ColumnHeightOutlined />} size="small" onClick={handleDistributeV} />
          </Tooltip>
          <div className="toolbar-divider" />
          {/* 连线样式 */}
          <Popover
            trigger="click"
            placement="bottomLeft"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}><DashOutlined style={{ marginRight: 6 }} />连线样式</span>}
            content={
              <div className="fta-edge-style-panel">
                <div className="fta-edge-style-row">
                  <span className="fta-edge-style-label">类型</span>
                  <Select size="small" value={edgeStyle.type} onChange={(v) => setEdgeStyle(s => ({ ...s, type: v }))}
                    options={EDGE_TYPE_OPTIONS} style={{ width: 100 }} />
                </div>
                <div className="fta-edge-style-row">
                  <span className="fta-edge-style-label">箭头</span>
                  <Select size="small" value={edgeStyle.markerEnd} onChange={(v) => setEdgeStyle(s => ({ ...s, markerEnd: v }))}
                    options={EDGE_MARKER_OPTIONS} style={{ width: 100 }} />
                </div>
                <div className="fta-edge-style-row">
                  <span className="fta-edge-style-label">粗细</span>
                  <Slider min={1} max={6} step={0.5} value={edgeStyle.strokeWidth}
                    onChange={(v) => setEdgeStyle(s => ({ ...s, strokeWidth: v }))}
                    style={{ width: 90, margin: '0 4px' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', minWidth: 20 }}>{edgeStyle.strokeWidth}</span>
                </div>
                <div className="fta-edge-style-row">
                  <span className="fta-edge-style-label">颜色</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {EDGE_COLORS.map(c => (
                      <div key={c} onClick={() => setEdgeStyle(s => ({ ...s, stroke: c }))}
                        style={{
                          width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer',
                          border: edgeStyle.stroke === c ? '2px solid var(--primary)' : '1px solid #d9d9d9',
                        }} />
                    ))}
                    <ColorPicker size="small" value={edgeStyle.stroke}
                      onChange={(_, hex) => setEdgeStyle(s => ({ ...s, stroke: hex }))} />
                  </div>
                </div>
                <div className="fta-edge-style-row">
                  <span className="fta-edge-style-label">动画</span>
                  <Switch size="small" checked={edgeStyle.animated}
                    onChange={(v) => setEdgeStyle(s => ({ ...s, animated: v }))} />
                </div>
                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8, marginTop: 8 }}>
                  <Button size="small" icon={<FormatPainterOutlined />} onClick={applyStyleToAllEdges} block>
                    应用到所有连线
                  </Button>
                </div>
              </div>
            }
          >
            <Tooltip title="连线样式设置">
              <Button icon={<DashOutlined />} size="small">
                连线
              </Button>
            </Tooltip>
          </Popover>
          <div className="toolbar-divider" />
          {/* 协同状态指示器 */}
          {currentProjectId && (
            <Badge status={wsConnected ? 'success' : 'default'} text={
              <span style={{ fontSize: 12 }}>
                {wsConnected ? (
                  <><TeamOutlined style={{ marginRight: 4 }} />{onlineCount} 人在线</>
                ) : '未连接'}
              </span>
            } />
          )}
        </Space>
        <Space size={4}>
          {/* 背景选择 */}
          <BgColorsOutlined style={{ color: 'var(--text-tertiary)', fontSize: 14 }} />
          <Segmented
            size="small"
            value={bgVariant}
            onChange={(v) => setBgVariant(v as string)}
            options={BG_OPTIONS}
          />
          <div className="toolbar-divider" />
          <Tooltip title="AI智能生成">
            <Button icon={<PlayCircleOutlined />} size="small" onClick={() => setIsGenerateModalOpen(true)}>
              AI生成
            </Button>
          </Tooltip>
          <Tooltip title="多文档联合建树">
            <Button icon={<ApartmentOutlined />} size="small" onClick={() => setMultiDocWizardOpen(true)} style={{ color: '#722ed1', borderColor: '#d3adf7' }}>
              联合建树
            </Button>
          </Tooltip>
          <Tooltip title="AI校验与修复">
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              loading={isValidating}
              onClick={handleValidate}
            >
              AI校验/修复
            </Button>
          </Tooltip>
          <div className="toolbar-divider" />
          <Tooltip title="版本历史">
            <Button icon={<HistoryOutlined />} size="small" onClick={loadVersions}>
              历史
            </Button>
          </Tooltip>
          <Button icon={<FolderOpenOutlined />} size="small" onClick={handleOpenSavedTrees}>
            打开
          </Button>
          <Button type="primary" icon={<SaveOutlined />} size="small" onClick={handleSave}>
            保存
          </Button>
          {lastAutoSave && <span style={{ fontSize: 10, color: '#999', marginLeft: -4 }}>自动保存 {lastAutoSave}</span>}
          <Popover
            trigger="click" placement="bottom"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}><SaveOutlined style={{ marginRight: 6 }} />自动保存设置</span>}
            content={
              <div style={{ width: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12 }}>启用自动保存</span>
                  <Switch size="small" checked={autoSaveEnabled} onChange={v => setAutoSaveEnabled(v)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12 }}>间隔(秒)</span>
                  <Select size="small" value={autoSaveInterval} onChange={v => setAutoSaveInterval(v)} style={{ width: 90 }}
                    options={[{ label: '30秒', value: 30 }, { label: '60秒', value: 60 }, { label: '120秒', value: 120 }, { label: '300秒', value: 300 }]} />
                </div>
              </div>
            }
          >
            <Tooltip title="自动保存设置">
              <Button size="small" icon={<ClockCircleOutlined />} type={autoSaveEnabled ? 'default' : 'text'}
                style={autoSaveEnabled ? { borderColor: '#52c41a', color: '#52c41a' } : {}} />
            </Tooltip>
          </Popover>
          <Tooltip title="导入故障树 (JSON / OpenPSA XML)">
            <Button icon={<UploadOutlined />} size="small" onClick={() => importFileRef.current?.click()}>
              导入
            </Button>
          </Tooltip>
          <input ref={importFileRef} type="file" accept=".json,.xml,.opsa" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImportTree(f); e.target.value = '' }} />
          <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
            <Tooltip title="导出故障树">
              <Button icon={<ExportOutlined />} size="small">导出</Button>
            </Tooltip>
          </Dropdown>
          <div className="toolbar-divider" />
          <Tooltip title="证据追溯 — 双击节点/边查看">
            <Button icon={<FileSearchOutlined />} size="small" loading={evidenceLoading} onClick={async () => { await loadEvidence(); message.success('证据数据已加载，双击节点或边查看详情') }}>
              证据
            </Button>
          </Tooltip>
          <Tooltip title="导出证据清单表 (CSV)">
            <Button icon={<DownloadOutlined />} size="small" onClick={handleExportEvidenceTable} />
          </Tooltip>
          {docComposition && docComposition.documents?.length > 0 && (
            <>
              <div className="toolbar-divider" />
              <Tooltip title="查看文档构成与贡献度">
                <Button icon={<BranchesOutlined />} size="small" onClick={() => setDocCompositionOpen(true)} style={{ color: '#722ed1' }}>
                  文档构成
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
      </div>

      <div className="fta-editor-body" style={{ position: 'relative' }}>
        {/* ---- 收起时的展开按钮 ---- */}
        {sidebarCollapsed && (
          <div className="fta-palette-expand-btn" onClick={() => setSidebarCollapsed(false)}
            title="展开元件面板">
            <RightOutlined />
          </div>
        )}
        {/* ---- 左侧元件面板 ---- */}
        <div className={`fta-palette ${sidebarCollapsed ? 'fta-palette-collapsed' : ''}`}>
          <div className="fta-palette-header">
            <span><AppstoreOutlined style={{ marginRight: 6 }} />元件面板</span>
            <Button type="text" size="small" onClick={() => setSidebarCollapsed(true)}
              style={{ fontSize: 11, padding: '0 4px' }}>
              ◀
            </Button>
          </div>
          {!sidebarCollapsed && (
            <div className="fta-palette-content">
              <div className="fta-palette-section">
                <div className="fta-palette-section-title">事件</div>
                <div className="fta-palette-grid">
                  {eventItems.map(item => (
                    <div
                      key={item.type}
                      className={`fta-palette-item ${pendingNodeType === item.type ? 'fta-palette-item-active' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, item.type)}
                      onClick={() => handlePaletteClick(item.type)}
                      title={`拖拽到画布或点击进入放置模式「${item.label}」`}
                    >
                      <div className="fta-palette-item-icon">{item.icon}</div>
                      <div className="fta-palette-item-label">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="fta-palette-section">
                <div className="fta-palette-section-title">逻辑门</div>
                <div className="fta-palette-grid">
                  {gateItems.map(item => (
                    <div
                      key={item.type}
                      className={`fta-palette-item ${pendingNodeType === item.type ? 'fta-palette-item-active' : ''}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, item.type)}
                      onClick={() => handlePaletteClick(item.type)}
                      title={`拖拽到画布或点击进入放置模式「${item.label}」`}
                    >
                      <div className="fta-palette-item-icon">{item.icon}</div>
                      <div className="fta-palette-item-label">{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="fta-palette-tip">
                拖拽元件到画布，或单击进入放置模式
              </div>
            </div>
          )}
        </div>

        {/* ---- 画布 ---- */}
        <div
          className="fta-editor-canvas"
          ref={reactFlowWrapper}
          style={{ cursor: pendingNodeType ? 'crosshair' : undefined }}
          onMouseMove={handlePaneMouseMove}
        >
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onPaneClick={handlePaneClick}
            onNodeClick={handleNodeClickForConnect}
            onNodeContextMenu={handleNodeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={buildEdgeProps(edgeStyle)}
            snapToGrid={snapToGrid}
            snapGrid={snapGrid}
            selectionOnDrag={!panMode}
            panOnDrag={panMode}
            selectionMode={SelectionMode.Partial}
            fitView
            deleteKeyCode={null}
          >
            {bgVariant !== 'none' && (
              <Background
                gap={bgVariant === 'dots' ? 20 : 16}
                size={bgVariant === 'dots' ? 1.5 : 1}
                color="#c0c4cc"
                variant={bgVariant as BackgroundVariant}
              />
            )}
            <Controls />
            <Panel position="bottom-left">
              <div className="fta-snap-toggle">
                <Switch size="small" checked={snapToGrid} onChange={setSnapToGrid} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>吸附网格</span>
              </div>
            </Panel>
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'topEvent') return '#ef4444'
                if (node.type === 'middleEvent') return '#f59e0b'
                if (node.type === 'basicEvent') return '#10b981'
                return '#94a3b8'
              }}
              maskColor="rgba(248,249,252,0.7)"
            />
          </ReactFlow>

          {/* 放置模式虚化预览 */}
          {pendingNodeType && (
            <div
              className="fta-ghost-preview"
              style={{ left: ghostPos.x, top: ghostPos.y }}
            >
              {PALETTE_ITEMS.find(p => p.type === pendingNodeType)?.icon}
              <div style={{ fontSize: 10, marginTop: 2 }}>{LABEL_MAP[pendingNodeType]}</div>
            </div>
          )}

          {/* 快捷连接源节点提示 */}
          {quickConnectEnabled && quickConnectSource && (
            <div className="fta-quick-connect-hint">
              <LinkOutlined /> 请点击目标节点完成连线（点自身取消）
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <Dropdown
          menu={{
            items: contextMenuItems,
            onClick: ({ key }) => {
              if (key === 'evidence' && contextMenu?.nodeId) { handleNodeEvidence(contextMenu.nodeId); setContextMenu(null) }
              else if (key === 'copy') handleCopy(false)
              else if (key === 'cut') handleCopy(true)
              else if (key === 'paste') handlePaste()
              else if (key === 'delete') {
                const selected = nodes.filter(n => n.selected)
                if (selected.length > 0) {
                  handleDeleteNode()
                } else if (contextMenu.nodeId) {
                  handleDeleteSpecificNode(contextMenu.nodeId)
                }
              }
            },
          }}
          open
          onOpenChange={(open) => { if (!open) setContextMenu(null) }}
        >
          <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, width: 1, height: 1 }} />
        </Dropdown>
      )}

      {/* 连线右键菜单 */}
      {edgeContextMenu && (
        <div
          className="fta-edge-context-menu"
          style={{ position: 'fixed', left: edgeContextMenu.x, top: edgeContextMenu.y, zIndex: 1000 }}
        >
          <div className="fta-ecm-title"><DashOutlined style={{ marginRight: 4 }} />连线样式</div>
          <div className="fta-ecm-row">
            <span className="fta-ecm-label">类型</span>
            <Select size="small" style={{ width: 90 }}
              value={(edges.find(e => e.id === edgeContextMenu.edgeId)?.type as string) || 'smoothstep'}
              options={EDGE_TYPE_OPTIONS}
              onChange={(v) => { updateEdgeStyle(edgeContextMenu.edgeId, { type: v as EdgeStyleConfig['type'] }); }} />
          </div>
          <div className="fta-ecm-row">
            <span className="fta-ecm-label">箭头</span>
            <Select size="small" style={{ width: 90 }}
              value={(() => {
                const me = edges.find(e => e.id === edgeContextMenu.edgeId)?.markerEnd
                if (!me) return 'none'
                return (me as any).type === MarkerType.ArrowClosed ? 'arrowclosed' : 'arrow'
              })()}
              options={EDGE_MARKER_OPTIONS}
              onChange={(v) => { updateEdgeStyle(edgeContextMenu.edgeId, { markerEnd: v as EdgeStyleConfig['markerEnd'] }); }} />
          </div>
          <div className="fta-ecm-row">
            <span className="fta-ecm-label">粗细</span>
            <Slider min={1} max={6} step={0.5} style={{ width: 80, margin: '0 4px' }}
              value={(edges.find(e => e.id === edgeContextMenu.edgeId)?.style as any)?.strokeWidth || 2}
              onChange={(v) => { updateEdgeStyle(edgeContextMenu.edgeId, { strokeWidth: v }); }} />
          </div>
          <div className="fta-ecm-row">
            <span className="fta-ecm-label">颜色</span>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {EDGE_COLORS.map(c => {
                const curStroke = (edges.find(e => e.id === edgeContextMenu.edgeId)?.style as any)?.stroke || '#64748b'
                return (
                  <div key={c} onClick={() => updateEdgeStyle(edgeContextMenu.edgeId, { stroke: c })}
                    style={{
                      width: 16, height: 16, borderRadius: 2, background: c, cursor: 'pointer',
                      border: curStroke === c ? '2px solid var(--primary)' : '1px solid #d9d9d9',
                    }} />
                )
              })}
            </div>
          </div>
          <div className="fta-ecm-row">
            <span className="fta-ecm-label">动画</span>
            <Switch size="small"
              checked={edges.find(e => e.id === edgeContextMenu.edgeId)?.animated || false}
              onChange={(v) => { updateEdgeStyle(edgeContextMenu.edgeId, { animated: v }); }} />
          </div>
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Button size="small" block icon={<FileSearchOutlined />}
              onClick={() => {
                const eid = edgeContextMenu.edgeId
                setEdgeContextMenu(null)
                handleEdgeEvidence(eid)
              }}>
              查看证据
            </Button>
            <Button size="small" danger block icon={<DeleteOutlined />}
              onClick={() => {
                setEdges(eds => eds.filter(e => e.id !== edgeContextMenu.edgeId))
                setEdgeContextMenu(null)
              }}>
              删除连线
            </Button>
          </div>
        </div>
      )}
      {edgeContextMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
          onClick={() => setEdgeContextMenu(null)} />
      )}

      {/* 放置模式提示条 */}
      {pendingNodeType && (
        <div className="fta-placement-bar">
          放置模式：点击画布放置「{LABEL_MAP[pendingNodeType]}」，按 ESC 取消
          <Button type="link" size="small" onClick={() => setPendingNodeType(null)} style={{ color: '#fff', marginLeft: 8 }}>取消</Button>
        </div>
      )}

      <Modal
        title={
          <span>
            <PlayCircleOutlined style={{ color: 'var(--primary)', marginRight: 8 }} />
            AI 智能生成故障树
          </span>
        }
        open={isGenerateModalOpen}
        onCancel={() => {
          if (!isGenerating) {
            setIsGenerateModalOpen(false)
          }
        }}
        onOk={() => form.submit()}
        confirmLoading={isGenerating}
        okText={isGenerating ? '生成中...' : '开始生成'}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleGenerate} style={{ marginTop: 16 }}>
          <Form.Item
            name="topEventName"
            label="顶事件名称"
            rules={[{ required: true, message: '请输入顶事件名称' }]}
          >
            <Input placeholder="例如：登机梯故障" size="large" />
          </Form.Item>
          <Form.Item name="description" label="故障描述">
            <Input.TextArea rows={3} placeholder="描述故障现象..." />
          </Form.Item>
          <Form.Item name="deviceType" label="设备类型">
            <Input placeholder="例如：登机梯系统" />
          </Form.Item>
        </Form>
        {isGenerating && (
          <div style={{ marginTop: 12, padding: '12px 0' }}>
            <div style={{ fontSize: 13, marginBottom: 6, color: 'var(--primary)', fontWeight: 500 }}>
              {generateProgress < 30 ? '🔍 正在分析故障模式...' : generateProgress < 60 ? '🧠 AI 正在构建故障树结构...' : generateProgress < 90 ? '📊 正在优化节点布局...' : '✅ 即将完成...'}
            </div>
            <Progress
              percent={Math.round(generateProgress)}
              status="active"
              strokeColor={{ '0%': '#6366f1', '100%': '#8b5cf6' }}
            />
          </div>
        )}
      </Modal>

      <Drawer
        title={<span style={{ fontWeight: 600 }}>已保存的故障树</span>}
        open={savedTreeDrawerOpen}
        onClose={() => setSavedTreeDrawerOpen(false)}
        width={420}
      >
        <List
          loading={loadingSavedTrees}
          dataSource={savedTrees}
          locale={{ emptyText: '暂无已保存的故障树' }}
          renderItem={(tree: any) => (
            <List.Item
              style={{
                borderRadius: 'var(--radius-md)',
                marginBottom: 8,
                padding: '12px 16px',
                border: currentTreeId === tree.id ? '1px solid var(--primary-border)' : '1px solid var(--border-light)',
                background: currentTreeId === tree.id ? 'var(--primary-bg)' : 'transparent',
                transition: 'all var(--transition-base)',
              }}
              actions={[
                <Button type="link" size="small" onClick={() => handleOpenTree(tree.id)}>
                  打开
                </Button>,
                <Popconfirm
                  title="确认删除此故障树？"
                  onConfirm={() => handleDeleteTree(tree.id)}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button type="link" size="small" danger>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span style={{ fontWeight: 500 }}>
                    {tree.name}
                    {currentTreeId === tree.id && (
                      <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>当前</Tag>
                    )}
                  </span>
                }
                description={
                  <Space size="small" style={{ marginTop: 4 }}>
                    <Tag style={{ fontSize: 11 }}>{tree.node_count || 0} 个节点</Tag>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {tree.created_at ? new Date(tree.created_at).toLocaleString() : ''}
                    </span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>

      {/* 版本历史抽屉 */}
      <Drawer
        title={<span style={{ fontWeight: 600 }}><HistoryOutlined style={{ marginRight: 8 }} />版本历史</span>}
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        width={420}
      >
        <Timeline
          items={
            loadingVersions
              ? [{ children: '加载中...' }]
              : versions.length === 0
                ? [{ children: '暂无版本历史，保存故障树后将自动记录' }]
                : versions.map((v: any) => ({
                    color: 'blue',
                    children: (
                      <div style={{
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 4,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>v{v.version}</span>
                          <Button
                            type="link"
                            size="small"
                            icon={<RollbackOutlined />}
                            onClick={() => handleRestoreVersion(v.id)}
                          >
                            回溯
                          </Button>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {v.change_summary}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                          <Tag style={{ fontSize: 11 }}>{v.node_count} 个节点</Tag>
                          <span>{v.created_at ? new Date(v.created_at).toLocaleString() : ''}</span>
                        </div>
                      </div>
                    ),
                  }))
          }
        />
      </Drawer>

      {validationResult && (
        <ValidationPanel
          data={validationResult}
          onClose={() => setValidationResult(null)}
          onLocateNode={handleLocateNode}
          onIgnoreIssue={handleIgnoreIssue}
          onAutoFix={handleAutoFix}
          onRevalidate={handleValidate}
          isFixing={isAutoFixing}
          fixProgress={fixProgress}
          ignoredIssues={ignoredIssues}
        />
      )}

      {/* ===== 证据追溯抽屉 ===== */}
      <Drawer
        title={
          <span style={{ fontWeight: 600 }}>
            <FileSearchOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />
            {evidenceTarget?.type === 'node' ? '节点证据追溯' : '边证据追溯'}
          </span>
        }
        open={evidenceDrawerOpen}
        onClose={() => { setEvidenceDrawerOpen(false); setEvidenceTarget(null) }}
        width={520}
      >
        {currentEvidence ? (
          <div className="fta-evidence-content">
            {/* ---- 证据等级标签 ---- */}
            {(() => {
              const lvl = EVIDENCE_LEVEL_CONFIG[currentEvidence.evidence_level] || EVIDENCE_LEVEL_CONFIG.none
              return (
                <Alert
                  type={currentEvidence.evidence_level === 'none' ? 'warning' : currentEvidence.evidence_level === 'single' ? 'info' : 'success'}
                  showIcon
                  icon={lvl.icon}
                  message={<span style={{ fontWeight: 600 }}>证据完整度：{lvl.label}</span>}
                  description={`共 ${(currentEvidence.sources || []).length} 条证据来源`}
                  style={{ marginBottom: 16, borderRadius: 8 }}
                />
              )
            })()}

            {/* ---- 节点基础信息 ---- */}
            {evidenceTarget?.type === 'node' && (
              <>
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="节点名称">{currentEvidence.label}</Descriptions.Item>
                  <Descriptions.Item label="节点类型">
                    <Tag color="blue">{LABEL_MAP[currentEvidence.node_type] || currentEvidence.node_type}</Tag>
                  </Descriptions.Item>
                  {currentEvidence.last_version && (
                    <Descriptions.Item label="最后修改">
                      v{currentEvidence.last_version.version} · {currentEvidence.last_version.changed_by} · {currentEvidence.last_version.created_at ? new Date(currentEvidence.last_version.created_at).toLocaleString() : ''}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* ---- 逻辑门详情 ---- */}
                {currentEvidence.gate_info && (
                  <Card size="small" title={<><BranchesOutlined style={{ marginRight: 6, color: '#1890ff' }} />{currentEvidence.gate_info.name}</>} style={{ marginBottom: 16, borderColor: '#91d5ff' }}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="含义">{currentEvidence.gate_info.description}</Descriptions.Item>
                      <Descriptions.Item label="逻辑公式"><code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{currentEvidence.gate_info.logic}</code></Descriptions.Item>
                      <Descriptions.Item label="适用标准"><Tag>{currentEvidence.gate_info.standard}</Tag></Descriptions.Item>
                      <Descriptions.Item label="使用场景">{currentEvidence.gate_info.usage}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </>
            )}

            {/* ---- 边特有信息 ---- */}
            {evidenceTarget?.type === 'edge' && (
              <>
                <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="连接">
                    {(() => {
                      const srcN = nodes.find(n => n.id === currentEvidence.source_node)
                      const tgtN = nodes.find(n => n.id === currentEvidence.target_node)
                      return `${(srcN?.data as any)?.label || currentEvidence.source_node} → ${(tgtN?.data as any)?.label || currentEvidence.target_node}`
                    })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="多文档共识">
                    {currentEvidence.is_multi_doc_consensus
                      ? <Tag color="green"><SafetyCertificateOutlined /> 是</Tag>
                      : <Tag>否</Tag>}
                  </Descriptions.Item>
                  {currentEvidence.has_conflict && (
                    <Descriptions.Item label="冲突">
                      <Alert type="error" message={currentEvidence.conflict_detail} showIcon style={{ padding: '4px 8px' }} />
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* 逻辑门判定依据 */}
                {currentEvidence.gate_basis && (
                  <Card size="small" title={<><BranchesOutlined style={{ marginRight: 6, color: '#1890ff' }} />逻辑门判定依据: {currentEvidence.gate_basis.name}</>} style={{ marginBottom: 16, borderColor: '#91d5ff' }}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="含义">{currentEvidence.gate_basis.description}</Descriptions.Item>
                      <Descriptions.Item label="逻辑公式"><code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{currentEvidence.gate_basis.logic}</code></Descriptions.Item>
                      <Descriptions.Item label="适用标准"><Tag>{currentEvidence.gate_basis.standard}</Tag></Descriptions.Item>
                    </Descriptions>
                  </Card>
                )}
              </>
            )}

            {/* ---- 证据来源列表 ---- */}
            <Divider orientation="left" style={{ fontSize: 13, margin: '12px 0' }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />证据来源
            </Divider>

            {(currentEvidence.sources || []).length === 0 ? (
              <Empty description="暂无关联证据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Tabs
                size="small"
                items={(currentEvidence.sources || []).map((src: any, idx: number) => ({
                  key: String(idx),
                  label: `来源 ${idx + 1}`,
                  children: (
                    <div style={{ fontSize: 13 }}>
                      {/* 节点来源 */}
                      {evidenceTarget?.type === 'node' && (
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="知识实体">{src.entity_name}</Descriptions.Item>
                          <Descriptions.Item label="实体类型"><Tag>{src.entity_type}</Tag></Descriptions.Item>
                          <Descriptions.Item label="抽取置信度">
                            <Progress percent={Math.round((src.confidence || 0) * 100)} size="small" style={{ width: 160 }}
                              strokeColor={src.confidence >= 0.8 ? '#52c41a' : src.confidence >= 0.5 ? '#faad14' : '#ff4d4f'} />
                          </Descriptions.Item>
                          {src.document_name && (
                            <Descriptions.Item label="来源文档">
                              <Button type="link" size="small" icon={<FileTextOutlined />} style={{ padding: 0 }}
                                onClick={() => handleEvidenceJump(src.document_id, src.document_name, src.chunk_id)}>
                                {src.document_name}
                              </Button>
                            </Descriptions.Item>
                          )}
                          {src.evidence_text && (
                            <Descriptions.Item label="来源片段">
                              <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.8, maxHeight: 120, overflow: 'auto', border: '1px solid #f0f0f0' }}>
                                {src.evidence_text}
                              </div>
                            </Descriptions.Item>
                          )}
                          {src.chunk_content && (
                            <Descriptions.Item label="文档 Chunk">
                              <div style={{ background: '#f6ffed', padding: '8px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.8, maxHeight: 120, overflow: 'auto', border: '1px solid #d9f7be' }}>
                                {src.chunk_content}
                              </div>
                              <Button type="link" size="small" style={{ padding: 0, marginTop: 4 }}
                                onClick={() => handleEvidenceJump(src.document_id, src.document_name, src.chunk_id)}>
                                跳转到文档 →
                              </Button>
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      )}
                      {/* 边来源 */}
                      {evidenceTarget?.type === 'edge' && (
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="关系">{src.source_entity} → {src.target_entity}</Descriptions.Item>
                          <Descriptions.Item label="关系类型"><Tag color="purple">{src.relation_type}</Tag></Descriptions.Item>
                          {src.logic_gate && (
                            <Descriptions.Item label="逻辑门"><Tag color="blue">{src.logic_gate}</Tag></Descriptions.Item>
                          )}
                          <Descriptions.Item label="置信度">
                            <Progress percent={Math.round((src.confidence || 0) * 100)} size="small" style={{ width: 160 }}
                              strokeColor={src.confidence >= 0.8 ? '#52c41a' : src.confidence >= 0.5 ? '#faad14' : '#ff4d4f'} />
                          </Descriptions.Item>
                          {src.document_name && (
                            <Descriptions.Item label="来源文档">
                              <Button type="link" size="small" icon={<FileTextOutlined />} style={{ padding: 0 }}
                                onClick={() => handleEvidenceJump(src.document_id, src.document_name)}>
                                {src.document_name}
                              </Button>
                            </Descriptions.Item>
                          )}
                          {src.evidence_text && (
                            <Descriptions.Item label="来源文本">
                              <div style={{ background: '#fafafa', padding: '8px 12px', borderRadius: 6, fontSize: 12, lineHeight: 1.8, maxHeight: 120, overflow: 'auto', border: '1px solid #f0f0f0' }}>
                                {src.evidence_text}
                              </div>
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        ) : (
          <Empty description="暂无证据数据，请先点击工具栏「证据」按钮加载" />
        )}
      </Drawer>

      {/* ===== 文档 Chunk 预览抽屉 ===== */}
      <Drawer
        title={<span style={{ fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8 }} />{chunkPreview.docName || '文档预览'}</span>}
        open={chunkPreview.open}
        onClose={() => setChunkPreview(p => ({ ...p, open: false }))}
        width={480}
      >
        {chunkPreview.chunks.length === 0 ? (
          <Empty description="该文档暂无分块数据" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chunkPreview.chunks.map((c: any) => (
              <Card
                key={c.id}
                size="small"
                title={<span style={{ fontSize: 12 }}>Chunk #{c.chunk_index} <Tag style={{ fontSize: 11 }}>{c.chunk_type}</Tag></span>}
                style={{
                  borderColor: c.id === chunkPreview.highlightChunkId ? '#1890ff' : '#f0f0f0',
                  background: c.id === chunkPreview.highlightChunkId ? '#e6f7ff' : '#fff',
                }}
                id={`chunk-${c.id}`}
              >
                <div style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                  {c.content}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Drawer>

      {/* ===== 节点属性面板 ===== */}
      <NodePropertyPanel
        open={propertyPanelOpen}
        node={propertyPanelNode}
        onClose={() => setPropertyPanelOpen(false)}
        onChange={handleNodePropertyChange}
      />

      {/* ===== 多文档联合建树向导 ===== */}
      <MultiDocWizard
        open={multiDocWizardOpen}
        projectId={currentProjectId}
        onClose={() => setMultiDocWizardOpen(false)}
        onGenerated={handleMultiDocGenerated}
      />

      {/* ===== 文档构成与贡献度面板 ===== */}
      <DocCompositionPanel
        open={docCompositionOpen}
        onClose={() => setDocCompositionOpen(false)}
        composition={docComposition}
      />
    </div>
  )
}

// 需要 ReactFlowProvider 包裹才能使用 useReactFlow
const Editor: React.FC = () => {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  )
}

export default Editor
