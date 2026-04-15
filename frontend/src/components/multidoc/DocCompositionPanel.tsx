/**
 * 文档构成 & 贡献度面板 — 展示故障树引用的文档和各文档贡献度
 */
import React from 'react'
import { Drawer, Tag, Progress, Alert, Empty, Divider, Tooltip } from 'antd'
import {
  FileTextOutlined, WarningOutlined, SwapOutlined,
  CheckCircleOutlined, PieChartOutlined,
} from '@ant-design/icons'

const SOURCE_LEVEL_MAP: Record<string, { label: string; color: string }> = {
  official: { label: '官方手册', color: 'green' },
  internal: { label: '内部资料', color: 'blue' },
  thirdparty: { label: '第三方', color: 'orange' },
  forum: { label: '论坛/社区', color: 'default' },
  experience: { label: '自录经验', color: 'purple' },
}

interface DocCompositionPanelProps {
  open: boolean
  onClose: () => void
  composition: any
}

const DocCompositionPanel: React.FC<DocCompositionPanelProps> = ({ open, onClose, composition }) => {
  if (!composition) return null

  const documents = composition.documents || []
  const contributions = composition.contributions || []
  const conflicts = composition.conflicts || []
  const synonymGroups = composition.synonym_groups || []

  const maxContrib = Math.max(...contributions.map((c: any) => c.contribution_score), 0.01)

  return (
    <Drawer
      title={<span style={{ fontWeight: 600 }}><PieChartOutlined style={{ marginRight: 8 }} />文档构成与贡献度</span>}
      open={open}
      onClose={onClose}
      width={500}
    >
      {/* 文档列表 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          <FileTextOutlined style={{ marginRight: 6 }} />
          引用文档 ({documents.length})
        </div>
        {documents.length === 0 ? (
          <Empty description="无关联文档" />
        ) : (
          documents.map((d: any) => {
            const sl = SOURCE_LEVEL_MAP[d.source_level] || { label: d.source_level || '未知', color: 'default' }
            return (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', marginBottom: 6,
                background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0',
              }}>
                <FileTextOutlined style={{ color: '#1890ff' }} />
                <span style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.filename}
                </span>
                <Tag color={sl.color} style={{ fontSize: 11 }}>{sl.label}</Tag>
                <Tooltip title="权重">
                  <Tag style={{ fontSize: 11 }}>{(d.weight || 0).toFixed(1)}</Tag>
                </Tooltip>
              </div>
            )
          })
        )}
      </div>

      {/* 贡献度 */}
      {contributions.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Divider orientation="left" style={{ fontSize: 13, margin: '0 0 12px' }}>
            <PieChartOutlined style={{ marginRight: 4 }} />各文档贡献度
          </Divider>
          {contributions.map((c: any) => (
            <div key={c.document_id} style={{ marginBottom: 10, padding: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{c.filename}</span>
                <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                  RAG: {c.rag_chunk_count} 片段 · KG: {c.kg_entity_count} 实体 / {c.kg_relation_count} 关系
                </span>
              </div>
              <Progress
                percent={Math.round((c.contribution_score / maxContrib) * 100)}
                format={() => `${(c.contribution_score * 100).toFixed(1)}%`}
                strokeColor={c.contribution_score >= 0.3 ? '#1890ff' : c.contribution_score >= 0.1 ? '#52c41a' : '#d9d9d9'}
                size="small"
              />
            </div>
          ))}
        </div>
      )}

      {/* 术语归一 */}
      {synonymGroups.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Divider orientation="left" style={{ fontSize: 13, margin: '0 0 12px' }}>
            <SwapOutlined style={{ marginRight: 4 }} />术语归一 ({synonymGroups.length})
          </Divider>
          {synonymGroups.map((g: any, i: number) => (
            <div key={i} style={{ marginBottom: 6, fontSize: 12 }}>
              <Tag color="blue">{g.canonical}</Tag>
              <span style={{ color: '#8c8c8c' }}>≡</span>
              {g.synonyms.map((s: string, j: number) => (
                <Tag key={j} style={{ fontSize: 11 }}>{s}</Tag>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 冲突 */}
      {conflicts.length > 0 ? (
        <div>
          <Divider orientation="left" style={{ fontSize: 13, margin: '0 0 12px' }}>
            <WarningOutlined style={{ marginRight: 4, color: '#faad14' }} />冲突提示 ({conflicts.length})
          </Divider>
          {conflicts.map((c: any, i: number) => (
            <Alert
              key={i}
              type="warning"
              message={c.message}
              showIcon
              style={{ marginBottom: 6, padding: '6px 10px', fontSize: 12 }}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#52c41a', fontSize: 13 }}>
          <CheckCircleOutlined />
          多文档知识无冲突
        </div>
      )}
    </Drawer>
  )
}

export default DocCompositionPanel
