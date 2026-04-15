/**
 * 指标评测模块 — 量化可视化评测中心
 *
 * 功能：
 *  1. 标准树管理（导入 / 创建 gold tree）
 *  2. 生成树 vs 标准树 对比评测
 *  3. 关系抽取准确率
 *  4. 专家修订前后质量 & 耗时变化
 *  5. 导出报告
 *  6. 多维筛选
 *  7. 历史趋势图
 *  8. 错误案例清单
 */
import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  Card, Button, Tabs, Table, Tag, Space, Modal, Form, Input, Select,
  InputNumber, message, Popconfirm, Tooltip, Empty, Descriptions,
  Statistic, Row, Col, Typography, Divider, Drawer, Spin,
} from 'antd'
import {
  PlusOutlined, PlayCircleOutlined, BarChartOutlined, DeleteOutlined,
  ExportOutlined, FileSearchOutlined, TrophyOutlined, AimOutlined,
  RocketOutlined, ClockCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  LineChartOutlined, BugOutlined, EditOutlined, EyeOutlined,
  ThunderboltOutlined, RiseOutlined, FallOutlined,
} from '@ant-design/icons'
import { benchmarkApi, projectApi, ftaApi } from '@/services/api'

/* ═══════════ ECharts 懒加载 + 错误边界 ═══════════ */

const LazyECharts = lazy(() => import('echarts-for-react'))

class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err: Error, info: ErrorInfo) { console.warn('Chart render error:', err, info) }
  render() {
    if (this.state.hasError) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>图表渲染失败</div>
    return this.props.children
  }
}

const SafeChart: React.FC<{ option: any; style?: React.CSSProperties }> = ({ option, style }) => (
  <ChartErrorBoundary>
    <Suspense fallback={<div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>}>
      <LazyECharts option={option} style={style} notMerge lazyUpdate />
    </Suspense>
  </ChartErrorBoundary>
)

const { TextArea } = Input
const { Text } = Typography

/* ═══════════ 常量 & 工具 ═══════════ */

const METRIC_COLORS = {
  primary: '#6366f1',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  rose: '#f43f5e',
}

const scoreColor = (v: number | null | undefined) => {
  if (v == null) return '#999'
  if (v >= 85) return METRIC_COLORS.success
  if (v >= 70) return METRIC_COLORS.warning
  return METRIC_COLORS.danger
}

const pctText = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : '—'

/* ═══════════ 组件 ═══════════ */

const Benchmark: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [projects, setProjects] = useState<any[]>([])
  const [goldTrees, setGoldTrees] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [runsTotal, setRunsTotal] = useState(0)
  const [trendData, setTrendData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [savedTrees, setSavedTrees] = useState<any[]>([])

  // Filters
  const [filterProject, setFilterProject] = useState<number | undefined>()
  const [filterDevice, setFilterDevice] = useState<string | undefined>()
  const [filterAlgo, setFilterAlgo] = useState<string | undefined>()

  // Modals
  const [goldModal, setGoldModal] = useState(false)
  const [editingGold, setEditingGold] = useState<any>(null)
  const [runModal, setRunModal] = useState(false)
  const [aiEvalModal, setAiEvalModal] = useState(false)
  const [detailDrawer, setDetailDrawer] = useState<any>(null)
  const [goldForm] = Form.useForm()
  const [runForm] = Form.useForm()
  const [aiEvalForm] = Form.useForm()

  // ── Load data ──
  useEffect(() => {
    projectApi.getProjects().then((r: any) => setProjects(Array.isArray(r) ? r : r?.projects || [])).catch(() => {})
    ftaApi.getFaultTrees().then((r: any) => setSavedTrees(Array.isArray(r) ? r : r?.fault_trees || r?.trees || [])).catch(() => {})
  }, [])

  const loadGoldTrees = useCallback(async () => {
    try {
      const r: any = await benchmarkApi.listGoldTrees({ project_id: filterProject, device_type: filterDevice })
      setGoldTrees(r.gold_trees || [])
    } catch { message.error('加载标准树失败') }
  }, [filterProject, filterDevice])

  const loadRuns = useCallback(async () => {
    try {
      setLoading(true)
      const r: any = await benchmarkApi.listRuns({
        project_id: filterProject, device_type: filterDevice, algorithm_version: filterAlgo,
      })
      setRuns(r.runs || [])
      setRunsTotal(r.total || 0)
    } catch { message.error('加载评测记录失败') }
    finally { setLoading(false) }
  }, [filterProject, filterDevice, filterAlgo])

  const loadTrend = useCallback(async () => {
    try {
      const r: any = await benchmarkApi.getTrend({ project_id: filterProject, device_type: filterDevice, limit: 30 })
      setTrendData(r)
    } catch {}
  }, [filterProject, filterDevice])

  useEffect(() => { loadGoldTrees(); loadRuns(); loadTrend() }, [loadGoldTrees, loadRuns, loadTrend])

  // ── 标准树 CRUD ──
  const handleSaveGold = async () => {
    try {
      const values = await goldForm.validateFields()
      // Parse structure from JSON string
      if (typeof values.structure === 'string') {
        values.structure = JSON.parse(values.structure)
      }
      if (typeof values.relation_annotations === 'string' && values.relation_annotations) {
        values.relation_annotations = JSON.parse(values.relation_annotations)
      }
      if (editingGold) {
        await benchmarkApi.updateGoldTree(editingGold.id, values)
        message.success('更新成功')
      } else {
        await benchmarkApi.createGoldTree(values)
        message.success('创建成功')
      }
      setGoldModal(false)
      setEditingGold(null)
      goldForm.resetFields()
      loadGoldTrees()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('JSON 格式错误，请检查')
    }
  }

  // ── 运行评测 ──
  const handleRunEval = async () => {
    try {
      const values = await runForm.validateFields()
      setLoading(true)
      const res: any = await benchmarkApi.runEval(values)
      message.success(`评测完成！综合得分: ${res.overall_score}`)
      setRunModal(false)
      runForm.resetFields()
      loadRuns()
      loadTrend()
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('评测失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'))
    } finally { setLoading(false) }
  }

  // ── AI 自动评测 ──
  const handleAIEval = async () => {
    try {
      const values = await aiEvalForm.validateFields()
      setLoading(true)
      if (values.structure && typeof values.structure === 'string') {
        values.structure = JSON.parse(values.structure)
      }
      const res: any = await benchmarkApi.runAIEval(values)
      message.success(`AI 评测完成！质量分数: ${res.overall_score}`)
      setAiEvalModal(false)
      aiEvalForm.resetFields()
      loadRuns()
      loadTrend()
      // 自动打开详情
      setDetailDrawer(res)
    } catch (e: any) {
      if (e?.errorFields) return
      message.error('AI 评测失败: ' + (e?.response?.data?.detail || e?.message || 'JSON格式错误'))
    } finally { setLoading(false) }
  }

  // ── 导出 ──
  const handleExport = async (runId: number, fmt: string) => {
    try {
      if (fmt === 'csv') {
        const res: any = await benchmarkApi.exportReport(runId, 'csv')
        const blob = new Blob([res], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `eval_report_${runId}.csv`; a.click()
        URL.revokeObjectURL(url)
      } else {
        const res: any = await benchmarkApi.exportReport(runId, 'json')
        const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `eval_report_${runId}.json`; a.click()
        URL.revokeObjectURL(url)
      }
      message.success('导出成功')
    } catch { message.error('导出失败') }
  }

  // ── 最新 run 的雷达图数据 ──
  const latestRun = runs[0]
  const radarData = useMemo(() => {
    if (!latestRun) return []
    return [
      { metric: '节点F1', value: latestRun.node_f1 || 0 },
      { metric: '边F1', value: latestRun.edge_f1 || 0 },
      { metric: '门准确率', value: latestRun.gate_accuracy || 0 },
      { metric: '层级准确率', value: latestRun.level_accuracy || 0 },
      { metric: '结构准确率', value: latestRun.structure_accuracy || 0 },
      { metric: '关系F1', value: latestRun.relation_f1 || 0 },
    ]
  }, [latestRun])

  // ── 质量对比柱状图 ──
  const qualityBarData = useMemo(() => {
    if (!latestRun) return []
    const items: any[] = []
    if (latestRun.quality_before != null) items.push({ stage: '修订前', score: latestRun.quality_before, type: '质量分' })
    if (latestRun.quality_after != null) items.push({ stage: '修订后', score: latestRun.quality_after, type: '质量分' })
    if (latestRun.time_manual_baseline != null) items.push({ stage: '人工基线', score: latestRun.time_manual_baseline / 60, type: '耗时(min)' })
    if (latestRun.time_ai_seconds != null) items.push({ stage: 'AI构树', score: latestRun.time_ai_seconds / 60, type: '耗时(min)' })
    if (latestRun.time_expert_seconds != null) items.push({ stage: '专家修订', score: latestRun.time_expert_seconds / 60, type: '耗时(min)' })
    return items
  }, [latestRun])

  /* ═══════════ 渲染 ═══════════ */

  // ── Filter bar (shared) — 返回函数避免同一 JSX 实例被多处引用 ──
  const renderFilterBar = () => (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <Select style={{ width: 160 }} value={filterProject ?? '__all__'}
        onChange={(v: any) => setFilterProject(v === '__all__' ? undefined : v)} showSearch optionFilterProp="label"
        options={[{ label: '全部项目', value: '__all__' }, ...projects.map((p: any) => ({ label: p.name, value: p.id }))]} />
      <Select style={{ width: 140 }} value={filterDevice ?? '__all__'}
        onChange={v => setFilterDevice(v === '__all__' ? undefined : v)}
        options={[{ label: '全部设备', value: '__all__' }, ...[...new Set(projects.map((p: any) => p.device_type).filter(Boolean))].map(d => ({ label: d, value: d }))]} />
      <Select style={{ width: 140 }} value={filterAlgo ?? '__all__'}
        onChange={v => setFilterAlgo(v === '__all__' ? undefined : v)}
        options={[{ label: '全部版本', value: '__all__' }, ...[...new Set(runs.map(r => r.algorithm_version).filter(Boolean))].map(a => ({ label: a, value: a }))]} />
      <div style={{ flex: 1 }} />
      <Button icon={<ReloadOutlined />} onClick={() => { loadRuns(); loadTrend(); loadGoldTrees() }}>刷新</Button>
    </div>
  )

  // ══════════ Tab: Dashboard ══════════
  const renderDashboard = () => (
    <div>
      {renderFilterBar()}

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)', border: 'none' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>结构准确率</span>}
              value={latestRun?.structure_accuracy ?? '—'}
              suffix={latestRun?.structure_accuracy != null ? '%' : ''}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 28 }}
              prefix={<AimOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)', border: 'none' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>关系抽取F1</span>}
              value={latestRun?.relation_f1 ?? '—'}
              suffix={latestRun?.relation_f1 != null ? '%' : ''}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 28 }}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 100%)', border: 'none' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>综合得分</span>}
              value={latestRun?.overall_score ?? '—'}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 28 }}
              prefix={<TrophyOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card style={{ borderRadius: 12, background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', border: 'none' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>评测次数</span>}
              value={runsTotal}
              valueStyle={{ color: '#fff', fontWeight: 700, fontSize: 28 }}
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={14}>
          <Card title={<Space><LineChartOutlined style={{ color: METRIC_COLORS.primary }} /><span style={{ fontWeight: 600 }}>评测趋势</span></Space>}
            style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            {trendData?.labels?.length > 0 ? (
              <SafeChart style={{ height: 280 }} option={{
                tooltip: { trigger: 'axis' },
                legend: { top: 0, textStyle: { fontSize: 11 } },
                grid: { top: 36, left: 45, right: 16, bottom: 28 },
                xAxis: { type: 'category', data: trendData.labels, axisLabel: { fontSize: 10, rotate: 30 } },
                yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
                series: [
                  { name: '结构准确率', type: 'line', smooth: true, data: trendData.structure_accuracy, lineStyle: { width: 2.5 }, itemStyle: { color: METRIC_COLORS.primary }, symbolSize: 4 },
                  { name: '关系F1', type: 'line', smooth: true, data: trendData.relation_f1, lineStyle: { width: 2.5 }, itemStyle: { color: METRIC_COLORS.blue }, symbolSize: 4 },
                  { name: '节点F1', type: 'line', smooth: true, data: trendData.node_f1, lineStyle: { width: 2.5 }, itemStyle: { color: METRIC_COLORS.success }, symbolSize: 4 },
                  { name: '边F1', type: 'line', smooth: true, data: trendData.edge_f1, lineStyle: { width: 2.5 }, itemStyle: { color: METRIC_COLORS.cyan }, symbolSize: 4 },
                  { name: '综合得分', type: 'line', smooth: true, data: trendData.overall_score, lineStyle: { width: 2.5 }, itemStyle: { color: METRIC_COLORS.purple }, symbolSize: 4 },
                ],
                animationDuration: 1200,
              }} />
            ) : <Empty description="暂无趋势数据，请先运行评测" style={{ padding: 40 }} />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title={<Space><AimOutlined style={{ color: METRIC_COLORS.purple }} /><span style={{ fontWeight: 600 }}>最新评测雷达</span></Space>}
            style={{ borderRadius: 12 }} styles={{ body: { padding: '12px 16px' } }}>
            {radarData.length > 0 ? (
              <SafeChart style={{ height: 280 }} option={{
                tooltip: {},
                radar: {
                  indicator: radarData.map((d: any) => ({ name: d.metric, max: 100 })),
                  shape: 'polygon',
                  splitArea: { areaStyle: { color: ['rgba(99,102,241,0.02)', 'rgba(99,102,241,0.06)'] } },
                  axisName: { fontSize: 11, fontWeight: 500, color: '#666' },
                },
                series: [{
                  type: 'radar',
                  data: [{ value: radarData.map((d: any) => d.value), name: '评测指标' }],
                  areaStyle: { color: 'rgba(99,102,241,0.25)' },
                  lineStyle: { color: METRIC_COLORS.primary, width: 2 },
                  itemStyle: { color: METRIC_COLORS.primary },
                  symbol: 'circle', symbolSize: 5,
                }],
              }} />
            ) : <Empty description="暂无数据" style={{ padding: 40 }} />}
          </Card>
        </Col>
      </Row>

      {/* Quality & Time comparison */}
      {qualityBarData.length > 0 && (
        <Card title={<Space><RocketOutlined style={{ color: METRIC_COLORS.success }} /><span style={{ fontWeight: 600 }}>质量 & 效率对比</span></Space>}
          style={{ borderRadius: 12, marginBottom: 20 }}>
          <SafeChart style={{ height: 220 }} option={{
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { top: 0, textStyle: { fontSize: 11 } },
            grid: { top: 30, left: 50, right: 16, bottom: 28 },
            xAxis: { type: 'category', data: [...new Set(qualityBarData.map((d: any) => d.stage))] },
            yAxis: { type: 'value' },
            series: [...new Set(qualityBarData.map((d: any) => d.type))].map((type, idx) => ({
              name: type,
              type: 'bar',
              barMaxWidth: 32,
              itemStyle: { color: idx === 0 ? METRIC_COLORS.primary : METRIC_COLORS.warning, borderRadius: [4, 4, 0, 0] },
              label: { show: true, position: 'top', fontSize: 11, fontWeight: 600 },
              data: [...new Set(qualityBarData.map((d: any) => d.stage))].map(stage => {
                const item = qualityBarData.find((d: any) => d.stage === stage && d.type === type)
                return item ? Math.round(item.score * 10) / 10 : 0
              }),
            })),
          }} />
        </Card>
      )}
    </div>
  )

  // ══════════ Tab: Gold Trees ══════════
  const goldColumns = [
    { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string) => <Text strong>{v}</Text> },
    { title: '顶事件', dataIndex: 'top_event', width: 180, ellipsis: true },
    { title: '设备类型', dataIndex: 'device_type', width: 120, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '—' },
    { title: '节点数', dataIndex: 'node_count', width: 70, render: (v: number) => <Tag>{v}</Tag> },
    { title: '边数', dataIndex: 'edge_count', width: 70, render: (v: number) => <Tag>{v}</Tag> },
    { title: '更新时间', dataIndex: 'updated_at', width: 150, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '—' },
    {
      title: '操作', width: 140,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditingGold(record); goldForm.setFieldsValue({ ...record, structure: JSON.stringify(record.structure, null, 2), relation_annotations: record.relation_annotations ? JSON.stringify(record.relation_annotations, null, 2) : '' }); setGoldModal(true) }} /></Tooltip>
          <Tooltip title="用于评测"><Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={() => { runForm.setFieldsValue({ gold_tree_id: record.id }); setRunModal(true) }} /></Tooltip>
          <Popconfirm title="确定删除?" onConfirm={async () => { await benchmarkApi.deleteGoldTree(record.id); message.success('已删除'); loadGoldTrees() }}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const renderGoldTrees = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingGold(null); goldForm.resetFields(); setGoldModal(true) }}>
            新建标准树
          </Button>
        </Space>
      </div>
      <Table dataSource={goldTrees} columns={goldColumns} rowKey="id" size="small"
        pagination={false} locale={{ emptyText: <Empty description="暂无标准树，请新建或导入" /> }} />
    </div>
  )

  // ══════════ Tab: Eval Runs ══════════
  const runColumns = [
    { title: '名称', dataIndex: 'name', ellipsis: true, render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: '结构准确率', dataIndex: 'structure_accuracy', width: 120, sorter: (a: any, b: any) => (a.structure_accuracy || 0) - (b.structure_accuracy || 0),
      render: (v: number) => <span style={{ color: scoreColor(v), fontWeight: 700, fontSize: 14 }}>{pctText(v)}</span>,
    },
    {
      title: '关系F1', dataIndex: 'relation_f1', width: 100, sorter: (a: any, b: any) => (a.relation_f1 || 0) - (b.relation_f1 || 0),
      render: (v: number) => <span style={{ color: scoreColor(v), fontWeight: 700 }}>{pctText(v)}</span>,
    },
    {
      title: '综合得分', dataIndex: 'overall_score', width: 100, sorter: (a: any, b: any) => (a.overall_score || 0) - (b.overall_score || 0),
      render: (v: number) => <span style={{ color: scoreColor(v), fontWeight: 700, fontSize: 14 }}>{v != null ? v.toFixed(1) : '—'}</span>,
    },
    {
      title: '类型', width: 80,
      render: (_: any, record: any) => (record.details?.mode === 'ai')
        ? <Tag color="purple">AI评测</Tag>
        : <Tag color="blue">对比</Tag>,
    },
    { title: '算法版本', dataIndex: 'algorithm_version', width: 100, render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '—' },
    { title: '时间', dataIndex: 'created_at', width: 150, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '—' },
    {
      title: '操作', width: 180,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="查看详情"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailDrawer(record)} /></Tooltip>
          <Tooltip title="导出 JSON"><Button type="text" size="small" icon={<ExportOutlined />} onClick={() => handleExport(record.id, 'json')} /></Tooltip>
          <Tooltip title="导出 CSV"><Button type="text" size="small" icon={<ExportOutlined style={{ color: METRIC_COLORS.success }} />} onClick={() => handleExport(record.id, 'csv')} /></Tooltip>
          <Popconfirm title="确定删除?" onConfirm={async () => { await benchmarkApi.deleteRun(record.id); message.success('已删除'); loadRuns() }}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const renderRuns = () => (
    <div>
      {renderFilterBar()}
      <div style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => { runForm.resetFields(); setRunModal(true) }}>
          标准树对比评测
        </Button>
        <Button type="primary" ghost icon={<ThunderboltOutlined />} onClick={() => { aiEvalForm.resetFields(); setAiEvalModal(true) }}>
          AI 自动评测
        </Button>
      </div>
      <Table dataSource={runs} columns={runColumns} rowKey="id" size="small" loading={loading}
        pagination={{ total: runsTotal, showTotal: t => `共 ${t} 条` }}
        expandable={{
          expandedRowRender: (record: any) => {
            const d = record.details || {}
            return (
              <div style={{ padding: '8px 0' }}>
                <Row gutter={16}>
                  <Col span={4}><Statistic title="节点P" value={pctText(record.node_precision)} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={4}><Statistic title="节点R" value={pctText(record.node_recall)} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={4}><Statistic title="边P" value={pctText(record.edge_precision)} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={4}><Statistic title="边R" value={pctText(record.edge_recall)} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={4}><Statistic title="门准确率" value={pctText(record.gate_accuracy)} valueStyle={{ fontSize: 14 }} /></Col>
                  <Col span={4}><Statistic title="层级准确率" value={pctText(record.level_accuracy)} valueStyle={{ fontSize: 14 }} /></Col>
                </Row>
                {d.summary && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    标准树: {d.summary.gold_nodes}节点/{d.summary.gold_edges}边 · 生成树: {d.summary.gen_nodes}节点/{d.summary.gen_edges}边 · 错误案例: {d.summary.total_error_cases}个
                  </div>
                )}
              </div>
            )
          },
        }}
      />
    </div>
  )

  // ══════════ Tab: Error Cases ══════════
  const allErrors = useMemo(() => {
    const result: any[] = []
    runs.forEach(run => {
      const cases = (run.details || {}).error_cases || []
      cases.forEach((c: any, idx: number) => {
        result.push({ ...c, run_id: run.id, run_name: run.name, key: `${run.id}-${idx}` })
      })
    })
    return result
  }, [runs])

  const errorColumns = [
    {
      title: '类型', dataIndex: 'type', width: 140,
      render: (v: string) => {
        const colorMap: Record<string, string> = {
          missing_node: 'red', extra_node: 'orange', missing_edge: 'red', extra_edge: 'orange',
          gate_mismatch: 'volcano', missing_gate: 'red', level_mismatch: 'gold', missing_relation: 'magenta',
        }
        const labelMap: Record<string, string> = {
          missing_node: '缺失节点', extra_node: '多余节点', missing_edge: '缺失边', extra_edge: '多余边',
          gate_mismatch: '门类型不一致', missing_gate: '缺失门', level_mismatch: '层级不一致', missing_relation: '缺失关系',
        }
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>
      },
    },
    {
      title: '严重度', dataIndex: 'severity', width: 80,
      render: (v: string) => v === 'error' ? <Tag color="error">错误</Tag> : <Tag color="warning">警告</Tag>,
    },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '来源评测', dataIndex: 'run_name', width: 180, ellipsis: true, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  ]

  const renderErrorCases = () => (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Space>
          <BugOutlined style={{ color: METRIC_COLORS.danger, fontSize: 16 }} />
          <Text strong>错误案例清单</Text>
          <Tag>{allErrors.length} 个</Tag>
        </Space>
      </div>
      <Table dataSource={allErrors} columns={errorColumns} rowKey="key" size="small"
        pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }}
        locale={{ emptyText: <Empty description="暂无错误案例" /> }} />
    </div>
  )

  /* ═══════════ Detail Drawer — 驾驶舱 ═══════════ */
  const renderDetailDrawer = () => {
    const r = detailDrawer
    if (!r) return null
    const d = r.details || r.ai_details || {}
    const isAI = d.mode === 'ai'
    const errors = d.error_cases || d.issues || []
    const timeReduction = d.time_reduction_pct
    const qualityImprove = d.quality_improvement
    const bd = d.score_breakdown || {}
    const topo = d.topology || {}
    const cov = d.coverage || {}
    const issueCnt = d.issue_count || {}
    const totalScore = d.quality_score ?? r.overall_score ?? 0

    // 五维雷达数据
    const DIM_LABELS: Record<string, string> = { structure: '结构', logic: '逻辑', data: '数据', domain: '领域', industrial: '完备' }
    const dimEntries = Object.entries(bd).filter(([, v]) => v != null) as [string, number][]
    const radarIndicator = dimEntries.map(([k]) => ({ name: DIM_LABELS[k] || k, max: 100 }))
    const radarValues = dimEntries.map(([, v]) => v)

    // 拓扑分布饼图
    const topoPie = topo.total_nodes ? [
      { name: '顶事件', value: topo.top_events || 0 },
      { name: '逻辑门', value: topo.gate_nodes || 0 },
      { name: '中间事件', value: topo.middle_events || 0 },
      { name: '基本事件', value: topo.basic_events || 0 },
    ] : []

    // 覆盖率仪表盘数据
    const gaugeItems = [
      { name: '概率完整性', value: cov.probability ?? null, color: '#6366f1' },
      { name: '命名完整性', value: cov.naming ?? null, color: '#3b82f6' },
      { name: '工业字段', value: cov.industrial_fields ?? null, color: '#22c55e' },
    ].filter(g => g.value !== null)

    return (
      <Drawer
        open={!!detailDrawer} onClose={() => setDetailDrawer(null)}
        width={860}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isAI ? 'linear-gradient(135deg,#6366f1,#a78bfa)' : 'linear-gradient(135deg,#3b82f6,#60a5fa)',
            }}>
              {isAI ? <ThunderboltOutlined style={{ color: '#fff', fontSize: 18 }} /> : <FileSearchOutlined style={{ color: '#fff', fontSize: 18 }} />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: '#999' }}>{isAI ? 'AI 多维自动评测' : '标准树对比评测'} · {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : ''}</div>
            </div>
          </div>
        }
      >
        {/* ── 核心分数区 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, padding: '16px 20px', borderRadius: 14,
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0',
        }}>
          {/* 大分数 */}
          <div style={{ textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: scoreColor(totalScore) }}>
              {totalScore.toFixed?.(1) ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>质量分数</div>
            {d.is_valid !== undefined && (
              <Tag color={d.is_valid ? 'success' : 'error'} style={{ marginTop: 6 }}>
                {d.is_valid ? '通过' : '未通过'}
              </Tag>
            )}
          </div>
          {/* 五维进度 */}
          <div style={{ flex: 1 }}>
            {dimEntries.map(([dim, val]) => (
              <div key={dim} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, width: 40, color: '#64748b', fontWeight: 500 }}>{DIM_LABELS[dim] || dim}</span>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 5, transition: 'width 0.8s ease',
                    width: `${Math.max(val, 2)}%`,
                    background: val >= 80 ? 'linear-gradient(90deg,#22c55e,#4ade80)' : val >= 60 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f87171)',
                  }} />
                </div>
                <span style={{ fontSize: 12, width: 36, textAlign: 'right', fontWeight: 700, color: scoreColor(val) }}>
                  {Math.round(val)}
                </span>
              </div>
            ))}
          </div>
          {/* 问题计数 */}
          {(issueCnt.error != null || issueCnt.warning != null) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 80 }}>
              {[{ label: '错误', value: issueCnt.error, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                { label: '警告', value: issueCnt.warning, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                { label: '建议', value: issueCnt.suggestion, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
              ].map(item => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8,
                  background: item.bg, fontSize: 12,
                }}>
                  <span style={{ color: item.color, fontWeight: 800, fontSize: 16 }}>{item.value ?? 0}</span>
                  <span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 图表区: 雷达 + 拓扑 ── */}
        <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
          {radarIndicator.length > 0 && (
            <Col span={topoPie.length > 0 ? 14 : 24}>
              <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}
                title={<span style={{ fontSize: 13, fontWeight: 600 }}><AimOutlined style={{ color: METRIC_COLORS.purple, marginRight: 6 }} />维度雷达</span>}>
                <SafeChart style={{ height: 220 }} option={{
                  radar: {
                    indicator: radarIndicator, shape: 'polygon', radius: '70%',
                    splitArea: { areaStyle: { color: ['rgba(99,102,241,0.02)', 'rgba(99,102,241,0.06)'] } },
                    axisName: { fontSize: 11, fontWeight: 600, color: '#475569' },
                  },
                  series: [{
                    type: 'radar',
                    data: [{ value: radarValues, name: '评测分数', areaStyle: { color: 'rgba(99,102,241,0.25)' } }],
                    lineStyle: { color: METRIC_COLORS.primary, width: 2.5 },
                    itemStyle: { color: METRIC_COLORS.primary }, symbol: 'circle', symbolSize: 6,
                  }],
                  tooltip: {},
                }} />
              </Card>
            </Col>
          )}
          {topoPie.length > 0 && (
            <Col span={radarIndicator.length > 0 ? 10 : 24}>
              <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: '8px 12px' } }}
                title={<span style={{ fontSize: 13, fontWeight: 600 }}><BarChartOutlined style={{ color: METRIC_COLORS.cyan, marginRight: 6 }} />节点分布</span>}>
                <SafeChart style={{ height: 220 }} option={{
                  tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                  series: [{
                    type: 'pie', radius: ['40%', '70%'], center: ['50%', '55%'],
                    label: { fontSize: 11, formatter: '{b}\n{c}' },
                    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
                    data: topoPie,
                    color: [METRIC_COLORS.danger, METRIC_COLORS.warning, METRIC_COLORS.primary, METRIC_COLORS.success],
                  }],
                }} />
              </Card>
            </Col>
          )}
        </Row>

        {/* ── 拓扑统计卡片 ── */}
        {topo.total_nodes != null && (
          <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
            {[
              { label: '总节点', value: topo.total_nodes, icon: '🔵', color: '#6366f1' },
              { label: '总边数', value: topo.total_edges, icon: '🔗', color: '#3b82f6' },
              { label: '树深度', value: topo.max_depth, icon: '📐', color: '#8b5cf6' },
              { label: '分支因子', value: topo.avg_branch_factor, icon: '🌿', color: '#22c55e' },
            ].map(item => (
              <Col span={6} key={item.label}>
                <div style={{
                  textAlign: 'center', padding: '10px 6px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>{item.value ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.label}</div>
                </div>
              </Col>
            ))}
          </Row>
        )}

        {/* ── 覆盖率仪表盘 ── */}
        {gaugeItems.length > 0 && (
          <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { padding: '8px 12px' } }}
            title={<span style={{ fontSize: 13, fontWeight: 600 }}><RocketOutlined style={{ color: METRIC_COLORS.success, marginRight: 6 }} />数据覆盖率</span>}>
            <SafeChart style={{ height: 160 }} option={{
              series: gaugeItems.map((g, idx) => ({
                type: 'gauge', startAngle: 200, endAngle: -20,
                center: [`${17 + idx * 33}%`, '60%'], radius: '80%',
                min: 0, max: 100,
                pointer: { show: false },
                progress: { show: true, width: 12, roundCap: true, itemStyle: { color: g.color } },
                axisLine: { lineStyle: { width: 12, color: [[1, '#e2e8f0']] } },
                axisTick: { show: false }, splitLine: { show: false },
                axisLabel: { show: false },
                title: { fontSize: 11, color: '#64748b', offsetCenter: [0, '90%'] },
                detail: { fontSize: 18, fontWeight: 800, color: g.color, offsetCenter: [0, '30%'], formatter: '{value}%' },
                data: [{ value: g.value, name: g.name }],
              })),
            }} />
          </Card>
        )}

        {/* ── 非AI模式: 传统指标表 ── */}
        {!isAI && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="节点 Precision">{pctText(r.node_precision)}</Descriptions.Item>
              <Descriptions.Item label="节点 Recall">{pctText(r.node_recall)}</Descriptions.Item>
              <Descriptions.Item label="节点 F1">{pctText(r.node_f1)}</Descriptions.Item>
              <Descriptions.Item label="边 Precision">{pctText(r.edge_precision)}</Descriptions.Item>
              <Descriptions.Item label="边 Recall">{pctText(r.edge_recall)}</Descriptions.Item>
              <Descriptions.Item label="边 F1">{pctText(r.edge_f1)}</Descriptions.Item>
              <Descriptions.Item label="门准确率">{pctText(r.gate_accuracy)}</Descriptions.Item>
              <Descriptions.Item label="层级准确率">{pctText(r.level_accuracy)}</Descriptions.Item>
            </Descriptions>

            {(qualityImprove != null || timeReduction != null) && (
              <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
                <Row gutter={16}>
                  {qualityImprove != null && (
                    <Col span={12}>
                      <Space>
                        {qualityImprove >= 0 ? <RiseOutlined style={{ color: METRIC_COLORS.success, fontSize: 20 }} /> : <FallOutlined style={{ color: METRIC_COLORS.danger, fontSize: 20 }} />}
                        <div>
                          <div style={{ fontSize: 12, color: '#999' }}>质量提升</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: qualityImprove >= 0 ? METRIC_COLORS.success : METRIC_COLORS.danger }}>
                            {qualityImprove >= 0 ? '+' : ''}{qualityImprove.toFixed(1)}
                          </div>
                        </div>
                      </Space>
                    </Col>
                  )}
                  {timeReduction != null && (
                    <Col span={12}>
                      <Space>
                        <ClockCircleOutlined style={{ color: METRIC_COLORS.primary, fontSize: 20 }} />
                        <div>
                          <div style={{ fontSize: 12, color: '#999' }}>耗时缩减</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: timeReduction > 0 ? METRIC_COLORS.success : METRIC_COLORS.danger }}>
                            {timeReduction > 0 ? '' : '+'}{timeReduction.toFixed(1)}%
                          </div>
                        </div>
                      </Space>
                    </Col>
                  )}
                </Row>
              </Card>
            )}
          </>
        )}

        {/* ── 问题列表 ── */}
        {errors.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ marginBottom: 8 }}>
              <Space><BugOutlined style={{ color: METRIC_COLORS.danger }} /><Text strong>{isAI ? '问题清单' : '错误案例'} ({errors.length})</Text></Space>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {errors.map((ec: any, i: number) => {
                const sev = ec.severity || 'warning'
                const sevColor = sev === 'ERROR' || sev === 'error' ? METRIC_COLORS.danger : sev === 'WARNING' || sev === 'warning' ? METRIC_COLORS.warning : METRIC_COLORS.blue
                return (
                  <div key={i} style={{
                    padding: '6px 12px', marginBottom: 4, borderRadius: 8, fontSize: 12,
                    background: `${sevColor}08`, borderLeft: `3px solid ${sevColor}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Tag color={sev === 'ERROR' || sev === 'error' ? 'error' : sev === 'WARNING' || sev === 'warning' ? 'warning' : 'processing'}
                      style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                      {ec.category || sev}
                    </Tag>
                    <span style={{ flex: 1 }}>{ec.message || ec.description}</span>
                    {ec.rule_id && <span style={{ color: '#94a3b8', fontSize: 10 }}>{ec.rule_id}</span>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── 建议 ── */}
        {d.suggestions?.length > 0 && (
          <>
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ marginBottom: 8 }}>
              <Space><RocketOutlined style={{ color: METRIC_COLORS.primary }} /><Text strong>改进建议 ({d.suggestions.length})</Text></Space>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {d.suggestions.map((s: any, i: number) => (
                <div key={i} style={{
                  padding: '6px 12px', marginBottom: 4, borderRadius: 8, fontSize: 12,
                  background: 'rgba(99,102,241,0.04)', borderLeft: `3px solid ${METRIC_COLORS.primary}`,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{s.description}</div>
                  <div style={{ color: '#94a3b8' }}>{s.reason}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>
    )
  }

  /* ═══════════ Main Render ═══════════ */
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card
        style={{ borderRadius: 12 }}
        title={
          <Space>
            <BarChartOutlined style={{ color: METRIC_COLORS.primary, fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 17 }}>指标评测中心</span>
            <Text type="secondary" style={{ fontSize: 13 }}>故障树结构 & 关系抽取准确率量化评测</Text>
          </Space>
        }
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} destroyInactiveTabPane items={[
          { key: 'dashboard', label: <Space><BarChartOutlined />总览</Space>, children: renderDashboard() },
          { key: 'goldtrees', label: <Space><TrophyOutlined />标准树</Space>, children: renderGoldTrees() },
          { key: 'runs', label: <Space><PlayCircleOutlined />评测记录</Space>, children: renderRuns() },
          { key: 'errors', label: <Space><BugOutlined />错误案例</Space>, children: renderErrorCases() },
        ]} />
      </Card>

      {/* ═══ 标准树弹窗 ═══ */}
      <Modal
        open={goldModal} width={720}
        title={<Space>{editingGold ? <EditOutlined /> : <PlusOutlined />}{editingGold ? '编辑标准树' : '新建标准树'}</Space>}
        onCancel={() => { setGoldModal(false); setEditingGold(null); goldForm.resetFields() }}
        onOk={handleSaveGold} destroyOnClose
      >
        <Form form={goldForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例：液压系统标准故障树 v1.0" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="project_id" label="所属项目" style={{ flex: 1 }}>
              <Select placeholder="可选" allowClear showSearch optionFilterProp="label"
                options={projects.map((p: any) => ({ label: p.name, value: p.id }))} />
            </Form.Item>
            <Form.Item name="device_type" label="设备类型" style={{ flex: 1 }}>
              <Input placeholder="例：液压泵" />
            </Form.Item>
          </div>
          <Form.Item name="top_event" label="顶事件">
            <Input placeholder="例：液压系统功能失效" />
          </Form.Item>
          <Form.Item name="structure" label="故障树结构 (JSON)" rules={[{ required: true, message: '请输入结构 JSON' }]}
            tooltip='格式: {"nodes": [...], "links": [...]}'>
            <TextArea rows={8} placeholder='{"nodes": [{"id": "1", "type": "topEvent", "data": {"label": "系统失效"}}], "links": []}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <Form.Item name="relation_annotations" label="关系标注 (JSON, 可选)"
            tooltip='格式: [{"source": "实体A", "target": "实体B", "type": "causes"}]'>
            <TextArea rows={4} placeholder='[{"source": "泄漏", "target": "压力下降", "type": "causes"}]' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══ 运行评测弹窗 ═══ */}
      <Modal
        open={runModal} width={640}
        title={<Space><PlayCircleOutlined style={{ color: METRIC_COLORS.primary }} />运行评测</Space>}
        onCancel={() => { setRunModal(false); runForm.resetFields() }}
        onOk={handleRunEval} okText="开始评测" confirmLoading={loading} destroyOnClose
      >
        <Form form={runForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="评测名称">
            <Input placeholder="可选，自动生成时间戳名称" />
          </Form.Item>
          <Form.Item name="gold_tree_id" label="标准树" rules={[{ required: true, message: '请选择标准树' }]}>
            <Select placeholder="选择标准树" showSearch optionFilterProp="label"
              options={goldTrees.map(g => ({ label: `${g.name} (${g.node_count}节点)`, value: g.id }))} />
          </Form.Item>
          <Form.Item name="generated_tree_id" label="生成树 (从已保存树中选择)"
            tooltip="选择已保存的故障树，或下方手动粘贴结构">
            <Select placeholder="可选" allowClear showSearch optionFilterProp="label"
              options={savedTrees.map((t: any) => ({ label: t.name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="generated_structure" label="或粘贴生成树结构 (JSON)"
            tooltip="如果上方已选择生成树，此项留空即可">
            <TextArea rows={4} placeholder='{"nodes": [...], "links": [...]}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <Divider>可选: 质量 & 耗时</Divider>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="algorithm_version" label="算法版本" style={{ flex: 1 }}>
              <Input placeholder="例: v2.1" />
            </Form.Item>
            <Form.Item name="quality_before" label="修订前质量分" style={{ flex: 1 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="quality_after" label="修订后质量分" style={{ flex: 1 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="time_ai_seconds" label="AI构树耗时(秒)" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="time_expert_seconds" label="专家修订耗时(秒)" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="time_manual_baseline" label="人工基线耗时(秒)" style={{ flex: 1 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══ AI 自动评测弹窗 ═══ */}
      <Modal
        open={aiEvalModal} width={560}
        title={<Space><ThunderboltOutlined style={{ color: METRIC_COLORS.purple }} />AI 自动评测</Space>}
        onCancel={() => { setAiEvalModal(false); aiEvalForm.resetFields() }}
        onOk={handleAIEval} okText="开始 AI 评测" confirmLoading={loading} destroyOnClose
      >
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', fontSize: 12, color: '#6366f1' }}>
          AI 评测无需标准树，直接对故障树进行结构完整性、逻辑正确性、数据规范性、领域合理性、工业完备性五维分析。
        </div>
        <Form form={aiEvalForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="评测名称">
            <Input placeholder="可选，自动生成时间戳名称" />
          </Form.Item>
          <Form.Item name="tree_id" label="选择已保存的故障树">
            <Select placeholder="从已保存树中选择" allowClear showSearch optionFilterProp="label"
              options={savedTrees.map((t: any) => ({ label: t.name, value: t.id }))} />
          </Form.Item>
          <Form.Item name="structure" label="或粘贴故障树结构 (JSON)"
            tooltip="如果上方已选择故障树，此项留空即可">
            <TextArea rows={5} placeholder='{"nodes": [...], "links": [...]}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="device_type" label="设备类型（可选）" style={{ flex: 1 }}>
              <Input placeholder="例：液压泵、电气系统" />
            </Form.Item>
            <Form.Item name="algorithm_version" label="算法版本（可选）" style={{ flex: 1 }}>
              <Input placeholder="例: v2.1" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {renderDetailDrawer()}
    </div>
  )
}

/* 顶层错误边界包裹，防止任何渲染异常导致白屏 */
class BenchmarkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  state: { hasError: boolean; error?: Error } = { hasError: false }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error } }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('Benchmark page error:', err, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <CloseCircleOutlined style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>页面渲染出错</div>
          <div style={{ color: '#999', marginBottom: 16 }}>{this.state.error?.message}</div>
          <Button type="primary" onClick={() => this.setState({ hasError: false, error: undefined })}>重试</Button>
        </div>
      )
    }
    return this.props.children
  }
}

const BenchmarkPage: React.FC = () => (
  <BenchmarkErrorBoundary>
    <Benchmark />
  </BenchmarkErrorBoundary>
)

export default BenchmarkPage
