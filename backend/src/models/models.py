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
    """知识实体表"""
    __tablename__ = "knowledge_entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    description = Column(Text)
    device_type = Column(String(100))
    confidence = Column(Float, default=1.0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    source_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    evidence = Column(Text)  # 来源文本片段
    created_at = Column(DateTime, server_default=func.now())


class KnowledgeRelation(Base):
    """知识关系表"""
    __tablename__ = "knowledge_relations"

    id = Column(Integer, primary_key=True, index=True)
    source_entity_id = Column(Integer, ForeignKey("knowledge_entities.id"))
    target_entity_id = Column(Integer, ForeignKey("knowledge_entities.id"))
    relation_type = Column(String(50), nullable=False)
    logic_gate = Column(String(30))  # AND / OR / XOR / PRIORITY_AND / INHIBIT / VOTING
    confidence = Column(Float, default=1.0)
    evidence = Column(Text)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    source_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    source_entity = relationship("KnowledgeEntity", foreign_keys=[source_entity_id])
    target_entity = relationship("KnowledgeEntity", foreign_keys=[target_entity_id])


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
