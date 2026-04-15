"""
评测引擎 — 标准树 vs 生成树 对齐对比 + 关系抽取评测
"""
from __future__ import annotations
from typing import List, Dict, Any, Tuple, Optional, Set
from difflib import SequenceMatcher
import math


# ──────────────────── helpers ────────────────────

def _normalize(name: str) -> str:
    """统一名称：去空格、转小写"""
    return (name or "").strip().lower().replace(" ", "")


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _best_match(name: str, candidates: List[str], threshold: float = 0.6) -> Optional[str]:
    best, best_score = None, 0.0
    for c in candidates:
        s = _sim(name, c)
        if s > best_score:
            best_score, best = s, c
    return best if best_score >= threshold else None


# ──────────────────── 节点对齐 ────────────────────

def _extract_nodes(structure: dict) -> Dict[str, dict]:
    """返回 {normalized_name: node_dict}"""
    result = {}
    for n in (structure.get("nodes") or []):
        label = (n.get("data") or {}).get("label") or n.get("name") or n.get("id", "")
        result[_normalize(label)] = n
    return result


def _extract_node_names(structure: dict) -> List[str]:
    names = []
    for n in (structure.get("nodes") or []):
        label = (n.get("data") or {}).get("label") or n.get("name") or ""
        names.append(label)
    return names


def _extract_edges(structure: dict) -> Set[Tuple[str, str]]:
    """返回 (source_name, target_name) 集合"""
    id2name = {}
    for n in (structure.get("nodes") or []):
        label = (n.get("data") or {}).get("label") or n.get("name") or n.get("id", "")
        id2name[n.get("id", "")] = _normalize(label)
    edges = set()
    for lk in (structure.get("links") or structure.get("edges") or []):
        s = id2name.get(lk.get("source", ""), _normalize(lk.get("source", "")))
        t = id2name.get(lk.get("target", ""), _normalize(lk.get("target", "")))
        edges.add((s, t))
    return edges


def _extract_gate_types(structure: dict) -> Dict[str, str]:
    """返回 {normalized_name: gate_type}"""
    result = {}
    for n in (structure.get("nodes") or []):
        ntype = n.get("type", "")
        if "gate" in ntype.lower() or "Gate" in ntype:
            label = (n.get("data") or {}).get("label") or n.get("name") or n.get("id", "")
            result[_normalize(label)] = ntype
    return result


def _compute_levels(structure: dict) -> Dict[str, int]:
    """BFS 计算每个节点的层级深度"""
    id2name = {}
    children: Dict[str, List[str]] = {}
    parent_set: Set[str] = set()
    child_set: Set[str] = set()

    for n in (structure.get("nodes") or []):
        label = (n.get("data") or {}).get("label") or n.get("name") or n.get("id", "")
        nid = n.get("id", "")
        id2name[nid] = _normalize(label)
        children[_normalize(label)] = []

    for lk in (structure.get("links") or structure.get("edges") or []):
        s = id2name.get(lk.get("source", ""), "")
        t = id2name.get(lk.get("target", ""), "")
        if s and t:
            children.setdefault(s, []).append(t)
            parent_set.add(s)
            child_set.add(t)

    roots = parent_set - child_set
    if not roots:
        roots = set(id2name.values())[:1] if id2name else set()

    levels: Dict[str, int] = {}
    queue = [(r, 0) for r in roots]
    while queue:
        node, depth = queue.pop(0)
        if node in levels:
            continue
        levels[node] = depth
        for kid in children.get(node, []):
            queue.append((kid, depth + 1))

    return levels


# ──────────────────── P / R / F1 ────────────────────

def _prf(tp: int, fp: int, fn: int) -> Tuple[float, float, float]:
    p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
    return round(p * 100, 2), round(r * 100, 2), round(f * 100, 2)


# ──────────────────── 主评测函数 ────────────────────

def evaluate_trees(
    gold_structure: dict,
    gen_structure: dict,
    gold_relations: Optional[List[dict]] = None,
    gen_relations: Optional[List[dict]] = None,
    quality_before: Optional[float] = None,
    quality_after: Optional[float] = None,
    time_ai: Optional[float] = None,
    time_expert: Optional[float] = None,
    time_manual: Optional[float] = None,
) -> Dict[str, Any]:
    """
    完整评测：
    返回 {
        node_precision, node_recall, node_f1,
        edge_precision, edge_recall, edge_f1,
        gate_accuracy, level_accuracy, structure_accuracy,
        relation_precision, relation_recall, relation_f1,
        quality_before, quality_after, quality_improvement,
        time_ai_seconds, time_expert_seconds, time_manual_baseline, time_reduction_pct,
        overall_score, error_cases: [...]
    }
    """
    error_cases: List[dict] = []

    # ── 1. 节点对比 ──
    gold_names = set(_extract_nodes(gold_structure).keys())
    gen_names = set(_extract_nodes(gen_structure).keys())

    # 模糊匹配
    matched_gold: Set[str] = set()
    matched_gen: Set[str] = set()
    for gn in gold_names:
        best = _best_match(gn, list(gen_names - matched_gen), threshold=0.65)
        if best:
            matched_gold.add(gn)
            matched_gen.add(best)

    node_tp = len(matched_gold)
    node_fp = len(gen_names) - len(matched_gen)
    node_fn = len(gold_names) - len(matched_gold)
    node_p, node_r, node_f1 = _prf(node_tp, node_fp, node_fn)

    # 记录节点错误案例
    missing_nodes = gold_names - matched_gold
    extra_nodes = gen_names - matched_gen
    for mn in missing_nodes:
        error_cases.append({"type": "missing_node", "severity": "error", "gold": mn, "description": f"标准树中存在但生成树中缺失: {mn}"})
    for en in extra_nodes:
        error_cases.append({"type": "extra_node", "severity": "warning", "generated": en, "description": f"生成树中多出的节点: {en}"})

    # ── 2. 边对比 ──
    gold_edges = _extract_edges(gold_structure)
    gen_edges = _extract_edges(gen_structure)

    # 通过名称映射建立对应关系
    name_map: Dict[str, str] = {}
    for gn in matched_gold:
        best = _best_match(gn, list(matched_gen), threshold=0.65)
        if best:
            name_map[gn] = best
            name_map[best] = gn

    edge_tp = 0
    matched_gen_edges: Set[Tuple[str, str]] = set()
    for gs, gt in gold_edges:
        ms = name_map.get(gs, gs)
        mt = name_map.get(gt, gt)
        # 尝试精确和模糊
        if (ms, mt) in gen_edges:
            edge_tp += 1
            matched_gen_edges.add((ms, mt))
        elif (gs, gt) in gen_edges:
            edge_tp += 1
            matched_gen_edges.add((gs, gt))
        else:
            error_cases.append({"type": "missing_edge", "severity": "error", "gold_source": gs, "gold_target": gt, "description": f"缺失边: {gs} → {gt}"})

    edge_fp = len(gen_edges) - len(matched_gen_edges)
    edge_fn = len(gold_edges) - edge_tp
    edge_p, edge_r, edge_f1 = _prf(edge_tp, edge_fp, edge_fn)

    for ge in gen_edges - matched_gen_edges:
        error_cases.append({"type": "extra_edge", "severity": "warning", "gen_source": ge[0], "gen_target": ge[1], "description": f"多出的边: {ge[0]} → {ge[1]}"})

    # ── 3. 逻辑门准确率 ──
    gold_gates = _extract_gate_types(gold_structure)
    gen_gates = _extract_gate_types(gen_structure)
    gate_total, gate_correct = 0, 0
    for gname, gtype in gold_gates.items():
        gate_total += 1
        best = _best_match(gname, list(gen_gates.keys()), threshold=0.65)
        if best and _normalize(gen_gates[best]) == _normalize(gtype):
            gate_correct += 1
        elif best:
            error_cases.append({"type": "gate_mismatch", "severity": "error", "node": gname, "gold_type": gtype, "gen_type": gen_gates.get(best, "?"), "description": f"门类型不一致: {gname} 应为 {gtype} 实为 {gen_gates.get(best, '?')}"})
        else:
            error_cases.append({"type": "missing_gate", "severity": "error", "node": gname, "gold_type": gtype, "description": f"缺失逻辑门: {gname} ({gtype})"})
    gate_accuracy = round(gate_correct / gate_total * 100, 2) if gate_total > 0 else 100.0

    # ── 4. 层级准确率 ──
    gold_levels = _compute_levels(gold_structure)
    gen_levels = _compute_levels(gen_structure)
    level_total, level_correct = 0, 0
    for gname, glevel in gold_levels.items():
        best = _best_match(gname, list(gen_levels.keys()), threshold=0.65)
        if best is not None:
            level_total += 1
            if gen_levels[best] == glevel:
                level_correct += 1
            else:
                error_cases.append({"type": "level_mismatch", "severity": "warning", "node": gname, "gold_level": glevel, "gen_level": gen_levels.get(best, "?"), "description": f"层级不一致: {gname} 应在第{glevel}层 实在第{gen_levels.get(best, '?')}层"})
    level_accuracy = round(level_correct / level_total * 100, 2) if level_total > 0 else 100.0

    # ── 5. 综合结构准确率 ──
    structure_accuracy = round((node_f1 * 0.35 + edge_f1 * 0.35 + gate_accuracy * 0.15 + level_accuracy * 0.15), 2)

    # ── 6. 关系抽取评测 ──
    rel_p, rel_r, rel_f1 = 0.0, 0.0, 0.0
    if gold_relations and gen_relations:
        gold_rels = {(_normalize(r.get("source", "")), _normalize(r.get("target", "")), _normalize(r.get("type", ""))) for r in gold_relations}
        gen_rels = {(_normalize(r.get("source", "")), _normalize(r.get("target", "")), _normalize(r.get("type", ""))) for r in gen_relations}
        rel_tp = len(gold_rels & gen_rels)
        rel_fp = len(gen_rels - gold_rels)
        rel_fn = len(gold_rels - gen_rels)
        rel_p, rel_r, rel_f1 = _prf(rel_tp, rel_fp, rel_fn)
        for mr in (gold_rels - gen_rels):
            error_cases.append({"type": "missing_relation", "severity": "error", "source": mr[0], "target": mr[1], "relation": mr[2], "description": f"缺失关系: {mr[0]} --[{mr[2]}]--> {mr[1]}"})

    # ── 7. 耗时对比 ──
    time_reduction_pct = None
    if time_ai is not None and time_manual is not None and time_manual > 0:
        total_ai = (time_ai or 0) + (time_expert or 0)
        time_reduction_pct = round((1 - total_ai / time_manual) * 100, 2)

    # ── 8. 质量变化 ──
    quality_improvement = None
    if quality_before is not None and quality_after is not None:
        quality_improvement = round(quality_after - quality_before, 2)

    # ── 9. 综合得分 ──
    overall_score = round(structure_accuracy * 0.5 + (rel_f1 if rel_f1 else structure_accuracy) * 0.3 + min(gate_accuracy, level_accuracy) * 0.2, 2)

    return {
        "node_precision": node_p, "node_recall": node_r, "node_f1": node_f1,
        "edge_precision": edge_p, "edge_recall": edge_r, "edge_f1": edge_f1,
        "gate_accuracy": gate_accuracy,
        "level_accuracy": level_accuracy,
        "structure_accuracy": structure_accuracy,
        "relation_precision": rel_p, "relation_recall": rel_r, "relation_f1": rel_f1,
        "quality_before": quality_before, "quality_after": quality_after, "quality_improvement": quality_improvement,
        "time_ai_seconds": time_ai, "time_expert_seconds": time_expert,
        "time_manual_baseline": time_manual, "time_reduction_pct": time_reduction_pct,
        "overall_score": overall_score,
        "error_cases": error_cases,
        "summary": {
            "gold_nodes": len(gold_names), "gen_nodes": len(gen_names),
            "gold_edges": len(gold_edges), "gen_edges": len(gen_edges),
            "gold_gates": len(gold_gates), "gen_gates": len(gen_gates),
            "total_error_cases": len(error_cases),
        },
    }
