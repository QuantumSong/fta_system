"""
专家模式 API — 专家规则的增删改查
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from models.models import ExpertRule, User
from core.auth import get_current_user

router = APIRouter()


# ---- Request Models ----

class ExpertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rule_type: str = "ignore"           # ignore / guidance / custom_check
    scope: str = "global"               # global / project
    project_id: Optional[int] = None
    target_rule_id: Optional[str] = None
    target_node_pattern: Optional[str] = None
    content: Optional[str] = None
    priority: int = 0
    enabled: bool = True


class ExpertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rule_type: Optional[str] = None
    scope: Optional[str] = None
    project_id: Optional[int] = None
    target_rule_id: Optional[str] = None
    target_node_pattern: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None


# ---- helpers ----

def _rule_to_dict(r: ExpertRule) -> dict:
    return {
        "id": r.id,
        "project_id": r.project_id,
        "name": r.name,
        "description": r.description,
        "rule_type": r.rule_type,
        "scope": r.scope,
        "target_rule_id": r.target_rule_id,
        "target_node_pattern": r.target_node_pattern,
        "content": r.content,
        "priority": r.priority,
        "enabled": r.enabled,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ---- 查询 ----

@router.get("/")
async def list_expert_rules(
    scope: Optional[str] = None,
    project_id: Optional[int] = None,
    rule_type: Optional[str] = None,
    enabled_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出专家规则（支持按 scope / project_id / rule_type 筛选）"""
    q = select(ExpertRule)
    if scope:
        q = q.where(ExpertRule.scope == scope)
    if project_id is not None:
        q = q.where(
            (ExpertRule.project_id == project_id) | (ExpertRule.scope == "global")
        )
    if rule_type:
        q = q.where(ExpertRule.rule_type == rule_type)
    if enabled_only:
        q = q.where(ExpertRule.enabled == True)

    # total
    count_q = select(sa_func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = q.order_by(ExpertRule.priority.desc(), ExpertRule.updated_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    rules = result.scalars().all()

    return {
        "rules": [_rule_to_dict(r) for r in rules],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{rule_id}")
async def get_expert_rule(
    rule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取单条专家规则详情"""
    result = await db.execute(select(ExpertRule).where(ExpertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "专家规则不存在")
    return _rule_to_dict(rule)


# ---- 创建 ----

@router.post("/")
async def create_expert_rule(
    data: ExpertRuleCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """新建专家规则"""
    rule = ExpertRule(
        name=data.name,
        description=data.description,
        rule_type=data.rule_type,
        scope=data.scope,
        project_id=data.project_id if data.scope == "project" else None,
        target_rule_id=data.target_rule_id,
        target_node_pattern=data.target_node_pattern,
        content=data.content,
        priority=data.priority,
        enabled=data.enabled,
        created_by=user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_to_dict(rule)


# ---- 更新 ----

@router.put("/{rule_id}")
async def update_expert_rule(
    rule_id: int,
    data: ExpertRuleUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新专家规则"""
    result = await db.execute(select(ExpertRule).where(ExpertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "专家规则不存在")

    for field in [
        "name", "description", "rule_type", "scope",
        "target_rule_id", "target_node_pattern", "content",
        "priority", "enabled", "project_id",
    ]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(rule, field, val)

    if data.scope == "global":
        rule.project_id = None

    await db.commit()
    await db.refresh(rule)
    return _rule_to_dict(rule)


# ---- 删除 ----

@router.delete("/{rule_id}")
async def delete_expert_rule(
    rule_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除专家规则"""
    result = await db.execute(select(ExpertRule).where(ExpertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "专家规则不存在")
    await db.delete(rule)
    await db.commit()
    return {"message": "删除成功", "id": rule_id}


# ---- 批量切换启停 ----

@router.post("/batch-toggle")
async def batch_toggle(
    data: Dict[str, Any],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """批量启用/禁用: {"ids": [1,2,3], "enabled": true}"""
    ids = data.get("ids", [])
    enabled = data.get("enabled", True)
    if not ids:
        raise HTTPException(400, "ids 不能为空")
    result = await db.execute(select(ExpertRule).where(ExpertRule.id.in_(ids)))
    rules = result.scalars().all()
    for r in rules:
        r.enabled = enabled
    await db.commit()
    return {"message": f"已{'启用' if enabled else '禁用'} {len(rules)} 条规则"}


# ---- 获取专家忽略列表（给校验器用） ----

@router.get("/ignored-set/{project_id}")
async def get_ignored_set(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取某项目生效的忽略集合（含全局 + 项目级别 ignore 规则的 target_rule_id）"""
    q = select(ExpertRule).where(
        ExpertRule.enabled == True,
        ExpertRule.rule_type == "ignore",
        (ExpertRule.scope == "global") | (ExpertRule.project_id == project_id),
    )
    result = await db.execute(q)
    rules = result.scalars().all()
    ignored = set()
    for r in rules:
        if r.target_rule_id:
            if r.target_node_pattern:
                ignored.add(f"{r.target_rule_id}::{r.target_node_pattern}")
            else:
                ignored.add(r.target_rule_id)
    return {"ignored_issues": list(ignored), "count": len(ignored)}
