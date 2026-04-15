/**
 * 多文档联合建树向导 — Steps: 选文档 → 配置权重 → 预检查 → 生成
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Modal, Steps, Button, Table, Tag, Slider, Input, Select,
  Alert, Card, Progress, Space, Tooltip, InputNumber,
  Checkbox, message, Empty, Spin, Divider, List, Popconfirm,
} from 'antd'
import {
  FileSearchOutlined, WarningOutlined, CheckCircleOutlined,
  SaveOutlined, FolderOpenOutlined, DeleteOutlined,
  FileTextOutlined, SafetyCertificateOutlined, ThunderboltOutlined,
  SwapOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import { documentApi, multidocApi } from '@/services/api'

const SOURCE_LEVEL_OPTIONS = [
  { value: 'official', label: '官方手册', color: 'green' },
  { value: 'internal', label: '内部资料', color: 'blue' },
  { value: 'thirdparty', label: '第三方', color: 'orange' },
  { value: 'forum', label: '论坛/社区', color: 'default' },
  { value: 'experience', label: '自录经验', color: 'purple' },
]

const SOURCE_LEVEL_MAP: Record<string, { label: string; color: string }> = {}
SOURCE_LEVEL_OPTIONS.forEach(o => { SOURCE_LEVEL_MAP[o.value] = { label: o.label, color: o.color } })

interface MultiDocWizardProps {
  open: boolean
  projectId: number | null
  onClose: () => void
  onGenerated: (result: any) => void
}

const MultiDocWizard: React.FC<MultiDocWizardProps> = ({ open, projectId, onClose, onGenerated }) => {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)

  // Step 0: 文档列表 & 筛选
  const [allDocs, setAllDocs] = useState<any[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])
  const [filterTag, setFilterTag] = useState<string>('')
  const [filterDevice, setFilterDevice] = useState<string>('')
  const [filterSource, setFilterSource] = useState<string>('')

  // Step 1: 权重 & 配置
  const [docWeights, setDocWeights] = useState<Record<number, number>>({})
  const [topEventName, setTopEventName] = useState('')
  const [topEventDesc, setTopEventDesc] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [maxDepth, setMaxDepth] = useState(5)
  const [enableSynonym, setEnableSynonym] = useState(true)
  const [enableConflict, setEnableConflict] = useState(true)

  // Step 2: 预检查结果
  const [precheckResult, setPrecheckResult] = useState<any>(null)

  // 模板
  const [templates, setTemplates] = useState<any[]>([])
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // 加载文档列表（加载全部文档，包括全局导入和项目内的）
  const loadDocs = useCallback(async () => {
    try {
      setLoading(true)
      // 同时加载项目文档和全局文档，确保知识抽取导入的文档都能看到
      const [projRes, globalRes]: any[] = await Promise.all([
        projectId ? documentApi.getDocuments(String(projectId)) : Promise.resolve({ documents: [] }),
        documentApi.getDocuments(),
      ])
      const projDocs: any[] = Array.isArray(projRes) ? projRes : projRes.documents || []
      const globalDocs: any[] = Array.isArray(globalRes) ? globalRes : globalRes.documents || []
      // 去重合并（以 id 为准）
      const idSet = new Set(projDocs.map((d: any) => d.id))
      const merged = [...projDocs, ...globalDocs.filter((d: any) => !idSet.has(d.id))]
      setAllDocs(merged)
    } catch {
      message.error('加载文档列表失败')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadTemplates = useCallback(async () => {
    try {
      const res: any = await multidocApi.getTemplates(projectId || undefined)
      setTemplates(Array.isArray(res) ? res : [])
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => {
    if (open) {
      loadDocs()
      loadTemplates()
      setStep(0)
      setSelectedDocIds([])
      setDocWeights({})
      setPrecheckResult(null)
      setGenerateProgress(0)
    }
  }, [open, loadDocs, loadTemplates])

  // 筛选后的文档
  const filteredDocs = allDocs.filter(d => {
    if (filterTag && !(d.tags || []).some((t: string) => t.includes(filterTag))) return false
    if (filterDevice && !(d.device_model || '').includes(filterDevice)) return false
    if (filterSource && d.source_level !== filterSource) return false
    return true
  })

  const selectedDocs = allDocs.filter(d => selectedDocIds.includes(d.id))

  // 更新元数据
  const handleMetadataUpdate = async (docId: number, field: string, value: any) => {
    try {
      await documentApi.updateDocumentMetadata(docId, { [field]: value })
      setAllDocs(prev => prev.map(d => d.id === docId ? { ...d, [field]: value } : d))
    } catch {
      message.error('更新失败')
    }
  }

  // 预检查
  const handlePrecheck = async () => {
    if (selectedDocIds.length === 0) { message.warning('请至少选择一个文档'); return }
    if (!topEventName) { message.warning('请输入顶事件名称'); return }
    try {
      setLoading(true)
      const res: any = await multidocApi.precheck({
        project_id: projectId,
        top_event: { name: topEventName, description: topEventDesc, device_type: deviceType },
        document_ids: selectedDocIds,
        generation_config: {
          max_depth: maxDepth,
          enable_synonym_normalization: enableSynonym,
          enable_conflict_detection: enableConflict,
        },
      })
      setPrecheckResult(res)
      setStep(2)
    } catch {
      message.error('预检查失败')
    } finally {
      setLoading(false)
    }
  }

  // 生成
  const handleGenerate = async () => {
    try {
      setGenerating(true)
      setGenerateProgress(0)
      const timer = setInterval(() => {
        setGenerateProgress(p => p >= 90 ? (clearInterval(timer), 90) : p + Math.random() * 10)
      }, 800)

      const docWeightsList = selectedDocIds.map(id => ({
        document_id: id,
        weight: docWeights[id] ?? (allDocs.find(d => d.id === id)?.trust_level || 0.8),
      }))

      const result: any = await multidocApi.generate({
        project_id: projectId,
        top_event: { name: topEventName, description: topEventDesc, device_type: deviceType },
        document_ids: selectedDocIds,
        document_weights: docWeightsList,
        generation_config: {
          max_depth: maxDepth,
          enable_synonym_normalization: enableSynonym,
          enable_conflict_detection: enableConflict,
        },
      })

      clearInterval(timer)
      setGenerateProgress(100)
      message.success(`多文档联合建树成功: ${result.statistics?.node_count || 0} 个节点`)
      setTimeout(() => onGenerated(result), 400)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败')
    } finally {
      setGenerating(false)
      setGenerateProgress(0)
    }
  }

  // 模板操作
  const handleSaveTemplate = async () => {
    if (!templateName) { message.warning('请输入模板名称'); return }
    try {
      const wMap: Record<string, number> = {}
      selectedDocIds.forEach(id => { wMap[String(id)] = docWeights[id] ?? 0.8 })
      await multidocApi.createTemplate({
        name: templateName,
        project_id: projectId,
        device_type: deviceType,
        document_ids: selectedDocIds,
        document_weights: wMap,
        generation_config: { max_depth: maxDepth, enable_synonym_normalization: enableSynonym, enable_conflict_detection: enableConflict },
      })
      message.success('模板已保存')
      setTemplateName('')
      loadTemplates()
    } catch {
      message.error('保存模板失败')
    }
  }

  const handleApplyTemplate = (t: any) => {
    setSelectedDocIds(t.document_ids || [])
    if (t.document_weights) {
      const wm: Record<number, number> = {}
      Object.entries(t.document_weights).forEach(([k, v]) => { wm[Number(k)] = v as number })
      setDocWeights(wm)
    }
    if (t.device_type) setDeviceType(t.device_type)
    if (t.generation_config) {
      if (t.generation_config.max_depth) setMaxDepth(t.generation_config.max_depth)
    }
    message.success(`已加载模板「${t.name}」`)
    setTemplateDrawerOpen(false)
  }

  // 文档选择表格列
  const docColumns = [
    {
      title: '文件名',
      dataIndex: 'filename',
      key: 'filename',
      width: 180,
      ellipsis: true,
      render: (v: string) => <span style={{ fontWeight: 500 }}><FileTextOutlined style={{ marginRight: 4 }} />{v}</span>,
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 160,
      render: (tags: string[], record: any) => (
        <Select
          mode="tags"
          size="small"
          style={{ width: '100%' }}
          value={tags || []}
          placeholder="添加标签"
          onChange={(v) => handleMetadataUpdate(record.id, 'tags', v)}
        />
      ),
    },
    {
      title: '设备型号',
      dataIndex: 'device_model',
      key: 'device_model',
      width: 120,
      render: (v: string, record: any) => (
        <Input
          size="small"
          value={v || ''}
          placeholder="型号"
          onChange={e => handleMetadataUpdate(record.id, 'device_model', e.target.value)}
        />
      ),
    },
    {
      title: '来源级别',
      dataIndex: 'source_level',
      key: 'source_level',
      width: 110,
      render: (v: string, record: any) => (
        <Select
          size="small"
          style={{ width: '100%' }}
          value={v || 'internal'}
          options={SOURCE_LEVEL_OPTIONS}
          onChange={(val) => handleMetadataUpdate(record.id, 'source_level', val)}
        />
      ),
    },
    {
      title: '可信度',
      dataIndex: 'trust_level',
      key: 'trust_level',
      width: 90,
      render: (v: number, record: any) => (
        <InputNumber
          size="small"
          min={0} max={1} step={0.1}
          value={v ?? 0.8}
          style={{ width: '100%' }}
          onChange={(val) => handleMetadataUpdate(record.id, 'trust_level', val)}
        />
      ),
    },
    {
      title: '类型',
      dataIndex: 'doc_type',
      key: 'doc_type',
      width: 60,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v || '-'}</Tag>,
    },
  ]

  return (
    <Modal
      title={
        <span style={{ fontWeight: 600 }}>
          <ExperimentOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          多文档联合建树
        </span>
      }
      open={open}
      onCancel={() => { if (!generating) onClose() }}
      width={920}
      footer={null}
      destroyOnClose
    >
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 20 }}
        items={[
          { title: '选择文档' },
          { title: '配置参数' },
          { title: '预检查' },
          { title: '生成' },
        ]}
      />

      {/* ===== Step 0: 选择文档 ===== */}
      {step === 0 && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Input
              size="small" placeholder="按标签筛选" prefix={<FileSearchOutlined />}
              value={filterTag} onChange={e => setFilterTag(e.target.value)}
              style={{ width: 150 }}
            />
            <Input
              size="small" placeholder="按设备型号筛选"
              value={filterDevice} onChange={e => setFilterDevice(e.target.value)}
              style={{ width: 150 }}
            />
            <Select
              size="small"
              style={{ width: 120 }}
              value={filterSource || '__all__'}
              options={[{ label: '全部来源', value: '__all__' }, ...SOURCE_LEVEL_OPTIONS]}
              onChange={v => setFilterSource(v === '__all__' ? '' : v)}
            />
            <div style={{ flex: 1 }} />
            <Button size="small" icon={<FolderOpenOutlined />} onClick={() => setTemplateDrawerOpen(true)}>
              加载模板
            </Button>
          </div>

          <Table
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={filteredDocs}
            columns={docColumns}
            pagination={{ pageSize: 8, size: 'small' }}
            scroll={{ x: 720 }}
            rowSelection={{
              selectedRowKeys: selectedDocIds,
              onChange: (keys) => setSelectedDocIds(keys as number[]),
            }}
          />

          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>
              已选 <b>{selectedDocIds.length}</b> 份文档
            </span>
            <Button type="primary" disabled={selectedDocIds.length === 0} onClick={() => setStep(1)}>
              下一步：配置参数
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 1: 配置参数 & 权重 ===== */}
      {step === 1 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>顶事件名称 *</label>
              <Input
                placeholder="例如：登机梯故障"
                value={topEventName}
                onChange={e => setTopEventName(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>设备类型</label>
              <Input
                placeholder="例如：登机梯系统"
                value={deviceType}
                onChange={e => setDeviceType(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>故障描述</label>
            <Input.TextArea
              rows={2}
              placeholder="描述故障现象..."
              value={topEventDesc}
              onChange={e => setTopEventDesc(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 13 }}>最大深度</label>
              <InputNumber min={2} max={10} value={maxDepth} onChange={v => setMaxDepth(v || 5)} style={{ marginLeft: 8 }} />
            </div>
            <Checkbox checked={enableSynonym} onChange={e => setEnableSynonym(e.target.checked)}>
              <SwapOutlined style={{ marginRight: 4 }} />术语归一
            </Checkbox>
            <Checkbox checked={enableConflict} onChange={e => setEnableConflict(e.target.checked)}>
              <WarningOutlined style={{ marginRight: 4 }} />冲突检测
            </Checkbox>
          </div>

          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 12px' }}>
            <SafetyCertificateOutlined style={{ marginRight: 4 }} />文档权重
          </Divider>

          <div style={{ maxHeight: 240, overflow: 'auto' }}>
            {selectedDocs.map(d => {
              const w = docWeights[d.id] ?? d.trust_level ?? 0.8
              const sl = SOURCE_LEVEL_MAP[d.source_level] || { label: d.source_level, color: 'default' }
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: '#fafafa', borderRadius: 6 }}>
                  <FileTextOutlined />
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.filename}
                  </span>
                  <Tag color={sl.color} style={{ fontSize: 11 }}>{sl.label}</Tag>
                  <Tooltip title={`权重: ${w.toFixed(1)}`}>
                    <Slider
                      min={0.1} max={2} step={0.1}
                      value={w}
                      onChange={v => setDocWeights(prev => ({ ...prev, [d.id]: v }))}
                      style={{ width: 120, margin: '0 8px' }}
                    />
                  </Tooltip>
                  <span style={{ width: 30, fontSize: 12, textAlign: 'right' }}>{w.toFixed(1)}</span>
                </div>
              )
            })}
          </div>

          {/* 保存模板 */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              size="small" placeholder="模板名称"
              value={templateName} onChange={e => setTemplateName(e.target.value)}
              style={{ width: 180 }}
            />
            <Button size="small" icon={<SaveOutlined />} onClick={handleSaveTemplate} disabled={!templateName}>
              保存为模板
            </Button>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(0)}>上一步</Button>
            <Button type="primary" onClick={handlePrecheck} loading={loading} disabled={!topEventName}>
              下一步：预检查
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 2: 预检查结果 ===== */}
      {step === 2 && (
        <div>
          {precheckResult ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <Card size="small" title={<><SwapOutlined style={{ marginRight: 4 }} />术语归一</>}>
                  {precheckResult.synonym_groups?.length > 0 ? (
                    <div style={{ maxHeight: 160, overflow: 'auto' }}>
                      {precheckResult.synonym_groups.map((g: any, i: number) => (
                        <div key={i} style={{ marginBottom: 6, fontSize: 12 }}>
                          <Tag color="blue">{g.canonical}</Tag>
                          <span style={{ color: '#8c8c8c' }}>≡</span>
                          {g.synonyms.map((s: string, j: number) => (
                            <Tag key={j} style={{ fontSize: 11 }}>{s}</Tag>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>无需归一化处理</span>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                    归一化后实体: {precheckResult.normalized_entity_count || 0}
                  </div>
                </Card>
                <Card size="small" title={<><WarningOutlined style={{ marginRight: 4, color: '#faad14' }} />冲突检测</>}>
                  {precheckResult.conflicts?.length > 0 ? (
                    <div style={{ maxHeight: 160, overflow: 'auto' }}>
                      {precheckResult.conflicts.map((c: any, i: number) => (
                        <Alert
                          key={i}
                          type="warning"
                          message={c.message}
                          showIcon
                          style={{ marginBottom: 6, padding: '4px 8px', fontSize: 12 }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      <span style={{ color: '#52c41a', fontSize: 12 }}>未检测到冲突</span>
                    </div>
                  )}
                </Card>
              </div>

              <Card size="small" title={<><FileTextOutlined style={{ marginRight: 4 }} />参与文档</>} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(precheckResult.documents || []).map((d: any) => {
                    const sl = SOURCE_LEVEL_MAP[d.source_level] || { label: d.source_level, color: 'default' }
                    return (
                      <Tag key={d.id} style={{ fontSize: 12 }}>
                        {d.filename}
                        <span style={{ marginLeft: 4, opacity: 0.6 }}>({sl.label})</span>
                      </Tag>
                    )
                  })}
                </div>
              </Card>
            </>
          ) : (
            <Spin />
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(1)}>上一步</Button>
            <Button type="primary" onClick={() => setStep(3)}>
              确认并生成
            </Button>
          </div>
        </div>
      )}

      {/* ===== Step 3: 生成 ===== */}
      {step === 3 && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {!generating && generateProgress === 0 && (
            <>
              <ThunderboltOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>准备就绪</div>
              <div style={{ color: '#8c8c8c', marginBottom: 24, fontSize: 13 }}>
                {selectedDocIds.length} 份文档 · 顶事件「{topEventName}」· 最大深度 {maxDepth}
              </div>
              <Space>
                <Button onClick={() => setStep(2)}>返回检查</Button>
                <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={handleGenerate}>
                  开始联合建树
                </Button>
              </Space>
            </>
          )}
          {generating && (
            <>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#1890ff', marginBottom: 12 }}>
                {generateProgress < 30 ? '🔍 正在融合多文档知识...'
                  : generateProgress < 60 ? '🧠 AI 正在构建故障树...'
                  : generateProgress < 90 ? '📊 正在计算贡献度...'
                  : '✅ 即将完成...'}
              </div>
              <Progress
                percent={Math.round(generateProgress)}
                status="active"
                strokeColor={{ '0%': '#6366f1', '100%': '#8b5cf6' }}
                style={{ maxWidth: 400, margin: '0 auto' }}
              />
            </>
          )}
        </div>
      )}

      {/* ===== 模板抽屉 ===== */}
      <Modal
        title={<><FolderOpenOutlined style={{ marginRight: 8 }} />建树模板</>}
        open={templateDrawerOpen}
        onCancel={() => setTemplateDrawerOpen(false)}
        footer={null}
        width={460}
      >
        {templates.length === 0 ? (
          <Empty description="暂无模板" />
        ) : (
          <List
            size="small"
            dataSource={templates}
            renderItem={(t: any) => (
              <List.Item
                actions={[
                  <Button key="apply" type="link" size="small" onClick={() => handleApplyTemplate(t)}>应用</Button>,
                  <Popconfirm key="del" title="确定删除?" onConfirm={async () => { await multidocApi.deleteTemplate(t.id); loadTemplates() }}>
                    <Button type="link" size="small" danger><DeleteOutlined /></Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={t.name}
                  description={`${(t.document_ids || []).length} 份文档 · ${t.device_type || '通用设备'}`}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </Modal>
  )
}

export default MultiDocWizard
