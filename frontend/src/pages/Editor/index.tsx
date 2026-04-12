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
import { Button, Space, Card, Input, Form, Modal, message, Tooltip, Drawer, List, Tag, Popconfirm, Badge, Timeline, Progress, Segmented, Switch, Dropdown, Popover, Select, Slider, ColorPicker } from 'antd'
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
} from '@ant-design/icons'
import type { Connection, Node, Edge } from '@xyflow/react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { ftaApi, collabApi } from '@/services/api'
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
  const [validationResult, setValidationResult] = useState<any>(null)
  const [currentTreeId, setCurrentTreeId] = useState<number | null>(null)
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null)
  const [form] = Form.useForm()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { getNodes, screenToFlowPosition } = useReactFlow()

  // 已保存故障树列表
  const [savedTreeDrawerOpen, setSavedTreeDrawerOpen] = useState(false)
  const [savedTrees, setSavedTrees] = useState<any[]>([])
  const [loadingSavedTrees, setLoadingSavedTrees] = useState(false)

  // 版本历史
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [versions, setVersions] = useState<any[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  // 协同工作 WebSocket
  const { token, user } = useAuthStore()
  const isRemoteUpdate = useRef(false)

  const { connected: wsConnected, onlineCount, sendTreeUpdate } = useCollabWs({
    projectId: currentProjectId,
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
        setNodes(remoteNodes)
        setEdges(remoteEdges)
        message.info(`${msg.from} 更新了故障树`, 2)
        setTimeout(() => { isRemoteUpdate.current = false }, 100)
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

  useEffect(() => {
    if (treeId) {
      loadFaultTree(treeId)
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

  // 给节点注入 onLabelChange / onSizeChange 回调
  const nodesWithCallbacks = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
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
  }))

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
        setNodes(loadedNodes)
        setEdges(loadedEdges)
        setCurrentTreeId(data.id)
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

  // ---- 快捷连接: 点两个节点自动连线 ----
  const handleNodeClickForConnect = useCallback((_event: React.MouseEvent, node: Node) => {
    setContextMenu(null)
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
    if (currentNodes.length === 0) { message.warning('画布为空'); return }
    // 构建邻接表
    const children: Record<string, string[]> = {}
    const hasParent = new Set<string>()
    currentNodes.forEach(n => { children[n.id] = [] })
    edges.forEach(e => {
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
  }, [edges, getNodes, setNodes])

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 不在输入框中时才响应
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey) {
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
        setNodes(genNodes)
        setEdges(genEdges)
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

  const handleValidate = async () => {
    try {
      setIsValidating(true)
      const structure = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          data: n.data,
          name: (n.data as any)?.label,
        })),
        links: edges.map((e) => ({
          source: e.source,
          target: e.target,
        })),
      }
      const result: any = await ftaApi.validateFaultTree(structure)
      setValidationResult(result)
      if (result.is_valid) {
        message.success('校验通过')
      } else {
        message.warning(`发现 ${result.issues?.length || 0} 个问题`)
      }
    } catch {
      message.error('校验失败')
    } finally {
      setIsValidating(false)
    }
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

  const eventItems = PALETTE_ITEMS.filter(i => i.category === 'event')
  const gateItems = PALETTE_ITEMS.filter(i => i.category === 'gate')

  // 右键菜单项
  const contextMenuItems = contextMenu ? [
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
          <Tooltip title="结构校验">
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              loading={isValidating}
              onClick={handleValidate}
            >
              校验
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
          <Tooltip title="导出为PNG图片">
            <Button icon={<ExportOutlined />} size="small" onClick={handleExportImage} />
          </Tooltip>
        </Space>
      </div>

      <div className="fta-editor-body">
        {/* ---- 左侧元件面板 ---- */}
        <div className={`fta-palette ${sidebarCollapsed ? 'fta-palette-collapsed' : ''}`}>
          <div className="fta-palette-header">
            <span><AppstoreOutlined style={{ marginRight: 6 }} />元件面板</span>
            <Button type="text" size="small" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{ fontSize: 11, padding: '0 4px' }}>
              {sidebarCollapsed ? '▶' : '◀'}
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
              if (key === 'copy') handleCopy(false)
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
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, marginTop: 6 }}>
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

      {validationResult && !validationResult.is_valid && (
        <div className="validation-panel">
          <Card
            title={
              <span style={{ fontSize: 14 }}>
                <CheckCircleOutlined style={{ color: 'var(--warning)', marginRight: 8 }} />
                校验结果
              </span>
            }
            size="small"
            extra={
              <Button type="link" size="small" onClick={() => setValidationResult(null)}>
                关闭
              </Button>
            }
          >
            {validationResult.issues?.map((issue: any, index: number) => (
              <div
                key={index}
                style={{
                  color: issue.severity === 'ERROR' ? 'var(--danger)' : 'var(--warning)',
                  marginBottom: 6,
                  fontSize: 13,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{
                  background: issue.severity === 'ERROR' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                  padding: '0 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {issue.severity}
                </span>
                <span>{issue.message}</span>
              </div>
            ))}
            {validationResult.suggestions?.length > 0 && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>优化建议</div>
                {validationResult.suggestions.map((s: any, i: number) => (
                  <div key={i} style={{ color: 'var(--primary)', marginBottom: 4, fontSize: 13 }}>
                    {s.description}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
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
