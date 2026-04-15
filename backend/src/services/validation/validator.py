"""
领域化逻辑校验器 — 通用结构校验 + 工业故障树合理性校验
支持:
  - 通用校验（空树、顶事件、孤立节点、循环依赖、逻辑门、概率、命名）
  - 领域规则（重复节点、同名冲突、原因方向、缺失中间层、粒度不一致、
             故障代码缺失、参数阈值冲突、术语不统一等）
  - 三级严重度（ERROR / WARNING / SUGGESTION）+ 修复动作建议
  - 节点 / 边 / 逻辑门 分别定位
  - 整体质量分数
  - 按设备类型加载专属规则包
  - 规则启停 & 权重配置
  - 专家忽略已知例外
  - AI 自动修复（由外部 AI 模块调用，本模块提供结构化修复建议）
"""
from __future__ import annotations

import re
import math
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from enum import Enum
from difflib import SequenceMatcher


# ===================== 枚举 & 数据类 =====================

class IssueSeverity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    SUGGESTION = "SUGGESTION"

# 保留旧别名——INFO 等价于 SUGGESTION，防止外部引用报错
IssueSeverity.INFO = IssueSeverity.SUGGESTION  # type: ignore[attr-defined]


class IssueType(Enum):
    STRUCTURE = "STRUCTURE"
    LOGIC = "LOGIC"
    DATA = "DATA"
    DOMAIN = "DOMAIN"
    INDUSTRIAL = "INDUSTRIAL"

# 定位目标类型
class TargetKind(Enum):
    NODE = "node"
    EDGE = "edge"
    GATE = "gate"
    TREE = "tree"


@dataclass
class IssueTarget:
    """定位到节点、边或逻辑门"""
    kind: TargetKind
    id: str = ""
    label: str = ""


@dataclass
class FixAction:
    """修复动作建议"""
    action: str           # 动作类型标识
    description: str      # 人可读描述
    auto_fixable: bool = False  # AI 是否可自动修复
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Issue:
    type: IssueType
    severity: IssueSeverity
    message: str
    node_ids: List[str] = field(default_factory=list)
    edge_ids: List[str] = field(default_factory=list)
    rule_id: str = ""
    category: str = ""          # 规则大类
    targets: List[IssueTarget] = field(default_factory=list)
    fix_actions: List[FixAction] = field(default_factory=list)


@dataclass
class Suggestion:
    type: str
    description: str
    reason: str
    confidence: float


@dataclass
class ValidationResult:
    is_valid: bool
    issues: List[Issue]
    suggestions: List[Suggestion]
    quality_score: float = 100.0
    score_breakdown: Dict[str, float] = field(default_factory=dict)


# ===================== 规则注册表 =====================

# 每条规则: rule_id -> {category, severity, label, weight, enabled, device_types(可选)}
DEFAULT_RULES: Dict[str, Dict[str, Any]] = {
    # --- 通用结构 ---
    "STRUCT_EMPTY_TREE":        {"category": "structure", "severity": "ERROR",   "label": "空树",         "weight": 25, "enabled": True},
    "STRUCT_NO_TOP_EVENT":      {"category": "structure", "severity": "ERROR",   "label": "缺少顶事件",    "weight": 25, "enabled": True},
    "STRUCT_MULTI_TOP_EVENT":   {"category": "structure", "severity": "WARNING", "label": "多个顶事件",    "weight": 10, "enabled": True},
    "STRUCT_ORPHAN_NODE":       {"category": "structure", "severity": "WARNING", "label": "孤立节点",      "weight": 8,  "enabled": True},
    "STRUCT_CYCLE":             {"category": "structure", "severity": "ERROR",   "label": "循环依赖",      "weight": 25, "enabled": True},
    "LOGIC_GATE_UNDERFLOW":     {"category": "logic",     "severity": "WARNING", "label": "逻辑门输入不足", "weight": 12, "enabled": True},
    "DATA_PROB_RANGE":          {"category": "data",      "severity": "ERROR",   "label": "概率超范围",    "weight": 15, "enabled": True},
    "DATA_EMPTY_LABEL":         {"category": "data",      "severity": "WARNING", "label": "未命名节点",    "weight": 6,  "enabled": True},
    # --- 领域规则 ---
    "DOMAIN_DUPLICATE_NODE":    {"category": "domain",    "severity": "WARNING", "label": "重复节点",      "weight": 8,  "enabled": True},
    "DOMAIN_NAME_CONFLICT":     {"category": "domain",    "severity": "WARNING", "label": "同名不同义冲突", "weight": 10, "enabled": True},
    "DOMAIN_WRONG_DIRECTION":   {"category": "domain",    "severity": "ERROR",   "label": "原因方向错误",   "weight": 20, "enabled": True},
    "DOMAIN_MISSING_MIDDLE":    {"category": "domain",    "severity": "WARNING", "label": "缺失中间层",    "weight": 10, "enabled": True},
    "DOMAIN_GRANULARITY":       {"category": "domain",    "severity": "SUGGESTION","label":"根因粒度不一致","weight": 5,  "enabled": True},
    "DOMAIN_TERM_INCONSISTENT": {"category": "domain",    "severity": "SUGGESTION","label":"术语不统一",   "weight": 4,  "enabled": True},
    # --- 工业字段 ---
    "IND_NO_FAULT_CODE":        {"category": "industrial","severity": "SUGGESTION","label":"底事件缺故障代码","weight": 3, "enabled": True},
    "IND_NO_FAULT_MODE":        {"category": "industrial","severity": "SUGGESTION","label":"底事件缺故障模式","weight": 3, "enabled": True},
    "IND_NO_SEVERITY":          {"category": "industrial","severity": "SUGGESTION","label":"事件缺严重等级", "weight": 3, "enabled": True},
    "IND_NO_DETECTION":         {"category": "industrial","severity": "SUGGESTION","label":"底事件缺检测方式","weight": 3, "enabled": True},
    "IND_WEAK_EVIDENCE":        {"category": "industrial","severity": "SUGGESTION","label":"证据等级较弱",   "weight": 2, "enabled": True},
    "IND_NO_MAINTENANCE":       {"category": "industrial","severity": "SUGGESTION","label":"底事件无维修参考","weight": 2, "enabled": True},
    "IND_PARAM_CONFLICT":       {"category": "industrial","severity": "WARNING", "label":"参数阈值冲突",   "weight": 7, "enabled": True},
}

# 设备类型专属规则包: device_type -> [额外规则 dict]
DEVICE_RULE_PACKS: Dict[str, List[Dict[str, Any]]] = {
    "hydraulic": [
        {"rule_id": "DEV_HYD_PRESSURE_RANGE", "category": "device", "severity": "WARNING",
         "label": "液压系统压力范围未标注", "weight": 6, "enabled": True,
         "check": "require_param", "param_name": "液压压力"},
        {"rule_id": "DEV_HYD_SEAL_MAINTENANCE", "category": "device", "severity": "SUGGESTION",
         "label": "液压密封件缺维修间隔", "weight": 4, "enabled": True,
         "check": "require_maintenance_keyword", "keyword": "密封"},
    ],
    "electrical": [
        {"rule_id": "DEV_ELEC_SHORT_CIRCUIT", "category": "device", "severity": "WARNING",
         "label": "电气系统未考虑短路故障模式", "weight": 6, "enabled": True,
         "check": "require_fault_mode_keyword", "keyword": "短路"},
    ],
    "engine": [
        {"rule_id": "DEV_ENG_VIBRATION", "category": "device", "severity": "WARNING",
         "label": "发动机系统未考虑振动监控参数", "weight": 6, "enabled": True,
         "check": "require_param", "param_name": "振动"},
    ],
}

# 故障树层级顺序 — 用于判断方向
_LEVEL_ORDER = {"topEvent": 0, "middleEvent": 1, "basicEvent": 2,
                "andGate": 1, "orGate": 1, "xorGate": 1,
                "priorityAndGate": 1, "inhibitGate": 1, "votingGate": 1,
                "houseEvent": 2, "undevelopedEvent": 2}

# 常见术语标准化对——用于检测术语不统一
_TERM_PAIRS = [
    ({"故障", "失效"}, "fault"),
    ({"损坏", "破损", "毁损"}, "damage"),
    ({"泄漏", "泄露", "漏"}, "leak"),
    ({"卡滞", "卡死", "堵塞"}, "stuck"),
    ({"断裂", "断路", "开路"}, "open"),
    ({"老化", "劣化", "退化"}, "aging"),
]

GATE_TYPES = {"andGate", "orGate", "xorGate", "priorityAndGate", "inhibitGate", "votingGate"}
EVENT_TYPES = {"topEvent", "middleEvent", "basicEvent", "houseEvent", "undevelopedEvent"}


# ===================== 辅助工具 =====================

def _label_of(node: Dict) -> str:
    return node.get("data", {}).get("label", node.get("name", ""))


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _normalize_term(text: str) -> Optional[str]:
    for variants, canonical in _TERM_PAIRS:
        for v in variants:
            if v in text:
                return canonical
    return None


# ===================== 主校验器 =====================

class LogicValidator:
    """领域化逻辑校验器"""

    def __init__(
        self,
        rule_config: Optional[Dict[str, Dict[str, Any]]] = None,
        device_type: Optional[str] = None,
        ignored_issues: Optional[Set[str]] = None,
    ):
        # 合并默认规则 + 用户配置
        self.rules = {k: dict(v) for k, v in DEFAULT_RULES.items()}
        if rule_config:
            for rid, cfg in rule_config.items():
                if rid in self.rules:
                    self.rules[rid].update(cfg)
                else:
                    self.rules[rid] = cfg

        # 加载设备类型专属规则包
        self.device_type = device_type
        if device_type and device_type in DEVICE_RULE_PACKS:
            for drule in DEVICE_RULE_PACKS[device_type]:
                rid = drule["rule_id"]
                self.rules[rid] = drule

        # 专家忽略集合: {"rule_id::node_id", "rule_id", ...}
        self.ignored: Set[str] = ignored_issues or set()

    # ---------- 规则是否启用 ----------
    def _enabled(self, rule_id: str) -> bool:
        r = self.rules.get(rule_id)
        return r is not None and r.get("enabled", True)

    def _severity(self, rule_id: str) -> IssueSeverity:
        r = self.rules.get(rule_id, {})
        return IssueSeverity(r.get("severity", "WARNING"))

    def _weight(self, rule_id: str) -> float:
        return self.rules.get(rule_id, {}).get("weight", 5)

    # ---------- 忽略过滤 ----------
    def _is_ignored(self, rule_id: str, node_ids: List[str] = None) -> bool:
        if rule_id in self.ignored:
            return True
        if node_ids:
            for nid in node_ids:
                if f"{rule_id}::{nid}" in self.ignored:
                    return True
        return False

    # ---------- 发射 Issue ----------
    def _emit(
        self, issues: List[Issue], rule_id: str, message: str, *,
        node_ids: List[str] = None, edge_ids: List[str] = None,
        targets: List[IssueTarget] = None,
        fix_actions: List[FixAction] = None,
        issue_type: IssueType = None,
    ):
        if not self._enabled(rule_id):
            return
        nids = node_ids or []
        if self._is_ignored(rule_id, nids):
            return
        cat = self.rules.get(rule_id, {}).get("category", "")
        it = issue_type or IssueType(cat.upper()) if cat.upper() in IssueType.__members__ else IssueType.DOMAIN
        issues.append(Issue(
            type=it,
            severity=self._severity(rule_id),
            message=message,
            node_ids=nids,
            edge_ids=edge_ids or [],
            rule_id=rule_id,
            category=cat,
            targets=targets or [],
            fix_actions=fix_actions or [],
        ))

    # ===================== 主入口 =====================

    async def validate(self, structure: Dict[str, Any]) -> ValidationResult:
        issues: List[Issue] = []
        nodes = structure.get("nodes", [])
        links = structure.get("links", [])

        # 构建辅助索引
        node_map = {n.get("id"): n for n in nodes}
        children: Dict[str, List[str]] = {}   # parent -> [child]
        parents: Dict[str, List[str]] = {}    # child -> [parent]
        for lk in links:
            s, t = lk.get("source"), lk.get("target")
            children.setdefault(s, []).append(t)
            parents.setdefault(t, []).append(s)

        ctx = {"nodes": nodes, "links": links, "node_map": node_map,
               "children": children, "parents": parents}

        # 1) 通用结构
        self._check_structure(ctx, issues)
        # 2) 逻辑门
        self._check_logic(ctx, issues)
        # 3) 数据
        self._check_data(ctx, issues)
        # 4) 领域规则
        self._check_domain(ctx, issues)
        # 5) 工业字段
        self._check_industrial(ctx, issues)
        # 6) 设备专属规则包
        self._check_device_pack(ctx, issues)

        # 生成建议
        suggestions = self._generate_suggestions(ctx, issues)

        # 质量分数
        score, breakdown = self._calc_quality_score(ctx, issues)

        is_valid = not any(i.severity == IssueSeverity.ERROR for i in issues)

        return ValidationResult(
            is_valid=is_valid, issues=issues, suggestions=suggestions,
            quality_score=score, score_breakdown=breakdown,
        )

    # ===================== 1) 通用结构 =====================

    def _check_structure(self, ctx: Dict, issues: List[Issue]):
        nodes = ctx["nodes"]
        links = ctx["links"]

        # 空树
        if not nodes:
            self._emit(issues, "STRUCT_EMPTY_TREE", "故障树为空，没有节点",
                       targets=[IssueTarget(kind=TargetKind.TREE)],
                       fix_actions=[FixAction("create_top_event", "创建一个顶事件节点", auto_fixable=True)],
                       issue_type=IssueType.STRUCTURE)
            return

        # 顶事件
        top_events = [n for n in nodes if n.get("type") == "topEvent"]
        if len(top_events) == 0:
            self._emit(issues, "STRUCT_NO_TOP_EVENT", "缺少顶事件",
                       targets=[IssueTarget(kind=TargetKind.TREE)],
                       fix_actions=[FixAction("create_top_event", "自动创建顶事件节点", auto_fixable=True)],
                       issue_type=IssueType.STRUCTURE)
        elif len(top_events) > 1:
            ids = [n.get("id") for n in top_events]
            self._emit(issues, "STRUCT_MULTI_TOP_EVENT", f"存在 {len(top_events)} 个顶事件",
                       node_ids=ids,
                       targets=[IssueTarget(TargetKind.NODE, nid, _label_of(n)) for nid, n in zip(ids, top_events)],
                       fix_actions=[FixAction("merge_top_events", "将多个顶事件合并为一个", auto_fixable=True)],
                       issue_type=IssueType.STRUCTURE)

        # 孤立节点
        connected = set()
        for lk in links:
            connected.add(lk.get("source"))
            connected.add(lk.get("target"))

        for node in nodes:
            nid = node.get("id")
            if node.get("type") != "topEvent" and nid not in connected:
                label = _label_of(node)
                self._emit(issues, "STRUCT_ORPHAN_NODE", f"节点 '{label}' 是孤立节点",
                           node_ids=[nid],
                           targets=[IssueTarget(TargetKind.NODE, nid, label)],
                           fix_actions=[
                               FixAction("connect_to_parent", f"将 '{label}' 连接到合适的父节点", auto_fixable=True),
                               FixAction("delete_node", f"删除孤立节点 '{label}'"),
                           ],
                           issue_type=IssueType.STRUCTURE)

    # ===================== 2) 逻辑 =====================

    def _check_logic(self, ctx: Dict, issues: List[Issue]):
        nodes = ctx["nodes"]
        children = ctx["children"]

        # 循环检测
        graph = children
        cycles = self._detect_cycles(graph, nodes)
        for cycle in cycles:
            self._emit(issues, "STRUCT_CYCLE", f"检测到循环依赖: {' → '.join(cycle)}",
                       node_ids=cycle,
                       targets=[IssueTarget(TargetKind.NODE, c) for c in cycle],
                       fix_actions=[FixAction("break_cycle", "删除回边以打破循环", auto_fixable=True)],
                       issue_type=IssueType.LOGIC)

        # 逻辑门输入不足
        for node in nodes:
            ntype = node.get("type", "")
            if ntype not in GATE_TYPES:
                continue
            nid = node.get("id")
            n_children = len(children.get(nid, []))
            min_inputs = 2
            if ntype == "inhibitGate":
                min_inputs = 1
            if n_children < min_inputs:
                label = _label_of(node) or ntype
                self._emit(issues, "LOGIC_GATE_UNDERFLOW",
                           f"逻辑门 '{label}' 子节点不足（当前 {n_children}，至少需 {min_inputs}）",
                           node_ids=[nid],
                           targets=[IssueTarget(TargetKind.GATE, nid, label)],
                           fix_actions=[FixAction("add_gate_input", f"为 '{label}' 添加子事件", auto_fixable=True)],
                           issue_type=IssueType.LOGIC)

    # ===================== 3) 数据 =====================

    def _check_data(self, ctx: Dict, issues: List[Issue]):
        for node in ctx["nodes"]:
            data = node.get("data", {})
            nid = node.get("id")
            label = _label_of(node)

            # 概率超范围
            prob = data.get("probability", node.get("probability"))
            if prob is not None:
                try:
                    p = float(prob)
                    if p < 0 or p > 1:
                        self._emit(issues, "DATA_PROB_RANGE", f"节点 '{label}' 的概率 {p} 不在 [0,1]",
                                   node_ids=[nid],
                                   targets=[IssueTarget(TargetKind.NODE, nid, label)],
                                   fix_actions=[FixAction("fix_probability", "将概率修正到合法范围", auto_fixable=True,
                                                          params={"suggested": max(0, min(1, p))})],
                                   issue_type=IssueType.DATA)
                except (ValueError, TypeError):
                    pass

            # 未命名
            if not label or not str(label).strip():
                self._emit(issues, "DATA_EMPTY_LABEL", f"存在未命名节点 ({nid})",
                           node_ids=[nid],
                           targets=[IssueTarget(TargetKind.NODE, nid, "")],
                           fix_actions=[FixAction("auto_name", "根据上下文自动命名", auto_fixable=True)],
                           issue_type=IssueType.DATA)

    # ===================== 4) 领域规则 =====================

    def _check_domain(self, ctx: Dict, issues: List[Issue]):
        nodes = ctx["nodes"]
        node_map = ctx["node_map"]
        children = ctx["children"]
        parents = ctx["parents"]

        # 4a. 重复节点: 同类型 + 完全相同 label（逻辑门节点除外）
        _gate_types = {"orGate", "andGate", "votingGate", "inhibitGate", "xorGate", "priorityAndGate"}
        label_groups: Dict[str, List[Dict]] = {}
        for n in nodes:
            if n.get("type") in _gate_types:
                continue
            lb = _label_of(n).strip()
            if not lb:
                continue
            key = f"{n.get('type')}::{lb}"
            label_groups.setdefault(key, []).append(n)

        for key, group in label_groups.items():
            if len(group) > 1:
                ids = [n.get("id") for n in group]
                lb = _label_of(group[0])
                self._emit(issues, "DOMAIN_DUPLICATE_NODE",
                           f"检测到 {len(group)} 个完全相同的节点 '{lb}'",
                           node_ids=ids,
                           targets=[IssueTarget(TargetKind.NODE, i, lb) for i in ids],
                           fix_actions=[FixAction("merge_duplicates", f"合并重复节点 '{lb}'", auto_fixable=True)])

        # 4b. 同名不同义冲突: 相同 label 但不同类型（逻辑门除外）
        name_types: Dict[str, List[Dict]] = {}
        for n in nodes:
            if n.get("type") in _gate_types:
                continue
            lb = _label_of(n).strip()
            if lb:
                name_types.setdefault(lb, []).append(n)
        for lb, grp in name_types.items():
            types = set(n.get("type") for n in grp)
            if len(types) > 1 and len(grp) > 1:
                ids = [n.get("id") for n in grp]
                type_strs = ", ".join(sorted(types))
                self._emit(issues, "DOMAIN_NAME_CONFLICT",
                           f"名称 '{lb}' 同时用于不同类型节点（{type_strs}），可能含义不同",
                           node_ids=ids,
                           targets=[IssueTarget(TargetKind.NODE, i, lb) for i in ids],
                           fix_actions=[FixAction("rename_conflicting", f"重命名 '{lb}' 以消除歧义", auto_fixable=True)])

        # 4c. 原因方向错误: 底事件 → 顶/中间事件（子节点层级 < 父节点层级）
        for lk in ctx["links"]:
            src_id, tgt_id = lk.get("source"), lk.get("target")
            src = node_map.get(src_id)
            tgt = node_map.get(tgt_id)
            if not src or not tgt:
                continue
            src_level = _LEVEL_ORDER.get(src.get("type", ""), 1)
            tgt_level = _LEVEL_ORDER.get(tgt.get("type", ""), 1)
            # 父 level 应 ≤ 子 level（顶→中→底）
            if src_level > tgt_level and src.get("type") in EVENT_TYPES and tgt.get("type") in EVENT_TYPES:
                edge_id = lk.get("id", f"{src_id}->{tgt_id}")
                self._emit(issues, "DOMAIN_WRONG_DIRECTION",
                           f"边 '{_label_of(src)}' → '{_label_of(tgt)}' 方向可能错误（底事件指向更高层级）",
                           node_ids=[src_id, tgt_id], edge_ids=[edge_id],
                           targets=[IssueTarget(TargetKind.EDGE, edge_id)],
                           fix_actions=[FixAction("reverse_edge", "反转该边方向", auto_fixable=True,
                                                  params={"edge_id": edge_id})])

        # 4d. 缺失中间层: 顶事件直接连底事件（无逻辑门/中间事件）
        for n in nodes:
            if n.get("type") != "topEvent":
                continue
            nid = n.get("id")
            for child_id in children.get(nid, []):
                child = node_map.get(child_id)
                if child and child.get("type") == "basicEvent":
                    self._emit(issues, "DOMAIN_MISSING_MIDDLE",
                               f"顶事件 '{_label_of(n)}' 直接连接底事件 '{_label_of(child)}'，缺少中间事件/逻辑门",
                               node_ids=[nid, child_id],
                               targets=[IssueTarget(TargetKind.NODE, nid, _label_of(n)),
                                        IssueTarget(TargetKind.NODE, child_id, _label_of(child))],
                               fix_actions=[FixAction("insert_middle_layer",
                                                      f"在 '{_label_of(n)}' 和 '{_label_of(child)}' 之间插入中间事件或逻辑门",
                                                      auto_fixable=True)])

        # 4e. 根因粒度不一致
        basic_events = [n for n in nodes if n.get("type") == "basicEvent"]
        if len(basic_events) >= 2:
            labels = [_label_of(n) for n in basic_events]
            avg_len = sum(len(lb) for lb in labels) / len(labels) if labels else 0
            for n in basic_events:
                lb = _label_of(n)
                if avg_len > 0 and (len(lb) > avg_len * 2.5 or len(lb) < avg_len * 0.3):
                    self._emit(issues, "DOMAIN_GRANULARITY",
                               f"底事件 '{lb}' 的描述粒度与其他底事件差异较大，建议统一拆分/合并",
                               node_ids=[n.get("id")],
                               targets=[IssueTarget(TargetKind.NODE, n.get("id"), lb)],
                               fix_actions=[FixAction("normalize_granularity", f"调整 '{lb}' 粒度", auto_fixable=True)])

        # 4f. 术语不统一: 同义词在不同节点中混用
        term_usage: Dict[str, List[Dict]] = {}  # canonical -> [{node, variant}]
        for n in nodes:
            lb = _label_of(n)
            canon = _normalize_term(lb)
            if canon:
                for variants, c in _TERM_PAIRS:
                    if c == canon:
                        for v in variants:
                            if v in lb:
                                term_usage.setdefault(canon, []).append({"node": n, "variant": v})
                                break
                        break
        for canon, usages in term_usage.items():
            variants_used = set(u["variant"] for u in usages)
            if len(variants_used) > 1:
                ids = [u["node"].get("id") for u in usages]
                self._emit(issues, "DOMAIN_TERM_INCONSISTENT",
                           f"术语不统一：节点中同时使用了 {', '.join(sorted(variants_used))}，建议统一",
                           node_ids=ids,
                           targets=[IssueTarget(TargetKind.NODE, i) for i in ids],
                           fix_actions=[FixAction("unify_terms", f"统一术语为一种表述", auto_fixable=True)])

    # ===================== 5) 工业字段（合并同类问题） =====================

    def _check_industrial(self, ctx: Dict, issues: List[Issue]):
        nodes = ctx["nodes"]
        param_ranges: Dict[str, List[Dict]] = {}

        # 先收集每种缺失类型涉及的所有节点，最后合并为单条 issue
        missing_groups: Dict[str, list] = {}  # rule_id -> [(nid, label)]

        for node in nodes:
            data = node.get("data", {})
            nid = node.get("id", "")
            ntype = node.get("type", "")
            label = _label_of(node)
            is_event = ntype in ("topEvent", "middleEvent", "basicEvent")
            is_basic = ntype == "basicEvent"
            if not is_event:
                continue

            if is_basic and not data.get("fault_code"):
                missing_groups.setdefault("IND_NO_FAULT_CODE", []).append((nid, label))
            if is_basic and not data.get("fault_mode"):
                missing_groups.setdefault("IND_NO_FAULT_MODE", []).append((nid, label))
            if not data.get("severity"):
                missing_groups.setdefault("IND_NO_SEVERITY", []).append((nid, label))
            if is_basic and not data.get("detection_method"):
                missing_groups.setdefault("IND_NO_DETECTION", []).append((nid, label))
            ev = data.get("evidence_level", "")
            if ev in ("assumed", "none"):
                missing_groups.setdefault("IND_WEAK_EVIDENCE", []).append((nid, label))
            if is_basic and not data.get("maintenance_ref"):
                missing_groups.setdefault("IND_NO_MAINTENANCE", []).append((nid, label))

            pname = data.get("parameter_name", "")
            prange = data.get("parameter_range", "")
            if pname and prange:
                param_ranges.setdefault(pname, []).append({"range": prange, "node_id": nid, "label": label})

        # 为每种缺失类型合并为单条 issue
        _IND_MSG = {
            "IND_NO_FAULT_CODE": ("缺少故障代码", "fill_fault_code", "基于知识库自动填充故障代码"),
            "IND_NO_FAULT_MODE": ("缺少故障模式", "fill_fault_mode", "基于知识库自动填充故障模式"),
            "IND_NO_SEVERITY":   ("缺少严重等级", "fill_severity", "基于上下文推断严重等级"),
            "IND_NO_DETECTION":  ("缺少检测方式", "fill_detection", "推荐检测方式"),
            "IND_WEAK_EVIDENCE": ("证据等级较弱", "upgrade_evidence", "补充直接证据来源"),
            "IND_NO_MAINTENANCE":("无维修参考",   "fill_maintenance", "关联维修手册章节"),
        }
        for rid, items in missing_groups.items():
            desc, action, action_desc = _IND_MSG.get(rid, ("缺少工业字段", "fill_field", "自动填充"))
            ids = [it[0] for it in items]
            names = [it[1] for it in items][:5]  # 最多显示5个
            suffix = f"等 {len(items)} 个节点" if len(items) > 5 else f"{len(items)} 个节点"
            name_str = "、".join(f"'{n}'" for n in names)
            self._emit(issues, rid, f"{name_str} {suffix}{desc}",
                       node_ids=ids,
                       targets=[IssueTarget(TargetKind.NODE, i, lb) for i, lb in items],
                       fix_actions=[FixAction(action, action_desc, auto_fixable=True)],
                       issue_type=IssueType.INDUSTRIAL)

        # 跨节点参数冲突
        for pname, entries in param_ranges.items():
            if len(entries) < 2:
                continue
            ranges = set(e["range"] for e in entries)
            if len(ranges) > 1:
                ids = [e["node_id"] for e in entries]
                labels = [e["label"] for e in entries]
                self._emit(issues, "IND_PARAM_CONFLICT",
                           f"参数 '{pname}' 在节点 ({', '.join(labels)}) 的正常范围不一致: {', '.join(ranges)}",
                           node_ids=ids,
                           targets=[IssueTarget(TargetKind.NODE, i) for i in ids],
                           fix_actions=[FixAction("resolve_param_conflict", "统一参数范围", auto_fixable=True)],
                           issue_type=IssueType.INDUSTRIAL)

    # ===================== 6) 设备专属规则包 =====================

    def _check_device_pack(self, ctx: Dict, issues: List[Issue]):
        if not self.device_type:
            return
        pack = DEVICE_RULE_PACKS.get(self.device_type, [])
        nodes = ctx["nodes"]
        for drule in pack:
            rid = drule["rule_id"]
            if not self._enabled(rid):
                continue
            check = drule.get("check", "")

            if check == "require_param":
                # 检查是否至少有一个节点设置了该监控参数
                target_param = drule.get("param_name", "")
                found = any(target_param in (n.get("data", {}).get("parameter_name", "") or "")
                            for n in nodes)
                if not found:
                    self._emit(issues, rid, f"{drule['label']}：树中未找到 '{target_param}' 监控参数",
                               targets=[IssueTarget(TargetKind.TREE)],
                               fix_actions=[FixAction("add_param_node", f"添加 '{target_param}' 监控参数节点", auto_fixable=True)],
                               issue_type=IssueType.DOMAIN)

            elif check == "require_fault_mode_keyword":
                keyword = drule.get("keyword", "")
                found = any(keyword in (n.get("data", {}).get("fault_mode", "") or "")
                            for n in nodes)
                if not found:
                    self._emit(issues, rid, f"{drule['label']}：树中未找到包含 '{keyword}' 的故障模式",
                               targets=[IssueTarget(TargetKind.TREE)],
                               fix_actions=[FixAction("add_fault_mode", f"添加 '{keyword}' 故障模式节点", auto_fixable=True)],
                               issue_type=IssueType.DOMAIN)

            elif check == "require_maintenance_keyword":
                keyword = drule.get("keyword", "")
                found = any(keyword in (_label_of(n) + (n.get("data", {}).get("maintenance_ref", "") or ""))
                            for n in nodes)
                if not found:
                    self._emit(issues, rid, f"{drule['label']}：树中未找到与 '{keyword}' 相关的维修措施",
                               targets=[IssueTarget(TargetKind.TREE)],
                               fix_actions=[FixAction("add_maintenance", f"补充 '{keyword}' 相关维修信息")],
                               issue_type=IssueType.DOMAIN)

    # ===================== 质量分数 =====================

    def _calc_quality_score(self, ctx: Dict, issues: List[Issue]) -> tuple:
        """计算质量分数 (0-100) 和各维度分项。

        直接惩罚模型：每个 issue 按 weight × severity_factor 直接从 100 分中扣除。
        严重度系数：ERROR ×3.0，WARNING ×2.0，SUGGESTION ×0.4
        各维度按相同方式独立计算展示。

        确保结构/逻辑问题显著拉低分数，工业字段缺失仅轻微影响。
        """
        _SEV_PENALTY = {
            IssueSeverity.ERROR: 3.0,
            IssueSeverity.WARNING: 2.0,
            IssueSeverity.SUGGESTION: 0.4,
        }
        _DIM_NAMES = ("structure", "logic", "data", "domain", "industrial")

        def _cat_of(iss_or_rule) -> str:
            if isinstance(iss_or_rule, Issue):
                cat = iss_or_rule.category or "other"
            else:
                cat = iss_or_rule.get("category", "other")
            if cat == "device":
                cat = "industrial"
            if cat not in _DIM_NAMES:
                cat = "domain"
            return cat

        # === 每条 issue 的惩罚分 ===
        total_penalty = 0.0
        dim_penalties: Dict[str, float] = {d: 0.0 for d in _DIM_NAMES}

        for iss in issues:
            w = self._weight(iss.rule_id)
            factor = _SEV_PENALTY.get(iss.severity, 0.5)
            p = w * factor
            total_penalty += p
            cat = _cat_of(iss)
            dim_penalties[cat] = dim_penalties.get(cat, 0) + p

        # === 总分 ===
        total_score = max(0.0, round(100 - total_penalty, 1))

        # === 各维度分项（每维度满分 100，直接扣减） ===
        breakdown = {}
        for dim in _DIM_NAMES:
            dim_score = max(0.0, 100 - dim_penalties.get(dim, 0))
            breakdown[dim] = round(dim_score, 1)

        return total_score, breakdown

    # ===================== 建议生成 =====================

    def _generate_suggestions(self, ctx: Dict, issues: List[Issue]) -> List[Suggestion]:
        suggestions = []

        for issue in issues:
            if issue.rule_id == "STRUCT_ORPHAN_NODE":
                suggestions.append(Suggestion("CONNECT_NODE", "建议将孤立节点连接到故障树中",
                                              "孤立节点无法参与故障分析", 0.9))
            elif issue.rule_id == "STRUCT_CYCLE":
                suggestions.append(Suggestion("BREAK_CYCLE", "建议打破循环依赖",
                                              "循环引用会导致逻辑死锁", 1.0))
            elif issue.rule_id == "DOMAIN_MISSING_MIDDLE":
                suggestions.append(Suggestion("ADD_MIDDLE_LAYER", "建议在顶事件和底事件之间增加中间层",
                                              "缺少中间层的树结构分析深度不够", 0.85))
            elif issue.rule_id == "DOMAIN_WRONG_DIRECTION":
                suggestions.append(Suggestion("REVERSE_EDGE", "建议检查并反转该边方向",
                                              "原因链方向应从高层到底层", 0.95))

        nodes = ctx["nodes"]
        basic_events = [n for n in nodes if n.get("type") == "basicEvent"]
        if 0 < len(basic_events) < 3 and len(nodes) > 2:
            suggestions.append(Suggestion("ADD_BASIC_EVENTS", "建议添加更多底事件",
                                          "底事件数量较少，可能导致故障分析不全面", 0.7))

        return suggestions

    # ===================== 循环检测 =====================

    def _detect_cycles(self, graph: Dict[str, List[str]], nodes: List[Dict]) -> List[List[str]]:
        cycles = []
        visited: Set[str] = set()
        rec_stack: Set[str] = set()

        def dfs(node_id: str, path: List[str]):
            visited.add(node_id)
            rec_stack.add(node_id)
            path.append(node_id)
            for neighbor in graph.get(node_id, []):
                if neighbor not in visited:
                    dfs(neighbor, path)
                elif neighbor in rec_stack:
                    idx = path.index(neighbor)
                    cycles.append(path[idx:] + [neighbor])
            path.pop()
            rec_stack.remove(node_id)

        for node in nodes:
            nid = node.get("id")
            if nid not in visited:
                dfs(nid, [])

        return cycles
