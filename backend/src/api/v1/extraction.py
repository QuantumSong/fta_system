"""
知识抽取 API — 文档解析 → LLM 抽取 → 存入知识图谱 + RAG 分块
"""
import asyncio
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel

from models.database import get_db, AsyncSessionLocal
from models.models import (
    Document, ExtractionRecord, KnowledgeEntity, KnowledgeRelation,
    DocumentChunk, User,
)
from core.auth import get_current_user

router = APIRouter()

# 内存进度追踪: task_id -> {total, completed, current_doc, status, details}
extraction_progress: dict = {}


# ---------------------------------------------------------------------------
# 请求 / 响应模型
# ---------------------------------------------------------------------------

class ExtractionStartRequest(BaseModel):
    document_ids: List[int]


class TextExtractionRequest(BaseModel):
    text: str
    project_id: Optional[int] = None


# ---------------------------------------------------------------------------
# 端点
# ---------------------------------------------------------------------------

@router.post("/start")
async def start_extraction(
    request: ExtractionStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """启动文档知识抽取（异步后台执行）"""
    from services.extraction.knowledge_extractor import KnowledgeExtractor
    from services.rag.rag_service import split_text_into_chunks

    # 验证文档存在
    docs = []
    for doc_id in request.document_ids:
        result = await db.execute(select(Document).where(Document.id == doc_id))
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail=f"文档 {doc_id} 不存在")
        docs.append(doc)

    # 标记为处理中
    for doc in docs:
        doc.extraction_status = "processing"
    await db.commit()

    task_id = f"ext-{'-'.join(str(d.id) for d in docs)}"
    extraction_progress[task_id] = {
        "total": len(docs),
        "completed": 0,
        "current_doc": docs[0].filename if docs else "",
        "status": "processing",
        "details": [],
    }

    # ---- 后台异步抽取 ----
    async def _run(document_ids: List[int], tid: str):
        async with AsyncSessionLocal() as session:
            extractor = KnowledgeExtractor()
            for idx, d_id in enumerate(document_ids):
                res = await session.execute(select(Document).where(Document.id == d_id))
                d = res.scalar_one_or_none()
                if not d or not d.file_path:
                    extraction_progress[tid]["completed"] = idx + 1
                    continue
                try:
                    extraction_progress[tid]["current_doc"] = d.filename
                    ext_result = await extractor.extract_from_document(d.file_path, d.doc_type)

                    # 存抽取结果到 Document
                    d.extraction_result = ext_result.to_dict()
                    d.extraction_status = "completed"
                    d.content_text = "\n".join(ext_result.text_chunks[:10])  # 保存前几块摘要

                    # 存 RAG 分块
                    for i, chunk_text in enumerate(ext_result.text_chunks):
                        session.add(DocumentChunk(
                            document_id=d.id,
                            chunk_index=i,
                            content=chunk_text,
                            chunk_type="text",
                            project_id=d.project_id,
                        ))

                    # 存知识实体
                    name_to_entity = {}
                    for ent in ext_result.entities:
                        ke = KnowledgeEntity(
                            name=ent.name,
                            entity_type=ent.entity_type,
                            description=ent.description,
                            device_type=ent.device_type,
                            confidence=ent.confidence,
                            project_id=d.project_id,
                            source_document_id=d.id,
                            evidence=ent.evidence,
                            fault_code=ent.fault_code or None,
                            fault_mode=ent.fault_mode or None,
                            severity=ent.severity or None,
                            detection_method=ent.detection_method or None,
                            parameter_name=ent.parameter_name or None,
                            parameter_range=ent.parameter_range or None,
                            maintenance_ref=ent.maintenance_ref or None,
                            evidence_level=ent.evidence_level or None,
                        )
                        session.add(ke)
                        await session.flush()  # 获取 id
                        name_to_entity[ent.name.strip().lower()] = ke

                    # 存知识关系
                    for rel in ext_result.relations:
                        src = name_to_entity.get(rel.source_name.strip().lower())
                        tgt = name_to_entity.get(rel.target_name.strip().lower())
                        if src and tgt:
                            session.add(KnowledgeRelation(
                                source_entity_id=src.id,
                                target_entity_id=tgt.id,
                                relation_type=rel.relation_type,
                                logic_gate=rel.logic_gate or None,
                                confidence=rel.confidence,
                                evidence=rel.evidence,
                                project_id=d.project_id,
                                source_document_id=d.id,
                                condition=rel.condition or None,
                                parameters=rel.parameters,
                            ))

                    # 存抽取记录
                    session.add(ExtractionRecord(
                        document_id=d.id,
                        extraction_type="knowledge",
                        entities_extracted=len(ext_result.entities),
                        relations_extracted=len(ext_result.relations),
                        quality_score=ext_result.quality_score,
                        details=ext_result.statistics,
                    ))

                    await session.commit()
                    extraction_progress[tid]["completed"] = idx + 1
                    extraction_progress[tid]["details"].append(
                        {"doc_id": d.id, "filename": d.filename, "status": "completed",
                         "entities": len(ext_result.entities), "relations": len(ext_result.relations)}
                    )
                    print(f"[Extraction] 文档 {d.id} 完成: {len(ext_result.entities)} 实体, {len(ext_result.relations)} 关系")

                except Exception as e:
                    print(f"[Extraction] 文档 {d_id} 失败: {e}")
                    d.extraction_status = "failed"
                    d.extraction_result = {"error": str(e)}
                    await session.commit()
                    extraction_progress[tid]["completed"] = idx + 1
                    extraction_progress[tid]["details"].append(
                        {"doc_id": d_id, "filename": d.filename if d else "", "status": "failed", "error": str(e)}
                    )

            extraction_progress[tid]["status"] = "completed"
            extraction_progress[tid]["current_doc"] = ""

    asyncio.create_task(_run([d.id for d in docs], task_id))

    return {
        "task_id": task_id,
        "status": "processing",
        "document_ids": [d.id for d in docs],
    }


@router.post("/text")
async def extract_from_text(
    request: TextExtractionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """直接从文本抽取知识（同步返回结果）"""
    from services.extraction.knowledge_extractor import KnowledgeExtractor

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="文本不能为空")

    extractor = KnowledgeExtractor()
    result = await extractor.extract_from_text(request.text)

    # 持久化到 DB (全局或指定项目)
    if True:
        name_to_entity = {}
        for ent in result.entities:
            ke = KnowledgeEntity(
                name=ent.name,
                entity_type=ent.entity_type,
                description=ent.description,
                device_type=ent.device_type,
                confidence=ent.confidence,
                project_id=request.project_id,
                evidence=ent.evidence,
                fault_code=ent.fault_code or None,
                fault_mode=ent.fault_mode or None,
                severity=ent.severity or None,
                detection_method=ent.detection_method or None,
                parameter_name=ent.parameter_name or None,
                parameter_range=ent.parameter_range or None,
                maintenance_ref=ent.maintenance_ref or None,
                evidence_level=ent.evidence_level or None,
            )
            db.add(ke)
            await db.flush()
            name_to_entity[ent.name.strip().lower()] = ke

        for rel in result.relations:
            src = name_to_entity.get(rel.source_name.strip().lower())
            tgt = name_to_entity.get(rel.target_name.strip().lower())
            if src and tgt:
                db.add(KnowledgeRelation(
                    source_entity_id=src.id,
                    target_entity_id=tgt.id,
                    relation_type=rel.relation_type,
                    logic_gate=rel.logic_gate or None,
                    confidence=rel.confidence,
                    evidence=rel.evidence,
                    project_id=request.project_id,
                    condition=rel.condition or None,
                    parameters=rel.parameters,
                ))
        await db.commit()

    return result.to_dict()


@router.get("/progress/{task_id}")
async def get_extraction_progress(
    task_id: str,
    user: User = Depends(get_current_user),
):
    """查询批量抽取进度"""
    prog = extraction_progress.get(task_id)
    if not prog:
        raise HTTPException(status_code=404, detail="任务不存在")
    return prog


@router.get("/status/{doc_id}")
async def get_document_extraction_status(
    doc_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """查询单个文档的抽取状态和结果"""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 统计该文档产生的实体/关系数
    ent_count = await db.execute(
        select(func.count(KnowledgeEntity.id)).where(KnowledgeEntity.source_document_id == doc_id)
    )
    rel_count = await db.execute(
        select(func.count(KnowledgeRelation.id)).where(KnowledgeRelation.source_document_id == doc_id)
    )

    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "status": doc.extraction_status,
        "entity_count": ent_count.scalar() or 0,
        "relation_count": rel_count.scalar() or 0,
        "extraction_result": doc.extraction_result,
    }


@router.get("/project/{project_id}/stats")
async def get_project_extraction_stats(
    project_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取项目级别的知识抽取统计"""
    # 文档统计
    doc_result = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    docs = doc_result.scalars().all()

    ent_count = await db.execute(
        select(func.count(KnowledgeEntity.id)).where(KnowledgeEntity.project_id == project_id)
    )
    rel_count = await db.execute(
        select(func.count(KnowledgeRelation.id)).where(KnowledgeRelation.project_id == project_id)
    )
    chunk_count = await db.execute(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.project_id == project_id)
    )

    return {
        "project_id": project_id,
        "document_count": len(docs),
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "doc_type": d.doc_type,
                "status": d.extraction_status,
            }
            for d in docs
        ],
        "entity_count": ent_count.scalar() or 0,
        "relation_count": rel_count.scalar() or 0,
        "chunk_count": chunk_count.scalar() or 0,
    }
