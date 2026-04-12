"""
认证API路由 - 注册、登录、用户信息
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from models.database import get_db
from models.models import User
from core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
)

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str


@router.post("/register")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """用户注册"""
    # 检查用户名
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    # 检查邮箱
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # 密码长度检查
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少6位")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role="user",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id})
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username, "email": user.email, "role": user.role},
        "message": "注册成功",
    }


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token({"sub": user.id})
    return {
        "token": token,
        "user": {"id": user.id, "username": user.username, "email": user.email, "role": user.role},
    }


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/users")
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员 - 获取所有用户列表"""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ]
    }


@router.post("/init-admin")
async def init_admin(db: AsyncSession = Depends(get_db)):
    """初始化管理员账号（仅在无管理员时可用）"""
    result = await db.execute(select(User).where(User.role == "admin"))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="管理员已存在")

    admin = User(
        username="admin",
        email="admin@fta.local",
        password_hash=hash_password("admin123"),
        role="admin",
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    token = create_access_token({"sub": admin.id})
    return {
        "token": token,
        "user": {"id": admin.id, "username": admin.username, "email": admin.email, "role": admin.role},
        "message": "管理员账号初始化成功 (admin / admin123)",
    }
