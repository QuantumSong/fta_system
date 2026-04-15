"""
多文档联合建树 API — 文档配置、术语归一、冲突检测、加权生成、模板管理
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from collections import defaultdict

from models.database import get_db
from models.models import (
    Document, DocumentChunk, KnowledgeEntity, KnowledgeRelation,
    FaultTree, BuildTemplate, User,
)
from services.generation.fta_generator import FTAGenerator
from core.auth import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic 请求模型
# ---------------------------------------------------------------------------

class DocWeight(BaseModel):
    document_id: int
    weight: float = 1.0


class MultiDocTopEvent(BaseModel):
    name: str
    description: Optional[str] = None
    device_type: Optional[str] = None


class MultiDocGenerationConfig(BaseModel):
    max_depth: int = 5
    min_confidence: float = 0.7
    calculate_probability: bool = True
    enable_synonym_normalization: bool = True
    enable_conflict_detection: bool = True


class MultiDocGenerateRequest(BaseModel):
    project_id: Optional[int] = None
    top_event: MultiDocTopEvent
    document_ids: List[int]
    document_weights: Optional[List[DocWeight]] = None
    generation_config: MultiDocGenerationConfig = MultiDocGenerationConfig()
    template_id: Optional[int] = None


class DocumentMetadataUpdate(BaseModel):
    tags: Optional[List[str]] = None
    device_model: Optional[str] = None
    source_level: Optional[str] = None
    trust_level: Optional[float] = None


class TemplateCreate(BaseModel):
    name: str
    project_id: Optional[int] = None
    device_type: Optional[str] = None
    description: Optional[str] = None
    document_ids: List[int]
    document_weights: Optional[Dict[str, float]] = None
    filters: Optional[Dict[str, Any]] = None
    generation_config: Optional[Dict[str, Any]] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[str] = None
    description: Optional[str] = None
    document_ids: Optional[List[int]] = None
    document_weights: Optional[Dict[str, float]] = None
    filters: Optional[Dict[str, Any]] = None
    generation_config: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# 1) 文档元数据更新
# ---------------------------------------------------------------------------

@router.patch("/documents/{doc_id}/metadata")
async def update_document_metadata(
    doc_id: int,
    data: DocumentMetadataUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新文档的多文档联合建树元数据"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    if data.tags is not None:
        doc.tags = data.tags
    if data.device_model is not None:
        doc.device_model = data.device_model
    if data.source_level is not None:
        doc.source_level = data.source_level
    if data.trust_level is not None:
        doc.trust_level = max(0.0, min(1.0, data.trust_level))
    await db.commit()
    await db.refresh(doc)
    return {
        "id": doc.id,
        "filename": doc.filename,
        "tags": doc.tags,
        "device_model": doc.device_model,
        "source_level": doc.source_level,
        "trust_level": doc.trust_level,
    }


# ---------------------------------------------------------------------------
# 2) 术语归一 + 实体去重
# ---------------------------------------------------------------------------

async def normalize_synonyms(
    db: AsyncSession,
    project_id: Optional[int],
    document_ids: List[int],
) -> Dict[str, Any]:
    """
    跨文档同义术语归一和实体去重。
    返回: { "synonym_groups": [...], "dedup_map": {...}, "normalized_entities": [...] }
    """
    # 获取选定文档关联的实体
    query = select(KnowledgeEntity).where(
        KnowledgeEntity.source_document_id.in_(document_ids)
    )
    if project_id:
        query = query.where(KnowledgeEntity.project_id == project_id)
    result = await db.execute(query)
    entities = result.scalars().all()

    if not entities:
        return {"synonym_groups": [], "dedup_map": {}, "normalized_entities": []}

    # 简单的名称归一化: 去空格/小写/去标点
    import re

    def normalize_name(name: str) -> str:
        n = name.strip().lower()
        n = re.sub(r'[（）()\-_\s]+', '', n)
        return n

    # 按归一化名称分组
    groups: Dict[str, List] = defaultdict(list)
    for e in entities:
        key = normalize_name(e.name)
        groups[key].append({
            "id": e.id,
            "name": e.name,
            "entity_type": e.entity_type,
            "description": e.description or "",
            "device_type": e.device_type or "",
            "confidence": e.confidence or 0,
            "source_document_id": e.source_document_id,
        })

    synonym_groups = []
    dedup_map = {}  # old_entity_id -> canonical_entity_id
    normalized_entities = []

    for key, members in groups.items():
        if len(members) > 1:
            # 选置信度最高的为正则实体
            canonical = max(members, key=lambda m: m["confidence"])
            synonym_groups.append({
                "canonical": canonical["name"],
                "canonical_id": canonical["id"],
                "synonyms": [m["name"] for m in members if m["id"] != canonical["id"]],
                "synonym_ids": [m["id"] for m in members if m["id"] != canonical["id"]],
                "member_count": len(members),
            })
            for m in members:
                dedup_map[m["id"]] = canonical["id"]
            normalized_entities.append(canonical)
        else:
            m = members[0]
            dedup_map[m["id"]] = m["id"]
            normalized_entities.append(m)

    return {
        "synonym_groups": [g for g in synonym_groups if len(g["synonyms"]) > 0],
        "dedup_map": dedup_map,
        "normalized_entities": normalized_entities,
    }


# ---------------------------------------------------------------------------
# 3) 冲突知识检测
# ---------------------------------------------------------------------------

async def detect_conflicts(
    db: AsyncSession,
    project_id: Optional[int],
    document_ids: List[int],
) -> List[Dict[str, Any]]:
    """
    检测多文档间的冲突知识:
    - 同名实体在不同文档中类型不同
    - 同一对实体在不同文档中关系类型/逻辑门不一致
    """
    import re

    def normalize_name(name: str) -> str:
        n = name.strip().lower()
        n = re.sub(r'[（）()\-_\s]+', '', n)
        return n

    # 获取选定文档的实体
    ent_query = select(KnowledgeEntity).where(
        KnowledgeEntity.source_document_id.in_(document_ids)
    )
    if project_id:
        ent_query = ent_query.where(KnowledgeEntity.project_id == project_id)
    result = await db.execute(ent_query)
    entities = result.scalars().all()

    ent_ids = {e.id for e in entities}

    # 获取关系
    rel_query = select(KnowledgeRelation).where(
        KnowledgeRelation.source_document_id.in_(document_ids)
    )
    if project_id:
        rel_query = rel_query.where(KnowledgeRelation.project_id == project_id)
    result = await db.execute(rel_query)
    relations = result.scalars().all()

    ent_map = {e.id: e for e in entities}
    conflicts = []

    # 冲突1: 同名实体在不同文档中类型不同
    name_groups: Dict[str, List] = defaultdict(list)
    for e in entities:
        name_groups[normalize_name(e.name)].append(e)

    for name_key, group in name_groups.items():
        if len(group) < 2:
            continue
        types_by_doc = {}
        for e in group:
            doc_id = e.source_document_id
            if doc_id:
                types_by_doc.setdefault(doc_id, set()).add(e.entity_type)
        all_types = set()
        for ts in types_by_doc.values():
            all_types |= ts
        if len(all_types) > 1:
            conflicts.append({
                "type": "entity_type_mismatch",
                "entity_name": group[0].name,
                "details": {
                    doc_id: list(ts) for doc_id, ts in types_by_doc.items()
                },
                "severity": "warning",
                "message": f"实体「{group[0].name}」在不同文档中类型不一致: {', '.join(all_types)}",
            })

    # 冲突2: 同一对实体在不同文档中关系不一致
    pair_groups: Dict[str, List] = defaultdict(list)
    for r in relations:
        src = ent_map.get(r.source_entity_id)
        tgt = ent_map.get(r.target_entity_id)
        if not src or not tgt:
            continue
        pair_key = f"{normalize_name(src.name)}||{normalize_name(tgt.name)}"
        pair_groups[pair_key].append(r)

    for pair_key, rels in pair_groups.items():
        if len(rels) < 2:
            continue
        rel_types = set(r.relation_type for r in rels)
        gate_types = set(r.logic_gate for r in rels if r.logic_gate)
        if len(rel_types) > 1 or len(gate_types) > 1:
            src_name = rels[0].source_entity.name if hasattr(rels[0], 'source_entity') and rels[0].source_entity else pair_key.split("||")[0]
            tgt_name = rels[0].target_entity.name if hasattr(rels[0], 'target_entity') and rels[0].target_entity else pair_key.split("||")[1]
            conflict_info = {
                "type": "relation_inconsistency",
                "entity_pair": pair_key,
                "severity": "warning",
            }
            msgs = []
            if len(rel_types) > 1:
                msgs.append(f"关系类型不一致: {', '.join(rel_types)}")
            if len(gate_types) > 1:
                msgs.append(f"逻辑门不一致: {', '.join(gate_types)}")
            conflict_info["message"] = f"「{src_name}」→「{tgt_name}」: {'; '.join(msgs)}"
            conflict_info["details"] = {
                "relation_types": list(rel_types),
                "logic_gates": list(gate_types),
                "document_ids": list(set(r.source_document_id for r in rels if r.source_document_id)),
            }
            conflicts.append(conflict_info)

    return conflicts


# ---------------------------------------------------------------------------
# 4) 加权 RAG 检索
# ---------------------------------------------------------------------------

async def weighted_rag_retrieval(
    db: AsyncSession,
    query: str,
    document_ids: List[int],
    weight_map: Dict[int, float],
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """带文档权重的 RAG 检索 — 高权文档的片段得分会被提升"""
    from services.rag.rag_service import TFIDFRetriever

    stmt = select(DocumentChunk).where(DocumentChunk.document_id.in_(document_ids))
    result = await db.execute(stmt)
    all_chunks = result.scalars().all()

    if not all_chunks:
        return []

    retriever = TFIDFRetriever()
    retriever.build_index(
        chunk_ids=[c.id for c in all_chunks],
        texts=[c.content for c in all_chunks],
    )

    hits = retriever.search(query, top_k=top_k * 2)
    chunk_map = {c.id: c for c in all_chunks}

    weighted_results = []
    for cid, score in hits:
        c = chunk_map[cid]
        doc_weight = weight_map.get(c.document_id, 1.0)
        weighted_score = score * doc_weight
        weighted_results.append({
            "chunk_id": c.id,
            "document_id": c.document_id,
            "content": c.content,
            "raw_score": round(score, 4),
            "doc_weight": doc_weight,
            "weighted_score": round(weighted_score, 4),
        })

    weighted_results.sort(key=lambda x: x["weighted_score"], reverse=True)
    return weighted_results[:top_k]


# ---------------------------------------------------------------------------
# 5) 加权知识图谱子图检索
# ---------------------------------------------------------------------------

async def weighted_knowledge_subgraph(
    db: AsyncSession,
    query: str,
    project_id: Optional[int],
    document_ids: List[int],
    weight_map: Dict[int, float],
    max_entities: int = 30,
) -> Dict[str, Any]:
    """带文档权重的知识图谱子图检索"""
    from sqlalchemy import or_

    keywords = [w.strip() for w in query.replace(",", " ").replace("，", " ").split() if w.strip()]
    if not keywords:
        keywords = [query]

    conditions = []
    for kw in keywords:
        conditions.append(and_(
            KnowledgeEntity.name.contains(kw),
            KnowledgeEntity.source_document_id.in_(document_ids),
        ))
        conditions.append(and_(
            KnowledgeEntity.description.contains(kw),
            KnowledgeEntity.source_document_id.in_(document_ids),
        ))

    if not conditions:
        return {"entities": [], "relations": []}

    stmt = select(KnowledgeEntity).where(or_(*conditions)).limit(max_entities * 2)
    result = await db.execute(stmt)
    entities = result.scalars().all()

    if not entities:
        return {"entities": [], "relations": []}

    # 按加权置信度排序截取
    def weighted_conf(e):
        w = weight_map.get(e.source_document_id, 1.0) if e.source_document_id else 1.0
        return (e.confidence or 0) * w

    entities = sorted(entities, key=weighted_conf, reverse=True)[:max_entities]
    entity_ids = {e.id for e in entities}

    stmt_rel = select(KnowledgeRelation).where(
        or_(
            KnowledgeRelation.source_entity_id.in_(entity_ids),
            KnowledgeRelation.target_entity_id.in_(entity_ids),
        )
    )
    result_rel = await db.execute(stmt_rel)
    relations = result_rel.scalars().all()

    extra_ids = set()
    for r in relations:
        extra_ids.add(r.source_entity_id)
        extra_ids.add(r.target_entity_id)
    missing = extra_ids - entity_ids
    if missing:
        stmt_extra = select(KnowledgeEntity).where(KnowledgeEntity.id.in_(missing))
        res_extra = await db.execute(stmt_extra)
        entities += list(res_extra.scalars().all())
        entity_ids |= missing

    return {
        "entities": [
            {
                "id": e.id,
                "name": e.name,
                "type": e.entity_type,
                "description": e.description or "",
                "device_type": e.device_type or "",
                "confidence": e.confidence,
                "source_document_id": e.source_document_id,
            }
            for e in entities
        ],
        "relations": [
            {
                "id": r.id,
                "source_id": r.source_entity_id,
                "target_id": r.target_entity_id,
                "source_name": next((e.name for e in entities if e.id == r.source_entity_id), ""),
                "target_name": next((e.name for e in entities if e.id == r.target_entity_id), ""),
                "type": r.relation_type,
                "logic_gate": r.logic_gate,
                "confidence": r.confidence,
                "evidence": r.evidence or "",
                "source_document_id": r.source_document_id,
            }
            for r in relations
        ],
    }


# ---------------------------------------------------------------------------
# 6) 文档贡献度计算
# ---------------------------------------------------------------------------

def compute_doc_contributions(
    rag_chunks: List[Dict[str, Any]],
    kg_context: Dict[str, Any],
    document_ids: List[int],
    doc_map: Dict[int, Any],
) -> List[Dict[str, Any]]:
    """计算各文档对建树的贡献度"""
    contrib: Dict[int, Dict[str, Any]] = {}
    for did in document_ids:
        doc = doc_map.get(did)
        contrib[did] = {
            "document_id": did,
            "filename": doc.filename if doc else f"文档{did}",
            "rag_chunk_count": 0,
            "rag_score_sum": 0.0,
            "kg_entity_count": 0,
            "kg_relation_count": 0,
            "contribution_score": 0.0,
        }

    # RAG 贡献
    for chunk in rag_chunks:
        did = chunk.get("document_id")
        if did in contrib:
            contrib[did]["rag_chunk_count"] += 1
            contrib[did]["rag_score_sum"] += chunk.get("weighted_score", chunk.get("score", 0))

    # 知识图谱贡献
    for ent in kg_context.get("entities", []):
        did = ent.get("source_document_id")
        if did and did in contrib:
            contrib[did]["kg_entity_count"] += 1
    for rel in kg_context.get("relations", []):
        did = rel.get("source_document_id")
        if did and did in contrib:
            contrib[did]["kg_relation_count"] += 1

    # 计算综合贡献分
    total_rag = sum(c["rag_score_sum"] for c in contrib.values()) or 1
    total_kg = sum(c["kg_entity_count"] + c["kg_relation_count"] for c in contrib.values()) or 1
    for c in contrib.values():
        rag_ratio = c["rag_score_sum"] / total_rag
        kg_ratio = (c["kg_entity_count"] + c["kg_relation_count"]) / total_kg
        c["contribution_score"] = round(0.5 * rag_ratio + 0.5 * kg_ratio, 4)

    result = sorted(contrib.values(), key=lambda x: x["contribution_score"], reverse=True)
    return result


# ---------------------------------------------------------------------------
# 7) 多文档联合生成主接口
# ---------------------------------------------------------------------------

@router.post("/generate")
async def multi_doc_generate(
    request: MultiDocGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """多文档联合建树 — 选文档、归一化、冲突检测、加权生成"""
    from services.rag.rag_service import retrieve_similar_fault_trees

    if not request.document_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个文档")

    # 验证文档存在
    doc_result = await db.execute(
        select(Document).where(Document.id.in_(request.document_ids))
    )
    docs = doc_result.scalars().all()
    if len(docs) != len(request.document_ids):
        raise HTTPException(status_code=400, detail="部分文档不存在")

    doc_map = {d.id: d for d in docs}

    # 构建权重映射
    weight_map: Dict[int, float] = {}
    if request.document_weights:
        for dw in request.document_weights:
            weight_map[dw.document_id] = dw.weight
    # 未指定权重的按 trust_level 自动设定
    for d in docs:
        if d.id not in weight_map:
            weight_map[d.id] = d.trust_level or 0.8

    try:
        query_text = f"{request.top_event.name} {request.top_event.description or ''} {request.top_event.device_type or ''}"

        # A) 术语归一
        synonym_info = None
        if request.generation_config.enable_synonym_normalization:
            synonym_info = await normalize_synonyms(db, request.project_id, request.document_ids)

        # B) 冲突检测
        conflicts = []
        if request.generation_config.enable_conflict_detection:
            conflicts = await detect_conflicts(db, request.project_id, request.document_ids)

        # C) 加权知识图谱检索
        knowledge_context = await weighted_knowledge_subgraph(
            db, query_text, request.project_id, request.document_ids, weight_map,
        )

        # D) 加权 RAG 检索
        rag_chunks = await weighted_rag_retrieval(
            db, query_text, request.document_ids, weight_map, top_k=10,
        )

        # E) 检索相似故障树
        similar_trees = await retrieve_similar_fault_trees(db, query_text, request.project_id, top_k=3)

        # F) 增强 prompt 中加入冲突和归一信息
        extra_context_parts = []
        if synonym_info and synonym_info["synonym_groups"]:
            syn_lines = []
            for g in synonym_info["synonym_groups"][:10]:
                syn_lines.append(f"  - 正则名「{g['canonical']}」≡ {', '.join(g['synonyms'])}")
            extra_context_parts.append(
                "【术语归一】以下同义术语已合并，请使用正则名称:\n" + "\n".join(syn_lines)
            )
        if conflicts:
            conflict_lines = [f"  - {c['message']}" for c in conflicts[:10]]
            extra_context_parts.append(
                "【冲突提示】以下知识在不同文档间存在不一致，请综合判断:\n" + "\n".join(conflict_lines)
            )

        # 文档来源说明
        doc_desc_lines = []
        for d in docs:
            w = weight_map.get(d.id, 1.0)
            tags = ", ".join(d.tags) if d.tags else ""
            doc_desc_lines.append(
                f"  - [{d.filename}] 权重={w:.1f} 来源={d.source_level or 'internal'}"
                + (f" 标签={tags}" if tags else "")
            )
        extra_context_parts.append(
            f"【本次建树引用 {len(docs)} 份文档】\n" + "\n".join(doc_desc_lines)
        )

        # G) 生成故障树
        generator = FTAGenerator()
        # 在 rag_chunks 中注入 extra context
        rag_for_gen = [{"content": c["content"], "score": c["weighted_score"]} for c in rag_chunks]
        if extra_context_parts:
            rag_for_gen.insert(0, {"content": "\n\n".join(extra_context_parts), "score": 1.0})

        result = await generator.generate(
            top_event=request.top_event.model_dump(),
            config=request.generation_config.model_dump(),
            knowledge_context=knowledge_context,
            rag_chunks=rag_for_gen,
            similar_trees=similar_trees,
        )

        # H) 计算贡献度
        contributions = compute_doc_contributions(rag_chunks, knowledge_context, request.document_ids, doc_map)

        doc_composition = {
            "documents": [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "tags": d.tags,
                    "device_model": d.device_model,
                    "source_level": d.source_level,
                    "trust_level": d.trust_level,
                    "weight": weight_map.get(d.id, 1.0),
                }
                for d in docs
            ],
            "contributions": contributions,
            "conflicts": conflicts,
            "synonym_groups": (synonym_info or {}).get("synonym_groups", []),
        }

        # 保存到数据库
        tree = FaultTree(
            name=request.top_event.name,
            project_id=request.project_id,
            top_event=request.top_event.name,
            structure=result.get("structure", {"nodes": [], "links": []}),
            quality_score=result.get("quality_metrics", {}).get("structure_accuracy"),
            status="generated",
            created_by=user.id,
            doc_composition=doc_composition,
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
            "doc_composition": doc_composition,
            "augmentation_info": {
                "kg_entities_used": len(knowledge_context.get("entities", [])),
                "kg_relations_used": len(knowledge_context.get("relations", [])),
                "rag_chunks_used": len(rag_chunks),
                "similar_trees_used": len(similar_trees),
                "documents_used": len(docs),
                "synonym_groups": len((synonym_info or {}).get("synonym_groups", [])),
                "conflicts_detected": len(conflicts),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"多文档联合生成失败: {str(e)}")


# ---------------------------------------------------------------------------
# 8) 获取已有树的文档构成
# ---------------------------------------------------------------------------

@router.get("/tree/{tree_id}/composition")
async def get_tree_composition(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取故障树的文档构成与贡献度"""
    result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")
    return tree.doc_composition or {"documents": [], "contributions": [], "conflicts": []}


# ---------------------------------------------------------------------------
# 9) 建树模板 CRUD
# ---------------------------------------------------------------------------

@router.get("/templates")
async def list_templates(
    project_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取建树模板列表"""
    query = select(BuildTemplate)
    if project_id:
        query = query.where(BuildTemplate.project_id == project_id)
    query = query.order_by(BuildTemplate.updated_at.desc())
    result = await db.execute(query)
    templates = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "device_type": t.device_type,
            "description": t.description,
            "document_ids": t.document_ids,
            "document_weights": t.document_weights,
            "filters": t.filters,
            "generation_config": t.generation_config,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in templates
    ]


@router.post("/templates")
async def create_template(
    data: TemplateCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建建树模板"""
    template = BuildTemplate(
        name=data.name,
        project_id=data.project_id,
        device_type=data.device_type,
        description=data.description,
        document_ids=data.document_ids,
        document_weights=data.document_weights,
        filters=data.filters,
        generation_config=data.generation_config,
        created_by=user.id,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return {"id": template.id, "name": template.name, "message": "模板创建成功"}


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新建树模板"""
    result = await db.execute(select(BuildTemplate).where(BuildTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    for field in ["name", "device_type", "description", "document_ids", "document_weights", "filters", "generation_config"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(template, field, val)
    await db.commit()
    return {"id": template.id, "message": "模板更新成功"}


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除建树模板"""
    result = await db.execute(select(BuildTemplate).where(BuildTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    await db.delete(template)
    await db.commit()
    return {"message": "模板删除成功"}


# ---------------------------------------------------------------------------
# 10) 预检查接口 — 前端配置时调用
# ---------------------------------------------------------------------------

@router.post("/precheck")
async def precheck_multi_doc(
    request: MultiDocGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    预检查: 在正式生成前，返回术语归一结果和冲突检测结果，
    让用户确认后再正式生成。
    """
    if not request.document_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个文档")

    doc_result = await db.execute(
        select(Document).where(Document.id.in_(request.document_ids))
    )
    docs = doc_result.scalars().all()

    synonym_info = await normalize_synonyms(db, request.project_id, request.document_ids)
    conflicts = await detect_conflicts(db, request.project_id, request.document_ids)

    return {
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "tags": d.tags,
                "device_model": d.device_model,
                "source_level": d.source_level,
                "trust_level": d.trust_level,
            }
            for d in docs
        ],
        "synonym_groups": synonym_info.get("synonym_groups", []),
        "normalized_entity_count": len(synonym_info.get("normalized_entities", [])),
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
    }
