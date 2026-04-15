"""
项目管理API路由 - 真正的CRUD实现（带用户鉴权与协作过滤）
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, update as sa_update, func as sa_func, or_
from typing import Optional
from pydantic import BaseModel

from models.database import get_db
from models.models import (
    Project, FaultTree, FaultTreeVersion, User, ProjectCollaboration,
    Document, DocumentChunk, ExtractionRecord, KnowledgeEntity, KnowledgeRelation,
    BuildTemplate, ExpertRule, GoldTree, EvalRun,
)
from core.auth import get_current_user

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    device_type: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    device_type: Optional[str] = None
    status: Optional[str] = None


@router.get("/")
async def get_projects(
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目列表 - 管理员看全部，普通用户看自己的+协作的"""
    if user.role == "admin":
        query = select(Project).order_by(Project.created_at.desc()).offset(skip).limit(limit)
    else:
        # 子查询：用户参与协作的项目ID
        collab_project_ids = (
            select(ProjectCollaboration.project_id)
            .where(ProjectCollaboration.user_id == user.id)
            .scalar_subquery()
        )
        query = (
            select(Project)
            .where(
                or_(
                    Project.owner_id == user.id,
                    Project.owner_id.is_(None),   # 旧项目兼容
                    Project.id.in_(collab_project_ids),
                )
            )
            .order_by(Project.created_at.desc())
            .offset(skip)
            .limit(limit)
        )

    result = await db.execute(query)
    projects = result.scalars().all()

    project_list = []
    for p in projects:
        tree_count_result = await db.execute(
            select(sa_func.count()).where(FaultTree.project_id == p.id)
        )
        tree_count = tree_count_result.scalar() or 0

        # 查询 owner 用户名
        owner_name = None
        if p.owner_id:
            owner_result = await db.execute(select(User.username).where(User.id == p.owner_id))
            owner_name = owner_result.scalar_one_or_none()

        project_list.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "device_type": p.device_type,
            "tree_count": tree_count,
            "status": p.status,
            "owner_id": p.owner_id,
            "owner_name": owner_name,
            "collab_enabled": p.collab_enabled or False,
            "collab_code": p.collab_code if (p.owner_id == user.id or user.role == "admin") else None,
            "is_owner": p.owner_id == user.id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    total_result = await db.execute(select(sa_func.count()).select_from(Project))
    total = total_result.scalar() or 0

    return {"projects": project_list, "total": total}


@router.post("/")
async def create_project(
    project: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建项目"""
    db_project = Project(
        name=project.name,
        description=project.description,
        device_type=project.device_type,
        owner_id=user.id,
    )
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)

    return {
        "id": db_project.id,
        "name": db_project.name,
        "message": "创建成功",
    }


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目详情"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    trees_result = await db.execute(
        select(FaultTree).where(FaultTree.project_id == project_id)
    )
    trees = trees_result.scalars().all()

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "device_type": project.device_type,
        "status": project.status,
        "owner_id": project.owner_id,
        "collab_enabled": project.collab_enabled or False,
        "collab_code": project.collab_code if (project.owner_id == user.id or user.role == "admin") else None,
        "fault_trees": [
            {
                "id": t.id,
                "name": t.name,
                "top_event": t.top_event,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in trees
        ],
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    project: ProjectUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新项目"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    db_project = result.scalar_one_or_none()
    if not db_project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if db_project.owner_id and db_project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限修改此项目")

    update_data = project.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)

    await db.commit()
    return {"id": project_id, "message": "更新成功"}


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除项目"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    db_project = result.scalar_one_or_none()
    if not db_project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if db_project.owner_id and db_project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限删除此项目")

    try:
        # 将已加载的 ORM 对象踢出 session，避免 cascade 冲突
        await db.refresh(db_project)
        db.expunge(db_project)

        # 收集将被删除的子表 ID
        tree_ids_q = select(FaultTree.id).where(FaultTree.project_id == project_id)
        gold_ids_q = select(GoldTree.id).where(GoldTree.project_id == project_id)
        doc_ids_q = select(Document.id).where(Document.project_id == project_id)

        # 1) EvalRun: 删除本项目的 + 断开其他项目对本项目树的引用
        await db.execute(sa_delete(EvalRun).where(EvalRun.project_id == project_id))
        await db.execute(sa_delete(EvalRun).where(EvalRun.gold_tree_id.in_(gold_ids_q)))
        await db.execute(sa_update(EvalRun).where(EvalRun.generated_tree_id.in_(tree_ids_q)).values(generated_tree_id=None))

        # 2) GoldTree, ExpertRule, BuildTemplate
        await db.execute(sa_delete(GoldTree).where(GoldTree.project_id == project_id))
        await db.execute(sa_delete(ExpertRule).where(ExpertRule.project_id == project_id))
        await db.execute(sa_delete(BuildTemplate).where(BuildTemplate.project_id == project_id))

        # 3) Knowledge
        await db.execute(sa_delete(KnowledgeRelation).where(KnowledgeRelation.project_id == project_id))
        await db.execute(sa_delete(KnowledgeEntity).where(KnowledgeEntity.project_id == project_id))

        # 4) DocumentChunk, ExtractionRecord
        await db.execute(sa_delete(DocumentChunk).where(DocumentChunk.project_id == project_id))
        await db.execute(sa_delete(ExtractionRecord).where(ExtractionRecord.document_id.in_(doc_ids_q)))

        # 5) FaultTreeVersion → FaultTree, Document
        await db.execute(sa_delete(FaultTreeVersion).where(FaultTreeVersion.fault_tree_id.in_(tree_ids_q)))
        await db.execute(sa_delete(FaultTree).where(FaultTree.project_id == project_id))
        await db.execute(sa_delete(Document).where(Document.project_id == project_id))

        # 6) ProjectCollaboration → Project
        await db.execute(sa_delete(ProjectCollaboration).where(ProjectCollaboration.project_id == project_id))

        # 最后删除项目本体（用 SQL 而非 ORM 的 db.delete 避免 cascade 冲突）
        await db.execute(sa_delete(Project).where(Project.id == project_id))
        await db.commit()
        return {"message": "删除成功"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")
