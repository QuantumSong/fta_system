"""
知识抽取服务 — 解析文档 → LLM 提取实体/关系 → 存入数据库 → 构建知识图谱
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import json
import re
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from core.llm import LLMClient
from services.extraction.document_parser import DocumentParserFactory, Document
from services.rag.rag_service import split_text_into_chunks


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------

@dataclass
class ExtractedEntity:
    name: str
    entity_type: str  # TOP_EVENT / MIDDLE_EVENT / BASIC_EVENT / DEVICE / COMPONENT
    description: str = ""
    device_type: str = ""
    confidence: float = 0.8
    evidence: str = ""


@dataclass
class ExtractedRelation:
    source_name: str
    target_name: str
    relation_type: str  # CAUSES / PART_OF / LOCATED_AT / AND_GATE / OR_GATE
    logic_gate: str = ""  # AND / OR / XOR / ...
    confidence: float = 0.8
    evidence: str = ""


@dataclass
class ExtractionResult:
    entities: List[ExtractedEntity]
    relations: List[ExtractedRelation]
    text_chunks: List[str]
    quality_score: float
    statistics: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entities": [
                {"name": e.name, "type": e.entity_type, "description": e.description,
                 "device_type": e.device_type, "confidence": e.confidence}
                for e in self.entities
            ],
            "relations": [
                {"source": r.source_name, "target": r.target_name,
                 "type": r.relation_type, "logic_gate": r.logic_gate,
                 "confidence": r.confidence}
                for r in self.relations
            ],
            "statistics": self.statistics,
            "quality_score": self.quality_score,
        }


# ---------------------------------------------------------------------------
# 抽取器
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """你是工业故障树分析(FTA)领域的知识抽取专家。
你的任务是从工业文档中识别故障事件、设备部件信息，以及它们之间的因果关系和逻辑门规则。
请始终输出有效的JSON格式。"""

EXTRACTION_PROMPT_TEMPLATE = """请从以下文本中抽取故障树分析(FTA)相关的知识。

【待分析文本】
{text}

【抽取要求】
1. 识别所有故障事件实体：
   - TOP_EVENT: 系统级顶层故障（如"登机梯系统故障"、"液压系统失效"）
   - MIDDLE_EVENT: 中间过渡事件（如"回收功能故障"、"压力不足"）
   - BASIC_EVENT: 最基本的故障原因/底事件（如"密封圈老化"、"传感器失灵"）
   - DEVICE: 设备（如"液压泵"、"发动机"）
   - COMPONENT: 部件（如"密封圈"、"阀门"、"传感器"）

2. 抽取实体间的关系：
   - CAUSES: 因果关系（A导致B）
   - PART_OF: 组成关系（A是B的一部分）
   - LOCATED_AT: 位置关系
   - AND_GATE: 与门关系（多个原因同时发生才导致结果）
   - OR_GATE: 或门关系（任一原因发生就导致结果）

3. 如果关系涉及逻辑门，请在logic_gate字段标注门类型(AND/OR/XOR/PRIORITY_AND/INHIBIT/VOTING)

【输出格式】(严格JSON)
{{
    "entities": [
        {{
            "name": "实体名称",
            "type": "实体类型",
            "description": "简要描述",
            "device_type": "所属设备类型（可选）",
            "confidence": 0.9
        }}
    ],
    "relations": [
        {{
            "source": "源实体名称",
            "target": "目标实体名称",
            "type": "关系类型",
            "logic_gate": "逻辑门类型（可选，空字符串表示无）",
            "confidence": 0.85,
            "evidence": "文本中的支撑证据片段"
        }}
    ]
}}

注意：只输出JSON，不要有其他内容。"""


class KnowledgeExtractor:
    """知识抽取器 — 一次 LLM 调用完成实体+关系联合抽取"""

    def __init__(self, llm: LLMClient = None):
        self.llm = llm or LLMClient()

    async def extract_from_document(
        self,
        file_path: str,
        doc_type: str,
    ) -> ExtractionResult:
        """
        端到端抽取：解析文档 → 分块 → LLM 抽取 → 去重合并
        """
        # 1. 文档解析
        parser = DocumentParserFactory.get_parser(doc_type)
        document = await parser.parse(file_path)

        if not document.text.strip():
            return ExtractionResult([], [], [], 0.0, {"error": "文档内容为空"})

        # 2. 文本分块
        chunks = split_text_into_chunks(document.text, chunk_size=1500, chunk_overlap=200)
        if not chunks:
            return ExtractionResult([], [], [], 0.0, {"error": "分块为空"})

        # 3. 逐块 LLM 抽取
        all_entities: List[ExtractedEntity] = []
        all_relations: List[ExtractedRelation] = []

        for chunk in chunks:
            try:
                ents, rels = await self._extract_from_chunk(chunk)
                all_entities.extend(ents)
                all_relations.extend(rels)
            except Exception as e:
                print(f"[KnowledgeExtractor] chunk extraction error: {e}")

        # 4. 去重 & 合并
        merged_entities = self._merge_entities(all_entities)
        merged_relations = self._merge_relations(all_relations, merged_entities)

        # 5. 质量评估
        quality = self._evaluate_quality(merged_entities, merged_relations)

        return ExtractionResult(
            entities=merged_entities,
            relations=merged_relations,
            text_chunks=chunks,
            quality_score=quality,
            statistics={
                "text_length": len(document.text),
                "chunk_count": len(chunks),
                "entity_count": len(merged_entities),
                "relation_count": len(merged_relations),
                "entity_types": self._count_by_field(merged_entities, "entity_type"),
                "relation_types": self._count_by_field(merged_relations, "relation_type"),
            },
        )

    async def extract_from_text(self, text: str) -> ExtractionResult:
        """直接从文本抽取（不走文件解析）"""
        chunks = split_text_into_chunks(text, chunk_size=1500, chunk_overlap=200)
        if not chunks:
            return ExtractionResult([], [], [], 0.0, {})

        all_entities: List[ExtractedEntity] = []
        all_relations: List[ExtractedRelation] = []
        for chunk in chunks:
            try:
                ents, rels = await self._extract_from_chunk(chunk)
                all_entities.extend(ents)
                all_relations.extend(rels)
            except Exception as e:
                print(f"[KnowledgeExtractor] chunk error: {e}")

        merged_entities = self._merge_entities(all_entities)
        merged_relations = self._merge_relations(all_relations, merged_entities)
        quality = self._evaluate_quality(merged_entities, merged_relations)
        return ExtractionResult(
            entities=merged_entities,
            relations=merged_relations,
            text_chunks=chunks,
            quality_score=quality,
            statistics={
                "entity_count": len(merged_entities),
                "relation_count": len(merged_relations),
            },
        )

    # ----- 内部方法 -----

    async def _extract_from_chunk(self, text: str):
        """对单个文本块调用 LLM 进行实体+关系联合抽取"""
        prompt = EXTRACTION_PROMPT_TEMPLATE.format(text=text[:3000])
        response = await self.llm.generate(
            prompt=prompt,
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            temperature=0.1,
        )

        data = self._parse_json(response)
        entities = []
        for e in data.get("entities", []):
            entities.append(ExtractedEntity(
                name=e.get("name", "").strip(),
                entity_type=e.get("type", "BASIC_EVENT"),
                description=e.get("description", ""),
                device_type=e.get("device_type", ""),
                confidence=float(e.get("confidence", 0.8)),
                evidence=text[:200],
            ))

        relations = []
        for r in data.get("relations", []):
            relations.append(ExtractedRelation(
                source_name=r.get("source", "").strip(),
                target_name=r.get("target", "").strip(),
                relation_type=r.get("type", "CAUSES"),
                logic_gate=r.get("logic_gate", "") or "",
                confidence=float(r.get("confidence", 0.8)),
                evidence=r.get("evidence", ""),
            ))

        return entities, relations

    def _parse_json(self, response: str) -> Dict:
        """从 LLM 响应中提取 JSON"""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass
        m = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", response)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
        m = re.search(r"(\{[\s\S]*\})", response)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
        return {"entities": [], "relations": []}

    def _merge_entities(self, entities: List[ExtractedEntity]) -> List[ExtractedEntity]:
        """按名称去重，保留高置信度"""
        seen: Dict[str, ExtractedEntity] = {}
        for e in entities:
            key = e.name.strip().lower()
            if not key:
                continue
            if key not in seen or e.confidence > seen[key].confidence:
                seen[key] = e
        return list(seen.values())

    def _merge_relations(
        self,
        relations: List[ExtractedRelation],
        entities: List[ExtractedEntity],
    ) -> List[ExtractedRelation]:
        """去重并过滤掉引用不存在实体的关系"""
        entity_names = {e.name.strip().lower() for e in entities}
        seen = set()
        merged = []
        for r in relations:
            sk = r.source_name.strip().lower()
            tk = r.target_name.strip().lower()
            if sk not in entity_names or tk not in entity_names:
                continue
            key = (sk, tk, r.relation_type)
            if key in seen:
                continue
            seen.add(key)
            merged.append(r)
        return merged

    def _evaluate_quality(
        self,
        entities: List[ExtractedEntity],
        relations: List[ExtractedRelation],
    ) -> float:
        if not entities:
            return 0.0
        avg_conf = sum(e.confidence for e in entities) / len(entities)
        rel_coverage = len(relations) / max(len(entities) - 1, 1)
        return round(avg_conf * 0.6 + min(rel_coverage, 1.0) * 0.4, 2)

    @staticmethod
    def _count_by_field(items, field_name) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for item in items:
            val = getattr(item, field_name, "unknown")
            counts[val] = counts.get(val, 0) + 1
        return counts
