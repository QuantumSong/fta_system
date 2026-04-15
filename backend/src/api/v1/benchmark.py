"""
指标评测 API — 标准树管理 / 评测运行 / 历史查询 / 报告导出
"""
import json, io, csv
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from sqlalchemy import select, func as sa_func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from models.models import GoldTree, EvalRun, FaultTree, User
from core.auth import get_current_user
from services.evaluation.engine import evaluate_trees
from services.validation.validator import LogicValidator

router = APIRouter()


# ──────────── Request / Response Models ────────────

class GoldTreeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    device_type: Optional[str] = None
    top_event: Optional[str] = None
    structure: Dict[str, Any]
    relation_annotations: Optional[List[dict]] = None


class GoldTreeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    device_type: Optional[str] = None
    top_event: Optional[str] = None
    structure: Optional[Dict[str, Any]] = None
    relation_annotations: Optional[List[dict]] = None


class RunEvalRequest(BaseModel):
    name: Optional[str] = None
    gold_tree_id: int
    generated_tree_id: Optional[int] = None
    generated_structure: Optional[Dict[str, Any]] = None
    generated_relations: Optional[List[dict]] = None
    algorithm_version: Optional[str] = None
    quality_before: Optional[float] = None
    quality_after: Optional[float] = None
    time_ai_seconds: Optional[float] = None
    time_expert_seconds: Optional[float] = None
    time_manual_baseline: Optional[float] = None


class AIEvalRequest(BaseModel):
    name: Optional[str] = None
    tree_id: Optional[int] = None
    structure: Optional[Dict[str, Any]] = None
    device_type: Optional[str] = None
    algorithm_version: Optional[str] = None


# ──────────── helpers ────────────

def _gold_to_dict(g: GoldTree) -> dict:
    return {
        "id": g.id, "name": g.name, "description": g.description,
        "project_id": g.project_id, "device_type": g.device_type,
        "top_event": g.top_event, "structure": g.structure,
        "relation_annotations": g.relation_annotations,
        "created_by": g.created_by,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
        "node_count": len((g.structure or {}).get("nodes", [])),
        "edge_count": len((g.structure or {}).get("links", [])),
    }


def _run_to_dict(r: EvalRun) -> dict:
    return {
        "id": r.id, "name": r.name,
        "project_id": r.project_id, "device_type": r.device_type,
        "top_event": r.top_event, "algorithm_version": r.algorithm_version,
        "gold_tree_id": r.gold_tree_id, "generated_tree_id": r.generated_tree_id,
        "node_precision": r.node_precision, "node_recall": r.node_recall, "node_f1": r.node_f1,
        "edge_precision": r.edge_precision, "edge_recall": r.edge_recall, "edge_f1": r.edge_f1,
        "gate_accuracy": r.gate_accuracy, "level_accuracy": r.level_accuracy,
        "structure_accuracy": r.structure_accuracy,
        "relation_precision": r.relation_precision, "relation_recall": r.relation_recall, "relation_f1": r.relation_f1,
        "quality_before": r.quality_before, "quality_after": r.quality_after,
        "time_ai_seconds": r.time_ai_seconds, "time_expert_seconds": r.time_expert_seconds,
        "time_manual_baseline": r.time_manual_baseline,
        "overall_score": r.overall_score,
        "details": r.details,
        "status": r.status,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ════════════════ 标准树 CRUD ════════════════

@router.get("/gold-trees")
async def list_gold_trees(
    project_id: Optional[int] = None,
    device_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(GoldTree)
    if project_id is not None:
        q = q.where(GoldTree.project_id == project_id)
    if device_type:
        q = q.where(GoldTree.device_type == device_type)
    q = q.order_by(desc(GoldTree.updated_at))
    result = await db.execute(q)
    return {"gold_trees": [_gold_to_dict(g) for g in result.scalars().all()]}


@router.get("/gold-trees/{gid}")
async def get_gold_tree(gid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(GoldTree).where(GoldTree.id == gid))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "标准树不存在")
    return _gold_to_dict(g)


@router.post("/gold-trees")
async def create_gold_tree(data: GoldTreeCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    g = GoldTree(
        name=data.name, description=data.description,
        project_id=data.project_id, device_type=data.device_type,
        top_event=data.top_event, structure=data.structure,
        relation_annotations=data.relation_annotations,
        created_by=user.id,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _gold_to_dict(g)


@router.put("/gold-trees/{gid}")
async def update_gold_tree(gid: int, data: GoldTreeUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(GoldTree).where(GoldTree.id == gid))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "标准树不存在")
    for field in ["name", "description", "device_type", "top_event", "structure", "relation_annotations"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(g, field, val)
    await db.commit()
    await db.refresh(g)
    return _gold_to_dict(g)


@router.delete("/gold-trees/{gid}")
async def delete_gold_tree(gid: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(GoldTree).where(GoldTree.id == gid))
    g = r.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "标准树不存在")
    await db.delete(g)
    await db.commit()
    return {"message": "已删除", "id": gid}


# ════════════════ 运行评测 ════════════════

@router.post("/run")
async def run_evaluation(
    data: RunEvalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """执行一次评测 run"""
    # 获取 gold tree
    r = await db.execute(select(GoldTree).where(GoldTree.id == data.gold_tree_id))
    gold = r.scalar_one_or_none()
    if not gold:
        raise HTTPException(404, "标准树不存在")

    # 获取 generated tree
    gen_structure = data.generated_structure
    if data.generated_tree_id and not gen_structure:
        r2 = await db.execute(select(FaultTree).where(FaultTree.id == data.generated_tree_id))
        ft = r2.scalar_one_or_none()
        if not ft:
            raise HTTPException(404, "生成树不存在")
        gen_structure = ft.structure

    if not gen_structure:
        raise HTTPException(400, "请提供生成树结构或 generated_tree_id")

    # 运行评测引擎
    result = evaluate_trees(
        gold_structure=gold.structure,
        gen_structure=gen_structure,
        gold_relations=gold.relation_annotations,
        gen_relations=data.generated_relations,
        quality_before=data.quality_before,
        quality_after=data.quality_after,
        time_ai=data.time_ai_seconds,
        time_expert=data.time_expert_seconds,
        time_manual=data.time_manual_baseline,
    )

    # 保存 run
    run_name = data.name or f"评测 {datetime.now().strftime('%Y%m%d_%H%M%S')}"
    run = EvalRun(
        name=run_name,
        project_id=gold.project_id,
        device_type=gold.device_type or data.algorithm_version,
        top_event=gold.top_event,
        algorithm_version=data.algorithm_version,
        gold_tree_id=gold.id,
        generated_tree_id=data.generated_tree_id,
        node_precision=result["node_precision"],
        node_recall=result["node_recall"],
        node_f1=result["node_f1"],
        edge_precision=result["edge_precision"],
        edge_recall=result["edge_recall"],
        edge_f1=result["edge_f1"],
        gate_accuracy=result["gate_accuracy"],
        level_accuracy=result["level_accuracy"],
        structure_accuracy=result["structure_accuracy"],
        relation_precision=result["relation_precision"],
        relation_recall=result["relation_recall"],
        relation_f1=result["relation_f1"],
        quality_before=result["quality_before"],
        quality_after=result["quality_after"],
        time_ai_seconds=result["time_ai_seconds"],
        time_expert_seconds=result["time_expert_seconds"],
        time_manual_baseline=result["time_manual_baseline"],
        overall_score=result["overall_score"],
        details=result,
        created_by=user.id,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return _run_to_dict(run)


# ════════════════ AI 自动评测 ════════════════

@router.post("/ai-eval")
async def ai_evaluation(
    data: AIEvalRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """数据结构/逻辑/领域/工业多维 AI 自动评测，不需要标准树"""
    try:
        return await _do_ai_eval(data, user, db)
    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI 评测失败: {str(e)}")


async def _do_ai_eval(data: AIEvalRequest, user: User, db: AsyncSession):
    structure = data.structure
    project_id = None

    if data.tree_id and not structure:
        r = await db.execute(select(FaultTree).where(FaultTree.id == data.tree_id))
        ft = r.scalar_one_or_none()
        if not ft:
            raise HTTPException(404, "故障树不存在")
        structure = ft.structure
        project_id = ft.project_id

    if not structure:
        raise HTTPException(400, "请提供故障树结构或 tree_id")

    nodes = structure.get("nodes", [])
    links = structure.get("links", [])

    # 运行校验器
    validator = LogicValidator(device_type=data.device_type)
    vr = await validator.validate(structure)

    # 计算补充统计指标
    top_events = [n for n in nodes if n.get("type") == "topEvent"]
    gate_nodes = [n for n in nodes if n.get("type", "") in (
        "andGate", "orGate", "xorGate", "priorityAndGate", "inhibitGate", "votingGate")]
    basic_events = [n for n in nodes if n.get("type") == "basicEvent"]
    middle_events = [n for n in nodes if n.get("type") == "middleEvent"]

    # 树深度
    children_map: Dict[str, list] = {}
    for lk in links:
        children_map.setdefault(lk.get("source"), []).append(lk.get("target"))
    max_depth = 0
    def _depth(nid, d=0):
        nonlocal max_depth
        if d > max_depth:
            max_depth = d
        for c in children_map.get(nid, []):
            _depth(c, d + 1)
    for te in top_events:
        _depth(te.get("id"))

    # 平均分支因子
    branch_counts = [len(children_map.get(n.get("id"), [])) for n in gate_nodes]
    avg_branch = round(sum(branch_counts) / len(branch_counts), 1) if branch_counts else 0

    # 辅助：同时检查 data 内嵌和节点根级两个位置（兼容 ReactFlow 格式和原始格式）
    def _node_field(n: dict, field: str):
        """优先从 data 中取，其次从节点根级取"""
        val = n.get("data", {}).get(field)
        if val is not None:
            return val
        return n.get(field)

    # 概率完整性
    prob_filled = sum(1 for n in basic_events if _node_field(n, "probability") is not None)
    prob_coverage = round(prob_filled / len(basic_events) * 100, 1) if basic_events else 100

    # 命名完整性
    named = sum(1 for n in nodes if (n.get("data", {}).get("label") or n.get("name") or "").strip())
    naming_coverage = round(named / len(nodes) * 100, 1) if nodes else 100

    # 工业字段覆盖率
    ind_fields = ["fault_code", "fault_mode", "severity", "detection_method", "maintenance_ref"]
    ind_total = len(basic_events) * len(ind_fields)
    ind_filled = 0
    for n in basic_events:
        for f in ind_fields:
            if _node_field(n, f):
                ind_filled += 1
    ind_coverage = round(ind_filled / ind_total * 100, 1) if ind_total else 100

    # 问题统计
    error_count = sum(1 for i in vr.issues if i.severity.value == "ERROR")
    warning_count = sum(1 for i in vr.issues if i.severity.value == "WARNING")
    suggestion_count = sum(1 for i in vr.issues if i.severity.value == "SUGGESTION")

    ai_details = {
        "mode": "ai",
        "quality_score": vr.quality_score,
        "score_breakdown": vr.score_breakdown,
        "is_valid": vr.is_valid,
        "issue_count": {"error": error_count, "warning": warning_count, "suggestion": suggestion_count},
        "issues": [
            {"rule_id": i.rule_id, "severity": i.severity.value, "category": i.category,
             "message": i.message, "node_ids": i.node_ids}
            for i in vr.issues
        ],
        "suggestions": [{"type": s.type, "description": s.description, "reason": s.reason, "confidence": s.confidence}
                        for s in vr.suggestions],
        "topology": {
            "total_nodes": len(nodes),
            "total_edges": len(links),
            "top_events": len(top_events),
            "gate_nodes": len(gate_nodes),
            "middle_events": len(middle_events),
            "basic_events": len(basic_events),
            "max_depth": max_depth,
            "avg_branch_factor": avg_branch,
        },
        "coverage": {
            "probability": prob_coverage,
            "naming": naming_coverage,
            "industrial_fields": ind_coverage,
        },
    }

    # 保存为 EvalRun 记录
    run_name = data.name or f"AI评测 {datetime.now().strftime('%Y%m%d_%H%M%S')}"
    run = EvalRun(
        name=run_name,
        project_id=project_id,
        device_type=data.device_type,
        algorithm_version=data.algorithm_version or "ai-eval",
        generated_tree_id=data.tree_id,
        structure_accuracy=vr.score_breakdown.get("structure"),
        gate_accuracy=vr.score_breakdown.get("logic"),
        level_accuracy=vr.score_breakdown.get("data"),
        relation_f1=vr.score_breakdown.get("domain"),
        overall_score=vr.quality_score,
        details=ai_details,
        created_by=user.id,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return {**_run_to_dict(run), "ai_details": ai_details}


# ════════════════ 评测历史 ════════════════

@router.get("/runs")
async def list_runs(
    project_id: Optional[int] = None,
    device_type: Optional[str] = None,
    top_event: Optional[str] = None,
    algorithm_version: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(EvalRun)
    if project_id is not None:
        q = q.where(EvalRun.project_id == project_id)
    if device_type:
        q = q.where(EvalRun.device_type == device_type)
    if top_event:
        q = q.where(EvalRun.top_event.contains(top_event))
    if algorithm_version:
        q = q.where(EvalRun.algorithm_version == algorithm_version)

    count_q = select(sa_func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = q.order_by(desc(EvalRun.created_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    runs = result.scalars().all()

    return {"runs": [_run_to_dict(r) for r in runs], "total": total, "page": page, "page_size": page_size}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(EvalRun).where(EvalRun.id == run_id))
    run = r.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测记录不存在")
    return _run_to_dict(run)


@router.delete("/runs/{run_id}")
async def delete_run(run_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(EvalRun).where(EvalRun.id == run_id))
    run = r.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测记录不存在")
    await db.delete(run)
    await db.commit()
    return {"message": "已删除", "id": run_id}


# ════════════════ 趋势数据 ════════════════

@router.get("/trend")
async def get_trend(
    project_id: Optional[int] = None,
    device_type: Optional[str] = None,
    limit: int = Query(30, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """返回最近 N 次评测的趋势数据"""
    q = select(EvalRun)
    if project_id is not None:
        q = q.where(EvalRun.project_id == project_id)
    if device_type:
        q = q.where(EvalRun.device_type == device_type)
    q = q.order_by(desc(EvalRun.created_at)).limit(limit)
    result = await db.execute(q)
    runs = result.scalars().all()
    runs = list(reversed(runs))  # oldest first for chart

    return {
        "labels": [r.created_at.strftime("%m/%d %H:%M") if r.created_at else str(r.id) for r in runs],
        "structure_accuracy": [r.structure_accuracy for r in runs],
        "relation_f1": [r.relation_f1 for r in runs],
        "node_f1": [r.node_f1 for r in runs],
        "edge_f1": [r.edge_f1 for r in runs],
        "gate_accuracy": [r.gate_accuracy for r in runs],
        "overall_score": [r.overall_score for r in runs],
        "quality_before": [r.quality_before for r in runs],
        "quality_after": [r.quality_after for r in runs],
    }


# ════════════════ 导出报告 ════════════════

@router.get("/runs/{run_id}/export")
async def export_report(run_id: int, fmt: str = "json", user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """导出评测报告 (json / csv)"""
    r = await db.execute(select(EvalRun).where(EvalRun.id == run_id))
    run = r.scalar_one_or_none()
    if not run:
        raise HTTPException(404, "评测记录不存在")

    data = _run_to_dict(run)

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        # header
        flat = {k: v for k, v in data.items() if k != "details"}
        writer.writerow(flat.keys())
        writer.writerow(flat.values())
        # error cases
        errors = (data.get("details") or {}).get("error_cases", [])
        if errors:
            writer.writerow([])
            writer.writerow(["=== 错误案例 ==="])
            if errors:
                writer.writerow(errors[0].keys())
                for ec in errors:
                    writer.writerow(ec.values())
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=eval_report_{run_id}.csv"},
        )

    return data
