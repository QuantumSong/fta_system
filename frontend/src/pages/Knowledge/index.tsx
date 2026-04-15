import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Card, Table, Input, Button, Tag, Space, message, Modal, Form, Select,
  Descriptions, Drawer, Progress, Tabs, Upload, Spin, Empty,
  Statistic, Alert, Divider, Segmented, Tooltip, Slider, Popconfirm, InputNumber,
} from 'antd'
import {
  SearchOutlined, ReloadOutlined, EyeOutlined, PlusOutlined, EditOutlined,
  DeleteOutlined, NodeIndexOutlined, TagsOutlined, ApiOutlined,
  UploadOutlined, FileTextOutlined, ExperimentOutlined, CloudUploadOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  BranchesOutlined, FileWordOutlined, FilePdfOutlined, FileExcelOutlined,
  AimOutlined, ExpandOutlined, InfoCircleOutlined, GlobalOutlined,
  ZoomInOutlined, ZoomOutOutlined, CompressOutlined,
  ApartmentOutlined, RadarChartOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force'
import { knowledgeApi, extractionApi, documentApi, projectApi } from '@/services/api'

/* ===================== 类型映射 ===================== */
const typeMap: Record<string, { color: string; text: string }> = {
  TOP_EVENT: { color: 'red', text: '顶事件' },
  MIDDLE_EVENT: { color: 'orange', text: '中间事件' },
  BASIC_EVENT: { color: 'green', text: '底事件' },
  SYSTEM: { color: 'geekblue', text: '系统' },
  SUBSYSTEM: { color: 'cyan', text: '子系统' },
  DEVICE: { color: 'blue', text: '设备' },
  COMPONENT: { color: 'purple', text: '部件' },
  FAULT_MODE: { color: 'volcano', text: '故障模式' },
  FAULT_CODE: { color: 'magenta', text: '故障代码' },
  PARAMETER: { color: 'lime', text: '监控参数' },
  MAINTENANCE_ACTION: { color: 'gold', text: '维修措施' },
}

const relTypeMap: Record<string, { color: string; text: string }> = {
  CAUSES: { color: 'volcano', text: '因果' },
  AND_GATE: { color: 'magenta', text: '与门' },
  OR_GATE: { color: 'gold', text: '或门' },
  PART_OF: { color: 'geekblue', text: '组成' },
  LOCATED_AT: { color: 'cyan', text: '位置' },
  HAS_FAULT_MODE: { color: 'red', text: '故障模式' },
  HAS_FAULT_CODE: { color: 'purple', text: '故障代码' },
  MONITORED_BY: { color: 'lime', text: '监控' },
  REPAIRED_BY: { color: 'green', text: '维修' },
}

const statusIcon = (s: string) => {
  if (s === 'completed') return <CheckCircleOutlined style={{ color: 'var(--success)' }} />
  if (s === 'processing') return <ClockCircleOutlined style={{ color: 'var(--warning)' }} spin />
  if (s === 'failed') return <CloseCircleOutlined style={{ color: 'var(--danger)' }} />
  return <ClockCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
}

const fileIcon = (t: string) => {
  if (t === 'pdf') return <FilePdfOutlined style={{ color: '#e53e3e' }} />
  if (t === 'docx') return <FileWordOutlined style={{ color: '#2b6cb0' }} />
  if (t === 'xlsx' || t === 'xls') return <FileExcelOutlined style={{ color: '#276749' }} />
  return <FileTextOutlined style={{ color: 'var(--text-secondary)' }} />
}

/* ===================== 知识图谱 SVG 可视化 (d3-force) ===================== */
const NODE_COLORS: Record<string, string> = {
  TOP_EVENT: '#ef4444', MIDDLE_EVENT: '#f59e0b', BASIC_EVENT: '#22c55e',
  SYSTEM: '#6366f1', SUBSYSTEM: '#8b5cf6',
  DEVICE: '#3b82f6', COMPONENT: '#14b8a6',
  FAULT_MODE: '#ec4899', FAULT_CODE: '#f43f5e',
  PARAMETER: '#0ea5e9', MAINTENANCE_ACTION: '#84cc16',
}
const NODE_RADIUS: Record<string, number> = {
  TOP_EVENT: 26, MIDDLE_EVENT: 22, BASIC_EVENT: 18,
  SYSTEM: 24, SUBSYSTEM: 22, DEVICE: 20, COMPONENT: 18,
  FAULT_MODE: 16, FAULT_CODE: 14, PARAMETER: 16, MAINTENANCE_ACTION: 16,
}

type LayoutMode = 'force' | 'circular' | 'hierarchical' | 'grid'

interface GraphCanvasProps {
  nodes: any[]
  edges: any[]
  onNodeClick?: (node: any) => void
  onExpandNode?: (node: any) => void
  selectedNodeId?: number | null
}

const KnowledgeGraphCanvas: React.FC<GraphCanvasProps> = ({ nodes, edges, onNodeClick, selectedNodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const [positions, setPositions] = useState<Map<number, { x: number; y: number }>>(new Map())
  const [hoverNode, setHoverNode] = useState<any | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force')
  const [linkStrength, setLinkStrength] = useState(180)
  // zoom/pan state
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  // drag node
  const dragInfo = useRef<{ id: number | null; moved: boolean }>({ id: null, moved: false })
  const dragStart = useRef({ mx: 0, my: 0, nx: 0, ny: 0 })

  const H = 560

  // 连接集合(用于高亮)
  const connectedIds = useCallback((nodeId: number | null | undefined): Set<number> => {
    if (nodeId == null) return new Set()
    const ids = new Set<number>([nodeId])
    edges.forEach((e: any) => {
      if (e.source === nodeId) ids.add(e.target)
      if (e.target === nodeId) ids.add(e.source)
    })
    return ids
  }, [edges])

  // 计算布局
  useEffect(() => {
    if (!nodes.length) return
    const cW = containerRef.current?.clientWidth || 900
    const cH = H
    const map = new Map<number, { x: number; y: number }>()

    if (layoutMode === 'force') {
      // d3-force simulation
      type SimNode = { id: number; x: number; y: number; vx: number; vy: number; index?: number }
      type SimLink = { source: number; target: number }
      const simNodes: SimNode[] = nodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length
        const r = Math.min(cW, cH) * 0.3
        return { id: n.id, x: cW / 2 + r * Math.cos(angle), y: cH / 2 + r * Math.sin(angle), vx: 0, vy: 0 }
      })
      const simLinks: SimLink[] = edges.map((e: any) => ({ source: e.source, target: e.target }))
        .filter((l: SimLink) => simNodes.some(n => n.id === l.source) && simNodes.some(n => n.id === l.target))

      const nodeById = new Map(simNodes.map(n => [n.id, n]))
      const sim = forceSimulation(simNodes)
        .force('charge', forceManyBody().strength(-Math.max(300, nodes.length * 8)))
        .force('link', forceLink(simLinks).id((d: any) => d.id).distance(linkStrength).strength(0.4))
        .force('center', forceCenter(cW / 2, cH / 2))
        .force('collide', forceCollide().radius(40))
        .force('x', forceX(cW / 2).strength(0.04))
        .force('y', forceY(cH / 2).strength(0.04))
        .stop()

      for (let i = 0; i < 300; i++) sim.tick()
      simNodes.forEach(sn => {
        const n = nodeById.get(sn.id) || sn
        map.set(sn.id, { x: n.x, y: n.y })
      })
    } else if (layoutMode === 'circular') {
      const cx = cW / 2, cy = cH / 2
      const r = Math.min(cW, cH) * 0.38
      nodes.forEach((n: any, i: number) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
        map.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
      })
    } else if (layoutMode === 'hierarchical') {
      // 分层: 按类型分层 TOP→MIDDLE→BASIC/DEVICE/COMPONENT
      const layers: Record<string, any[]> = { TOP_EVENT: [], MIDDLE_EVENT: [], BASIC_EVENT: [], DEVICE: [], COMPONENT: [], OTHER: [] }
      nodes.forEach((n: any) => {
        const key = layers[n.type] ? n.type : 'OTHER'
        layers[key].push(n)
      })
      const order = ['TOP_EVENT', 'MIDDLE_EVENT', 'BASIC_EVENT', 'DEVICE', 'COMPONENT', 'OTHER']
      const activeRows = order.filter(k => layers[k].length > 0)
      const rowH = cH / (activeRows.length + 1)
      activeRows.forEach((key, ri) => {
        const row = layers[key]
        const rowW = cW / (row.length + 1)
        row.forEach((n: any, ci: number) => {
          map.set(n.id, { x: rowW * (ci + 1), y: rowH * (ri + 1) })
        })
      })
    } else if (layoutMode === 'grid') {
      const cols = Math.ceil(Math.sqrt(nodes.length))
      const cellW = cW / (cols + 1)
      const cellH = cH / (Math.ceil(nodes.length / cols) + 1)
      nodes.forEach((n: any, i: number) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        map.set(n.id, { x: cellW * (col + 1), y: cellH * (row + 1) })
      })
    }

    setPositions(map)
    // reset transform on layout change
    setTransform({ x: 0, y: 0, k: 1 })
  }, [nodes, edges, layoutMode, linkStrength])

  const activeId = selectedNodeId ?? hoverNode?.id ?? null
  const highlighted = useMemo(() => connectedIds(activeId), [activeId, connectedIds])
  const hasActive = activeId != null

  // --- zoom ---
  const handleWheel = useCallback((ev: React.WheelEvent) => {
    ev.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top
    const dir = ev.deltaY < 0 ? 1.08 : 1 / 1.08
    setTransform(t => {
      const nk = Math.min(5, Math.max(0.15, t.k * dir))
      return { k: nk, x: mx - (mx - t.x) * (nk / t.k), y: my - (my - t.y) * (nk / t.k) }
    })
  }, [])

  // --- pan ---
  const handleBgPointerDown = useCallback((ev: React.PointerEvent) => {
    if ((ev.target as SVGElement).closest('.kg-node')) return
    isPanning.current = true
    panStart.current = { x: ev.clientX, y: ev.clientY, tx: transform.x, ty: transform.y }
    ;(ev.target as SVGElement).setPointerCapture(ev.pointerId)
  }, [transform])

  const handlePointerMove = useCallback((ev: React.PointerEvent) => {
    if (dragInfo.current.id !== null) {
      dragInfo.current.moved = true
      const dx = (ev.clientX - dragStart.current.mx) / transform.k
      const dy = (ev.clientY - dragStart.current.my) / transform.k
      setPositions(prev => {
        const next = new Map(prev)
        next.set(dragInfo.current.id!, { x: dragStart.current.nx + dx, y: dragStart.current.ny + dy })
        return next
      })
      return
    }
    if (!isPanning.current) return
    const dx = ev.clientX - panStart.current.x
    const dy = ev.clientY - panStart.current.y
    setTransform(t => ({ ...t, x: panStart.current.tx + dx, y: panStart.current.ty + dy }))
  }, [transform.k])

  const handlePointerUp = useCallback(() => {
    if (dragInfo.current.id !== null) {
      if (!dragInfo.current.moved) {
        const node = nodes.find((n: any) => n.id === dragInfo.current.id)
        if (node) onNodeClick?.(node)
      }
      dragInfo.current = { id: null, moved: false }
    }
    isPanning.current = false
  }, [nodes, onNodeClick])

  // --- node drag ---
  const handleNodePointerDown = useCallback((ev: React.PointerEvent, n: any) => {
    ev.stopPropagation()
    dragInfo.current = { id: n.id, moved: false }
    const pos = positions.get(n.id)
    dragStart.current = { mx: ev.clientX, my: ev.clientY, nx: pos?.x || 0, ny: pos?.y || 0 }
    ;(ev.target as SVGElement).setPointerCapture(ev.pointerId)
  }, [positions])

  // --- hover ---
  const handleNodeEnter = useCallback((ev: React.MouseEvent, n: any) => {
    setHoverNode(n)
    setHoverPos({ x: ev.clientX, y: ev.clientY - 50 })
  }, [])
  const handleNodeLeave = useCallback(() => setHoverNode(null), [])

  // --- zoom controls ---
  const zoomIn = () => setTransform(t => ({ ...t, k: Math.min(5, t.k * 1.3) }))
  const zoomOut = () => setTransform(t => ({ ...t, k: Math.max(0.15, t.k / 1.3) }))
  const zoomFit = () => setTransform({ x: 0, y: 0, k: 1 })

  if (!nodes.length) {
    return <Empty description="暂无知识图谱数据，请先上传文档并执行知识抽取" style={{ padding: 60 }} />
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: H, background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
      <svg
        ref={svgRef}
        width="100%" height={H}
        style={{ display: 'block', cursor: isPanning.current ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          <marker id="kg-arrow" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M0,0 L10,4 L0,8 L3,4 Z" fill="#94a3b8" />
          </marker>
          <marker id="kg-arrow-hl" markerWidth="10" markerHeight="8" refX="10" refY="4" orient="auto">
            <path d="M0,0 L10,4 L0,8 L3,4 Z" fill="#6366f1" />
          </marker>
          <filter id="kg-shadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
          </filter>
        </defs>
        <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* 边 */}
          {edges.map((e: any, i: number) => {
            const a = positions.get(e.source)
            const b = positions.get(e.target)
            if (!a || !b) return null
            const isHL = hasActive && highlighted.has(e.source) && highlighted.has(e.target)
            const dimmed = hasActive && !isHL
            const label = relTypeMap[e.type]?.text || e.type
            // Offset midpoint slightly for curved look
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
            const dx = b.x - a.x, dy = b.y - a.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const nx = -dy / len, ny = dx / len
            const curve = Math.min(30, len * 0.1)
            const cx1 = mx + nx * curve, cy1 = my + ny * curve
            return (
              <g key={`edge-${i}`} opacity={dimmed ? 0.12 : 1}>
                <path
                  d={`M${a.x},${a.y} Q${cx1},${cy1} ${b.x},${b.y}`}
                  fill="none"
                  stroke={isHL ? '#6366f1' : '#cbd5e1'}
                  strokeWidth={isHL ? 2.5 : 1.5}
                  markerMid={isHL ? 'url(#kg-arrow-hl)' : 'url(#kg-arrow)'}
                />
                {(!dimmed) && (
                  <text
                    x={cx1} y={cy1 - 6}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isHL ? 600 : 400}
                    fill={isHL ? '#4f46e5' : '#94a3b8'}
                    style={{ userSelect: 'none' }}
                  >
                    {label}
                  </text>
                )}
              </g>
            )
          })}
          {/* 节点 */}
          {nodes.map((n: any) => {
            const p = positions.get(n.id)
            if (!p) return null
            const isSelected = n.id === selectedNodeId
            const isHL = hasActive ? highlighted.has(n.id) : true
            const color = NODE_COLORS[n.type] || '#64748b'
            const r = NODE_RADIUS[n.type] || 18
            const displayName = n.name.length > 10 ? n.name.slice(0, 9) + '…' : n.name
            return (
              <g
                key={n.id}
                className="kg-node"
                opacity={isHL ? 1 : 0.15}
                style={{ cursor: 'pointer' }}
                onPointerDown={(ev) => handleNodePointerDown(ev, n)}
                onMouseEnter={(ev) => handleNodeEnter(ev, n)}
                onMouseLeave={handleNodeLeave}
              >
                {isSelected && (
                  <circle cx={p.x} cy={p.y} r={r + 8} fill="rgba(99,102,241,0.12)" stroke="#6366f1" strokeWidth="2" strokeDasharray="5 3" />
                )}
                <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={isSelected ? '#6366f1' : '#fff'}
                  strokeWidth={isSelected ? 3 : 2} filter="url(#kg-shadow)" />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {displayName.length > 4 ? displayName.slice(0, 4) : displayName}
                </text>
                <text x={p.x} y={p.y + r + 16} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1e293b"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {displayName}
                </text>
                <text x={p.x} y={p.y + r + 29} textAnchor="middle" fontSize="10" fill="#94a3b8"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {typeMap[n.type]?.text || n.type}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* 悬浮提示 */}
      {hoverNode && dragInfo.current.id === null && (
        <div style={{
          position: 'fixed', left: hoverPos.x, top: hoverPos.y,
          background: 'rgba(15,23,42,0.92)', color: '#fff', padding: '10px 16px',
          borderRadius: 10, fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
          transform: 'translateX(-50%)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 10,
          border: '1px solid rgba(255,255,255,0.1)', maxWidth: 320,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{hoverNode.name}</div>
          <div style={{ opacity: 0.85 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: NODE_COLORS[hoverNode.type] || '#64748b', marginRight: 6, verticalAlign: 'middle' }} />
            {typeMap[hoverNode.type]?.text || hoverNode.type} · 点击查看详情
          </div>
          {hoverNode.description && <div style={{ opacity: 0.6, marginTop: 4, whiteSpace: 'normal', lineHeight: 1.5 }}>{hoverNode.description}</div>}
        </div>
      )}

      {/* 顶部工具栏 */}
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Segmented
          size="small"
          value={layoutMode}
          onChange={(v) => setLayoutMode(v as LayoutMode)}
          options={[
            { label: <Tooltip title="力导向布局"><span><BranchesOutlined /> 力导向</span></Tooltip>, value: 'force' },
            { label: <Tooltip title="环形布局"><span><RadarChartOutlined /> 环形</span></Tooltip>, value: 'circular' },
            { label: <Tooltip title="层次布局"><span><ApartmentOutlined /> 层次</span></Tooltip>, value: 'hierarchical' },
            { label: <Tooltip title="网格布局"><span><AppstoreOutlined /> 网格</span></Tooltip>, value: 'grid' },
          ]}
        />
        {layoutMode === 'force' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.92)', padding: '2px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>间距</span>
            <Slider min={80} max={350} step={10} value={linkStrength} onChange={setLinkStrength}
              style={{ width: 80, margin: '0 4px' }} />
          </div>
        )}
      </div>

      {/* 右上缩放控制 */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
        <Tooltip title="放大"><Button size="small" icon={<ZoomInOutlined />} onClick={zoomIn} /></Tooltip>
        <Tooltip title="缩小"><Button size="small" icon={<ZoomOutOutlined />} onClick={zoomOut} /></Tooltip>
        <Tooltip title="适应画布"><Button size="small" icon={<CompressOutlined />} onClick={zoomFit} /></Tooltip>
        <div style={{ background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#64748b', lineHeight: '24px', border: '1px solid #e2e8f0' }}>
          {Math.round(transform.k * 100)}%
        </div>
      </div>

      {/* 图例 */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 12, fontSize: 11, background: 'rgba(255,255,255,0.92)', padding: '6px 14px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
        {Object.entries(NODE_COLORS).map(([k, c]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c }} />
            {typeMap[k]?.text || k}
          </span>
        ))}
      </div>

      {/* 操作提示 */}
      <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.9)', padding: '4px 10px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
        滚轮缩放 · 拖拽平移画布 · 拖拽节点移动 · 点击查看详情
      </div>
    </div>
  )
}

/* ===================== 主组件 ===================== */
const Knowledge: React.FC = () => {
  const [activeTab, setActiveTab] = useState('extraction')
  // 抽取 tab
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined)
  const [scopeMode, setScopeMode] = useState<'global' | 'project'>('global')
  const [documents, setDocuments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [, setExtractionTaskId] = useState<string | null>(null)
  const [extractionProgress, setExtractionProgress] = useState<{ total: number; completed: number; current_doc: string; status: string; details: any[] } | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textResult, setTextResult] = useState<any>(null)
  const [textExtracting, setTextExtracting] = useState(false)
  const [textProgress, setTextProgress] = useState(0)
  // 文档管理
  const [editingDoc, setEditingDoc] = useState<any>(null)
  const [editDocForm] = Form.useForm()
  // 实体 tab
  const [entities, setEntities] = useState<any[]>([])
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<any>(null)
  const [entityRelations, setEntityRelations] = useState<any[]>([])
  const [form] = Form.useForm()
  // 图谱 tab
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] }>({ nodes: [], edges: [] })
  const [graphLoading, setGraphLoading] = useState(false)
  const [kgStats, setKgStats] = useState<any>(null)
  const [selectedGraphNode, setSelectedGraphNode] = useState<any | null>(null)
  const [graphNodeDetail, setGraphNodeDetail] = useState<any | null>(null)
  const [graphNodeRelations, setGraphNodeRelations] = useState<any[]>([])
  const [expandedNodeId, setExpandedNodeId] = useState<number | null>(null)

  const effectiveProjectId = scopeMode === 'project' ? selectedProject : undefined

  useEffect(() => { loadProjects() }, [])

  const loadProjects = async () => {
    try {
      const data: any = await projectApi.getProjects()
      setProjects(data.projects || [])
    } catch { /* ignore */ }
  }

  /* ---- 文档 & 抽取 ---- */
  const loadDocuments = async () => {
    try {
      const data: any = await documentApi.getDocuments(effectiveProjectId?.toString())
      setDocuments(data.documents || [])
    } catch { message.error('加载文档列表失败') }
  }

  useEffect(() => { loadDocuments() }, [scopeMode, selectedProject])
  useEffect(() => { if (activeTab === 'entities') loadEntities() }, [scopeMode, selectedProject, activeTab])

  const handleDeleteDoc = async (docId: number) => {
    try {
      await documentApi.deleteDocument(docId)
      message.success('文档已删除')
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch { message.error('删除失败') }
  }

  const handleEditDoc = (doc: any) => {
    setEditingDoc(doc)
    editDocForm.setFieldsValue({
      filename: doc.filename,
      tags: doc.tags || [],
      device_model: doc.device_model || '',
      source_level: doc.source_level || 'internal',
      trust_level: doc.trust_level ?? 0.8,
    })
  }

  const handleSaveDoc = async () => {
    if (!editingDoc) return
    try {
      const values = await editDocForm.validateFields()
      await documentApi.updateDocument(editingDoc.id, values)
      message.success('文档信息已更新')
      setDocuments(prev => prev.map(d => d.id === editingDoc.id ? { ...d, ...values } : d))
      setEditingDoc(null)
    } catch { message.error('更新失败') }
  }

  const handleUpload = async (file: File) => {
    try {
      setUploading(true)
      await documentApi.uploadDocument(file, effectiveProjectId?.toString())
      message.success('上传成功')
      loadDocuments()
    } catch { message.error('上传失败') } finally { setUploading(false) }
    return false
  }

  const handleStartExtraction = async () => {
    const pendingDocs = documents.filter(d => d.extraction_status === 'pending' || d.extraction_status === 'failed')
    if (!pendingDocs.length) { message.info('没有待抽取的文档'); return }
    try {
      setExtracting(true)
      setExtractionProgress({ total: pendingDocs.length, completed: 0, current_doc: pendingDocs[0]?.filename || '', status: 'processing', details: [] })
      const result: any = await extractionApi.startExtraction(pendingDocs.map(d => d.id))
      const taskId = result.task_id
      setExtractionTaskId(taskId)
      message.success('抽取任务已启动')
      // 轮询进度
      const poll = setInterval(async () => {
        try {
          const prog: any = await extractionApi.getExtractionProgress(taskId)
          setExtractionProgress(prog)
          if (prog.status === 'completed') {
            clearInterval(poll)
            setExtracting(false)
            setExtractionTaskId(null)
            loadDocuments()
            const succeeded = (prog.details || []).filter((d: any) => d.status === 'completed').length
            const failed = (prog.details || []).filter((d: any) => d.status === 'failed').length
            message.success(`知识抽取完成: ${succeeded} 成功${failed ? `, ${failed} 失败` : ''}`)
            // 自动刷新实体列表
            loadEntities()
          }
        } catch { /* ignore */ }
      }, 2000)
    } catch { message.error('启动抽取失败'); setExtracting(false); setExtractionProgress(null) }
  }

  const handleTextExtraction = async () => {
    if (!textInput.trim()) { message.warning('请输入文本'); return }
    try {
      setTextExtracting(true)
      setTextProgress(0)
      setTextResult(null)
      // 模拟进度
      const progressTimer = setInterval(() => {
        setTextProgress(prev => {
          if (prev >= 90) { clearInterval(progressTimer); return 90 }
          return prev + Math.random() * 15
        })
      }, 600)
      const result: any = await extractionApi.extractFromText(textInput, effectiveProjectId)
      clearInterval(progressTimer)
      setTextProgress(100)
      setTextResult(result)
      message.success(`抽取完成: ${result.entities?.length || 0} 个实体, ${result.relations?.length || 0} 个关系`)
    } catch { message.error('文本抽取失败') } finally {
      setTimeout(() => { setTextExtracting(false); setTextProgress(0) }, 500)
    }
  }

  /* ---- 实体管理 ---- */
  const loadEntities = async () => {
    try {
      setEntitiesLoading(true)
      const data: any = await knowledgeApi.searchEntities(searchQuery || '*', undefined, effectiveProjectId)
      setEntities(data.entities || [])
    } catch { message.error('加载实体失败') } finally { setEntitiesLoading(false) }
  }

  const handleCreateEntity = async (values: any) => {
    try {
      if (values.confidence != null) values.confidence = Number(values.confidence)
      await knowledgeApi.createEntity({ ...values, project_id: effectiveProjectId })
      message.success('创建成功')
      setIsCreateModalOpen(false)
      form.resetFields()
      loadEntities()
    } catch { message.error('创建失败') }
  }

  const [editingEntity, setEditingEntity] = useState<any>(null)
  const [editForm] = Form.useForm()
  const [addRelForm] = Form.useForm()
  const [addRelModalOpen, setAddRelModalOpen] = useState(false)

  const handleEditEntity = (entity: any) => {
    setEditingEntity(entity)
    editForm.setFieldsValue({
      name: entity.name,
      entity_type: entity.type,
      description: entity.description,
      device_type: entity.device_type,
      confidence: entity.confidence,
      fault_code: entity.fault_code,
      fault_mode: entity.fault_mode,
      severity: entity.severity,
      detection_method: entity.detection_method,
      parameter_name: entity.parameter_name,
      parameter_range: entity.parameter_range,
      maintenance_ref: entity.maintenance_ref,
      evidence_level: entity.evidence_level,
    })
  }

  const handleSaveEntity = async () => {
    if (!editingEntity) return
    try {
      const values = await editForm.validateFields()
      if (values.confidence != null) values.confidence = Number(values.confidence)
      await knowledgeApi.updateEntity(editingEntity.id, values)
      message.success('更新成功')
      setEditingEntity(null)
      loadEntities()
      // 如果详情抽屉打开的是同一个实体，刷新详情
      if (selectedEntity?.id === editingEntity.id) {
        handleViewEntity({ ...editingEntity, ...values })
      }
    } catch { message.error('更新失败') }
  }

  const handleAddRelation = async (values: any) => {
    try {
      await knowledgeApi.createRelation({
        source_entity_id: values.source_entity_id,
        target_entity_id: values.target_entity_id,
        relation_type: values.relation_type,
        confidence: values.confidence || 1.0,
        project_id: effectiveProjectId,
      })
      message.success('关系创建成功')
      setAddRelModalOpen(false)
      addRelForm.resetFields()
      // 刷新当前实体的关系
      if (selectedEntity) {
        const data: any = await knowledgeApi.getRelations(selectedEntity.id)
        setEntityRelations(data.relations || [])
      }
    } catch { message.error('创建关系失败') }
  }

  const handleDeleteEntity = (id: number) => {
    Modal.confirm({
      title: '确认删除', content: '删除实体将同时删除其关联关系。',
      okText: '确认', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => {
        try { await knowledgeApi.deleteEntity(id); message.success('删除成功'); loadEntities() }
        catch { message.error('删除失败') }
      },
    })
  }

  const handleViewEntity = async (entity: any) => {
    setSelectedEntity(entity)
    setIsDetailDrawerOpen(true)
    try {
      const data: any = await knowledgeApi.getRelations(entity.id)
      setEntityRelations(data.relations || [])
    } catch { setEntityRelations([]) }
  }

  /* ---- 知识图谱 ---- */
  const loadGraph = async (centerId?: number) => {
    try {
      setGraphLoading(true)
      if (centerId) {
        // 以某节点为中心加载子图
        const entity = graphData.nodes.find(n => n.id === centerId)
        const queryText = entity?.name || ''
        const [sub, stats]: any[] = await Promise.all([
          knowledgeApi.getSubgraph(queryText, effectiveProjectId),
          knowledgeApi.getStats(effectiveProjectId),
        ])
        const subNodes = (sub.entities || []).map((e: any) => ({
          id: e.id ?? e.entity_id, name: e.name, type: e.entity_type || e.type,
          description: e.description || '', device_type: e.device_type || '', confidence: e.confidence,
        }))
        const subEdges = (sub.relations || []).map((r: any) => ({
          id: r.id, source: r.source_id ?? r.source_entity_id ?? r.source, target: r.target_id ?? r.target_entity_id ?? r.target,
          type: r.relation_type || r.type, logic_gate: r.logic_gate, confidence: r.confidence,
        }))
        setGraphData({ nodes: subNodes, edges: subEdges })
        setKgStats(stats)
        setExpandedNodeId(centerId)
      } else {
        const [graph, stats]: any[] = await Promise.all([
          knowledgeApi.getGraph(effectiveProjectId),
          knowledgeApi.getStats(effectiveProjectId),
        ])
        setGraphData({ nodes: graph.nodes || [], edges: graph.edges || [] })
        setKgStats(stats)
        setExpandedNodeId(null)
      }
    } catch { message.error('加载图谱失败') } finally { setGraphLoading(false) }
  }

  const handleGraphNodeClick = async (node: any) => {
    setSelectedGraphNode(node)
    setGraphNodeDetail(null)
    setGraphNodeRelations([])
    try {
      const [detail, rels]: any[] = await Promise.all([
        knowledgeApi.getEntity(node.id),
        knowledgeApi.getRelations(node.id),
      ])
      setGraphNodeDetail(detail)
      setGraphNodeRelations(rels.relations || [])
    } catch { /* ignore */ }
  }

  const handleExpandFromNode = (node: any) => {
    loadGraph(node.id)
    setSelectedGraphNode(null)
    setGraphNodeDetail(null)
  }

  // 切换 tab 时加载数据
  useEffect(() => {
    if (activeTab === 'entities') loadEntities()
    if (activeTab === 'graph') loadGraph()
  }, [activeTab])

  /* ---- 实体表格列 ---- */
  const entityColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 110, render: (t: string) => {
      const m = typeMap[t] || { color: 'default', text: t }; return <Tag color={m.color}>{m.text}</Tag>
    }},
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true, render: (t: string) => <span style={{ color: 'var(--text-secondary)' }}>{t || '—'}</span> },
    { title: '故障代码', dataIndex: 'fault_code', key: 'fc', width: 110, render: (t: string) => t ? <Tag color="red" style={{ fontSize: 11 }}>{t}</Tag> : '—' },
    { title: '严重等级', dataIndex: 'severity', key: 'sev', width: 100, render: (t: string) => {
      if (!t) return '—'
      const labels: Record<string, { c: string; l: string }> = { catastrophic: { c: '#dc2626', l: '灾难性' }, hazardous: { c: '#ea580c', l: '危险' }, major: { c: '#d97706', l: '重大' }, minor: { c: '#65a30d', l: '轻微' }, no_effect: { c: '#64748b', l: '无影响' } }
      const m = labels[t] || { c: 'default', l: t }
      return <Tag color={m.c} style={{ fontSize: 11 }}>{m.l}</Tag>
    }},
    { title: '证据', dataIndex: 'evidence_level', key: 'ev', width: 80, render: (t: string) => {
      if (!t) return '—'
      const colors: Record<string, string> = { direct: 'green', inferred: 'blue', assumed: 'orange', none: 'default' }
      const labels: Record<string, string> = { direct: '直接', inferred: '推断', assumed: '假设', none: '无' }
      return <Tag color={colors[t] || 'default'} style={{ fontSize: 11 }}>{labels[t] || t}</Tag>
    }},
    { title: '置信度', dataIndex: 'confidence', key: 'conf', width: 120, render: (v: number) => v != null ? (
      <Progress percent={Math.round(v * 100)} size="small"
        strokeColor={v >= 0.8 ? 'var(--success)' : v >= 0.5 ? 'var(--warning)' : 'var(--danger)'} />
    ) : '—' },
    { title: '来源', key: 'src', width: 80, render: (_: any, r: any) =>
      r.source_document_id ? <Tag color="blue" style={{ fontSize: 11 }}>自动抽取</Tag> : <Tag style={{ fontSize: 11 }}>手动</Tag>
    },
    { title: '操作', key: 'action', width: 160, render: (_: any, r: any) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewEntity(r)}>详情</Button>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditEntity(r)}>编辑</Button>
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteEntity(r.id)}>删除</Button>
      </Space>
    )},
  ]

  /* ---- 渲染 ---- */
  return (
    <div className="knowledge-page">
      <div className="knowledge-page-header">
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            <ExperimentOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />
            知识抽取与管理
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            上传工业文档，智能抽取故障知识，构建知识图谱，增强故障树生成
          </p>
        </div>
        <Space>
          <Select
            value={scopeMode}
            onChange={(v) => { setScopeMode(v); if (v === 'global') setSelectedProject(undefined) }}
            style={{ width: 130 }}
            options={[
              { label: <span><GlobalOutlined /> 全局知识库</span>, value: 'global' },
              { label: <span><AimOutlined /> 按项目</span>, value: 'project' },
            ]}
          />
          {scopeMode === 'project' && (
            <Select
              placeholder="选择项目"
              style={{ width: 200 }}
              value={selectedProject}
              onChange={setSelectedProject}
              allowClear
              options={projects.map(p => ({ label: p.name, value: p.id }))}
            />
          )}
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        /* ==================== Tab 1: 知识抽取 ==================== */
        { key: 'extraction', label: <span><CloudUploadOutlined /> 知识抽取</span>, children: (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {/* 左：文档上传+抽取 */}
            <Card title={<span><UploadOutlined style={{ marginRight: 6 }} />文档上传与抽取</span>}
              extra={scopeMode === 'global' ? <Tag color="blue"><GlobalOutlined /> 全局</Tag> : selectedProject ? <Tag color="green">项目 #{selectedProject}</Tag> : null}
              style={{ flex: '1 1 480px', minWidth: 420 }}>
              <Upload.Dragger
                accept=".pdf,.docx,.xlsx,.xls,.txt,.png,.jpg,.jpeg"
                beforeUpload={handleUpload}
                showUploadList={false}
                disabled={uploading}
              >
                <p className="ant-upload-drag-icon"><CloudUploadOutlined style={{ fontSize: 36, color: 'var(--primary)' }} /></p>
                <p className="ant-upload-text">点击或拖拽上传工业文档</p>
                <p className="ant-upload-hint">
                  支持 PDF、Word、Excel、TXT、图片格式
                  {scopeMode === 'global' && <span style={{ color: 'var(--primary)', fontWeight: 500 }}> · 全局导入模式</span>}
                </p>
              </Upload.Dragger>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>文档列表 ({documents.length})</span>
                <Space>
                  <Button size="small" icon={<ReloadOutlined />} onClick={loadDocuments}>刷新</Button>
                  <Button type="primary" size="small" icon={<ExperimentOutlined />}
                    loading={extracting} onClick={handleStartExtraction}
                    disabled={!documents.some(d => d.extraction_status === 'pending' || d.extraction_status === 'failed')}>
                    开始抽取
                  </Button>
                </Space>
              </div>

              {/* 抽取进度条 */}
              {extracting && extractionProgress && (
                <div style={{ margin: '12px 0', padding: '12px 16px', background: 'var(--primary-bg)', borderRadius: 8, border: '1px solid var(--primary-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      <ClockCircleOutlined spin style={{ marginRight: 6 }} />
                      正在抽取: {extractionProgress.current_doc || '准备中...'}
                    </span>
                    <span>{extractionProgress.completed} / {extractionProgress.total}</span>
                  </div>
                  <Progress
                    percent={extractionProgress.total > 0 ? Math.round((extractionProgress.completed / extractionProgress.total) * 100) : 0}
                    status="active"
                    strokeColor={{ '0%': '#6366f1', '100%': '#8b5cf6' }}
                  />
                  {extractionProgress.details?.length > 0 && (
                    <div style={{ marginTop: 8, maxHeight: 100, overflowY: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {extractionProgress.details.map((d: any, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                          {d.status === 'completed' ? <CheckCircleOutlined style={{ color: 'var(--success)' }} /> : <CloseCircleOutlined style={{ color: 'var(--danger)' }} />}
                          <span>{d.filename}</span>
                          {d.status === 'completed' && <span style={{ color: 'var(--success)' }}>({d.entities} 实体, {d.relations} 关系)</span>}
                          {d.status === 'failed' && <span style={{ color: 'var(--danger)' }}>失败</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 10, maxHeight: 400, overflowY: 'auto' }}>
                {documents.map(doc => {
                  const status = doc.extraction_status || 'pending'
                  const sizeStr = doc.file_size ? (doc.file_size < 1024 * 1024
                    ? `${(doc.file_size / 1024).toFixed(0)} KB`
                    : `${(doc.file_size / 1024 / 1024).toFixed(1)} MB`) : ''
                  return (
                    <div key={doc.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                      borderBottom: '1px solid #f0f0f0', fontSize: 13,
                      transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {fileIcon(doc.doc_type)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.filename}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {sizeStr && <span>{sizeStr}</span>}
                          {doc.uploaded_at && <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>}
                          {doc.source_level && doc.source_level !== 'internal' && (
                            <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{
                              doc.source_level === 'official' ? '官方' : doc.source_level === 'thirdparty' ? '第三方' : doc.source_level === 'forum' ? '论坛' : doc.source_level === 'experience' ? '经验' : doc.source_level
                            }</Tag>
                          )}
                          {(doc.tags || []).slice(0, 2).map((t: string) => (
                            <Tag key={t} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color="blue">{t}</Tag>
                          ))}
                        </div>
                      </div>
                      <span style={{ flexShrink: 0 }}>
                        {statusIcon(status)}
                        <span style={{ marginLeft: 4, color: 'var(--text-secondary)', fontSize: 12 }}>
                          {status === 'completed' ? '已完成' : status === 'processing' ? '抽取中' : status === 'failed' ? '失败' : '待抽取'}
                        </span>
                      </span>
                      <Space size={0} style={{ flexShrink: 0 }}>
                        <Tooltip title="编辑">
                          <Button type="text" size="small" icon={<EditOutlined />}
                            onClick={() => handleEditDoc(doc)}
                            style={{ color: 'var(--text-tertiary)' }} />
                        </Tooltip>
                        <Popconfirm
                          title="确定删除此文档？"
                          description="关联的文档分块也会一并删除"
                          onConfirm={() => handleDeleteDoc(doc.id)}
                          okText="删除"
                          cancelText="取消"
                          okButtonProps={{ danger: true }}
                        >
                          <Tooltip title="删除">
                            <Button type="text" size="small" icon={<DeleteOutlined />}
                              style={{ color: 'var(--text-tertiary)' }} />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    </div>
                  )
                })}
                {!documents.length && <Empty description="暂无文档，请上传" style={{ padding: 30 }} />}
              </div>
            </Card>

            {/* 右：文本直接抽取 */}
            <Card title={<span><FileTextOutlined style={{ marginRight: 6 }} />文本直接抽取</span>}
              style={{ flex: '1 1 400px', minWidth: 360 }}>
              <Input.TextArea
                rows={8}
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="粘贴工业文档文本，例如：&#10;&#10;液压系统由液压泵、液压阀、液压缸等部件组成。当液压泵密封圈老化时，会导致液压油泄漏，进而引起系统压力不足..."
              />
              <Button type="primary" icon={<ExperimentOutlined />} loading={textExtracting}
                onClick={handleTextExtraction} style={{ marginTop: 12 }} block>
                智能抽取
              </Button>

              {/* 文本抽取进度 */}
              {textExtracting && (
                <div style={{ marginTop: 12 }}>
                  <Progress
                    percent={Math.round(textProgress)}
                    status="active"
                    strokeColor={{ '0%': '#6366f1', '100%': '#8b5cf6' }}
                    format={p => p! < 90 ? 'AI 分析中...' : '即将完成...'}
                  />
                </div>
              )}

              {textResult && (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    type="success" showIcon
                    message={`抽取完成 — ${textResult.entities?.length || 0} 个实体, ${textResult.relations?.length || 0} 个关系`}
                    description={`质量评分: ${(textResult.quality_score * 100).toFixed(0)}%`}
                    style={{ marginBottom: 12 }}
                  />
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>抽取到的实体:</p>
                    {(textResult.entities || []).map((e: any, i: number) => (
                      <Tag key={i} color={typeMap[e.type]?.color || 'default'} style={{ margin: '2px 4px 2px 0' }}>
                        {e.name} ({typeMap[e.type]?.text || e.type})
                      </Tag>
                    ))}
                    <p style={{ fontWeight: 600, fontSize: 13, margin: '12px 0 6px' }}>抽取到的关系:</p>
                    {(textResult.relations || []).map((r: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0' }}>
                        {r.source} → <Tag color={relTypeMap[r.type]?.color || 'default'} style={{ fontSize: 11 }}>{relTypeMap[r.type]?.text || r.type}{r.logic_gate ? ` [${r.logic_gate}]` : ''}</Tag> → {r.target}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )},

        /* ==================== Tab 2: 知识实体 ==================== */
        { key: 'entities', label: <span><TagsOutlined /> 知识实体</span>, children: (
          <>
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Input placeholder="搜索实体名称或描述..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} onPressEnter={loadEntities}
                prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
                style={{ maxWidth: 360 }} allowClear />
              <Button icon={<SearchOutlined />} onClick={loadEntities}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setSearchQuery(''); loadEntities() }}>重置</Button>
              <div style={{ flex: 1 }} />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>添加实体</Button>
            </div>
            <Table columns={entityColumns} dataSource={entities} loading={entitiesLoading} rowKey="id"
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
              locale={{ emptyText: '暂无实体数据' }} />
          </>
        )},

        /* ==================== Tab 3: 知识图谱 ==================== */
        { key: 'graph', label: <span><BranchesOutlined /> 知识图谱</span>, children: (
          <>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <Space size="large" wrap>
                {kgStats ? (<>
                  <Statistic title="实体总数" value={kgStats.entity_count} prefix={<NodeIndexOutlined />} />
                  <Statistic title="关系总数" value={kgStats.relation_count} prefix={<ApiOutlined />} />
                  {kgStats.entity_types && Object.entries(kgStats.entity_types).map(([k, v]) => (
                    <Statistic key={k} title={typeMap[k]?.text || k} value={v as number}
                      valueStyle={{ color: NODE_COLORS[k] || '#64748b' }} />
                  ))}
                </>) : <span />}
              </Space>
              <Space>
                {expandedNodeId && (
                  <Button icon={<ExpandOutlined />} onClick={() => { loadGraph(); setSelectedGraphNode(null); setGraphNodeDetail(null) }}>
                    显示全部
                  </Button>
                )}
                <Button icon={<ReloadOutlined />} onClick={() => loadGraph()} loading={graphLoading}>刷新</Button>
              </Space>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              {/* 图谱画布 */}
              <Card bodyStyle={{ padding: 0 }} style={{ flex: 1, minWidth: 0 }}>
                {graphLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 520, gap: 16 }}>
                    <Spin size="large" />
                    <span style={{ color: 'var(--text-secondary)' }}>加载知识图谱...</span>
                  </div>
                ) : (
                  <KnowledgeGraphCanvas
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                    selectedNodeId={selectedGraphNode?.id}
                    onNodeClick={handleGraphNodeClick}
                    onExpandNode={handleExpandFromNode}
                  />
                )}
              </Card>

              {/* 节点详情侧栏 */}
              {selectedGraphNode && (
                <Card
                  title={<span style={{ fontWeight: 600 }}><InfoCircleOutlined style={{ marginRight: 6, color: 'var(--primary)' }} />节点详情</span>}
                  style={{ width: 320, flexShrink: 0 }}
                  bodyStyle={{ padding: '16px' }}
                  extra={<Button type="text" size="small" onClick={() => { setSelectedGraphNode(null); setGraphNodeDetail(null) }}>✕</Button>}
                >
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{selectedGraphNode.name}</h3>
                    <Tag color={typeMap[selectedGraphNode.type]?.color || 'default'}>{typeMap[selectedGraphNode.type]?.text || selectedGraphNode.type}</Tag>
                  </div>
                  {selectedGraphNode.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>{selectedGraphNode.description}</p>
                  )}
                  {selectedGraphNode.device_type && (
                    <div style={{ fontSize: 13, marginBottom: 8 }}><span style={{ fontWeight: 500 }}>设备类型:</span> {selectedGraphNode.device_type}</div>
                  )}
                  {selectedGraphNode.confidence != null && (
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>置信度:</span>
                      <Progress percent={Math.round(selectedGraphNode.confidence * 100)} size="small" style={{ maxWidth: 180, marginLeft: 8, display: 'inline-flex' }} />
                    </div>
                  )}

                  {/* 工业 schema 扩展字段 */}
                  {(selectedGraphNode.fault_code || selectedGraphNode.fault_mode || selectedGraphNode.severity || selectedGraphNode.detection_method || selectedGraphNode.parameter_name || selectedGraphNode.maintenance_ref || selectedGraphNode.evidence_level) && (
                    <div style={{ background: 'var(--bg-page)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, lineHeight: 2 }}>
                      {selectedGraphNode.fault_code && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>故障代码:</span> <Tag color="red" style={{ fontSize: 11 }}>{selectedGraphNode.fault_code}</Tag></div>}
                      {selectedGraphNode.fault_mode && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>故障模式:</span> {selectedGraphNode.fault_mode}</div>}
                      {selectedGraphNode.severity && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>严重等级:</span> <Tag color={
                        selectedGraphNode.severity === 'catastrophic' ? '#dc2626' : selectedGraphNode.severity === 'hazardous' ? '#ea580c' : selectedGraphNode.severity === 'major' ? '#d97706' : '#65a30d'
                      } style={{ fontSize: 11 }}>{
                        selectedGraphNode.severity === 'catastrophic' ? '灾难性' : selectedGraphNode.severity === 'hazardous' ? '危险' : selectedGraphNode.severity === 'major' ? '重大' : selectedGraphNode.severity === 'minor' ? '轻微' : '无影响'
                      }</Tag></div>}
                      {selectedGraphNode.detection_method && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>检测方式:</span> {selectedGraphNode.detection_method}</div>}
                      {selectedGraphNode.parameter_name && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>监控参数:</span> {selectedGraphNode.parameter_name}{selectedGraphNode.parameter_range ? ` (${selectedGraphNode.parameter_range})` : ''}</div>}
                      {selectedGraphNode.maintenance_ref && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>维修参考:</span> {selectedGraphNode.maintenance_ref}</div>}
                      {selectedGraphNode.evidence_level && <div><span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>证据等级:</span> <Tag color={
                        selectedGraphNode.evidence_level === 'direct' ? 'green' : selectedGraphNode.evidence_level === 'inferred' ? 'blue' : 'orange'
                      } style={{ fontSize: 11 }}>{
                        selectedGraphNode.evidence_level === 'direct' ? '直接证据' : selectedGraphNode.evidence_level === 'inferred' ? '推断' : selectedGraphNode.evidence_level === 'assumed' ? '假设' : '无'
                      }</Tag></div>}
                    </div>
                  )}

                  <Divider style={{ margin: '12px 0' }} />

                  <Button type="primary" icon={<AimOutlined />} block style={{ marginBottom: 12 }}
                    onClick={() => handleExpandFromNode(selectedGraphNode)}>
                    以此节点为中心展开
                  </Button>

                  <h4 style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    <ApiOutlined style={{ marginRight: 6, color: 'var(--primary)' }} />
                    关联关系 ({graphNodeRelations.length})
                  </h4>
                  {!graphNodeDetail ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
                  ) : graphNodeRelations.length > 0 ? (
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {graphNodeRelations.map((r: any) => {
                        const isSource = r.source_entity_id === selectedGraphNode.id
                        const otherName = graphData.nodes.find(n => n.id === (isSource ? r.target_entity_id : r.source_entity_id))?.name || `#${isSource ? r.target_entity_id : r.source_entity_id}`
                        return (
                          <div key={r.id} style={{
                            padding: '6px 10px', marginBottom: 4, borderRadius: 6,
                            background: 'var(--bg-page)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            {isSource ? (
                              <><span style={{ fontWeight: 500 }}>{selectedGraphNode.name}</span> → <Tag color={relTypeMap[r.type]?.color} style={{ fontSize: 11 }}>{relTypeMap[r.type]?.text || r.type}</Tag> → <span style={{ fontWeight: 500 }}>{otherName}</span></>
                            ) : (
                              <><span style={{ fontWeight: 500 }}>{otherName}</span> → <Tag color={relTypeMap[r.type]?.color} style={{ fontSize: 11 }}>{relTypeMap[r.type]?.text || r.type}</Tag> → <span style={{ fontWeight: 500 }}>{selectedGraphNode.name}</span></>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 16, background: 'var(--bg-page)', borderRadius: 8 }}>暂无关联关系</div>
                  )}
                </Card>
              )}
            </div>
          </>
        )},
      ]} />

      {/* ═══ 创建实体 Modal ═══ */}
      <Modal title={<span><PlusOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />添加知识实体</span>}
        open={isCreateModalOpen} width={640}
        onCancel={() => { setIsCreateModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreateEntity} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="实体名称" rules={[{ required: true, message: '请输入实体名称' }]}>
              <Input placeholder="例如：液压泵故障" />
            </Form.Item>
            <Form.Item name="entity_type" label="实体类型" rules={[{ required: true, message: '请选择实体类型' }]}>
              <Select placeholder="选择类型" options={Object.entries(typeMap).map(([k, v]) => ({ value: k, label: v.text }))} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="描述该实体..." /></Form.Item>
          <Divider style={{ margin: '12px 0', fontSize: 12 }}>工业属性</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="device_type" label="设备类型"><Input placeholder="例如：液压系统" /></Form.Item>
            <Form.Item name="fault_code" label="故障代码"><Input placeholder="例如：HYD-2101" /></Form.Item>
            <Form.Item name="fault_mode" label="故障模式"><Input placeholder="例如：内漏、卡滞" /></Form.Item>
            <Form.Item name="severity" label="严重等级">
              <Select placeholder="选择" allowClear options={[
                { value: 'catastrophic', label: '灾难性' }, { value: 'hazardous', label: '危险' },
                { value: 'major', label: '重大' }, { value: 'minor', label: '轻微' }, { value: 'no_effect', label: '无影响' },
              ]} />
            </Form.Item>
            <Form.Item name="detection_method" label="检测方式"><Input placeholder="例如：BITE自检" /></Form.Item>
            <Form.Item name="evidence_level" label="证据等级">
              <Select placeholder="选择" allowClear options={[
                { value: 'direct', label: '直接证据' }, { value: 'inferred', label: '推断' },
                { value: 'assumed', label: '假设' }, { value: 'none', label: '无' },
              ]} />
            </Form.Item>
            <Form.Item name="parameter_name" label="监控参数"><Input placeholder="例如：液压压力" /></Form.Item>
            <Form.Item name="parameter_range" label="参数范围"><Input placeholder="例如：2800-3200 psi" /></Form.Item>
            <Form.Item name="maintenance_ref" label="维修参考"><Input placeholder="AMM/TSM章节号" /></Form.Item>
            <Form.Item name="confidence" label="置信度" initialValue={1.0}>
              <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══ 编辑实体 Modal ═══ */}
      <Modal title={<span><EditOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />编辑实体</span>}
        open={!!editingEntity} width={640}
        onCancel={() => setEditingEntity(null)}
        onOk={handleSaveEntity} okText="保存" cancelText="取消" destroyOnClose>
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="实体名称" rules={[{ required: true, message: '请输入实体名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="entity_type" label="实体类型" rules={[{ required: true, message: '请选择实体类型' }]}>
              <Select options={Object.entries(typeMap).map(([k, v]) => ({ value: k, label: v.text }))} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Divider style={{ margin: '12px 0', fontSize: 12 }}>工业属性</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="device_type" label="设备类型"><Input /></Form.Item>
            <Form.Item name="fault_code" label="故障代码"><Input /></Form.Item>
            <Form.Item name="fault_mode" label="故障模式"><Input /></Form.Item>
            <Form.Item name="severity" label="严重等级">
              <Select allowClear options={[
                { value: 'catastrophic', label: '灾难性' }, { value: 'hazardous', label: '危险' },
                { value: 'major', label: '重大' }, { value: 'minor', label: '轻微' }, { value: 'no_effect', label: '无影响' },
              ]} />
            </Form.Item>
            <Form.Item name="detection_method" label="检测方式"><Input /></Form.Item>
            <Form.Item name="evidence_level" label="证据等级">
              <Select allowClear options={[
                { value: 'direct', label: '直接证据' }, { value: 'inferred', label: '推断' },
                { value: 'assumed', label: '假设' }, { value: 'none', label: '无' },
              ]} />
            </Form.Item>
            <Form.Item name="parameter_name" label="监控参数"><Input /></Form.Item>
            <Form.Item name="parameter_range" label="参数范围"><Input /></Form.Item>
            <Form.Item name="maintenance_ref" label="维修参考"><Input /></Form.Item>
            <Form.Item name="confidence" label="置信度">
              <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══ 添加关系 Modal ═══ */}
      <Modal title={<span><ApiOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />添加实体关系</span>}
        open={addRelModalOpen} width={520}
        onCancel={() => { setAddRelModalOpen(false); addRelForm.resetFields() }}
        onOk={() => addRelForm.submit()} okText="创建" cancelText="取消" destroyOnClose>
        <Form form={addRelForm} layout="vertical" onFinish={handleAddRelation} style={{ marginTop: 16 }}>
          <Form.Item name="source_entity_id" label="源实体" rules={[{ required: true, message: '请选择' }]} initialValue={selectedEntity?.id}>
            <Select showSearch optionFilterProp="label" placeholder="选择源实体"
              options={entities.map(e => ({ value: e.id, label: `${e.name} (${typeMap[e.type]?.text || e.type})` }))} />
          </Form.Item>
          <Form.Item name="relation_type" label="关系类型" rules={[{ required: true, message: '请选择关系类型' }]}>
            <Select placeholder="选择关系类型" options={Object.entries(relTypeMap).map(([k, v]) => ({ value: k, label: v.text }))} />
          </Form.Item>
          <Form.Item name="target_entity_id" label="目标实体" rules={[{ required: true, message: '请选择' }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择目标实体"
              options={entities.map(e => ({ value: e.id, label: `${e.name} (${typeMap[e.type]?.text || e.type})` }))} />
          </Form.Item>
          <Form.Item name="confidence" label="置信度" initialValue={1.0}>
            <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══ 实体详情 Drawer ═══ */}
      <Drawer title={<span style={{ fontWeight: 600 }}><NodeIndexOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />实体详情</span>}
        open={isDetailDrawerOpen}
        onClose={() => { setIsDetailDrawerOpen(false); setSelectedEntity(null); setEntityRelations([]) }}
        width={560}
        extra={selectedEntity && (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => { handleEditEntity(selectedEntity); setIsDetailDrawerOpen(false) }}>编辑</Button>
            <Button size="small" icon={<ApiOutlined />} type="primary" onClick={() => { addRelForm.setFieldsValue({ source_entity_id: selectedEntity.id }); setAddRelModalOpen(true) }}>添加关系</Button>
          </Space>
        )}>
        {selectedEntity && (
          <div>
            {/* 基本信息 */}
            <Descriptions column={2} bordered size="small" labelStyle={{ fontWeight: 500, width: 90 }}>
              <Descriptions.Item label="名称" span={2}><span style={{ fontWeight: 600, fontSize: 15 }}>{selectedEntity.name}</span></Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={typeMap[selectedEntity.type]?.color || 'default'}>{typeMap[selectedEntity.type]?.text || selectedEntity.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="置信度">
                {selectedEntity.confidence != null ? <Progress percent={Math.round(selectedEntity.confidence * 100)} size="small" style={{ maxWidth: 160 }} /> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{selectedEntity.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="来源" span={2}>
                {selectedEntity.source_document_id ? <Tag color="blue">自动抽取 (文档 #{selectedEntity.source_document_id})</Tag> : <Tag>手动创建</Tag>}
              </Descriptions.Item>
            </Descriptions>

            {/* 工业属性 */}
            {(selectedEntity.device_type || selectedEntity.fault_code || selectedEntity.fault_mode || selectedEntity.severity || selectedEntity.detection_method || selectedEntity.parameter_name || selectedEntity.maintenance_ref || selectedEntity.evidence_level) && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>工业属性</h4>
                <Descriptions column={2} bordered size="small" labelStyle={{ fontWeight: 500, width: 90 }}>
                  {selectedEntity.device_type && <Descriptions.Item label="设备类型">{selectedEntity.device_type}</Descriptions.Item>}
                  {selectedEntity.fault_code && <Descriptions.Item label="故障代码"><Tag color="red">{selectedEntity.fault_code}</Tag></Descriptions.Item>}
                  {selectedEntity.fault_mode && <Descriptions.Item label="故障模式">{selectedEntity.fault_mode}</Descriptions.Item>}
                  {selectedEntity.severity && <Descriptions.Item label="严重等级"><Tag color={
                    selectedEntity.severity === 'catastrophic' ? '#dc2626' : selectedEntity.severity === 'hazardous' ? '#ea580c' : selectedEntity.severity === 'major' ? '#d97706' : '#65a30d'
                  }>{
                    ({ catastrophic: '灾难性', hazardous: '危险', major: '重大', minor: '轻微', no_effect: '无影响' } as any)[selectedEntity.severity] || selectedEntity.severity
                  }</Tag></Descriptions.Item>}
                  {selectedEntity.detection_method && <Descriptions.Item label="检测方式" span={2}>{selectedEntity.detection_method}</Descriptions.Item>}
                  {selectedEntity.evidence_level && <Descriptions.Item label="证据等级"><Tag color={
                    selectedEntity.evidence_level === 'direct' ? 'green' : selectedEntity.evidence_level === 'inferred' ? 'blue' : 'orange'
                  }>{
                    ({ direct: '直接证据', inferred: '推断', assumed: '假设', none: '无' } as any)[selectedEntity.evidence_level] || selectedEntity.evidence_level
                  }</Tag></Descriptions.Item>}
                  {selectedEntity.parameter_name && <Descriptions.Item label="监控参数">{selectedEntity.parameter_name}{selectedEntity.parameter_range ? ` (${selectedEntity.parameter_range})` : ''}</Descriptions.Item>}
                  {selectedEntity.maintenance_ref && <Descriptions.Item label="维修参考" span={2}>{selectedEntity.maintenance_ref}</Descriptions.Item>}
                </Descriptions>
              </div>
            )}

            {/* 关联关系 */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontWeight: 600, margin: 0 }}><ApiOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />关联关系 ({entityRelations.length})</h4>
                <Button size="small" type="primary" ghost icon={<PlusOutlined />}
                  onClick={() => { addRelForm.setFieldsValue({ source_entity_id: selectedEntity.id }); setAddRelModalOpen(true) }}>
                  添加关系
                </Button>
              </div>
              {entityRelations.length > 0 ? (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {entityRelations.map((r: any) => {
                    const isSource = r.source_entity_id === selectedEntity.id
                    const otherId = isSource ? r.target_entity_id : r.source_entity_id
                    const otherEntity = entities.find(e => e.id === otherId)
                    const otherName = otherEntity?.name || `#${otherId}`
                    return (
                      <div key={r.id} style={{
                        padding: '8px 12px', marginBottom: 6, borderRadius: 8,
                        background: 'var(--bg-page)', border: '1px solid var(--border-light)',
                        fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ fontWeight: 500 }}>{isSource ? selectedEntity.name : otherName}</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                        <Tag color={relTypeMap[r.type]?.color} style={{ fontSize: 11 }}>{relTypeMap[r.type]?.text || r.type}</Tag>
                        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                        <span style={{ fontWeight: 500 }}>{isSource ? otherName : selectedEntity.name}</span>
                        {r.confidence != null && r.confidence < 1 && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>置信度 {Math.round(r.confidence * 100)}%</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : <div style={{ color: 'var(--text-tertiary)', padding: 24, textAlign: 'center', background: 'var(--bg-page)', borderRadius: 8 }}>暂无关联关系，点击上方按钮添加</div>}
            </div>
          </div>
        )}
      </Drawer>

      {/* ===== 文档编辑弹窗 ===== */}
      <Modal
        title={<span><EditOutlined style={{ marginRight: 8, color: 'var(--primary)' }} />编辑文档信息</span>}
        open={!!editingDoc}
        onCancel={() => setEditingDoc(null)}
        onOk={handleSaveDoc}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editDocForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="filename" label="文件名" rules={[{ required: true, message: '请输入文件名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="输入标签后回车" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="device_model" label="设备型号">
              <Input placeholder="例如：A320液压系统" />
            </Form.Item>
            <Form.Item name="source_level" label="来源级别">
              <Select options={[
                { value: 'official', label: '官方手册' },
                { value: 'internal', label: '内部资料' },
                { value: 'thirdparty', label: '第三方' },
                { value: 'forum', label: '论坛/社区' },
                { value: 'experience', label: '自录经验' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="trust_level" label="可信度">
            <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Knowledge
