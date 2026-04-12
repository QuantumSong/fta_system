"""
协同工作API路由 - 协作开启/关闭、加入协作、版本历史
"""
import random
import string
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import Optional

from models.database import get_db
from models.models import (
    Project, ProjectCollaboration, FaultTree, FaultTreeVersion, User
)
from core.auth import get_current_user

router = APIRouter()


def _generate_code(length: int = 6) -> str:
    """生成唯一六位协作密码（大写字母+数字）"""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


class JoinRequest(BaseModel):
    code: str


# ───────── 开启 / 关闭协作 ─────────

@router.post("/projects/{project_id}/collab/enable")
async def enable_collaboration(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """开启项目协作，生成六位协作密码"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id and project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="只有项目所有者可以开启协作")

    # 生成不重复的六位码
    for _ in range(20):
        code = _generate_code()
        dup = await db.execute(select(Project).where(Project.collab_code == code))
        if not dup.scalar_one_or_none():
            break
    else:
        raise HTTPException(status_code=500, detail="协作码生成失败，请重试")

    project.collab_enabled = True
    project.collab_code = code

    # 把所有者也加入协作成员（如果还没有）
    existing = await db.execute(
        select(ProjectCollaboration).where(
            and_(
                ProjectCollaboration.project_id == project_id,
                ProjectCollaboration.user_id == user.id,
            )
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ProjectCollaboration(
            project_id=project_id,
            user_id=user.id,
            role="owner",
        ))

    await db.commit()
    return {"collab_code": code, "message": "协作已开启"}


@router.post("/projects/{project_id}/collab/disable")
async def disable_collaboration(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """关闭项目协作"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id and project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="只有项目所有者可以关闭协作")

    project.collab_enabled = False
    project.collab_code = None
    await db.commit()
    return {"message": "协作已关闭"}


# ───────── 加入协作 ─────────

@router.post("/collab/join")
async def join_collaboration(
    data: JoinRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """通过六位协作密码加入项目"""
    code = data.code.strip().upper()
    result = await db.execute(
        select(Project).where(
            and_(Project.collab_code == code, Project.collab_enabled == True)
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="无效的协作密码或协作未开启")

    # 检查是否已加入
    existing = await db.execute(
        select(ProjectCollaboration).where(
            and_(
                ProjectCollaboration.project_id == project.id,
                ProjectCollaboration.user_id == user.id,
            )
        )
    )
    if existing.scalar_one_or_none():
        return {
            "project_id": project.id,
            "project_name": project.name,
            "message": "你已经是该项目的协作成员",
        }

    db.add(ProjectCollaboration(
        project_id=project.id,
        user_id=user.id,
        role="collaborator",
    ))
    await db.commit()
    return {
        "project_id": project.id,
        "project_name": project.name,
        "message": "加入协作成功",
    }


# ───────── 协作成员管理 ─────────

@router.get("/projects/{project_id}/collab/members")
async def get_collab_members(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目的协作成员列表"""
    result = await db.execute(
        select(ProjectCollaboration, User)
        .join(User, ProjectCollaboration.user_id == User.id)
        .where(ProjectCollaboration.project_id == project_id)
    )
    rows = result.all()
    return {
        "members": [
            {
                "id": collab.id,
                "user_id": u.id,
                "username": u.username,
                "role": collab.role,
                "joined_at": collab.joined_at.isoformat() if collab.joined_at else None,
            }
            for collab, u in rows
        ]
    }


@router.delete("/projects/{project_id}/collab/members/{user_id}")
async def remove_collab_member(
    project_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """移除协作成员"""
    # 只有项目所有者或管理员可以移除
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="无权限")

    result = await db.execute(
        select(ProjectCollaboration).where(
            and_(
                ProjectCollaboration.project_id == project_id,
                ProjectCollaboration.user_id == user_id,
            )
        )
    )
    collab = result.scalar_one_or_none()
    if not collab:
        raise HTTPException(status_code=404, detail="该成员不存在")

    await db.delete(collab)
    await db.commit()
    return {"message": "已移除"}


# ───────── 版本历史 ─────────

@router.get("/fault-trees/{tree_id}/versions")
async def get_tree_versions(
    tree_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取故障树的版本历史"""
    result = await db.execute(
        select(FaultTreeVersion, User)
        .outerjoin(User, FaultTreeVersion.changed_by == User.id)
        .where(FaultTreeVersion.fault_tree_id == tree_id)
        .order_by(FaultTreeVersion.created_at.desc())
    )
    rows = result.all()
    return {
        "versions": [
            {
                "id": v.id,
                "version": v.version,
                "changed_by": u.username if u else "未知",
                "change_summary": v.change_summary,
                "node_count": len(v.structure.get("nodes", [])) if v.structure else 0,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v, u in rows
        ]
    }


@router.get("/fault-trees/{tree_id}/versions/{version_id}")
async def get_tree_version_detail(
    tree_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取某个版本的故障树结构（用于回溯）"""
    result = await db.execute(
        select(FaultTreeVersion).where(
            and_(
                FaultTreeVersion.id == version_id,
                FaultTreeVersion.fault_tree_id == tree_id,
            )
        )
    )
    ver = result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {
        "id": ver.id,
        "version": ver.version,
        "structure": ver.structure,
        "change_summary": ver.change_summary,
        "created_at": ver.created_at.isoformat() if ver.created_at else None,
    }


@router.post("/fault-trees/{tree_id}/versions/{version_id}/restore")
async def restore_tree_version(
    tree_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """回溯到某个版本"""
    ver_result = await db.execute(
        select(FaultTreeVersion).where(
            and_(
                FaultTreeVersion.id == version_id,
                FaultTreeVersion.fault_tree_id == tree_id,
            )
        )
    )
    ver = ver_result.scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="版本不存在")

    tree_result = await db.execute(select(FaultTree).where(FaultTree.id == tree_id))
    tree = tree_result.scalar_one_or_none()
    if not tree:
        raise HTTPException(status_code=404, detail="故障树不存在")

    # 保存当前版本到历史
    db.add(FaultTreeVersion(
        fault_tree_id=tree.id,
        version=tree.version,
        structure=tree.structure,
        changed_by=user.id,
        change_summary=f"回溯前自动备份 (v{tree.version})",
    ))

    # 恢复
    tree.structure = ver.structure
    tree.version = (tree.version or 1) + 1

    await db.commit()
    return {"message": f"已恢复到版本 v{ver.version}", "new_version": tree.version}
