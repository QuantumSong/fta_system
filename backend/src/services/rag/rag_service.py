"""
RAG 服务 — 基于 TF-IDF 的文档检索 + 知识图谱子图检索
"""
import math
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_

from models.models import (
    DocumentChunk, KnowledgeEntity, KnowledgeRelation, FaultTree, Document,
)


# ---------------------------------------------------------------------------
# 1) 文本分块
# ---------------------------------------------------------------------------

def split_text_into_chunks(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 150,
) -> List[str]:
    """将长文本切分为带重叠的片段"""
    if not text or not text.strip():
        return []

    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - chunk_overlap
    return chunks


# ---------------------------------------------------------------------------
# 2) TF-IDF 检索（轻量级，无需外部向量数据库）
# ---------------------------------------------------------------------------

class TFIDFRetriever:
    """基于 scikit-learn TfidfVectorizer 的轻量级检索器"""

    def __init__(self):
        self._vectorizer = None
        self._matrix = None
        self._corpus_texts: List[str] = []
        self._corpus_ids: List[int] = []

    def build_index(self, chunk_ids: List[int], texts: List[str]):
        """构建 TF-IDF 索引"""
        from sklearn.feature_extraction.text import TfidfVectorizer

        if not texts:
            return

        self._corpus_ids = chunk_ids
        self._corpus_texts = texts
        self._vectorizer = TfidfVectorizer(
            max_features=10000,
            token_pattern=r"(?u)\b\w+\b",
        )
        self._matrix = self._vectorizer.fit_transform(texts)

    def search(self, query: str, top_k: int = 10) -> List[Tuple[int, float]]:
        """检索最相似的文档片段，返回 [(chunk_id, score), ...]"""
        if self._vectorizer is None or self._matrix is None:
            return []

        from sklearn.metrics.pairwise import cosine_similarity

        q_vec = self._vectorizer.transform([query])
        scores = cosine_similarity(q_vec, self._matrix).flatten()

        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        results = []
        for idx, score in ranked[:top_k]:
            if score > 0.01:
                results.append((self._corpus_ids[idx], float(score)))
        return results


# ---------------------------------------------------------------------------
# 3) 数据库交互辅助
# ---------------------------------------------------------------------------

async def store_chunks(
    db: AsyncSession,
    document_id: int,
    project_id: Optional[int],
    chunks: List[str],
):
    """将文本分块存入 document_chunks 表"""
    for i, text in enumerate(chunks):
        db.add(DocumentChunk(
            document_id=document_id,
            chunk_index=i,
            content=text,
            chunk_type="text",
            project_id=project_id,
        ))
    await db.commit()


async def retrieve_relevant_chunks(
    db: AsyncSession,
    query: str,
    project_id: Optional[int] = None,
    top_k: int = 10,
) -> List[Dict[str, Any]]:
    """从数据库加载分块 → 建 TF-IDF 索引 → 检索最相关片段"""
    stmt = select(DocumentChunk)
    if project_id:
        stmt = stmt.where(DocumentChunk.project_id == project_id)
    result = await db.execute(stmt)
    all_chunks = result.scalars().all()

    if not all_chunks:
        return []

    retriever = TFIDFRetriever()
    retriever.build_index(
        chunk_ids=[c.id for c in all_chunks],
        texts=[c.content for c in all_chunks],
    )

    hits = retriever.search(query, top_k=top_k)
    chunk_map = {c.id: c for c in all_chunks}

    results = []
    for cid, score in hits:
        c = chunk_map[cid]
        results.append({
            "chunk_id": c.id,
            "document_id": c.document_id,
            "content": c.content,
            "score": round(score, 4),
        })
    return results


# ---------------------------------------------------------------------------
# 4) 知识图谱子图检索
# ---------------------------------------------------------------------------

async def retrieve_knowledge_subgraph(
    db: AsyncSession,
    query: str,
    project_id: Optional[int] = None,
    max_entities: int = 30,
) -> Dict[str, Any]:
    """
    根据查询文本在知识图谱中检索相关子图。
    1. 模糊匹配实体名称/描述
    2. 获取匹配实体间的关系
    """
    keywords = [w.strip() for w in query.replace(",", " ").replace("，", " ").split() if w.strip()]
    if not keywords:
        keywords = [query]

    # 模糊匹配实体
    conditions = []
    for kw in keywords:
        conditions.append(KnowledgeEntity.name.contains(kw))
        conditions.append(KnowledgeEntity.description.contains(kw))
    if project_id:
        conditions_with_project = [and_(c, KnowledgeEntity.project_id == project_id) for c in conditions]
        # 也搜索全局实体 (project_id IS NULL)
        conditions_global = [and_(c, KnowledgeEntity.project_id.is_(None)) for c in conditions]
        all_conds = conditions_with_project + conditions_global
    else:
        all_conds = conditions

    stmt = select(KnowledgeEntity).where(or_(*all_conds)).limit(max_entities) if all_conds else select(KnowledgeEntity).limit(max_entities)
    result = await db.execute(stmt)
    entities = result.scalars().all()

    if not entities:
        return {"entities": [], "relations": []}

    entity_ids = {e.id for e in entities}

    # 获取这些实体之间的关系
    stmt_rel = select(KnowledgeRelation).where(
        or_(
            KnowledgeRelation.source_entity_id.in_(entity_ids),
            KnowledgeRelation.target_entity_id.in_(entity_ids),
        )
    )
    result_rel = await db.execute(stmt_rel)
    relations = result_rel.scalars().all()

    # 关系涉及的新实体也加进来
    extra_ids = set()
    for r in relations:
        extra_ids.add(r.source_entity_id)
        extra_ids.add(r.target_entity_id)
    missing = extra_ids - entity_ids
    if missing:
        stmt_extra = select(KnowledgeEntity).where(KnowledgeEntity.id.in_(missing))
        res_extra = await db.execute(stmt_extra)
        entities += list(res_extra.scalars().all())
        entity_ids |= missing

    return {
        "entities": [
            {
                "id": e.id,
                "name": e.name,
                "type": e.entity_type,
                "description": e.description or "",
                "device_type": e.device_type or "",
                "confidence": e.confidence,
            }
            for e in entities
        ],
        "relations": [
            {
                "id": r.id,
                "source_id": r.source_entity_id,
                "target_id": r.target_entity_id,
                "source_name": next((e.name for e in entities if e.id == r.source_entity_id), ""),
                "target_name": next((e.name for e in entities if e.id == r.target_entity_id), ""),
                "type": r.relation_type,
                "logic_gate": r.logic_gate,
                "confidence": r.confidence,
                "evidence": r.evidence or "",
            }
            for r in relations
        ],
    }


# ---------------------------------------------------------------------------
# 5) 检索相似历史故障树
# ---------------------------------------------------------------------------

async def retrieve_similar_fault_trees(
    db: AsyncSession,
    query: str,
    project_id: Optional[int] = None,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """检索名称/顶事件与查询相似的历史故障树"""
    stmt = select(FaultTree)
    if project_id:
        stmt = stmt.where(FaultTree.project_id == project_id)
    result = await db.execute(stmt)
    all_trees = result.scalars().all()

    if not all_trees:
        return []

    # 用树的 name + top_event 做 TF-IDF 匹配
    retriever = TFIDFRetriever()
    texts = [f"{t.name or ''} {t.top_event or ''}" for t in all_trees]
    retriever.build_index(
        chunk_ids=[t.id for t in all_trees],
        texts=texts,
    )

    hits = retriever.search(query, top_k=top_k)
    tree_map = {t.id: t for t in all_trees}

    results = []
    for tid, score in hits:
        t = tree_map[tid]
        structure = t.structure or {}
        results.append({
            "id": t.id,
            "name": t.name,
            "top_event": t.top_event,
            "score": round(score, 4),
            "node_count": len(structure.get("nodes", [])),
            "structure": structure,
        })
    return results
