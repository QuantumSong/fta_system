"""
知识图谱API路由 - 实体/关系 CRUD + 图谱可视化 + 子图检索
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from typing import Optional, List
from pydantic import BaseModel

from models.database import get_db
from models.models import KnowledgeEntity, KnowledgeRelation, User
from core.auth import get_current_user

router = APIRouter()


class EntityCreate(BaseModel):
    name: str
    entity_type: str
    description: Optional[str] = None
    device_type: Optional[str] = None
    confidence: float = 1.0
    project_id: Optional[int] = None


class RelationCreate(BaseModel):
    source_entity_id: int
    target_entity_id: int
    relation_type: str
    logic_gate: Optional[str] = None
    confidence: float = 1.0
    project_id: Optional[int] = None


@router.get("/entities/search")
async def search_entities(
    q: str = "*",
    entity_type: Optional[str] = None,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """搜索实体"""
    query = select(KnowledgeEntity)

    if q and q != "*":
        query = query.where(
            or_(
                KnowledgeEntity.name.contains(q),
                KnowledgeEntity.description.contains(q),
            )
        )

    if entity_type:
        query = query.where(KnowledgeEntity.entity_type == entity_type)

    query = query.limit(limit)
    result = await db.execute(query)
    entities = result.scalars().all()

    return {
        "entities": [
            {
                "id": e.id,
                "name": e.name,
                "type": e.entity_type,
                "description": e.description,
                "device_type": e.device_type,
                "confidence": e.confidence,
            }
            for e in entities
        ],
        "total": len(entities),
    }


@router.get("/entities/{entity_id}")
async def get_entity(
    entity_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取实体详情"""
    result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.id == entity_id)
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")

    # 获取关联关系
    rels_result = await db.execute(
        select(KnowledgeRelation).where(
            or_(
                KnowledgeRelation.source_entity_id == entity_id,
                KnowledgeRelation.target_entity_id == entity_id,
            )
        )
    )
    relations = rels_result.scalars().all()

    return {
        "id": entity.id,
        "name": entity.name,
        "type": entity.entity_type,
        "description": entity.description,
        "device_type": entity.device_type,
        "confidence": entity.confidence,
        "relations": [
            {
                "id": r.id,
                "source_entity_id": r.source_entity_id,
                "target_entity_id": r.target_entity_id,
                "type": r.relation_type,
                "confidence": r.confidence,
            }
            for r in relations
        ]
    }


@router.get("/entities/{entity_id}/relations")
async def get_entity_relations(
    entity_id: int,
    relation_type: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取实体关系"""
    query = select(KnowledgeRelation).where(
        or_(
            KnowledgeRelation.source_entity_id == entity_id,
            KnowledgeRelation.target_entity_id == entity_id,
        )
    )
    if relation_type:
        query = query.where(KnowledgeRelation.relation_type == relation_type)

    result = await db.execute(query)
    relations = result.scalars().all()

    return {
        "relations": [
            {
                "id": r.id,
                "source_entity_id": r.source_entity_id,
                "target_entity_id": r.target_entity_id,
                "type": r.relation_type,
                "confidence": r.confidence,
            }
            for r in relations
        ]
    }


@router.post("/entities")
async def create_entity(
    entity: EntityCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建实体"""
    db_entity = KnowledgeEntity(
        name=entity.name,
        entity_type=entity.entity_type,
        description=entity.description,
        device_type=entity.device_type,
        confidence=entity.confidence,
        project_id=entity.project_id,
    )
    db.add(db_entity)
    await db.commit()
    await db.refresh(db_entity)

    return {"id": db_entity.id, "message": "创建成功"}


@router.post("/relations")
async def create_relation(
    relation: RelationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建关系"""
    db_relation = KnowledgeRelation(
        source_entity_id=relation.source_entity_id,
        target_entity_id=relation.target_entity_id,
        relation_type=relation.relation_type,
        confidence=relation.confidence,
        project_id=relation.project_id,
    )
    db.add(db_relation)
    await db.commit()
    await db.refresh(db_relation)

    return {"id": db_relation.id, "message": "创建成功"}


@router.delete("/entities/{entity_id}")
async def delete_entity(
    entity_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除实体"""
    result = await db.execute(
        select(KnowledgeEntity).where(KnowledgeEntity.id == entity_id)
    )
    entity = result.scalar_one_or_none()
    if not entity:
        raise HTTPException(status_code=404, detail="实体不存在")

    # 删除关联关系
    rels_result = await db.execute(
        select(KnowledgeRelation).where(
            or_(
                KnowledgeRelation.source_entity_id == entity_id,
                KnowledgeRelation.target_entity_id == entity_id,
            )
        )
    )
    for rel in rels_result.scalars().all():
        await db.delete(rel)

    await db.delete(entity)
    await db.commit()
    return {"message": "删除成功"}


# ---------------------------------------------------------------------------
# 知识图谱可视化 & 子图检索
# ---------------------------------------------------------------------------

@router.get("/graph")
async def get_knowledge_graph(
    project_id: Optional[int] = None,
    limit: int = 200,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取完整知识图谱（用于可视化），返回 nodes + edges 格式"""
    stmt_ent = select(KnowledgeEntity)
    if project_id:
        stmt_ent = stmt_ent.where(KnowledgeEntity.project_id == project_id)
    stmt_ent = stmt_ent.limit(limit)
    result_ent = await db.execute(stmt_ent)
    entities = result_ent.scalars().all()

    entity_ids = {e.id for e in entities}

    stmt_rel = select(KnowledgeRelation)
    if project_id:
        stmt_rel = stmt_rel.where(KnowledgeRelation.project_id == project_id)
    result_rel = await db.execute(stmt_rel)
    relations = result_rel.scalars().all()

    # 过滤掉端点不在当前实体集合中的关系
    relations = [r for r in relations if r.source_entity_id in entity_ids and r.target_entity_id in entity_ids]

    # 统计
    type_counts = {}
    for e in entities:
        type_counts[e.entity_type] = type_counts.get(e.entity_type, 0) + 1

    return {
        "nodes": [
            {
                "id": e.id,
                "name": e.name,
                "type": e.entity_type,
                "description": e.description or "",
                "device_type": e.device_type or "",
                "confidence": e.confidence,
            }
            for e in entities
        ],
        "edges": [
            {
                "id": r.id,
                "source": r.source_entity_id,
                "target": r.target_entity_id,
                "type": r.relation_type,
                "logic_gate": r.logic_gate,
                "confidence": r.confidence,
                "evidence": r.evidence or "",
            }
            for r in relations
        ],
        "statistics": {
            "entity_count": len(entities),
            "relation_count": len(relations),
            "type_distribution": type_counts,
        },
    }


@router.get("/subgraph")
async def get_subgraph(
    query: str,
    project_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """根据查询文本检索知识子图（用于 FTA 生成增强）"""
    from services.rag.rag_service import retrieve_knowledge_subgraph
    subgraph = await retrieve_knowledge_subgraph(db, query, project_id)
    return subgraph


@router.get("/stats")
async def get_knowledge_stats(
    project_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取知识图谱统计信息"""
    ent_stmt = select(func.count(KnowledgeEntity.id))
    rel_stmt = select(func.count(KnowledgeRelation.id))
    if project_id:
        ent_stmt = ent_stmt.where(KnowledgeEntity.project_id == project_id)
        rel_stmt = rel_stmt.where(KnowledgeRelation.project_id == project_id)

    ent_count = (await db.execute(ent_stmt)).scalar() or 0
    rel_count = (await db.execute(rel_stmt)).scalar() or 0

    # 按类型统计
    type_result = await db.execute(
        select(KnowledgeEntity.entity_type, func.count(KnowledgeEntity.id))
        .where(KnowledgeEntity.project_id == project_id if project_id else True)
        .group_by(KnowledgeEntity.entity_type)
    )
    type_distribution = {row[0]: row[1] for row in type_result.all()}

    rel_type_result = await db.execute(
        select(KnowledgeRelation.relation_type, func.count(KnowledgeRelation.id))
        .where(KnowledgeRelation.project_id == project_id if project_id else True)
        .group_by(KnowledgeRelation.relation_type)
    )
    rel_type_distribution = {row[0]: row[1] for row in rel_type_result.all()}

    return {
        "entity_count": ent_count,
        "relation_count": rel_count,
        "entity_types": type_distribution,
        "relation_types": rel_type_distribution,
    }
