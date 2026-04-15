"""
故障树API路由 - 真正的CRUD + AI生成（带用户鉴权与版本历史）+ 证据追溯
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func as sa_func
from typing import Optional, List
from pydantic import BaseModel

from models.database import get_db
from models.models import (
    FaultTree, FaultTreeVersion, User, KnowledgeEntity, KnowledgeRelation,
    Document, DocumentChunk,
)
from services.generation.fta_generator import FTAGenerator
from services.validation.validator import LogicValidator
from core.auth import get_current_user, get_optional_user

router = APIRouter()


class TopEvent(BaseModel):
    name: str
    description: Optional[str] = None
    device_type: Optional[str] = None


class GenerationConfig(BaseModel):
    max_depth: int = 5
    min_confidence: float = 0.7
    calculate_probability: bool = True


class GenerateRequest(BaseModel):
    project_id: Optional[int] = None
    top_event: TopEvent
    generation_config: GenerationConfig = GenerationConfig()


class FaultTreeCreate(BaseModel):
    name: str
    project_id: Optional[int] = None
    top_event: Optional[str] = None
    structure: Optional[dict] = None


class FaultTreeUpdate(BaseModel):
    name: Optional[str] = None
    project_id: Optional[int] = None
    structure: Optional[dict] = None
    status: Optional[str] = None


@router.get("/")
async def get_fault_trees(
    project_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取故障树列表"""
    query = select(FaultTree).order_by(FaultTree.created_at.desc())
    if project_id is not None:
        query = query.where(FaultTree.project_id == project_id)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    trees = result.scalars().all()

    # 查询创建者用户名
    tree_list = []
    for t in trees:
        creator_name = None
        if t.created_by:
            cr = await db.execute(select(User.username).where(User.id == t.created_by))
            creator_name = cr.scalar_one_or_none()
        tree_list.append({
            "id": t.id,
            "name": t.name,
            "project_id": t.project_id,
            "top_event": t.top_event,
            "node_count": len(t.structure.get("nodes", [])) if t.structure else 0,
            "status": t.status,
            "created_by": t.created_by,
            "creator_name": creator_name,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return {"fault_trees": tree_list}


@router.get("/{tree_id}")
async def get_fault_tree(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单个故障树"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    return {
        "id": tree.id,
        "name": tree.name,
        "project_id": tree.project_id,
        "top_event": tree.top_event,
        "structure": tree.structure or {"nodes": [], "links": []},
        "version": tree.version,
        "status": tree.status,
        "quality_score": tree.quality_score,
        "created_at": tree.created_at.isoformat() if tree.created_at else None,
        "doc_composition": tree.doc_composition,
    }


@router.post("/")
async def create_fault_tree(
    data: FaultTreeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建故障树"""
    tree = FaultTree(
        name=data.name,
        project_id=data.project_id,
        top_event=data.top_event,
        structure=data.structure or {"nodes": [], "links": []},
        created_by=user.id,
    )
    db.add(tree)
    await db.commit()
    await db.refresh(tree)

    return {"id": tree.id, "message": "创建成功"}


@router.put("/{tree_id}")
async def update_fault_tree(
    tree_id: int,
    data: FaultTreeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新故障树 - 自动保存版本历史"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    # 保存当前版本到历史（仅当 structure 变更时）
    if data.structure is not None and tree.structure:
        db.add(FaultTreeVersion(
            fault_tree_id=tree.id,
            version=tree.version or 1,
            structure=tree.structure,
            changed_by=user.id,
            change_summary=f"由 {user.username} 编辑保存",
        ))

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tree, key, value)
    tree.version = (tree.version or 1) + 1

    await db.commit()
    return {"id": tree.id, "version": tree.version, "message": "更新成功"}


@router.delete("/{tree_id}")
async def delete_fault_tree(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除故障树"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    await db.delete(tree)
    await db.commit()
    return {"message": "删除成功"}


@router.post("/generate")
async def generate_fault_tree(
    request: GenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI生成故障树 — 结合知识图谱 + RAG 增强"""
    from services.rag.rag_service import (
        retrieve_knowledge_subgraph,
        retrieve_relevant_chunks,
        retrieve_similar_fault_trees,
    )

    try:
        query_text = f"{request.top_event.name} {request.top_event.description or ''} {request.top_event.device_type or ''}"

        # 1. 检索知识图谱子图
        knowledge_context = await retrieve_knowledge_subgraph(db, query_text, request.project_id)

        # 2. RAG 检索相关文档片段
        rag_chunks = await retrieve_relevant_chunks(db, query_text, request.project_id, top_k=8)

        # 3. 检索相似历史故障树
        similar_trees = await retrieve_similar_fault_trees(db, query_text, request.project_id, top_k=3)

        # 4. 增强生成
        generator = FTAGenerator()
        result = await generator.generate(
            top_event=request.top_event.model_dump(),
            config=request.generation_config.model_dump(),
            knowledge_context=knowledge_context,
            rag_chunks=rag_chunks,
            similar_trees=similar_trees,
        )

        # 保存到数据库
        tree = FaultTree(
            name=request.top_event.name,
            project_id=request.project_id,
            top_event=request.top_event.name,
            structure=result.get("structure", {"nodes": [], "links": []}),
            quality_score=result.get("quality_metrics", {}).get("structure_accuracy"),
            status="generated",
            created_by=user.id,
        )
        db.add(tree)
        await db.commit()
        await db.refresh(tree)

        return {
            "tree_id": tree.id,
            "status": "generated",
            "structure": tree.structure,
            "statistics": result.get("statistics"),
            "quality_metrics": result.get("quality_metrics"),
            "augmentation_info": {
                "kg_entities_used": len(knowledge_context.get("entities", [])),
                "kg_relations_used": len(knowledge_context.get("relations", [])),
                "rag_chunks_used": len(rag_chunks),
                "similar_trees_used": len(similar_trees),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成失败: {str(e)}")


@router.post("/{tree_id}/validate")
async def validate_fault_tree(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """校验故障树"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    try:
        validator = LogicValidator()
        vresult = await validator.validate(tree.structure or {"nodes": [], "links": []})
        return {
            "is_valid": vresult.is_valid,
            "issues": [
                {
                    "type": issue.type.value,
                    "severity": issue.severity.value,
                    "message": issue.message,
                    "node_ids": issue.node_ids,
                }
                for issue in vresult.issues
            ],
            "suggestions": [
                {
                    "type": s.type,
                    "description": s.description,
                    "reason": s.reason,
                    "confidence": s.confidence,
                }
                for s in vresult.suggestions
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"校验失败: {str(e)}")


@router.get("/{tree_id}/suggestions")
async def get_suggestions(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取优化建议"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    validator = LogicValidator()
    vresult = await validator.validate(tree.structure or {"nodes": [], "links": []})

    return {
        "suggestions": [
            {
                "type": s.type,
                "description": s.description,
                "reason": s.reason,
                "confidence": s.confidence,
            }
            for s in vresult.suggestions
        ]
    }


# ---------------------------------------------------------------------------
# 证据追溯
# ---------------------------------------------------------------------------

# 逻辑门类型解释映射
GATE_EXPLANATIONS = {
    "andGate": {
        "name": "与门 (AND Gate)",
        "description": "所有输入事件同时发生时，输出事件才发生",
        "logic": "P(output) = P(A) × P(B) × ... × P(N)",
        "standard": "IEC 61025 / GB/T 7829",
        "usage": "当所有子原因必须同时存在才能导致父事件时使用",
    },
    "orGate": {
        "name": "或门 (OR Gate)",
        "description": "任一输入事件发生时，输出事件就发生",
        "logic": "P(output) = 1 - (1-P(A)) × (1-P(B)) × ... × (1-P(N))",
        "standard": "IEC 61025 / GB/T 7829",
        "usage": "当任何一个子原因即可导致父事件时使用",
    },
    "xorGate": {
        "name": "异或门 (XOR Gate)",
        "description": "恰好一个输入事件发生时，输出事件才发生",
        "logic": "仅当输入中恰好有一个为真时输出为真",
        "standard": "IEC 61025 扩展",
        "usage": "当多个互斥原因中恰好一个发生才导致父事件时使用",
    },
    "priorityAndGate": {
        "name": "优先与门 (Priority AND Gate)",
        "description": "所有输入事件按特定顺序发生时，输出事件才发生",
        "logic": "P(output) = P(A 先于 B) × P(A) × P(B)",
        "standard": "IEC 61025 / GB/T 7829",
        "usage": "当子原因的发生顺序影响父事件时使用，例如：先过热再断裂",
    },
    "inhibitGate": {
        "name": "禁止门 (INHIBIT Gate)",
        "description": "输入事件发生且条件满足时，输出事件才发生",
        "logic": "P(output) = P(input) × P(condition)",
        "standard": "IEC 61025 / GB/T 7829",
        "usage": "当某原因仅在特定条件下才能导致父事件时使用，例如：仅在高温环境下",
    },
    "votingGate": {
        "name": "表决门 (Voting Gate / k-out-of-n)",
        "description": "n个输入中至少k个发生时，输出事件才发生",
        "logic": "P(output) = Σ C(n,i) × P^i × (1-P)^(n-i)，i从k到n",
        "standard": "IEC 61025",
        "usage": "冗余系统中使用，例如：三冗余系统中至少两个失效",
    },
    "notGate": {
        "name": "非门 (NOT Gate)",
        "description": "输入事件不发生时，输出事件发生",
        "logic": "P(output) = 1 - P(input)",
        "standard": "IEC 61025 扩展",
        "usage": "当某保护功能失效（即保护事件不发生）导致父事件时使用",
    },
}


def _compute_evidence_level(sources: list) -> str:
    """计算证据完整度: none / single / strong / multi_doc"""
    if not sources:
        return "none"
    doc_ids = {s.get("document_id") for s in sources if s.get("document_id")}
    if len(doc_ids) >= 2:
        return "multi_doc"
    if len(sources) >= 2:
        return "strong"
    return "single"


@router.get("/{tree_id}/evidence")
async def get_evidence(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取故障树的证据追溯信息 — 节点/边对应知识实体、关系、文档片段"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    structure = tree.structure or {"nodes": [], "links": []}
    ft_nodes = structure.get("nodes", [])
    ft_links = structure.get("links", [])
    project_id = tree.project_id

    # ---- 预加载知识库实体 & 关系 & 文档 & chunks ----
    ent_query = select(KnowledgeEntity)
    rel_query = select(KnowledgeRelation)
    doc_query = select(Document)
    chunk_query = select(DocumentChunk)
    if project_id:
        ent_query = ent_query.where(
            or_(KnowledgeEntity.project_id == project_id, KnowledgeEntity.project_id.is_(None))
        )
        rel_query = rel_query.where(
            or_(KnowledgeRelation.project_id == project_id, KnowledgeRelation.project_id.is_(None))
        )
        doc_query = doc_query.where(Document.project_id == project_id)
        chunk_query = chunk_query.where(DocumentChunk.project_id == project_id)

    ent_res = await db.execute(ent_query)
    all_entities = ent_res.scalars().all()
    rel_res = await db.execute(rel_query)
    all_relations = rel_res.scalars().all()
    doc_res = await db.execute(doc_query)
    all_docs = {d.id: d for d in doc_res.scalars().all()}
    chunk_res = await db.execute(chunk_query)
    all_chunks = chunk_res.scalars().all()

    # 获取版本信息
    last_version = None
    try:
        ver_res = await db.execute(
            select(FaultTreeVersion)
            .where(FaultTreeVersion.fault_tree_id == tree_id)
            .order_by(FaultTreeVersion.created_at.desc())
            .limit(1)
        )
        lv = ver_res.scalar_one_or_none()
        if lv:
            changed_user = None
            if lv.changed_by:
                u_res = await db.execute(select(User.username).where(User.id == lv.changed_by))
                changed_user = u_res.scalar_one_or_none()
            last_version = {
                "version": lv.version,
                "changed_by": changed_user or "unknown",
                "created_at": lv.created_at.isoformat() if lv.created_at else None,
                "summary": lv.change_summary,
            }
    except Exception:
        pass

    # 实体名 -> 实体 的索引
    ent_by_name = {}
    for e in all_entities:
        ent_by_name.setdefault(e.name.lower().strip(), []).append(e)

    # chunk 按 document_id 索引
    chunks_by_doc = {}
    for c in all_chunks:
        chunks_by_doc.setdefault(c.document_id, []).append(c)

    # ---- 节点证据 ----
    node_evidence = {}
    for n in ft_nodes:
        nid = n.get("id", "")
        label = (n.get("data", {}).get("label", "") or n.get("name", "")).strip()
        ntype = n.get("type", "")
        label_lower = label.lower()

        sources = []
        matched_entities = ent_by_name.get(label_lower, [])

        # 模糊匹配: 也检查包含关系
        if not matched_entities:
            for ename, elist in ent_by_name.items():
                if label_lower and (label_lower in ename or ename in label_lower):
                    matched_entities.extend(elist)
                    break

        for ent in matched_entities:
            doc = all_docs.get(ent.source_document_id) if ent.source_document_id else None
            doc_chunks = chunks_by_doc.get(ent.source_document_id, []) if ent.source_document_id else []
            # 找最相关的 chunk
            best_chunk = None
            if label_lower and doc_chunks:
                for ch in doc_chunks:
                    if label_lower in (ch.content or "").lower():
                        best_chunk = ch
                        break
                if not best_chunk and doc_chunks:
                    best_chunk = doc_chunks[0]

            sources.append({
                "entity_id": ent.id,
                "entity_name": ent.name,
                "entity_type": ent.entity_type,
                "confidence": ent.confidence,
                "evidence_text": ent.evidence or "",
                "document_id": ent.source_document_id,
                "document_name": doc.filename if doc else None,
                "chunk_id": best_chunk.id if best_chunk else None,
                "chunk_content": best_chunk.content[:500] if best_chunk else None,
                "chunk_index": best_chunk.chunk_index if best_chunk else None,
            })

        # 逻辑门说明
        gate_info = GATE_EXPLANATIONS.get(ntype)

        node_evidence[nid] = {
            "node_id": nid,
            "label": label,
            "node_type": ntype,
            "sources": sources,
            "evidence_level": _compute_evidence_level(sources),
            "gate_info": gate_info,
            "last_version": last_version,
        }

    # ---- 边证据 ----
    edge_evidence = {}
    for link in ft_links:
        eid = link.get("id", f"e-{link.get('source')}-{link.get('target')}")
        src_id = link.get("source", "")
        tgt_id = link.get("target", "")

        # 获取源/目标节点名称
        src_node = next((n for n in ft_nodes if n.get("id") == src_id), {})
        tgt_node = next((n for n in ft_nodes if n.get("id") == tgt_id), {})
        src_label = (src_node.get("data", {}).get("label", "") or src_node.get("name", "")).strip().lower()
        tgt_label = (tgt_node.get("data", {}).get("label", "") or tgt_node.get("name", "")).strip().lower()

        sources = []
        for rel in all_relations:
            src_ent = next((e for e in all_entities if e.id == rel.source_entity_id), None)
            tgt_ent = next((e for e in all_entities if e.id == rel.target_entity_id), None)
            if not src_ent or not tgt_ent:
                continue
            sn = src_ent.name.lower().strip()
            tn = tgt_ent.name.lower().strip()
            # 匹配: 名称包含关系
            matched = False
            if src_label and tgt_label:
                if (src_label in sn or sn in src_label) and (tgt_label in tn or tn in tgt_label):
                    matched = True
                elif (src_label in tn or tn in src_label) and (tgt_label in sn or sn in tgt_label):
                    matched = True
            if not matched:
                continue

            doc = all_docs.get(rel.source_document_id) if rel.source_document_id else None
            sources.append({
                "relation_id": rel.id,
                "source_entity": src_ent.name,
                "target_entity": tgt_ent.name,
                "relation_type": rel.relation_type,
                "logic_gate": rel.logic_gate,
                "confidence": rel.confidence,
                "evidence_text": rel.evidence or "",
                "document_id": rel.source_document_id,
                "document_name": doc.filename if doc else None,
            })

        # 判断源节点是否为逻辑门，提供门判定依据
        src_type = src_node.get("type", "")
        gate_basis = GATE_EXPLANATIONS.get(src_type)

        # 多文档共识判断
        doc_ids = {s.get("document_id") for s in sources if s.get("document_id")}
        is_multi_doc = len(doc_ids) >= 2

        # 冲突检测: 不同文档给出不同逻辑门
        gate_types = {s.get("logic_gate") for s in sources if s.get("logic_gate")}
        has_conflict = len(gate_types) > 1

        edge_evidence[eid] = {
            "edge_id": eid,
            "source_node": src_id,
            "target_node": tgt_id,
            "sources": sources,
            "evidence_level": _compute_evidence_level(sources),
            "gate_basis": gate_basis,
            "is_multi_doc_consensus": is_multi_doc,
            "has_conflict": has_conflict,
            "conflict_detail": f"不同文档给出了不同的逻辑门类型: {', '.join(filter(None, gate_types))}" if has_conflict else None,
        }

    return {
        "tree_id": tree_id,
        "node_evidence": node_evidence,
        "edge_evidence": edge_evidence,
    }
