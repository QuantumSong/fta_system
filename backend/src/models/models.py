"""
数据模型定义
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user")  # "admin" | "user"
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    projects = relationship("Project", back_populates="owner")
    collaborations = relationship("ProjectCollaboration", back_populates="user")


class Project(Base):
    """项目表"""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    device_type = Column(String(50))
    status = Column(String(20), default="active")
    collab_enabled = Column(Boolean, default=False)
    collab_code = Column(String(6), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="projects")
    fault_trees = relationship("FaultTree", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    collaborators = relationship("ProjectCollaboration", back_populates="project", cascade="all, delete-orphan")


class ProjectCollaboration(Base):
    """项目协作成员表"""
    __tablename__ = "project_collaborations"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="collaborator")  # "owner" | "collaborator"
    joined_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="collaborators")
    user = relationship("User", back_populates="collaborations")


class FaultTree(Base):
    """故障树表"""
    __tablename__ = "fault_trees"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    name = Column(String(100), nullable=False)
    top_event = Column(String(200))
    structure = Column(JSON, nullable=False, default=dict)
    layout_config = Column(JSON)
    version = Column(Integer, default=1)
    status = Column(String(20), default="draft")
    quality_score = Column(Float)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    # 多文档联合建树记录
    doc_composition = Column(JSON)  # {"documents": [...], "contributions": {...}, "conflicts": [...]}

    project = relationship("Project", back_populates="fault_trees")
    versions = relationship("FaultTreeVersion", back_populates="fault_tree", cascade="all, delete-orphan",
                            order_by="FaultTreeVersion.created_at.desc()")


class FaultTreeVersion(Base):
    """故障树版本历史表"""
    __tablename__ = "fault_tree_versions"

    id = Column(Integer, primary_key=True, index=True)
    fault_tree_id = Column(Integer, ForeignKey("fault_trees.id"), nullable=False)
    version = Column(Integer, nullable=False)
    structure = Column(JSON, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    change_summary = Column(String(500))
    created_at = Column(DateTime, server_default=func.now())

    fault_tree = relationship("FaultTree", back_populates="versions")
    user = relationship("User")


class Document(Base):
    """文档表"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500))
    file_size = Column(Integer)
    doc_type = Column(String(50))
    content_text = Column(Text)
    extraction_status = Column(String(20), default="pending")
    extraction_result = Column(JSON)
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, server_default=func.now())
    # 多文档联合建树扩展字段
    tags = Column(JSON)  # ["维修手册", "案例报告", ...]
    device_model = Column(String(200))  # 适用设备型号
    source_level = Column(String(50), default="internal")  # official / internal / thirdparty / forum / experience
    trust_level = Column(Float, default=0.8)  # 可信等级 0-1

    project = relationship("Project", back_populates="documents")


class ExtractionRecord(Base):
    """知识抽取记录表"""
    __tablename__ = "extraction_records"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    extraction_type = Column(String(50))
    entities_extracted = Column(Integer, default=0)
    relations_extracted = Column(Integer, default=0)
    quality_score = Column(Float)
    details = Column(JSON)
    created_at = Column(DateTime, server_default=func.now())


class DocumentChunk(Base):
    """文档分块表 — 用于 RAG 检索"""
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    chunk_index = Column(Integer, default=0)
    content = Column(Text, nullable=False)
    chunk_type = Column(String(30), default="text")  # text / table / image_desc
    metadata_ = Column("metadata", JSON)  # page_num, table_index, etc.
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    document = relationship("Document")


class KnowledgeEntity(Base):
    """知识实体表 — 字段口径参见 schemas/fta_schema.py"""
    __tablename__ = "knowledge_entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)  # 参见 ENTITY_TYPE_KEYS
    description = Column(Text)
    device_type = Column(String(100))
    confidence = Column(Float, default=1.0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    source_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    evidence = Column(Text)  # 来源文本片段
    # ---- 工业 schema 扩展 ----
    fault_code = Column(String(100))       # 故障代码, e.g. HYD-2101
    fault_mode = Column(String(200))       # 故障模式, e.g. 内漏/卡滞
    severity = Column(String(30))          # catastrophic / hazardous / major / minor / no_effect
    detection_method = Column(String(500)) # 检测/调查方式
    parameter_name = Column(String(200))   # 监控参数名
    parameter_range = Column(String(200))  # 参数正常范围, e.g. "2800-3200 psi"
    maintenance_ref = Column(String(500))  # AMM/TSM 参考章节
    evidence_level = Column(String(30))    # direct / inferred / assumed / none
    created_at = Column(DateTime, server_default=func.now())


class KnowledgeRelation(Base):
    """知识关系表 — 字段口径参见 schemas/fta_schema.py"""
    __tablename__ = "knowledge_relations"

    id = Column(Integer, primary_key=True, index=True)
    source_entity_id = Column(Integer, ForeignKey("knowledge_entities.id"))
    target_entity_id = Column(Integer, ForeignKey("knowledge_entities.id"))
    relation_type = Column(String(50), nullable=False)  # 参见 RELATION_TYPE_KEYS
    logic_gate = Column(String(30))  # AND / OR / XOR / PRIORITY_AND / INHIBIT / VOTING
    confidence = Column(Float, default=1.0)
    evidence = Column(Text)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    source_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    # ---- 工业 schema 扩展 ----
    condition = Column(String(500))        # 触发条件描述（禁止门/表决门）
    parameters = Column(JSON)              # 额外参数, e.g. {"k": 2, "n": 3} for voting
    created_at = Column(DateTime, server_default=func.now())

    source_entity = relationship("KnowledgeEntity", foreign_keys=[source_entity_id])
    target_entity = relationship("KnowledgeEntity", foreign_keys=[target_entity_id])


class BuildTemplate(Base):
    """建树模板 — 保存文档组合与生成参数供复用"""
    __tablename__ = "build_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    device_type = Column(String(200))
    description = Column(Text)
    document_ids = Column(JSON)  # [1, 2, 3]
    document_weights = Column(JSON)  # {"1": 1.0, "2": 0.8}
    filters = Column(JSON)  # 筛选条件快照
    generation_config = Column(JSON)  # 生成参数
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ExpertRule(Base):
    """专家规则表 — 专家确认的忽略/自定义校验指导"""
    __tablename__ = "expert_rules"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # NULL = 全局
    name = Column(String(200), nullable=False)
    description = Column(Text)
    rule_type = Column(String(30), nullable=False, default="ignore")  # ignore / guidance / custom_check
    scope = Column(String(30), default="global")  # global / project
    # 针对的校验规则 ID（如 DOMAIN_TERM_INCONSISTENT），可选
    target_rule_id = Column(String(100))
    # 针对的节点名或 ID pattern（支持通配符），可选
    target_node_pattern = Column(String(500))
    # 专家指导内容 / 理由
    content = Column(Text)
    # 优先级（越高越优先）
    priority = Column(Integer, default=0)
    enabled = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class GoldTree(Base):
    """标准故障树 — 人工标注的 ground truth"""
    __tablename__ = "gold_trees"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    device_type = Column(String(100))
    top_event = Column(String(300))
    structure = Column(JSON, nullable=False, default=dict)       # {nodes:[], links:[]}
    relation_annotations = Column(JSON)                          # 人工标注的实体关系 [{source, target, type}]
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EvalRun(Base):
    """评测运行记录"""
    __tablename__ = "eval_runs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    device_type = Column(String(100))
    top_event = Column(String(300))
    algorithm_version = Column(String(100))
    gold_tree_id = Column(Integer, ForeignKey("gold_trees.id"), nullable=True)
    generated_tree_id = Column(Integer, ForeignKey("fault_trees.id"), nullable=True)
    # 树结构评测指标
    node_precision = Column(Float)
    node_recall = Column(Float)
    node_f1 = Column(Float)
    edge_precision = Column(Float)
    edge_recall = Column(Float)
    edge_f1 = Column(Float)
    gate_accuracy = Column(Float)
    level_accuracy = Column(Float)
    structure_accuracy = Column(Float)       # 综合结构准确率
    # 关系抽取评测指标
    relation_precision = Column(Float)
    relation_recall = Column(Float)
    relation_f1 = Column(Float)
    # 专家修订前后对比
    quality_before = Column(Float)
    quality_after = Column(Float)
    time_ai_seconds = Column(Float)          # AI 构树耗时
    time_expert_seconds = Column(Float)      # 专家修订耗时
    time_manual_baseline = Column(Float)     # 人工基线耗时
    # 汇总
    overall_score = Column(Float)
    details = Column(JSON)                   # 完整评测明细 + 错误案例列表
    status = Column(String(20), default="completed")
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class OperationLog(Base):
    """操作日志表"""
    __tablename__ = "operation_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    operation_type = Column(String(50))
    target_type = Column(String(50))
    target_id = Column(String(50))
    details = Column(JSON)
    ip_address = Column(String(45))
    created_at = Column(DateTime, server_default=func.now())
