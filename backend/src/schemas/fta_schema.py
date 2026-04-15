"""
工业知识专用 Schema — 系统内所有模块共享的字段口径

本模块是抽取、生成、校验、UI 的唯一 schema 来源。
任何新增/变更都应在此处修改后同步到前端 fta_schema.ts。
"""

# =====================================================================
# 1. 实体类型 (EntityType)
# =====================================================================

ENTITY_TYPES = {
    # ---- FTA 事件层 ----
    "TOP_EVENT": {
        "label": "顶事件",
        "description": "系统级顶层故障事件",
        "examples": ["登机梯系统故障", "液压系统失效", "飞行控制系统失效"],
        "color": "#ef4444",
        "node_type": "topEvent",
    },
    "MIDDLE_EVENT": {
        "label": "中间事件",
        "description": "传递性过渡故障事件",
        "examples": ["回收功能故障", "压力不足", "电源中断"],
        "color": "#f59e0b",
        "node_type": "middleEvent",
    },
    "BASIC_EVENT": {
        "label": "底事件",
        "description": "最基本的不可再分的故障原因",
        "examples": ["密封圈老化", "传感器失灵", "焊点虚焊"],
        "color": "#22c55e",
        "node_type": "basicEvent",
    },
    # ---- 设备/物理层 ----
    "SYSTEM": {
        "label": "系统",
        "description": "一级功能系统",
        "examples": ["液压系统", "电气系统", "飞行控制系统"],
        "color": "#6366f1",
    },
    "SUBSYSTEM": {
        "label": "子系统",
        "description": "二级子系统或功能模块",
        "examples": ["液压动力单元", "应急液压系统", "自动驾驶模块"],
        "color": "#8b5cf6",
    },
    "DEVICE": {
        "label": "设备/LRU",
        "description": "可外场更换单元(LRU)或独立设备",
        "examples": ["液压泵", "发动机", "飞行数据记录仪"],
        "color": "#3b82f6",
    },
    "COMPONENT": {
        "label": "部件/零件",
        "description": "设备内部不可再拆的零部件",
        "examples": ["密封圈", "阀芯", "继电器触点"],
        "color": "#14b8a6",
    },
    # ---- 运维/参数层 ----
    "FAULT_MODE": {
        "label": "故障模式",
        "description": "标准化的故障表现形式",
        "examples": ["内漏", "卡滞", "断路", "过热"],
        "color": "#ec4899",
    },
    "FAULT_CODE": {
        "label": "故障代码",
        "description": "维修手册或 BITE 报告的编码",
        "examples": ["HYD-2101", "ECAM ELEC DC ESS BUS"],
        "color": "#f43f5e",
    },
    "PARAMETER": {
        "label": "监控参数",
        "description": "可测量的状态参量",
        "examples": ["液压压力", "温度", "电压", "振动频率"],
        "color": "#0ea5e9",
    },
    "MAINTENANCE_ACTION": {
        "label": "维修措施",
        "description": "排故/预防的维修动作",
        "examples": ["更换密封圈", "校准传感器", "功能测试"],
        "color": "#84cc16",
    },
}

# 全部允许的 entity_type 值
ENTITY_TYPE_KEYS = list(ENTITY_TYPES.keys())


# =====================================================================
# 2. 关系类型 (RelationType)
# =====================================================================

RELATION_TYPES = {
    # ---- FTA 逻辑关系 ----
    "CAUSES": {
        "label": "导致",
        "description": "因→果，A 发生会导致 B 发生",
        "direction": "cause_to_effect",
    },
    "AND_GATE": {
        "label": "与门",
        "description": "所有子事件同时发生才导致父事件",
        "direction": "children_to_gate",
        "logic_gate": "AND",
    },
    "OR_GATE": {
        "label": "或门",
        "description": "任一子事件发生就导致父事件",
        "direction": "children_to_gate",
        "logic_gate": "OR",
    },
    "XOR_GATE": {
        "label": "异或门",
        "description": "恰好一个子事件发生导致父事件",
        "direction": "children_to_gate",
        "logic_gate": "XOR",
    },
    "PRIORITY_AND_GATE": {
        "label": "优先与门",
        "description": "子事件按特定顺序同时发生",
        "direction": "children_to_gate",
        "logic_gate": "PRIORITY_AND",
    },
    "INHIBIT_GATE": {
        "label": "禁止门",
        "description": "输入事件发生且条件满足时输出",
        "direction": "children_to_gate",
        "logic_gate": "INHIBIT",
    },
    "VOTING_GATE": {
        "label": "表决门",
        "description": "k/n 子事件发生即触发",
        "direction": "children_to_gate",
        "logic_gate": "VOTING",
    },
    # ---- 物理/结构关系 ----
    "PART_OF": {
        "label": "隶属/组成",
        "description": "A 是 B 的组成部分",
    },
    "LOCATED_AT": {
        "label": "安装位置",
        "description": "A 安装/位于 B",
    },
    # ---- 运维关系 ----
    "HAS_FAULT_MODE": {
        "label": "具有故障模式",
        "description": "设备/部件 → 故障模式",
    },
    "HAS_FAULT_CODE": {
        "label": "对应故障代码",
        "description": "事件/故障模式 → 故障代码",
    },
    "MONITORED_BY": {
        "label": "被监控",
        "description": "设备/事件由某参数监控",
    },
    "REPAIRED_BY": {
        "label": "维修措施",
        "description": "故障 → 维修动作",
    },
}

RELATION_TYPE_KEYS = list(RELATION_TYPES.keys())


# =====================================================================
# 3. 节点元数据字段 (FTA Node Metadata) — 挂在 node.data 上
# =====================================================================

NODE_META_FIELDS = {
    # 核心字段（每个节点必有）
    "label":            {"type": "string",  "required": True,  "label": "节点名称"},
    "description":      {"type": "string",  "required": False, "label": "描述"},
    "probability":      {"type": "float",   "required": False, "label": "发生概率", "min": 0, "max": 1},
    # 工业扩展字段
    "fault_code":       {"type": "string",  "required": False, "label": "故障代码"},
    "fault_mode":       {"type": "string",  "required": False, "label": "故障模式"},
    "severity":         {"type": "enum",    "required": False, "label": "严重等级",
                         "options": ["catastrophic", "hazardous", "major", "minor", "no_effect"]},
    "detection_method": {"type": "string",  "required": False, "label": "检测/调查方式"},
    "parameter_name":   {"type": "string",  "required": False, "label": "监控参数名"},
    "parameter_range":  {"type": "string",  "required": False, "label": "参数正常范围"},
    "maintenance_ref":  {"type": "string",  "required": False, "label": "维修参考(AMM/TSM)"},
    "evidence_level":   {"type": "enum",    "required": False, "label": "证据等级",
                         "options": ["direct", "inferred", "assumed", "none"]},
    "source_doc_ids":   {"type": "array",   "required": False, "label": "来源文档IDs"},
}


# =====================================================================
# 4. 校验规则 ID — 供校验器引用
# =====================================================================

VALIDATION_RULES = {
    "STRUCT_NO_TOP_EVENT":      {"severity": "ERROR",   "label": "缺少顶事件"},
    "STRUCT_MULTI_TOP_EVENT":   {"severity": "WARNING", "label": "多个顶事件"},
    "STRUCT_ORPHAN_NODE":       {"severity": "WARNING", "label": "孤立节点"},
    "STRUCT_CYCLE":             {"severity": "ERROR",   "label": "循环引用"},
    "LOGIC_GATE_UNDERFLOW":     {"severity": "WARNING", "label": "逻辑门输入不足"},
    "DATA_PROB_RANGE":          {"severity": "ERROR",   "label": "概率值超范围"},
    "DATA_EMPTY_LABEL":         {"severity": "WARNING", "label": "节点名称为空"},
    # ---- 工业 schema 新增 ----
    "INDUSTRIAL_NO_FAULT_CODE": {"severity": "INFO",    "label": "底事件缺少故障代码"},
    "INDUSTRIAL_NO_FAULT_MODE": {"severity": "INFO",    "label": "底事件缺少故障模式"},
    "INDUSTRIAL_NO_SEVERITY":   {"severity": "INFO",    "label": "事件缺少严重等级"},
    "INDUSTRIAL_PARAM_CONFLICT":{"severity": "WARNING", "label": "监控参数范围冲突"},
    "INDUSTRIAL_NO_DETECTION":  {"severity": "INFO",    "label": "底事件缺少检测方式"},
    "INDUSTRIAL_WEAK_EVIDENCE": {"severity": "INFO",    "label": "证据等级较弱(assumed/none)"},
    "INDUSTRIAL_NO_MAINTENANCE":{"severity": "INFO",    "label": "底事件无维修参考"},
}

SEVERITY_ORDER = {"catastrophic": 4, "hazardous": 3, "major": 2, "minor": 1, "no_effect": 0}
EVIDENCE_ORDER = {"direct": 3, "inferred": 2, "assumed": 1, "none": 0}


# =====================================================================
# 5. 辅助函数
# =====================================================================

def entity_type_to_node_type(entity_type: str) -> str:
    """将知识图谱实体类型映射为 ReactFlow 节点类型"""
    mapping = {
        "TOP_EVENT": "topEvent",
        "MIDDLE_EVENT": "middleEvent",
        "BASIC_EVENT": "basicEvent",
    }
    return mapping.get(entity_type, "basicEvent")


def node_type_to_entity_type(node_type: str) -> str:
    """将 ReactFlow 节点类型映射为知识图谱实体类型"""
    mapping = {
        "topEvent": "TOP_EVENT",
        "middleEvent": "MIDDLE_EVENT",
        "basicEvent": "BASIC_EVENT",
        "houseEvent": "BASIC_EVENT",
        "undevelopedEvent": "BASIC_EVENT",
    }
    return mapping.get(node_type, "BASIC_EVENT")


def get_schema_summary() -> dict:
    """返回完整 schema 摘要（供 API 或前端查询）"""
    return {
        "entity_types": {k: {"label": v["label"], "description": v["description"]}
                         for k, v in ENTITY_TYPES.items()},
        "relation_types": {k: {"label": v["label"], "description": v["description"]}
                           for k, v in RELATION_TYPES.items()},
        "node_meta_fields": NODE_META_FIELDS,
        "validation_rules": VALIDATION_RULES,
    }
