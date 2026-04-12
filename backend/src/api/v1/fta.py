"""
故障树API路由 - 真正的CRUD + AI生成（带用户鉴权与版本历史）
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from typing import Optional
from pydantic import BaseModel

from models.database import get_db
from models.models import FaultTree, FaultTreeVersion, User
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
