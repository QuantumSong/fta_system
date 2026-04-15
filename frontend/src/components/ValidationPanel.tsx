/**
 * 领域化校验结果面板 — 三级问题展示 + 质量分数 + 忽略 + AI 修复
 */
import React, { useState, useMemo, useCallback } from 'react'
import {
  Card, Tag, Button, Progress, Space, Tooltip, Typography,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, BulbOutlined,
  ThunderboltOutlined, EyeInvisibleOutlined, ToolOutlined,
  ReloadOutlined, RobotOutlined,
} from '@ant-design/icons'

const { Text } = Typography

/* =========== 类型 =========== */

interface IssueTarget {
  kind: 'node' | 'edge' | 'gate' | 'tree'
  id: string
  label: string
}

interface FixAction {
  action: string
  description: string
  auto_fixable: boolean
  params: Record<string, any>
}

interface ValidationIssue {
  type: string
  severity: 'ERROR' | 'WARNING' | 'SUGGESTION'
  message: string
  node_ids: string[]
  edge_ids: string[]
  rule_id: string
  category: string
  targets: IssueTarget[]
  fix_actions: FixAction[]
}

interface ValidationSuggestion {
  type: string
  description: string
  reason: string
  confidence: number
}

export interface ValidationData {
  is_valid: boolean
  quality_score: number
  score_breakdown: Record<string, number>
  issues: ValidationIssue[]
  suggestions: ValidationSuggestion[]
}

interface Props {
  data: ValidationData | null
  onClose: () => void
  onLocateNode?: (nodeId: string) => void
  onIgnoreIssue?: (ruleId: string, nodeId?: string) => void
  onAutoFix?: (issueIndices: number[]) => Promise<void>
  onRevalidate?: () => void
  isFixing?: boolean
  fixProgress?: number
  ignoredIssues?: Set<string>
}

/* =========== 常量 =========== */

const SEV_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  ERROR:      { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  icon: <CloseCircleOutlined />, label: '错误' },
  WARNING:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: <WarningOutlined />,     label: '警告' },
  SUGGESTION: { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: <BulbOutlined />,        label: '建议' },
}

const CAT_LABELS: Record<string, string> = {
  structure: '结构', logic: '逻辑', data: '数据',
  domain: '领域', industrial: '完备', device: '设备',
}

const scoreColor = (s: number) => s >= 80 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444'

/* =========== 组件 =========== */

const ValidationPanel: React.FC<Props> = ({
  data, onClose, onLocateNode, onIgnoreIssue, onAutoFix, onRevalidate,
  isFixing, fixProgress, ignoredIssues,
}) => {
  const [filter, setFilter] = useState<string>('all')

  if (!data) return null

  const { quality_score, score_breakdown, issues, suggestions } = data

  const counts = useMemo(() => {
    const c = { ERROR: 0, WARNING: 0, SUGGESTION: 0 }
    issues.forEach(i => { c[i.severity] = (c[i.severity] || 0) + 1 })
    return c
  }, [issues])

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return issues
    if (filter in SEV_CONFIG) return issues.filter(i => i.severity === filter)
    return issues.filter(i => i.category === filter)
  }, [issues, filter])

  const hasAutoFixable = issues.some(i => i.fix_actions?.some(fa => fa.auto_fixable))

  const handleFixAll = useCallback(async () => {
    if (!onAutoFix) return
    const indices = issues
      .map((iss, idx) => iss.fix_actions?.some(fa => fa.auto_fixable) ? idx : -1)
      .filter(i => i >= 0)
    await onAutoFix(indices)
  }, [issues, onAutoFix])

  const handleFixSingle = useCallback(async (idx: number) => {
    if (!onAutoFix) return
    await onAutoFix([idx])
  }, [onAutoFix])

  return (
    <div className="validation-panel" style={{ maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
      <Card
        size="small"
        title={
          <Space size={8}>
            <CheckCircleOutlined style={{ color: data.is_valid ? 'var(--success)' : 'var(--warning)' }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>校验结果</span>
            <Tag color={counts.ERROR > 0 ? 'error' : counts.WARNING > 0 ? 'warning' : 'success'}>
              {issues.length} 项
            </Tag>
          </Space>
        }
        extra={
          <Space size={4}>
            {onRevalidate && (
              <Tooltip title="重新校验">
                <Button type="text" size="small" icon={<ReloadOutlined />} onClick={onRevalidate} />
              </Tooltip>
            )}
            <Button type="text" size="small" onClick={onClose}>✕</Button>
          </Space>
        }
        styles={{ body: { padding: '8px 12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      >
        {/* 质量分数 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '8px 12px',
          background: 'var(--bg-page)', borderRadius: 10, marginBottom: 10,
        }}>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(quality_score), lineHeight: 1.1 }}>
              {quality_score}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>质量分数</div>
          </div>
          <div style={{ flex: 1 }}>
            {Object.entries(score_breakdown).map(([cat, score]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 11, width: 36, color: 'var(--text-secondary)' }}>
                  {CAT_LABELS[cat] || cat}
                </span>
                <Progress
                  percent={Math.round(score)} size="small" showInfo={false}
                  strokeColor={scoreColor(score)} style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, width: 30, textAlign: 'right', color: scoreColor(score), fontWeight: 600 }}>
                  {Math.round(score)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI 修复进度条 */}
        {isFixing && fixProgress !== undefined && fixProgress > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <RobotOutlined style={{ color: 'var(--primary)', animation: 'pulse 1.5s infinite' }} />
              <Text style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                AI 正在修复中...
              </Text>
              <Text style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                {Math.round(fixProgress)}%
              </Text>
            </div>
            <Progress
              percent={Math.round(fixProgress)} size="small" showInfo={false}
              strokeColor={{ from: '#3b82f6', to: '#22c55e' }}
              status={fixProgress >= 100 ? 'success' : 'active'}
            />
          </div>
        )}

        {/* 统计条 + 过滤 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <Tag color="error" style={{ cursor: 'pointer' }} onClick={() => setFilter(filter === 'ERROR' ? 'all' : 'ERROR')}>
            {counts.ERROR} 错误
          </Tag>
          <Tag color="warning" style={{ cursor: 'pointer' }} onClick={() => setFilter(filter === 'WARNING' ? 'all' : 'WARNING')}>
            {counts.WARNING} 警告
          </Tag>
          <Tag color="blue" style={{ cursor: 'pointer' }} onClick={() => setFilter(filter === 'SUGGESTION' ? 'all' : 'SUGGESTION')}>
            {counts.SUGGESTION} 建议
          </Tag>
          <div style={{ flex: 1 }} />
          {hasAutoFixable && onAutoFix && (
            <Button
              type="primary" size="small" icon={<RobotOutlined />}
              loading={isFixing}
              onClick={handleFixAll}
              style={{ borderRadius: 6 }}
            >
              AI 一键修复
            </Button>
          )}
        </div>

        {/* 问题列表 */}
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(60vh - 220px)' }}>
          {filteredIssues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
              <CheckCircleOutlined style={{ fontSize: 28, marginBottom: 8 }} /><br />
              {filter === 'all' ? '未发现问题' : '该分类无问题'}
            </div>
          ) : (
            filteredIssues.map((issue, i) => {
              const sev = SEV_CONFIG[issue.severity] || SEV_CONFIG.SUGGESTION
              const globalIdx = issues.indexOf(issue)
              const isIgnored = ignoredIssues?.has(issue.rule_id) ||
                issue.node_ids?.some(nid => ignoredIssues?.has(`${issue.rule_id}::${nid}`))

              return (
                <div
                  key={i}
                  style={{
                    padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                    background: isIgnored ? 'var(--bg-page)' : sev.bg,
                    border: `1px solid ${isIgnored ? 'var(--border-light)' : sev.color}20`,
                    opacity: isIgnored ? 0.5 : 1,
                    transition: 'all 0.2s',
                  }}
                >
                  {/* 头部: 严重度 + 规则 + 消息 */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{
                      color: sev.color, fontSize: 12, flexShrink: 0, marginTop: 1,
                    }}>
                      {sev.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <Tag color={sev.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                          {sev.label}
                        </Tag>
                        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }} color="default">
                          {CAT_LABELS[issue.category] || issue.category}
                        </Tag>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{issue.rule_id}</span>
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
                        {issue.message}
                      </div>
                    </div>
                  </div>

                  {/* 定位目标 */}
                  {issue.targets?.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {issue.targets.map((t, ti) => (
                        <Tag
                          key={ti}
                          style={{ fontSize: 10, cursor: t.kind === 'node' || t.kind === 'gate' ? 'pointer' : 'default' }}
                          color={t.kind === 'node' ? 'blue' : t.kind === 'edge' ? 'orange' : t.kind === 'gate' ? 'purple' : 'default'}
                          onClick={() => {
                            if ((t.kind === 'node' || t.kind === 'gate') && t.id && onLocateNode) {
                              onLocateNode(t.id)
                            }
                          }}
                        >
                          {t.kind === 'node' ? '📍' : t.kind === 'edge' ? '🔗' : t.kind === 'gate' ? '⚙️' : '🌲'}{' '}
                          {t.label || t.id}
                        </Tag>
                      ))}
                    </div>
                  )}

                  {/* 修复动作 */}
                  {issue.fix_actions?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {issue.fix_actions.map((fa, fi) => (
                        <Tooltip key={fi} title={fa.description}>
                          {fa.auto_fixable ? (
                            <Button
                              size="small" type="link"
                              icon={<ThunderboltOutlined />}
                              loading={isFixing}
                              onClick={() => handleFixSingle(globalIdx)}
                              style={{ fontSize: 11, padding: '0 4px', height: 22 }}
                            >
                              {fa.description.length > 16 ? fa.description.slice(0, 15) + '…' : fa.description}
                            </Button>
                          ) : (
                            <Tag style={{ fontSize: 10 }} color="default">
                              <ToolOutlined /> {fa.description.length > 20 ? fa.description.slice(0, 19) + '…' : fa.description}
                            </Tag>
                          )}
                        </Tooltip>
                      ))}
                      {onIgnoreIssue && !isIgnored && (
                        <Tooltip title="忽略此问题（专家确认）">
                          <Button
                            size="small" type="text"
                            icon={<EyeInvisibleOutlined />}
                            onClick={() => onIgnoreIssue(issue.rule_id, issue.node_ids?.[0])}
                            style={{ fontSize: 11, padding: '0 4px', height: 22, color: 'var(--text-tertiary)' }}
                          />
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* 建议 */}
        {suggestions?.length > 0 && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
              <BulbOutlined style={{ marginRight: 4 }} />优化建议
            </div>
            {suggestions.map((s, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--primary)', marginBottom: 3, lineHeight: 1.6 }}>
                • {s.description}
                <Text type="secondary" style={{ fontSize: 11 }}> — {s.reason}</Text>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default ValidationPanel
