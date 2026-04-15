/**
 * 专家模式 — 专家指导规则管理（增删改查）
 * 支持全局 / 项目级别，类型：忽略 / 指导 / 自定义检查
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, Switch, Tag, Space,
  Tooltip, message, Popconfirm, Radio, InputNumber, Badge, Empty, Typography,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined,
  EyeInvisibleOutlined, BulbOutlined, ToolOutlined,
  ReloadOutlined, GlobalOutlined, FolderOutlined,
} from '@ant-design/icons'
import { expertApi, projectApi } from '@/services/api'

const { TextArea } = Input
const { Text } = Typography

/* =========== 常量 =========== */

const RULE_TYPES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ignore:       { label: '忽略规则', color: 'orange',  icon: <EyeInvisibleOutlined /> },
  guidance:     { label: '专家指导', color: 'blue',    icon: <BulbOutlined /> },
  custom_check: { label: '自定义检查', color: 'purple', icon: <ToolOutlined /> },
}

const SCOPE_OPTIONS = [
  { label: '全局', value: 'global', icon: <GlobalOutlined /> },
  { label: '项目', value: 'project', icon: <FolderOutlined /> },
]

/* =========== 组件 =========== */

const ExpertMode: React.FC = () => {
  const [rules, setRules] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)
  const [form] = Form.useForm()

  // 过滤
  const [filterScope, setFilterScope] = useState<string | undefined>()
  const [filterType, setFilterType] = useState<string | undefined>()
  const [filterProject, setFilterProject] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const pageSize = 20

  // 加载项目列表
  useEffect(() => {
    projectApi.getProjects().then((res: any) => {
      setProjects(res?.projects || res || [])
    }).catch(() => {})
  }, [])

  // 加载规则列表
  const loadRules = useCallback(async () => {
    try {
      setLoading(true)
      const res: any = await expertApi.listRules({
        scope: filterScope, project_id: filterProject,
        rule_type: filterType, page, page_size: pageSize,
      })
      setRules(res.rules || [])
      setTotal(res.total || 0)
    } catch {
      message.error('加载专家规则失败')
    } finally {
      setLoading(false)
    }
  }, [filterScope, filterProject, filterType, page])

  useEffect(() => { loadRules() }, [loadRules])

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      if (values.scope === 'global') {
        values.project_id = null
      }
      if (editingRule) {
        await expertApi.updateRule(editingRule.id, values)
        message.success('更新成功')
      } else {
        await expertApi.createRule(values)
        message.success('创建成功')
      }
      setModalOpen(false)
      setEditingRule(null)
      form.resetFields()
      loadRules()
    } catch {
      // validation error
    }
  }

  // 删除
  const handleDelete = async (id: number) => {
    await expertApi.deleteRule(id)
    message.success('已删除')
    loadRules()
  }

  // 切换启停
  const handleToggle = async (record: any, enabled: boolean) => {
    await expertApi.updateRule(record.id, { enabled })
    message.success(enabled ? '已启用' : '已禁用')
    loadRules()
  }

  // 编辑
  const handleEdit = (record: any) => {
    setEditingRule(record)
    form.setFieldsValue(record)
    setModalOpen(true)
  }

  // 新建
  const handleCreate = () => {
    setEditingRule(null)
    form.resetFields()
    form.setFieldsValue({ rule_type: 'ignore', scope: 'global', priority: 0, enabled: true })
    setModalOpen(true)
  }

  const columns = [
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 60,
      render: (v: boolean, record: any) => (
        <Switch size="small" checked={v} onChange={(checked) => handleToggle(record, checked)} />
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
      render: (v: string, record: any) => (
        <Space size={4}>
          <Text strong style={{ fontSize: 13 }}>{v}</Text>
          {record.scope === 'global' ? (
            <Tag color="cyan" style={{ fontSize: 10 }}><GlobalOutlined /> 全局</Tag>
          ) : (
            <Tag color="geekblue" style={{ fontSize: 10 }}><FolderOutlined /> 项目</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'rule_type',
      width: 120,
      render: (v: string) => {
        const cfg = RULE_TYPES[v]
        return cfg ? <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag> : v
      },
    },
    {
      title: '目标规则',
      dataIndex: 'target_rule_id',
      width: 180,
      ellipsis: true,
      render: (v: string) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: '节点匹配',
      dataIndex: 'target_node_pattern',
      width: 140,
      ellipsis: true,
      render: (v: string) => v ? <code style={{ fontSize: 11 }}>{v}</code> : <Text type="secondary">—</Text>,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 70,
      sorter: (a: any, b: any) => a.priority - b.priority,
      render: (v: number) => <Badge count={v} showZero color={v > 5 ? '#f5222d' : v > 0 ? '#faad14' : '#d9d9d9'} />,
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm title="确定删除此规则？" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: 'var(--primary)', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>专家模式</span>
            <Text type="secondary" style={{ fontSize: 13 }}>管理校验忽略规则、专家指导和自定义检查</Text>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建规则
          </Button>
        }
      >
        {/* 过滤栏 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            style={{ width: 120 }}
            value={filterScope ?? '__all__'} onChange={(v: any) => { setFilterScope(v === '__all__' ? undefined : v); setPage(1) }}
            options={[{ label: '全部作用域', value: '__all__' }, { label: '全局', value: 'global' }, { label: '项目', value: 'project' }]}
          />
          <Select
            style={{ width: 140 }}
            value={filterType ?? '__all__'} onChange={(v: any) => { setFilterType(v === '__all__' ? undefined : v); setPage(1) }}
            options={[{ label: '全部类型', value: '__all__' }, ...Object.entries(RULE_TYPES).map(([k, v]) => ({ label: v.label, value: k }))]}
          />
          <Select
            showSearch optionFilterProp="label"
            style={{ width: 200 }} value={filterProject ?? '__all__'}
            onChange={(v: any) => { setFilterProject(v === '__all__' ? undefined : v); setPage(1) }}
            options={[{ label: '全部项目', value: '__all__' }, ...projects.map((p: any) => ({ label: p.name, value: p.id }))]}
          />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={loadRules}>刷新</Button>
        </div>

        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page, pageSize, total,
            onChange: (p) => setPage(p),
            showTotal: (t) => `共 ${t} 条`,
            showSizeChanger: false,
          }}
          expandable={{
            expandedRowRender: (record: any) => (
              <div style={{ padding: '8px 0' }}>
                {record.description && (
                  <div style={{ marginBottom: 6 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>描述：</Text>
                    <span style={{ fontSize: 13 }}>{record.description}</span>
                  </div>
                )}
                {record.content && (
                  <div style={{
                    background: 'var(--bg-page)', padding: '8px 12px', borderRadius: 8,
                    fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>专家指导内容：</Text>
                    <div>{record.content}</div>
                  </div>
                )}
                {!record.description && !record.content && (
                  <Text type="secondary">无详细内容</Text>
                )}
              </div>
            ),
            rowExpandable: (record: any) => !!(record.description || record.content),
          }}
          locale={{ emptyText: <Empty description="暂无专家规则，点击右上角新建" /> }}
        />
      </Card>

      {/* 新建 / 编辑弹窗 */}
      <Modal
        open={modalOpen}
        title={
          <Space>
            {editingRule ? <EditOutlined /> : <PlusOutlined />}
            {editingRule ? '编辑专家规则' : '新建专家规则'}
          </Space>
        }
        onCancel={() => { setModalOpen(false); setEditingRule(null); form.resetFields() }}
        onOk={handleSave}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例：忽略液压系统术语不统一警告" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="rule_type" label="类型" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select>
                {Object.entries(RULE_TYPES).map(([k, v]) => (
                  <Select.Option key={k} value={k}>
                    <Space size={4}>{v.icon}{v.label}</Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="scope" label="作用域" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Radio.Group>
                {SCOPE_OPTIONS.map(o => (
                  <Radio.Button key={o.value} value={o.value}>
                    <Space size={4}>{o.icon}{o.label}</Space>
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          </div>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.scope !== cur.scope}>
            {({ getFieldValue }) =>
              getFieldValue('scope') === 'project' && (
                <Form.Item name="project_id" label="所属项目" rules={[{ required: true, message: '选择项目' }]}>
                  <Select placeholder="选择项目" showSearch optionFilterProp="label"
                    options={projects.map((p: any) => ({ label: p.name, value: p.id }))} />
                </Form.Item>
              )
            }
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input placeholder="简要说明此规则的用途" />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="target_rule_id" label="目标校验规则 ID" style={{ flex: 1 }}
              tooltip="如 DOMAIN_TERM_INCONSISTENT，留空表示不限">
              <Input placeholder="例：DOMAIN_TERM_INCONSISTENT" />
            </Form.Item>
            <Form.Item name="target_node_pattern" label="目标节点匹配" style={{ flex: 1 }}
              tooltip="节点名称或 ID 的匹配模式，支持通配符 *">
              <Input placeholder="例：液压泵*" />
            </Form.Item>
          </div>

          <Form.Item name="content" label="专家指导内容"
            tooltip="详细的专家经验说明，会在校验结果中展示给用户">
            <TextArea rows={4} placeholder={'例：液压系统中泄漏和泄露在本项目中含义相同，无需修改。'} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="priority" label="优先级" style={{ flex: 1 }}
              tooltip="数值越大优先级越高，高优先级规则在冲突时覆盖低优先级">
              <InputNumber min={0} max={99} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked" style={{ flex: 1 }}>
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default ExpertMode
