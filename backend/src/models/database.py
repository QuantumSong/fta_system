"""
数据库连接管理 - SQLite (aiosqlite)
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text, event

from config import settings

# 创建异步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
)


# SQLite需要开启外键支持
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# 创建会话工厂
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# 声明基类
Base = declarative_base()


async def get_db():
    """获取数据库会话（依赖注入用）"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """初始化数据库（创建所有表）"""
    # 确保models被导入，这样Base.metadata才有表信息
    import models.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("  数据库表创建完成")

    # 为已有表补充新增列（SQLite 的 create_all 不会 ALTER 已有表）
    await _migrate_add_columns()


async def _migrate_add_columns():
    """安全地为已有表添加缺失列（幂等操作，列已存在时跳过）"""
    migrations = [
        # (表名, 列名, 列类型及默认值)
        ("documents", "tags", "TEXT"),
        ("documents", "device_model", "VARCHAR(200)"),
        ("documents", "source_level", "VARCHAR(50) DEFAULT 'internal'"),
        ("documents", "trust_level", "REAL DEFAULT 0.8"),
        ("fault_trees", "doc_composition", "TEXT"),
        # build_templates 是新表，create_all 会自动创建
        # ---- 工业 schema 扩展: KnowledgeEntity ----
        ("knowledge_entities", "fault_code", "VARCHAR(100)"),
        ("knowledge_entities", "fault_mode", "VARCHAR(200)"),
        ("knowledge_entities", "severity", "VARCHAR(30)"),
        ("knowledge_entities", "detection_method", "VARCHAR(500)"),
        ("knowledge_entities", "parameter_name", "VARCHAR(200)"),
        ("knowledge_entities", "parameter_range", "VARCHAR(200)"),
        ("knowledge_entities", "maintenance_ref", "VARCHAR(500)"),
        ("knowledge_entities", "evidence_level", "VARCHAR(30)"),
        # ---- 工业 schema 扩展: KnowledgeRelation ----
        ("knowledge_relations", "condition", "VARCHAR(500)"),
        ("knowledge_relations", "parameters", "TEXT"),
    ]
    async with engine.begin() as conn:
        for table, column, col_type in migrations:
            try:
                await conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
                ))
                print(f"  迁移: {table}.{column} 列已添加")
            except Exception:
                # 列已存在，跳过
                pass


async def check_db_connection():
    """检查数据库连接"""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception as e:
        print(f"数据库连接检查失败: {e}")
        return False
