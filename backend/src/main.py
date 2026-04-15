"""
FTA智能生成系统 - 后端入口
直接运行: python src/main.py
"""
import os
import sys

# 添加src目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    print("=" * 50)
    print(f"  {settings.APP_NAME} v{settings.APP_VERSION}")
    print("=" * 50)

    # 检查DeepSeek配置
    if not settings.DEEPSEEK_API_KEY:
        print("\n  警告: DeepSeek API密钥未配置!")
        print("  请在 backend/.env 文件中设置 DEEPSEEK_API_KEY")
        print("  获取地址: https://platform.deepseek.com/\n")
    else:
        print(f"  DeepSeek API已配置 (模型: {settings.DEEPSEEK_MODEL})")

    # 初始化数据库
    try:
        from models.database import init_db
        await init_db()
    except Exception as e:
        print(f"  数据库初始化失败: {e}")

    # 确保上传目录存在
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    print(f"  数据库: SQLite ({settings.DB_PATH})")
    print("=" * 50)
    print(f"  API文档: http://{settings.HOST}:{settings.PORT}/docs")
    print(f"  健康检查: http://{settings.HOST}:{settings.PORT}/health")
    print("=" * 50)

    yield

    print("\n  应用关闭中...")


# 创建FastAPI应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="基于知识的工业设备故障树智能生成与辅助构建系统",
    lifespan=lifespan,
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
from api.v1 import documents, extraction, fta, validation, projects, knowledge, auth, collaboration, ws, multidoc, expert, benchmark, demo_seed

app.include_router(auth.router, prefix="/api/v1/auth", tags=["认证"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["文档管理"])
app.include_router(extraction.router, prefix="/api/v1/extraction", tags=["知识抽取"])
app.include_router(fta.router, prefix="/api/v1/fta", tags=["故障树"])
app.include_router(validation.router, prefix="/api/v1/validation", tags=["逻辑校验"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["项目管理"])
app.include_router(knowledge.router, prefix="/api/v1/knowledge", tags=["知识图谱"])
app.include_router(collaboration.router, prefix="/api/v1", tags=["协同工作"])
app.include_router(ws.router, tags=["WebSocket"])
app.include_router(multidoc.router, prefix="/api/v1/multidoc", tags=["多文档联合建树"])
app.include_router(expert.router, prefix="/api/v1/expert-rules", tags=["专家模式"])
app.include_router(benchmark.router, prefix="/api/v1/benchmark", tags=["指标评测"])
app.include_router(demo_seed.router, prefix="/api/v1/demo", tags=["演示数据"])


# ---- Schema 查询端点（无需认证，供前端缓存） ----
@app.get("/api/v1/schema", tags=["工业Schema"])
async def get_industrial_schema():
    """返回工业知识专用 Schema 定义"""
    from schemas.fta_schema import get_schema_summary
    return get_schema_summary()


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health_check():
    db_status = "unknown"
    try:
        from models.database import check_db_connection
        if await check_db_connection():
            db_status = "connected"
        else:
            db_status = "disconnected"
    except Exception:
        db_status = "error"

    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
    }


# 直接运行入口
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
