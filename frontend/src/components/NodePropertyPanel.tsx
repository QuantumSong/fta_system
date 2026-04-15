/**
 * 节点属性面板 — 显示/编辑工业 schema 元数据
 */
import React, { useEffect } from 'react'
import { Drawer, Form, Input, InputNumber, Select, Tag, Divider, Typography } from 'antd'
import {
  SEVERITY_OPTIONS, EVIDENCE_LEVEL_OPTIONS, ENTITY_TYPES,
  type FTANodeMeta,
} from '@/schemas/ftaSchema'

const { Text } = Typography

interface Props {
  open: boolean
  node: { id: string; type: string; data: FTANodeMeta } | null
  onClose: () => void
  onChange: (nodeId: string, data: Partial<FTANodeMeta>) => void
}

const nodeTypeLabel: Record<string, string> = {
  topEvent: '顶事件', middleEvent: '中间事件', basicEvent: '底事件',
  andGate: '与门', orGate: '或门', xorGate: '异或门',
  priorityAndGate: '优先与门', inhibitGate: '禁止门', votingGate: '表决门',
  houseEvent: '屋型事件', undevelopedEvent: '未展开事件',
}

const NodePropertyPanel: React.FC<Props> = ({ open, node, onClose, onChange }) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (node) {
      form.setFieldsValue({
        label: node.data.label,
        description: node.data.description || '',
        probability: node.data.probability,
        fault_code: node.data.fault_code || '',
        fault_mode: node.data.fault_mode || '',
        severity: node.data.severity || undefined,
        detection_method: node.data.detection_method || '',
        parameter_name: node.data.parameter_name || '',
        parameter_range: node.data.parameter_range || '',
        maintenance_ref: node.data.maintenance_ref || '',
        evidence_level: node.data.evidence_level || undefined,
      })
    }
  }, [node, form])

  if (!node) return null

  const isEvent = ['topEvent', 'middleEvent', 'basicEvent'].includes(node.type)
  const isBasic = node.type === 'basicEvent'
  const isGate = ['andGate', 'orGate', 'xorGate', 'priorityAndGate', 'inhibitGate', 'votingGate'].includes(node.type)

  const entityInfo = Object.values(ENTITY_TYPES).find(e => e.nodeType === node.type)

  const handleValuesChange = (_: any, allValues: any) => {
    const cleaned: Partial<FTANodeMeta> = {}
    for (const [k, v] of Object.entries(allValues)) {
      if (v !== undefined && v !== '') {
        (cleaned as any)[k] = v
      }
    }
    onChange(node.id, cleaned)
  }

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={entityInfo?.color || '#666'}>{nodeTypeLabel[node.type] || node.type}</Tag>
          <span style={{ fontWeight: 600 }}>{node.data.label || '未命名'}</span>
        </div>
      }
      open={open}
      onClose={onClose}
      width={360}
      mask={false}
      styles={{ body: { paddingTop: 8 } }}
    >
      <Form form={form} layout="vertical" size="small" onValuesChange={handleValuesChange}>
        {/* 基础信息 */}
        <Form.Item name="label" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} placeholder="事件/设备描述" />
        </Form.Item>

        {isEvent && (
          <Form.Item name="probability" label="发生概率">
            <InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }}
              placeholder="0.0 ~ 1.0" />
          </Form.Item>
        )}

        {isGate && (
          <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
            <Text type="secondary">逻辑门节点无需额外属性，其语义由类型决定。</Text>
          </div>
        )}

        {isEvent && (
          <>
            <Divider style={{ margin: '12px 0' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>工业元数据</Text>
            </Divider>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Form.Item name="fault_code" label="故障代码">
                <Input placeholder="例: HYD-2101" />
              </Form.Item>
              <Form.Item name="fault_mode" label="故障模式">
                <Input placeholder="例: 内漏" />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Form.Item name="severity" label="严重等级">
                <Select allowClear placeholder="选择等级"
                  options={SEVERITY_OPTIONS.map(o => ({
                    value: o.value,
                    label: <span><span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: o.color, marginRight: 6,
                    }} />{o.label}</span>,
                  }))}
                />
              </Form.Item>
              <Form.Item name="evidence_level" label="证据等级">
                <Select allowClear placeholder="选择等级"
                  options={EVIDENCE_LEVEL_OPTIONS.map(o => ({
                    value: o.value,
                    label: <span><span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: o.color, marginRight: 6,
                    }} />{o.label}</span>,
                  }))}
                />
              </Form.Item>
            </div>

            <Form.Item name="detection_method" label="检测/调查方式">
              <Input placeholder="例: BITE自检、目视检查" />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <Form.Item name="parameter_name" label="监控参数">
                <Input placeholder="例: 液压压力" />
              </Form.Item>
              <Form.Item name="parameter_range" label="正常范围">
                <Input placeholder="例: 2800-3200 psi" />
              </Form.Item>
            </div>

            {isBasic && (
              <Form.Item name="maintenance_ref" label="维修参考 (AMM/TSM)">
                <Input placeholder="例: AMM 29-11-01" />
              </Form.Item>
            )}
          </>
        )}
      </Form>
    </Drawer>
  )
}

export default NodePropertyPanel
