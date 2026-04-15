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
    entity_type: str  # 参见 schemas.fta_schema.ENTITY_TYPE_KEYS
    description: str = ""
    device_type: str = ""
    confidence: float = 0.8
    evidence: str = ""
    # ---- 工业 schema 扩展 ----
    fault_code: str = ""
    fault_mode: str = ""
    severity: str = ""          # catastrophic / hazardous / major / minor / no_effect
    detection_method: str = ""
    parameter_name: str = ""
    parameter_range: str = ""
    maintenance_ref: str = ""
    evidence_level: str = ""    # direct / inferred / assumed / none


@dataclass
class ExtractedRelation:
    source_name: str
    target_name: str
    relation_type: str  # 参见 schemas.fta_schema.RELATION_TYPE_KEYS
    logic_gate: str = ""  # AND / OR / XOR / ...
    confidence: float = 0.8
    evidence: str = ""
    condition: str = ""
    parameters: dict = None


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
                 "device_type": e.device_type, "confidence": e.confidence,
                 "fault_code": e.fault_code, "fault_mode": e.fault_mode,
                 "severity": e.severity, "detection_method": e.detection_method,
                 "parameter_name": e.parameter_name, "parameter_range": e.parameter_range,
                 "maintenance_ref": e.maintenance_ref, "evidence_level": e.evidence_level}
                for e in self.entities
            ],
            "relations": [
                {"source": r.source_name, "target": r.target_name,
                 "type": r.relation_type, "logic_gate": r.logic_gate,
                 "confidence": r.confidence, "evidence": r.evidence,
                 "condition": r.condition, "parameters": r.parameters}
                for r in self.relations
            ],
            "statistics": self.statistics,
            "quality_score": self.quality_score,
        }


# ---------------------------------------------------------------------------
# 抽取器
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """你是工业故障树分析(FTA)领域的知识抽取专家。
你的任务是从工业文档中识别故障事件、设备部件、故障模式、故障代码、监控参数和维修措施，
以及它们之间的因果关系、逻辑门规则、隶属关系和运维关系。
请始终输出有效的JSON格式。"""

EXTRACTION_PROMPT_TEMPLATE = """请从以下工业文档文本中抽取故障树分析(FTA)相关的结构化知识。

【待分析文本】
{text}

【实体类型定义】
- TOP_EVENT: 系统级顶层故障（如"登机梯系统故障"、"液压系统失效"）
- MIDDLE_EVENT: 中间过渡事件（如"回收功能故障"、"压力不足"）
- BASIC_EVENT: 最基本的故障原因/底事件（如"密封圈老化"、"传感器失灵"）
- SYSTEM: 一级功能系统（如"液压系统"、"电气系统"）
- SUBSYSTEM: 二级子系统（如"液压动力单元"）
- DEVICE: 设备/LRU（如"液压泵"、"发动机"）
- COMPONENT: 部件/零件（如"密封圈"、"阀芯"）
- FAULT_MODE: 故障模式（如"内漏"、"卡滞"、"断路"）
- FAULT_CODE: 故障代码（如"HYD-2101"）
- PARAMETER: 监控参数（如"液压压力"、"温度"）
- MAINTENANCE_ACTION: 维修措施（如"更换密封圈"、"校准传感器"）

【关系类型定义】
- CAUSES: 因果关系（A导致B）
- AND_GATE: 与门（多原因同时→结果）
- OR_GATE: 或门（任一原因→结果）
- PART_OF: 组成关系（A是B的一部分）
- LOCATED_AT: 位置关系
- HAS_FAULT_MODE: 设备/部件→故障模式
- HAS_FAULT_CODE: 事件→故障代码
- MONITORED_BY: 设备/事件→监控参数
- REPAIRED_BY: 故障→维修措施

【输出格式】(严格JSON)
{{
    "entities": [
        {{
            "name": "实体名称",
            "type": "实体类型(上述之一)",
            "description": "简要描述",
            "device_type": "所属设备类型(可选)",
            "confidence": 0.9,
            "fault_code": "故障代码(若有)",
            "fault_mode": "故障模式(若有)",
            "severity": "严重等级: catastrophic/hazardous/major/minor/no_effect(若能判断)",
            "detection_method": "检测或调查方式(若有)",
            "parameter_name": "监控参数名(若有)",
            "parameter_range": "参数正常范围(若有)",
            "maintenance_ref": "维修手册参考章节(若有)",
            "evidence_level": "证据等级: direct/inferred/assumed"
        }}
    ],
    "relations": [
        {{
            "source": "源实体名称",
            "target": "目标实体名称",
            "type": "关系类型(上述之一)",
            "logic_gate": "逻辑门类型(AND/OR/XOR等,无则空字符串)",
            "confidence": 0.85,
            "evidence": "文本中的支撑证据片段",
            "condition": "触发条件(禁止门/表决门时填写,可选)"
        }}
    ]
}}

注意：
- 只输出JSON，不要有其他内容
- 尽可能填写工业扩展字段(fault_code, severity, detection_method等)，文本中未提及的字段留空字符串
- evidence_level: 文本明确描述=direct, 可推断=inferred, 仅假设=assumed"""


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
                fault_code=e.get("fault_code", "") or "",
                fault_mode=e.get("fault_mode", "") or "",
                severity=e.get("severity", "") or "",
                detection_method=e.get("detection_method", "") or "",
                parameter_name=e.get("parameter_name", "") or "",
                parameter_range=e.get("parameter_range", "") or "",
                maintenance_ref=e.get("maintenance_ref", "") or "",
                evidence_level=e.get("evidence_level", "") or "",
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
                condition=r.get("condition", "") or "",
                parameters=r.get("parameters"),
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
