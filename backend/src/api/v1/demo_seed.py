"""
演示数据种子 API — 创建预设项目 + 故障树 + 标准树 + 知识实体/关系 + 专家规则
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete

from models.database import get_db
from models.models import (
    Project, FaultTree, FaultTreeVersion, GoldTree, KnowledgeEntity, KnowledgeRelation,
    ExpertRule, EvalRun, User,
)
from core.auth import get_current_user

router = APIRouter()

# ════════════════════════════════════════════════════════════
# 项目 1  ·  航空液压系统故障分析（复杂项目）
# ════════════════════════════════════════════════════════════

HYDRAULIC_TREE = {
    "nodes": [
        {"id": "top1",  "type": "topEvent",     "position": {"x": 500, "y": 0},   "data": {"label": "液压系统功能失效"}},
        {"id": "or1",   "type": "orGate",        "position": {"x": 500, "y": 120}, "data": {"label": "OR"}},
        # 一级分支
        {"id": "mid1",  "type": "middleEvent",   "position": {"x": 160, "y": 240}, "data": {"label": "液压泵组件故障"}},
        {"id": "mid2",  "type": "middleEvent",   "position": {"x": 500, "y": 240}, "data": {"label": "管路与阀门系统故障"}},
        {"id": "mid3",  "type": "middleEvent",   "position": {"x": 840, "y": 240}, "data": {"label": "液压油品质异常"}},
        # 液压泵子树
        {"id": "and1",  "type": "andGate",       "position": {"x": 160, "y": 360}, "data": {"label": "AND"}},
        {"id": "be1",   "type": "basicEvent",    "position": {"x":  50, "y": 480}, "data": {"label": "泵体磨损超限", "probability": 0.0012, "fault_code": "HYD-2101", "fault_mode": "内漏", "severity": "hazardous", "detection_method": "ECAM HYD LO PR", "maintenance_ref": "AMM 29-11-00"}},
        {"id": "be2",   "type": "basicEvent",    "position": {"x": 270, "y": 480}, "data": {"label": "主密封件老化泄漏", "probability": 0.0008, "fault_code": "HYD-2102", "fault_mode": "外漏", "severity": "hazardous", "detection_method": "目视检查", "maintenance_ref": "AMM 29-11-05"}},
        # 管路子树
        {"id": "or2",   "type": "orGate",        "position": {"x": 500, "y": 360}, "data": {"label": "OR"}},
        {"id": "mid4",  "type": "middleEvent",   "position": {"x": 380, "y": 480}, "data": {"label": "高压管路故障"}},
        {"id": "mid5",  "type": "middleEvent",   "position": {"x": 620, "y": 480}, "data": {"label": "控制阀失效"}},
        {"id": "or3",   "type": "orGate",        "position": {"x": 380, "y": 600}, "data": {"label": "OR"}},
        {"id": "be3",   "type": "basicEvent",    "position": {"x": 300, "y": 720}, "data": {"label": "管路疲劳裂纹", "probability": 0.0003, "fault_code": "HYD-2920", "fault_mode": "裂纹", "severity": "catastrophic", "detection_method": "荧光渗透检测", "maintenance_ref": "AMM 29-21-00"}},
        {"id": "be4",   "type": "basicEvent",    "position": {"x": 460, "y": 720}, "data": {"label": "B-nut接头松动", "probability": 0.0015, "fault_code": "HYD-2921", "fault_mode": "松动", "severity": "major", "detection_method": "扭矩检查", "maintenance_ref": "AMM 29-21-11"}},
        {"id": "and2",  "type": "andGate",       "position": {"x": 620, "y": 600}, "data": {"label": "AND"}},
        {"id": "be5",   "type": "basicEvent",    "position": {"x": 540, "y": 720}, "data": {"label": "电磁阀线圈断路", "probability": 0.0005, "fault_code": "HYD-2905", "fault_mode": "断路", "severity": "hazardous", "detection_method": "电阻测量", "maintenance_ref": "AMM 29-12-31"}},
        {"id": "be6",   "type": "basicEvent",    "position": {"x": 700, "y": 720}, "data": {"label": "阀芯卡滞", "probability": 0.0007, "fault_code": "HYD-2906", "fault_mode": "卡滞", "severity": "hazardous", "detection_method": "功能测试", "maintenance_ref": "AMM 29-12-32"}},
        # 油品子树
        {"id": "or4",   "type": "orGate",        "position": {"x": 840, "y": 360}, "data": {"label": "OR"}},
        {"id": "be7",   "type": "basicEvent",    "position": {"x": 760, "y": 480}, "data": {"label": "滤芯堵塞（金属碎屑）", "probability": 0.002, "fault_code": "HYD-2940", "fault_mode": "堵塞", "severity": "major", "detection_method": "压差指示器", "maintenance_ref": "AMM 29-10-11"}},
        {"id": "be8",   "type": "basicEvent",    "position": {"x": 920, "y": 480}, "data": {"label": "液压油含水量超标", "probability": 0.001, "fault_code": "HYD-2950", "fault_mode": "污染", "severity": "major", "detection_method": "油液采样分析", "maintenance_ref": "AMM 29-10-00"}},
    ],
    "links": [
        {"id": "e1",  "source": "top1", "target": "or1"},
        {"id": "e2",  "source": "or1",  "target": "mid1"},
        {"id": "e3",  "source": "or1",  "target": "mid2"},
        {"id": "e4",  "source": "or1",  "target": "mid3"},
        {"id": "e5",  "source": "mid1", "target": "and1"},
        {"id": "e6",  "source": "and1", "target": "be1"},
        {"id": "e7",  "source": "and1", "target": "be2"},
        {"id": "e8",  "source": "mid2", "target": "or2"},
        {"id": "e9",  "source": "or2",  "target": "mid4"},
        {"id": "e10", "source": "or2",  "target": "mid5"},
        {"id": "e11", "source": "mid4", "target": "or3"},
        {"id": "e12", "source": "or3",  "target": "be3"},
        {"id": "e13", "source": "or3",  "target": "be4"},
        {"id": "e14", "source": "mid5", "target": "and2"},
        {"id": "e15", "source": "and2", "target": "be5"},
        {"id": "e16", "source": "and2", "target": "be6"},
        {"id": "e17", "source": "mid3", "target": "or4"},
        {"id": "e18", "source": "or4",  "target": "be7"},
        {"id": "e19", "source": "or4",  "target": "be8"},
    ],
}

HYDRAULIC_ENTITIES = [
    {"name": "液压系统",        "entity_type": "SYSTEM",     "description": "飞机液压动力与控制系统 (ATA29)", "device_type": "A320液压系统", "severity": "catastrophic", "evidence_level": "direct", "confidence": 1.0},
    {"name": "液压泵",          "entity_type": "DEVICE",     "description": "发动机驱动液压泵 (EDP)", "device_type": "A320液压系统", "fault_code": "HYD-2101", "detection_method": "ECAM HYD LO PR", "maintenance_ref": "AMM 29-11-00", "confidence": 0.95},
    {"name": "高压管路",        "entity_type": "COMPONENT",  "description": "3000psi钛合金高压管路", "device_type": "A320液压系统", "parameter_name": "系统压力", "parameter_range": "2800-3200 psi", "confidence": 0.90},
    {"name": "电磁控制阀",      "entity_type": "DEVICE",     "description": "电液伺服控制阀", "device_type": "A320液压系统", "fault_code": "HYD-2905", "maintenance_ref": "AMM 29-12-31", "confidence": 0.92},
    {"name": "液压油",          "entity_type": "COMPONENT",  "description": "Skydrol LD-4 磷酸酯液压油", "device_type": "A320液压系统", "parameter_name": "含水量", "parameter_range": "<0.1%", "confidence": 0.88},
    {"name": "泵体磨损超限",    "entity_type": "FAULT_MODE", "description": "柱塞泵缸体与配流盘间隙超标导致内泄", "fault_mode": "内漏", "severity": "hazardous", "evidence_level": "direct", "confidence": 0.93},
    {"name": "主密封件老化泄漏", "entity_type": "FAULT_MODE", "description": "轴封在高温下橡胶硬化导致外漏", "fault_mode": "外漏", "severity": "hazardous", "evidence_level": "direct", "confidence": 0.91},
    {"name": "管路疲劳裂纹",    "entity_type": "FAULT_MODE", "description": "振动疲劳导致管路微裂纹扩展", "fault_mode": "裂纹", "severity": "catastrophic", "detection_method": "目视检查+荧光渗透", "evidence_level": "direct", "confidence": 0.89},
    {"name": "B-nut接头松动",   "entity_type": "FAULT_MODE", "description": "AN/MS接头未达扭矩标准", "fault_mode": "松动", "severity": "major", "detection_method": "扭矩检查", "evidence_level": "inferred", "confidence": 0.85},
    {"name": "阀芯卡滞",        "entity_type": "FAULT_MODE", "description": "污染颗粒导致阀芯卡在某一位置", "fault_mode": "卡滞", "severity": "hazardous", "evidence_level": "direct", "confidence": 0.88},
    {"name": "电磁阀线圈断路",  "entity_type": "BASIC_EVENT","description": "电磁线圈过热烧毁或导线断裂", "fault_code": "HYD-E2905", "severity": "major", "evidence_level": "direct", "confidence": 0.90},
    {"name": "滤芯堵塞",        "entity_type": "FAULT_MODE", "description": "金属碎屑积累导致滤芯压差报警", "fault_mode": "堵塞", "severity": "major", "detection_method": "压差指示器", "parameter_name": "滤芯压差", "parameter_range": "<15 psi", "evidence_level": "direct", "confidence": 0.92},
    {"name": "更换液压泵",      "entity_type": "MAINTENANCE_ACTION", "description": "根据AMM 29-11-00拆装更换EDP泵", "maintenance_ref": "AMM 29-11-00", "confidence": 0.95},
    {"name": "液压压力",        "entity_type": "PARAMETER",  "description": "系统工作压力，正常值3000±200 psi", "parameter_name": "系统压力", "parameter_range": "2800-3200 psi", "confidence": 1.0},
    {"name": "HYD-2101",        "entity_type": "FAULT_CODE", "description": "液压泵输出压力低", "fault_code": "HYD-2101", "severity": "hazardous", "confidence": 1.0},
]

HYDRAULIC_RELATIONS_DEF = [
    ("液压泵", "液压系统", "PART_OF"),
    ("高压管路", "液压系统", "PART_OF"),
    ("电磁控制阀", "液压系统", "PART_OF"),
    ("液压油", "液压系统", "PART_OF"),
    ("泵体磨损超限", "液压泵", "HAS_FAULT_MODE"),
    ("主密封件老化泄漏", "液压泵", "HAS_FAULT_MODE"),
    ("管路疲劳裂纹", "高压管路", "HAS_FAULT_MODE"),
    ("B-nut接头松动", "高压管路", "HAS_FAULT_MODE"),
    ("阀芯卡滞", "电磁控制阀", "HAS_FAULT_MODE"),
    ("电磁阀线圈断路", "电磁控制阀", "HAS_FAULT_MODE"),
    ("滤芯堵塞", "液压油", "HAS_FAULT_MODE"),
    ("HYD-2101", "液压泵", "HAS_FAULT_CODE"),
    ("液压压力", "液压泵", "MONITORED_BY"),
    ("更换液压泵", "泵体磨损超限", "REPAIRED_BY"),
    ("更换液压泵", "主密封件老化泄漏", "REPAIRED_BY"),
    ("泵体磨损超限", "液压系统", "CAUSES"),
    ("管路疲劳裂纹", "液压系统", "CAUSES"),
    ("阀芯卡滞", "液压系统", "CAUSES"),
]

HYDRAULIC_EXPERT_RULES = [
    {"name": "液压泵双故障AND门规则", "description": "泵体磨损和密封老化需同时发生才导致泵功能完全丧失，单一故障仅降低性能", "rule_type": "guidance", "target_rule_id": "LOGIC_GATE_MISMATCH", "content": "液压泵故障子树使用AND门是正确的：根据MSG-3分析，泵体磨损（内泄）和密封老化（外漏）单独发生时系统仍可维持最低工作压力2400psi，不会导致功能完全丧失。", "priority": 10},
    {"name": "管路裂纹为灾难性事件", "description": "高压管路裂纹在飞行中属灾难性故障，应标为最高严重等级", "rule_type": "guidance", "target_node_pattern": "*裂纹*", "content": "根据SFAR 88和AC 25.981，液压高压管路裂纹属灾难性失效模式。故障树中此类事件必须标注severity=catastrophic，且应有冗余保护分析。", "priority": 8},
    {"name": "忽略油品检测警告", "description": "定期检测中液压油品质波动属于正常维护范围", "rule_type": "ignore", "target_rule_id": "DOMAIN_UNLINKED_PARAM", "target_node_pattern": "*含水量*", "content": "液压油含水量检测在MRO维护中定期执行，数值在标准范围内的波动不构成故障模式，可忽略此校验警告。", "priority": 5},
]

# ════════════════════════════════════════════════════════════
# 项目 2  ·  工业电气控制系统故障分析（中等复杂度）
# ════════════════════════════════════════════════════════════

ELECTRICAL_TREE = {
    "nodes": [
        {"id": "top1",  "type": "topEvent",     "position": {"x": 400, "y": 0},   "data": {"label": "电气控制系统失效"}},
        {"id": "or1",   "type": "orGate",        "position": {"x": 400, "y": 120}, "data": {"label": "OR"}},
        {"id": "mid1",  "type": "middleEvent",   "position": {"x": 160, "y": 240}, "data": {"label": "电源模块故障"}},
        {"id": "mid2",  "type": "middleEvent",   "position": {"x": 400, "y": 240}, "data": {"label": "PLC控制器故障"}},
        {"id": "mid3",  "type": "middleEvent",   "position": {"x": 640, "y": 240}, "data": {"label": "传感器信号链故障"}},
        {"id": "or2",   "type": "orGate",        "position": {"x": 160, "y": 360}, "data": {"label": "OR"}},
        {"id": "and1",  "type": "andGate",       "position": {"x": 400, "y": 360}, "data": {"label": "AND"}},
        {"id": "or3",   "type": "orGate",        "position": {"x": 640, "y": 360}, "data": {"label": "OR"}},
        {"id": "be1",   "type": "basicEvent",    "position": {"x":  60, "y": 480}, "data": {"label": "输入电压越限", "probability": 0.005, "fault_code": "ELC-1001", "fault_mode": "过压", "severity": "major", "detection_method": "电压监测仪"}},
        {"id": "be2",   "type": "basicEvent",    "position": {"x": 260, "y": 480}, "data": {"label": "保险丝/断路器跳脱", "probability": 0.008, "fault_code": "ELC-1002", "fault_mode": "过流保护", "severity": "minor", "detection_method": "状态指示灯"}},
        {"id": "be3",   "type": "basicEvent",    "position": {"x": 340, "y": 480}, "data": {"label": "PLC程序逻辑错误", "probability": 0.002, "fault_code": "ELC-2001", "fault_mode": "程序错误", "severity": "hazardous", "detection_method": "在线诊断"}},
        {"id": "be4",   "type": "basicEvent",    "position": {"x": 460, "y": 480}, "data": {"label": "通信总线中断", "probability": 0.003, "fault_code": "ELC-2002", "fault_mode": "通信失联", "severity": "major", "detection_method": "网络监控"}},
        {"id": "be5",   "type": "basicEvent",    "position": {"x": 560, "y": 480}, "data": {"label": "传感器漂移", "probability": 0.01, "fault_code": "ELC-3001", "fault_mode": "精度下降", "severity": "minor", "detection_method": "校准检查"}},
        {"id": "be6",   "type": "basicEvent",    "position": {"x": 720, "y": 480}, "data": {"label": "接线端子腐蚀", "probability": 0.006, "fault_code": "ELC-3002", "fault_mode": "腐蚀", "severity": "minor", "detection_method": "目视+电阻检测"}},
    ],
    "links": [
        {"id": "e1",  "source": "top1", "target": "or1"},
        {"id": "e2",  "source": "or1",  "target": "mid1"},
        {"id": "e3",  "source": "or1",  "target": "mid2"},
        {"id": "e4",  "source": "or1",  "target": "mid3"},
        {"id": "e5",  "source": "mid1", "target": "or2"},
        {"id": "e6",  "source": "or2",  "target": "be1"},
        {"id": "e7",  "source": "or2",  "target": "be2"},
        {"id": "e8",  "source": "mid2", "target": "and1"},
        {"id": "e9",  "source": "and1", "target": "be3"},
        {"id": "e10", "source": "and1", "target": "be4"},
        {"id": "e11", "source": "mid3", "target": "or3"},
        {"id": "e12", "source": "or3",  "target": "be5"},
        {"id": "e13", "source": "or3",  "target": "be6"},
    ],
}

ELECTRICAL_ENTITIES = [
    {"name": "电气控制系统",     "entity_type": "SYSTEM",     "description": "工业自动化电气控制系统", "device_type": "电气系统", "confidence": 1.0},
    {"name": "电源模块",         "entity_type": "DEVICE",     "description": "24V/48V直流稳压电源模块", "device_type": "电气系统", "fault_code": "ELC-1001", "parameter_name": "输出电压", "parameter_range": "24V±5%", "confidence": 0.95},
    {"name": "PLC控制器",        "entity_type": "DEVICE",     "description": "可编程逻辑控制器 S7-1500", "device_type": "电气系统", "fault_code": "ELC-2001", "maintenance_ref": "PLC维护手册 Ch.5", "confidence": 0.93},
    {"name": "传感器信号链",     "entity_type": "SUBSYSTEM",  "description": "温度/压力/位移传感器及信号调理", "device_type": "电气系统", "confidence": 0.90},
    {"name": "PLC程序逻辑错误",  "entity_type": "FAULT_MODE", "description": "梯形图逻辑缺陷导致误动作", "fault_mode": "逻辑错误", "severity": "major", "evidence_level": "direct", "confidence": 0.88},
    {"name": "通信总线中断",     "entity_type": "BASIC_EVENT","description": "Profinet/Modbus通信链路断开", "severity": "major", "detection_method": "通信诊断", "confidence": 0.90},
    {"name": "传感器漂移",       "entity_type": "FAULT_MODE", "description": "长期运行后传感器零点/增益漂移", "fault_mode": "漂移", "severity": "minor", "detection_method": "定期校准", "evidence_level": "inferred", "confidence": 0.82},
]

ELECTRICAL_RELATIONS_DEF = [
    ("电源模块", "电气控制系统", "PART_OF"),
    ("PLC控制器", "电气控制系统", "PART_OF"),
    ("传感器信号链", "电气控制系统", "PART_OF"),
    ("PLC程序逻辑错误", "PLC控制器", "HAS_FAULT_MODE"),
    ("通信总线中断", "PLC控制器", "CAUSES"),
    ("传感器漂移", "传感器信号链", "HAS_FAULT_MODE"),
]

ELECTRICAL_EXPERT_RULES = [
    {"name": "PLC双故障AND门", "description": "PLC软件错误+通信中断同时发生才导致系统失控", "rule_type": "guidance", "content": "PLC具有watchdog看门狗机制，单一故障会触发安全停机。只有程序逻辑错误导致watchdog未触发+通信中断同时发生，才会导致控制器真正失效。AND门正确。", "priority": 8},
]

# ════════════════════════════════════════════════════════════
# 项目 3  ·  车辆制动系统故障分析（复杂项目 — 4级深度）
# ════════════════════════════════════════════════════════════

BRAKE_TREE = {
    "nodes": [
        {"id": "top1",  "type": "topEvent",     "position": {"x": 480, "y": 0},   "data": {"label": "制动系统完全失效"}},
        {"id": "and_top","type": "andGate",      "position": {"x": 480, "y": 120}, "data": {"label": "AND"}},
        {"id": "mid1",  "type": "middleEvent",   "position": {"x": 200, "y": 240}, "data": {"label": "主制动回路失效"}},
        {"id": "mid2",  "type": "middleEvent",   "position": {"x": 760, "y": 240}, "data": {"label": "备用制动回路失效"}},
        # 主制动
        {"id": "or1",   "type": "orGate",        "position": {"x": 200, "y": 360}, "data": {"label": "OR"}},
        {"id": "mid3",  "type": "middleEvent",   "position": {"x":  80, "y": 480}, "data": {"label": "液压助力失效"}},
        {"id": "mid4",  "type": "middleEvent",   "position": {"x": 320, "y": 480}, "data": {"label": "摩擦制动失效"}},
        {"id": "or2",   "type": "orGate",        "position": {"x":  80, "y": 600}, "data": {"label": "OR"}},
        {"id": "be1",   "type": "basicEvent",    "position": {"x":   0, "y": 720}, "data": {"label": "制动液泄漏", "probability": 0.003, "fault_code": "BRK-1001", "fault_mode": "泄漏", "severity": "catastrophic", "detection_method": "液位传感器"}},
        {"id": "be2",   "type": "basicEvent",    "position": {"x": 160, "y": 720}, "data": {"label": "真空助力器膜片破裂", "probability": 0.001, "fault_code": "BRK-1002", "fault_mode": "破裂", "severity": "hazardous", "detection_method": "踏板力度检测"}},
        {"id": "or3",   "type": "orGate",        "position": {"x": 320, "y": 600}, "data": {"label": "OR"}},
        {"id": "be3",   "type": "basicEvent",    "position": {"x": 240, "y": 720}, "data": {"label": "制动片磨损至极限", "probability": 0.008, "fault_code": "BRK-2001", "fault_mode": "磨损", "severity": "hazardous", "detection_method": "厚度测量+报警指示"}},
        {"id": "be4",   "type": "basicEvent",    "position": {"x": 400, "y": 720}, "data": {"label": "制动盘热衰退", "probability": 0.004, "fault_code": "BRK-2002", "fault_mode": "热衰退", "severity": "major", "detection_method": "温度传感器"}},
        # 备用制动
        {"id": "or4",   "type": "orGate",        "position": {"x": 760, "y": 360}, "data": {"label": "OR"}},
        {"id": "mid5",  "type": "middleEvent",   "position": {"x": 640, "y": 480}, "data": {"label": "ABS/ESC系统故障"}},
        {"id": "be5",   "type": "basicEvent",    "position": {"x": 880, "y": 480}, "data": {"label": "手刹拉索断裂", "probability": 0.0005, "fault_code": "BRK-3001", "fault_mode": "断裂", "severity": "major", "detection_method": "目视检查"}},
        {"id": "and2",  "type": "andGate",       "position": {"x": 640, "y": 600}, "data": {"label": "AND"}},
        {"id": "be6",   "type": "basicEvent",    "position": {"x": 560, "y": 720}, "data": {"label": "ABS轮速传感器失效", "probability": 0.002, "fault_code": "BRK-4001", "fault_mode": "信号丢失", "severity": "hazardous", "detection_method": "OBD故障码读取"}},
        {"id": "be7",   "type": "basicEvent",    "position": {"x": 720, "y": 720}, "data": {"label": "ABS控制单元MCU故障", "probability": 0.0008, "fault_code": "BRK-4002", "fault_mode": "MCU失效", "severity": "catastrophic", "detection_method": "ECU自诊断"}},
    ],
    "links": [
        {"id": "e1",  "source": "top1",    "target": "and_top"},
        {"id": "e2",  "source": "and_top", "target": "mid1"},
        {"id": "e3",  "source": "and_top", "target": "mid2"},
        {"id": "e4",  "source": "mid1",    "target": "or1"},
        {"id": "e5",  "source": "or1",     "target": "mid3"},
        {"id": "e6",  "source": "or1",     "target": "mid4"},
        {"id": "e7",  "source": "mid3",    "target": "or2"},
        {"id": "e8",  "source": "or2",     "target": "be1"},
        {"id": "e9",  "source": "or2",     "target": "be2"},
        {"id": "e10", "source": "mid4",    "target": "or3"},
        {"id": "e11", "source": "or3",     "target": "be3"},
        {"id": "e12", "source": "or3",     "target": "be4"},
        {"id": "e13", "source": "mid2",    "target": "or4"},
        {"id": "e14", "source": "or4",     "target": "mid5"},
        {"id": "e15", "source": "or4",     "target": "be5"},
        {"id": "e16", "source": "mid5",    "target": "and2"},
        {"id": "e17", "source": "and2",    "target": "be6"},
        {"id": "e18", "source": "and2",    "target": "be7"},
    ],
}

BRAKE_ENTITIES = [
    {"name": "制动系统",            "entity_type": "SYSTEM",     "description": "汽车液压盘式制动系统（含ABS）", "device_type": "制动系统", "severity": "catastrophic", "confidence": 1.0},
    {"name": "制动主缸",            "entity_type": "DEVICE",     "description": "串联双回路制动主缸", "device_type": "制动系统", "fault_code": "BRK-0100", "maintenance_ref": "维修手册 Ch.6", "confidence": 0.95},
    {"name": "真空助力器",          "entity_type": "DEVICE",     "description": "真空伺服制动助力器", "device_type": "制动系统", "confidence": 0.93},
    {"name": "ABS控制单元",         "entity_type": "DEVICE",     "description": "防抱死制动系统ECU", "device_type": "制动系统", "fault_code": "ABS-C1200", "detection_method": "OBD-II诊断", "confidence": 0.92},
    {"name": "制动液泄漏",          "entity_type": "FAULT_MODE", "description": "制动管路或接头泄漏导致压力丧失", "fault_mode": "泄漏", "severity": "catastrophic", "evidence_level": "direct", "confidence": 0.95},
    {"name": "制动片磨损至极限",    "entity_type": "FAULT_MODE", "description": "摩擦材料厚度低于最小值", "fault_mode": "磨损", "severity": "hazardous", "detection_method": "磨损指示器", "parameter_name": "制动片厚度", "parameter_range": ">2mm", "evidence_level": "direct", "confidence": 0.93},
    {"name": "ABS轮速传感器失效",   "entity_type": "BASIC_EVENT","description": "磁电式轮速传感器气隙变化导致信号丢失", "severity": "major", "detection_method": "OBD故障码", "fault_code": "ABS-C0035", "evidence_level": "direct", "confidence": 0.90},
]

BRAKE_RELATIONS_DEF = [
    ("制动主缸", "制动系统", "PART_OF"),
    ("真空助力器", "制动系统", "PART_OF"),
    ("ABS控制单元", "制动系统", "PART_OF"),
    ("制动液泄漏", "制动主缸", "HAS_FAULT_MODE"),
    ("制动片磨损至极限", "制动系统", "HAS_FAULT_MODE"),
    ("ABS轮速传感器失效", "ABS控制单元", "CAUSES"),
]

BRAKE_EXPERT_RULES = [
    {"name": "制动双回路AND门", "description": "主+备用同时失效才是完全失效", "rule_type": "guidance", "content": "根据ECE R13法规，制动系统必须采用双回路冗余设计。只有主回路和备用回路同时失效，才会导致制动系统完全失效，顶事件使用AND门是合理的。", "priority": 10},
    {"name": "ABS双故障AND门", "description": "ABS传感器+ECU同时故障才导致ABS完全失效", "rule_type": "guidance", "content": "ABS系统具有降级运行能力：单个轮速传感器失效时仍可三通道工作，仅ECU故障也会回退到常规制动。AND门合理。", "priority": 8},
]

# ════════════════════════════════════════════════════════════
# 项目 4  ·  水泵电机故障快速分析（简单项目）
# ════════════════════════════════════════════════════════════

PUMP_MOTOR_TREE = {
    "nodes": [
        {"id": "top1", "type": "topEvent",    "position": {"x": 300, "y": 0},   "data": {"label": "水泵无法启动"}},
        {"id": "or1",  "type": "orGate",       "position": {"x": 300, "y": 120}, "data": {"label": "OR"}},
        {"id": "be1",  "type": "basicEvent",   "position": {"x": 100, "y": 240}, "data": {"label": "电源未接通", "probability": 0.02, "fault_code": "PMP-001", "fault_mode": "断电", "severity": "minor", "detection_method": "电压表"}},
        {"id": "be2",  "type": "basicEvent",   "position": {"x": 300, "y": 240}, "data": {"label": "电机绕组烧毁", "probability": 0.005, "fault_code": "PMP-002", "fault_mode": "绝缘击穿", "severity": "major", "detection_method": "绝缘电阻测试"}},
        {"id": "be3",  "type": "basicEvent",   "position": {"x": 500, "y": 240}, "data": {"label": "叶轮卡死", "probability": 0.003, "fault_code": "PMP-003", "fault_mode": "卡死", "severity": "major", "detection_method": "电流监测"}},
    ],
    "links": [
        {"id": "e1", "source": "top1", "target": "or1"},
        {"id": "e2", "source": "or1",  "target": "be1"},
        {"id": "e3", "source": "or1",  "target": "be2"},
        {"id": "e4", "source": "or1",  "target": "be3"},
    ],
}

PUMP_ENTITIES = [
    {"name": "水泵电机",     "entity_type": "DEVICE",     "description": "离心式水泵驱动电机", "device_type": "水泵", "confidence": 1.0},
    {"name": "电机绕组烧毁", "entity_type": "FAULT_MODE", "description": "过载或绝缘老化导致绕组短路", "fault_mode": "烧毁", "severity": "major", "evidence_level": "direct", "confidence": 0.95},
    {"name": "叶轮卡死",     "entity_type": "FAULT_MODE", "description": "异物进入或轴承抱死", "fault_mode": "卡死", "severity": "major", "evidence_level": "direct", "confidence": 0.90},
]

PUMP_RELATIONS_DEF = [
    ("电机绕组烧毁", "水泵电机", "HAS_FAULT_MODE"),
    ("叶轮卡死", "水泵电机", "HAS_FAULT_MODE"),
]

# ════════════════════════════════════════════════════════════
# 项目 5  ·  消防喷淋系统故障分析（简单项目）
# ════════════════════════════════════════════════════════════

SPRINKLER_TREE = {
    "nodes": [
        {"id": "top1", "type": "topEvent",    "position": {"x": 350, "y": 0},   "data": {"label": "消防喷淋系统未响应"}},
        {"id": "or1",  "type": "orGate",       "position": {"x": 350, "y": 120}, "data": {"label": "OR"}},
        {"id": "mid1", "type": "middleEvent",  "position": {"x": 150, "y": 240}, "data": {"label": "检测系统故障"}},
        {"id": "mid2", "type": "middleEvent",  "position": {"x": 550, "y": 240}, "data": {"label": "执行系统故障"}},
        {"id": "or2",  "type": "orGate",       "position": {"x": 150, "y": 360}, "data": {"label": "OR"}},
        {"id": "be1",  "type": "basicEvent",   "position": {"x":  50, "y": 480}, "data": {"label": "烟感探头失灵", "probability": 0.008, "fault_code": "FPS-1001", "fault_mode": "失灵", "severity": "hazardous", "detection_method": "定期功能测试"}},
        {"id": "be2",  "type": "basicEvent",   "position": {"x": 250, "y": 480}, "data": {"label": "温感探头失灵", "probability": 0.006, "fault_code": "FPS-1002", "fault_mode": "失灵", "severity": "hazardous", "detection_method": "定期功能测试"}},
        {"id": "or3",  "type": "orGate",       "position": {"x": 550, "y": 360}, "data": {"label": "OR"}},
        {"id": "be3",  "type": "basicEvent",   "position": {"x": 450, "y": 480}, "data": {"label": "电磁阀未开启", "probability": 0.004, "fault_code": "FPS-2001", "fault_mode": "卡死", "severity": "catastrophic", "detection_method": "流量开关检测"}},
        {"id": "be4",  "type": "basicEvent",   "position": {"x": 650, "y": 480}, "data": {"label": "管网水压不足", "probability": 0.01, "fault_code": "FPS-2002", "fault_mode": "压力不足", "severity": "major", "detection_method": "压力表监测"}},
    ],
    "links": [
        {"id": "e1", "source": "top1", "target": "or1"},
        {"id": "e2", "source": "or1",  "target": "mid1"},
        {"id": "e3", "source": "or1",  "target": "mid2"},
        {"id": "e4", "source": "mid1", "target": "or2"},
        {"id": "e5", "source": "or2",  "target": "be1"},
        {"id": "e6", "source": "or2",  "target": "be2"},
        {"id": "e7", "source": "mid2", "target": "or3"},
        {"id": "e8", "source": "or3",  "target": "be3"},
        {"id": "e9", "source": "or3",  "target": "be4"},
    ],
}

SPRINKLER_ENTITIES = [
    {"name": "消防喷淋系统", "entity_type": "SYSTEM",     "description": "自动喷水灭火系统", "device_type": "消防系统", "confidence": 1.0},
    {"name": "烟感探头",     "entity_type": "DEVICE",     "description": "光电感烟探测器", "device_type": "消防系统", "detection_method": "月检", "confidence": 0.92},
    {"name": "管网水压不足", "entity_type": "FAULT_MODE", "description": "稳压泵故障或管网泄漏导致压力低于0.1MPa", "fault_mode": "压力不足", "severity": "hazardous", "parameter_name": "管网压力", "parameter_range": ">0.1 MPa", "evidence_level": "direct", "confidence": 0.88},
]

SPRINKLER_RELATIONS_DEF = [
    ("烟感探头", "消防喷淋系统", "PART_OF"),
    ("管网水压不足", "消防喷淋系统", "HAS_FAULT_MODE"),
]

# ════════════════════════════════════════════════════════════
# 汇总
# ════════════════════════════════════════════════════════════

DEMO_PROJECTS = [
    {
        "name": "航空液压系统故障分析",
        "description": "基于A320液压系统的深度故障树分析项目（4级、20节点）。\n演示亮点：知识图谱增强、完整工业属性实体、专家规则指导、标准树对比评测、AI自动评测。",
        "device_type": "A320液压系统",
        "top_event": "液压系统功能失效",
        "trees": [
            {"name": "液压系统功能失效 — 主分析", "structure": HYDRAULIC_TREE},
        ],
        "gold": {"name": "液压系统标准故障树 v2.0 (航标)", "structure": HYDRAULIC_TREE},
        "entities": HYDRAULIC_ENTITIES,
        "relations": HYDRAULIC_RELATIONS_DEF,
        "expert_rules": HYDRAULIC_EXPERT_RULES,
    },
    {
        "name": "工业电气控制系统故障分析",
        "description": "PLC+传感器+电源模块工业控制系统故障分析（3级、14节点）。\n演示亮点：知识实体编辑、关系管理、专家模式AND门验证。",
        "device_type": "电气控制系统",
        "top_event": "电气控制系统失效",
        "trees": [
            {"name": "电气控制系统失效 — 完整分析", "structure": ELECTRICAL_TREE},
        ],
        "gold": {"name": "电气系统标准故障树 v1.0", "structure": ELECTRICAL_TREE},
        "entities": ELECTRICAL_ENTITIES,
        "relations": ELECTRICAL_RELATIONS_DEF,
        "expert_rules": ELECTRICAL_EXPERT_RULES,
    },
    {
        "name": "车辆制动系统故障分析",
        "description": "汽车双回路制动系统故障树分析（4级、19节点）。\n演示亮点：AND门冗余建模、ECE法规验证、标准树对比评测、AI评测驾驶舱。",
        "device_type": "制动系统",
        "top_event": "制动系统完全失效",
        "trees": [
            {"name": "制动系统完全失效 — 双回路分析", "structure": BRAKE_TREE},
        ],
        "gold": {"name": "制动系统标准故障树 v1.0 (法规)", "structure": BRAKE_TREE},
        "entities": BRAKE_ENTITIES,
        "relations": BRAKE_RELATIONS_DEF,
        "expert_rules": BRAKE_EXPERT_RULES,
    },
    {
        "name": "水泵电机故障快速分析",
        "description": "简单的水泵电机故障树（2级、5节点）。\n演示亮点：快速建树、基本编辑功能、AI自动评测入门演示。",
        "device_type": "水泵",
        "top_event": "水泵无法启动",
        "trees": [
            {"name": "水泵无法启动 — 基础分析", "structure": PUMP_MOTOR_TREE},
        ],
        "gold": None,
        "entities": PUMP_ENTITIES,
        "relations": PUMP_RELATIONS_DEF,
        "expert_rules": [],
    },
    {
        "name": "消防喷淋系统故障分析",
        "description": "自动喷水灭火系统故障分析（3级、10节点）。\n演示亮点：中等复杂度建树、检测+执行双支路结构、知识实体管理。",
        "device_type": "消防系统",
        "top_event": "消防喷淋系统未响应",
        "trees": [
            {"name": "消防喷淋系统未响应 — 全面分析", "structure": SPRINKLER_TREE},
        ],
        "gold": None,
        "entities": SPRINKLER_ENTITIES,
        "relations": SPRINKLER_RELATIONS_DEF,
        "expert_rules": [],
    },
]


# ════════════════════════════════════════════════════════════
# API
# ════════════════════════════════════════════════════════════

@router.post("/seed")
async def seed_demo_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建全套演示数据：项目 + 故障树 + 标准树 + 知识实体/关系 + 专家规则"""
    created = []

    for demo in DEMO_PROJECTS:
        # 检查是否已存在同名项目
        existing = await db.execute(
            select(Project).where(Project.name == demo["name"])
        )
        if existing.scalar_one_or_none():
            created.append({"name": demo["name"], "status": "已存在，跳过"})
            continue

        # ---- 创建项目 ----
        project = Project(
            name=demo["name"],
            description=demo["description"],
            device_type=demo["device_type"],
            owner_id=user.id,
            status="active",
        )
        db.add(project)
        await db.flush()
        pid = project.id

        # ---- 故障树 ----
        for t in demo["trees"]:
            db.add(FaultTree(
                name=t["name"], project_id=pid,
                top_event=demo["top_event"],
                structure=t["structure"],
                created_by=user.id,
            ))

        # ---- 标准树 ----
        if demo.get("gold"):
            g = demo["gold"]
            db.add(GoldTree(
                name=g["name"], project_id=pid,
                device_type=demo["device_type"],
                top_event=demo["top_event"],
                structure=g["structure"],
                created_by=user.id,
            ))

        # ---- 知识实体 ----
        name_to_entity: dict[str, KnowledgeEntity] = {}
        for ent in demo.get("entities", []):
            ke = KnowledgeEntity(
                name=ent["name"],
                entity_type=ent["entity_type"],
                description=ent.get("description"),
                device_type=ent.get("device_type"),
                confidence=ent.get("confidence", 1.0),
                project_id=pid,
                fault_code=ent.get("fault_code"),
                fault_mode=ent.get("fault_mode"),
                severity=ent.get("severity"),
                detection_method=ent.get("detection_method"),
                parameter_name=ent.get("parameter_name"),
                parameter_range=ent.get("parameter_range"),
                maintenance_ref=ent.get("maintenance_ref"),
                evidence_level=ent.get("evidence_level"),
            )
            db.add(ke)
            name_to_entity[ent["name"]] = ke

        await db.flush()  # 获取实体 ID

        # ---- 知识关系 ----
        for src_name, tgt_name, rel_type in demo.get("relations", []):
            src_ent = name_to_entity.get(src_name)
            tgt_ent = name_to_entity.get(tgt_name)
            if src_ent and tgt_ent:
                db.add(KnowledgeRelation(
                    source_entity_id=src_ent.id,
                    target_entity_id=tgt_ent.id,
                    relation_type=rel_type,
                    confidence=0.9,
                    project_id=pid,
                ))

        # ---- 专家规则 ----
        for rule in demo.get("expert_rules", []):
            db.add(ExpertRule(
                name=rule["name"],
                description=rule.get("description"),
                rule_type=rule.get("rule_type", "guidance"),
                scope="project",
                project_id=pid,
                target_rule_id=rule.get("target_rule_id"),
                target_node_pattern=rule.get("target_node_pattern"),
                content=rule.get("content"),
                priority=rule.get("priority", 0),
                enabled=True,
                created_by=user.id,
            ))

        tree_count = len(demo["trees"])
        ent_count = len(demo.get("entities", []))
        rel_count = len(demo.get("relations", []))
        rule_count = len(demo.get("expert_rules", []))
        gold_flag = "✓" if demo.get("gold") else "—"

        created.append({
            "name": demo["name"],
            "project_id": pid,
            "trees": tree_count,
            "entities": ent_count,
            "relations": rel_count,
            "expert_rules": rule_count,
            "gold_tree": gold_flag,
            "status": "已创建",
        })

    await db.commit()

    return {
        "message": f"演示数据创建完成，共处理 {len(created)} 个项目",
        "projects": created,
    }


@router.post("/reset")
async def reset_demo_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除所有演示项目并重新创建（慎用）"""
    demo_names = [d["name"] for d in DEMO_PROJECTS]

    for name in demo_names:
        result = await db.execute(select(Project).where(Project.name == name))
        project = result.scalar_one_or_none()
        if not project:
            continue
        pid = project.id

        # 删除关联数据
        await db.execute(sa_delete(KnowledgeRelation).where(KnowledgeRelation.project_id == pid))
        await db.execute(sa_delete(KnowledgeEntity).where(KnowledgeEntity.project_id == pid))
        await db.execute(sa_delete(ExpertRule).where(ExpertRule.project_id == pid))
        await db.execute(sa_delete(EvalRun).where(EvalRun.project_id == pid))
        await db.execute(sa_delete(GoldTree).where(GoldTree.project_id == pid))
        # 先删版本历史再删故障树（FK约束）
        ft_ids_q = select(FaultTree.id).where(FaultTree.project_id == pid)
        ft_ids_result = await db.execute(ft_ids_q)
        ft_ids = [r[0] for r in ft_ids_result.fetchall()]
        if ft_ids:
            await db.execute(sa_delete(FaultTreeVersion).where(FaultTreeVersion.fault_tree_id.in_(ft_ids)))
        await db.execute(sa_delete(FaultTree).where(FaultTree.project_id == pid))
        await db.delete(project)

    await db.commit()

    # 重新创建
    return await seed_demo_data(user, db)
