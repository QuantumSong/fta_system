/**
 * 工业知识专用 Schema — 前端侧唯一 schema 来源
 * 与 backend/src/schemas/fta_schema.py 保持一一对应
 */

/* ============================== 实体类型 ============================== */

export const ENTITY_TYPES: Record<string, {
  label: string; description: string; examples: string[]; color: string; nodeType?: string
}> = {
  TOP_EVENT:     { label: '顶事件', description: '系统级顶层故障事件', examples: ['登机梯系统故障', '液压系统失效'], color: '#ef4444', nodeType: 'topEvent' },
  MIDDLE_EVENT:  { label: '中间事件', description: '传递性过渡故障事件', examples: ['回收功能故障', '压力不足'], color: '#f59e0b', nodeType: 'middleEvent' },
  BASIC_EVENT:   { label: '底事件', description: '不可再分的故障原因', examples: ['密封圈老化', '传感器失灵'], color: '#22c55e', nodeType: 'basicEvent' },
  SYSTEM:        { label: '系统', description: '一级功能系统', examples: ['液压系统', '电气系统'], color: '#6366f1' },
  SUBSYSTEM:     { label: '子系统', description: '二级子系统或功能模块', examples: ['液压动力单元'], color: '#8b5cf6' },
  DEVICE:        { label: '设备/LRU', description: '可外场更换单元', examples: ['液压泵', '发动机'], color: '#3b82f6' },
  COMPONENT:     { label: '部件/零件', description: '不可再拆的零部件', examples: ['密封圈', '阀芯'], color: '#14b8a6' },
  FAULT_MODE:    { label: '故障模式', description: '标准化故障表现', examples: ['内漏', '卡滞', '断路'], color: '#ec4899' },
  FAULT_CODE:    { label: '故障代码', description: '维修手册/BITE编码', examples: ['HYD-2101'], color: '#f43f5e' },
  PARAMETER:     { label: '监控参数', description: '可测量状态参量', examples: ['液压压力', '温度'], color: '#0ea5e9' },
  MAINTENANCE_ACTION: { label: '维修措施', description: '排故/预防动作', examples: ['更换密封圈'], color: '#84cc16' },
}

export const ENTITY_TYPE_KEYS = Object.keys(ENTITY_TYPES)

/* ============================== 关系类型 ============================== */

export const RELATION_TYPES: Record<string, {
  label: string; description: string; logicGate?: string
}> = {
  CAUSES:            { label: '导致', description: '因→果' },
  AND_GATE:          { label: '与门', description: '所有子事件同时发生', logicGate: 'AND' },
  OR_GATE:           { label: '或门', description: '任一子事件发生', logicGate: 'OR' },
  XOR_GATE:          { label: '异或门', description: '恰好一个子事件发生', logicGate: 'XOR' },
  PRIORITY_AND_GATE: { label: '优先与门', description: '按顺序同时发生', logicGate: 'PRIORITY_AND' },
  INHIBIT_GATE:      { label: '禁止门', description: '输入+条件', logicGate: 'INHIBIT' },
  VOTING_GATE:       { label: '表决门', description: 'k/n 触发', logicGate: 'VOTING' },
  PART_OF:           { label: '隶属/组成', description: 'A 是 B 的组成部分' },
  LOCATED_AT:        { label: '安装位置', description: 'A 安装于 B' },
  HAS_FAULT_MODE:    { label: '具有故障模式', description: '设备→故障模式' },
  HAS_FAULT_CODE:    { label: '对应故障代码', description: '事件→故障代码' },
  MONITORED_BY:      { label: '被监控', description: '设备由参数监控' },
  REPAIRED_BY:       { label: '维修措施', description: '故障→维修动作' },
}

export const RELATION_TYPE_KEYS = Object.keys(RELATION_TYPES)

/* ============================== 节点元数据 ============================== */

export interface FTANodeMeta {
  label: string
  description?: string
  probability?: number
  // 工业扩展
  fault_code?: string
  fault_mode?: string
  severity?: 'catastrophic' | 'hazardous' | 'major' | 'minor' | 'no_effect'
  detection_method?: string
  parameter_name?: string
  parameter_range?: string
  maintenance_ref?: string
  evidence_level?: 'direct' | 'inferred' | 'assumed' | 'none'
  source_doc_ids?: number[]
  // UI 内部
  onLabelChange?: (label: string) => void
  nodeWidth?: number
  nodeHeight?: number
  onSizeChange?: (w: number, h: number) => void
  evidenceLevel?: string
}

export const SEVERITY_OPTIONS = [
  { value: 'catastrophic', label: '灾难性', color: '#dc2626' },
  { value: 'hazardous',    label: '危险',   color: '#ea580c' },
  { value: 'major',        label: '重大',   color: '#d97706' },
  { value: 'minor',        label: '轻微',   color: '#65a30d' },
  { value: 'no_effect',    label: '无影响', color: '#9ca3af' },
] as const

export const EVIDENCE_LEVEL_OPTIONS = [
  { value: 'direct',   label: '直接证据', color: '#22c55e' },
  { value: 'inferred', label: '推断',     color: '#3b82f6' },
  { value: 'assumed',  label: '假设',     color: '#f59e0b' },
  { value: 'none',     label: '无',       color: '#9ca3af' },
] as const

/* ============================== 校验规则 ============================== */

export const VALIDATION_RULES: Record<string, { severity: string; label: string }> = {
  STRUCT_NO_TOP_EVENT:       { severity: 'ERROR',   label: '缺少顶事件' },
  STRUCT_MULTI_TOP_EVENT:    { severity: 'WARNING', label: '多个顶事件' },
  STRUCT_ORPHAN_NODE:        { severity: 'WARNING', label: '孤立节点' },
  STRUCT_CYCLE:              { severity: 'ERROR',   label: '循环引用' },
  LOGIC_GATE_UNDERFLOW:      { severity: 'WARNING', label: '逻辑门输入不足' },
  DATA_PROB_RANGE:           { severity: 'ERROR',   label: '概率值超范围' },
  DATA_EMPTY_LABEL:          { severity: 'WARNING', label: '节点名称为空' },
  INDUSTRIAL_NO_FAULT_CODE:  { severity: 'INFO',    label: '底事件缺少故障代码' },
  INDUSTRIAL_NO_FAULT_MODE:  { severity: 'INFO',    label: '底事件缺少故障模式' },
  INDUSTRIAL_NO_SEVERITY:    { severity: 'INFO',    label: '事件缺少严重等级' },
  INDUSTRIAL_PARAM_CONFLICT: { severity: 'WARNING', label: '监控参数范围冲突' },
  INDUSTRIAL_NO_DETECTION:   { severity: 'INFO',    label: '底事件缺少检测方式' },
  INDUSTRIAL_WEAK_EVIDENCE:  { severity: 'INFO',    label: '证据等级较弱' },
  INDUSTRIAL_NO_MAINTENANCE: { severity: 'INFO',    label: '底事件无维修参考' },
}

/* ============================== 映射工具 ============================== */

export function entityTypeToNodeType(entityType: string): string {
  return ENTITY_TYPES[entityType]?.nodeType || 'basicEvent'
}

export function nodeTypeToEntityType(nodeType: string): string {
  const map: Record<string, string> = {
    topEvent: 'TOP_EVENT', middleEvent: 'MIDDLE_EVENT', basicEvent: 'BASIC_EVENT',
    houseEvent: 'BASIC_EVENT', undevelopedEvent: 'BASIC_EVENT',
  }
  return map[nodeType] || 'BASIC_EVENT'
}
