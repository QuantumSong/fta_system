"""
文档管理API路由 - 真正的CRUD实现
"""
import os
import aiofiles
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from typing import Optional

from models.database import get_db
from models.models import Document, DocumentChunk, User
from config import settings
from core.auth import get_current_user

router = APIRouter()


@router.get("/")
async def get_documents(
    project_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取文档列表"""
    query = select(Document).order_by(Document.uploaded_at.desc())
    if project_id is not None:
        query = query.where(Document.project_id == project_id)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    documents = result.scalars().all()

    # 总数
    count_query = select(sa_func.count()).select_from(Document)
    if project_id is not None:
        count_query = count_query.where(Document.project_id == project_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    return {
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "file_size": d.file_size,
                "doc_type": d.doc_type,
                "extraction_status": d.extraction_status,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "tags": d.tags,
                "device_model": d.device_model,
                "source_level": d.source_level,
                "trust_level": d.trust_level,
            }
            for d in documents
        ],
        "total": total,
    }


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    project_id: str = Form(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传文档"""
    # 检查文件扩展名
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}。支持: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )

    # 确保上传目录存在
    upload_path = os.path.abspath(settings.UPLOAD_DIR)
    os.makedirs(upload_path, exist_ok=True)

    # 读取文件内容
    content = await file.read()
    file_size = len(content)

    if file_size > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过限制")

    # 保存文件到磁盘
    import uuid
    safe_filename = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # 保存记录到数据库
    pid = int(project_id) if project_id and project_id.isdigit() else None
    doc = Document(
        project_id=pid,
        filename=file.filename,
        file_path=file_path,
        file_size=file_size,
        doc_type=ext,
        extraction_status="pending",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "filename": doc.filename,
        "file_size": doc.file_size,
        "status": "uploaded",
        "message": "上传成功",
    }


@router.get("/{document_id}")
async def get_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取文档详情"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    return {
        "id": doc.id,
        "filename": doc.filename,
        "file_size": doc.file_size,
        "doc_type": doc.doc_type,
        "content_text": doc.content_text,
        "extraction_status": doc.extraction_status,
        "extraction_result": doc.extraction_result,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
    }


@router.put("/{document_id}")
async def update_document(
    document_id: int,
    data: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新文档信息（文件名、标签、设备型号、来源级别、可信度）"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    if "filename" in data and data["filename"]:
        doc.filename = data["filename"]
    if "tags" in data:
        doc.tags = data["tags"]
    if "device_model" in data:
        doc.device_model = data["device_model"]
    if "source_level" in data:
        doc.source_level = data["source_level"]
    if "trust_level" in data:
        doc.trust_level = max(0.0, min(1.0, float(data["trust_level"]))) if data["trust_level"] is not None else None

    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "filename": doc.filename,
        "tags": doc.tags,
        "device_model": doc.device_model,
        "source_level": doc.source_level,
        "trust_level": doc.trust_level,
        "message": "更新成功",
    }


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除文档及其关联的分块数据"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 删除关联的文档分块
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(DocumentChunk).where(DocumentChunk.document_id == document_id))

    # 删除磁盘文件
    if doc.file_path and os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    await db.delete(doc)
    await db.commit()
    return {"message": "删除成功"}


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取文档的所有分块"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    chunk_result = await db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index)
    )
    chunks = chunk_result.scalars().all()

    return {
        "document_id": document_id,
        "filename": doc.filename,
        "chunks": [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "chunk_type": c.chunk_type,
                "metadata": c.metadata_,
            }
            for c in chunks
        ],
    }
