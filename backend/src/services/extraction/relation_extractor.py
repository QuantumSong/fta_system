"""
关系抽取器
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import json
import re
from typing import List, Dict, Any
from dataclasses import dataclass

from core.llm import LLMClient
from services.extraction.entity_recognizer import FTAEntity


@dataclass
class FTARelation:
    """FTA关系"""
    source: FTAEntity
    target: FTAEntity
    relation_type: str
    confidence: float = 0.0
    evidence: str = ""


class RelationExtractor:
    """关系抽取器"""
    
    # 关系类型定义
    RELATION_TYPES = {
        "CAUSES": {
            "description": "因果关系，前因导致后果",
            "keywords": ["导致", "引起", "造成", "引发", "使"]
        },
        "PART_OF": {
            "description": "组成部分关系",
            "keywords": ["包含", "由...组成", "包括", "有"]
        },
        "LOCATED_AT": {
            "description": "位置关系",
            "keywords": ["位于", "在...上", "在...内"]
        }
    }
    
    def __init__(self, llm_client: LLMClient = None):
        self.llm = llm_client or LLMClient()
    
    async def extract(
        self,
        text: str,
        entities: List[FTAEntity]
    ) -> List[FTARelation]:
        """
        抽取实体间关系
        
        Args:
            text: 待分析文本
            entities: 已识别的实体列表
            
        Returns:
            抽取的关系列表
        """
        if len(entities) < 2:
            return []
        
        # 基于规则的预抽取
        rule_based_relations = self._rule_based_extract(text, entities)
        
        # 基于LLM的抽取
        llm_based_relations = await self._llm_based_extract(text, entities)
        
        # 合并结果
        all_relations = rule_based_relations + llm_based_relations
        
        # 去重
        unique_relations = self._deduplicate_relations(all_relations)
        
        return unique_relations
    
    def _rule_based_extract(
        self,
        text: str,
        entities: List[FTAEntity]
    ) -> List[FTARelation]:
        """基于规则的关系抽取"""
        relations = []
        
        # 构建实体位置映射
        entity_positions = {}
        for entity in entities:
            entity_positions[entity.start] = entity
        
        # 基于关键词匹配
        for rel_type, config in self.RELATION_TYPES.items():
            for keyword in config['keywords']:
                for match in re.finditer(keyword, text):
                    # 查找附近的实体
                    nearby_entities = self._find_nearby_entities(
                        match.start(),
                        entities,
                        window=50
                    )
                    
                    if len(nearby_entities) >= 2:
                        relations.append(FTARelation(
                            source=nearby_entities[0],
                            target=nearby_entities[1],
                            relation_type=rel_type,
                            confidence=0.6,
                            evidence=text[max(0, match.start()-20):match.end()+20]
                        ))
        
        return relations
    
    async def _llm_based_extract(
        self,
        text: str,
        entities: List[FTAEntity]
    ) -> List[FTARelation]:
        """基于LLM的关系抽取"""
        prompt = self._build_prompt(text, entities)
        
        response = await self.llm.generate(prompt, temperature=0.1)
        
        return self._parse_response(response, entities)
    
    def _build_prompt(self, text: str, entities: List[FTAEntity]) -> str:
        """构建关系抽取Prompt"""
        entities_info = [
            {"name": e.name, "type": e.type}
            for e in entities
        ]
        
        return f"""请分析以下文本中故障事件之间的关系。

已知实体列表：
{json.dumps(entities_info, ensure_ascii=False, indent=2)}

关系类型定义：
{json.dumps(self.RELATION_TYPES, ensure_ascii=False, indent=2)}

待分析文本：
{text}

请按以下JSON格式输出关系：
{{
    "relations": [
        {{
            "source": "源实体名称",
            "target": "目标实体名称",
            "relation_type": "关系类型",
            "confidence": 置信度(0-1),
            "evidence": "文本证据"
        }}
    ]
}}

注意：
1. 只输出JSON格式
2. source和target必须是已知实体列表中的名称
3. relation_type必须是定义的类型之一
"""
    
    def _parse_response(
        self,
        response: str,
        entities: List[FTAEntity]
    ) -> List[FTARelation]:
        """解析LLM响应"""
        relations = []
        
        try:
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                data = json.loads(json_match.group())
                
                # 构建实体名称映射
                entity_map = {e.name: e for e in entities}
                
                for r in data.get("relations", []):
                    source_name = r.get("source")
                    target_name = r.get("target")
                    
                    if source_name in entity_map and target_name in entity_map:
                        relations.append(FTARelation(
                            source=entity_map[source_name],
                            target=entity_map[target_name],
                            relation_type=r.get("relation_type", "CAUSES"),
                            confidence=r.get("confidence", 0.7),
                            evidence=r.get("evidence", "")
                        ))
        except json.JSONDecodeError as e:
            print(f"JSON解析失败: {e}")
        
        return relations
    
    def _find_nearby_entities(
        self,
        position: int,
        entities: List[FTAEntity],
        window: int = 50
    ) -> List[FTAEntity]:
        """查找位置附近的实体"""
        nearby = []
        for entity in entities:
            if abs(entity.start - position) <= window:
                nearby.append(entity)
        
        # 按距离排序
        nearby.sort(key=lambda e: abs(e.start - position))
        return nearby
    
    def _deduplicate_relations(self, relations: List[FTARelation]) -> List[FTARelation]:
        """关系去重"""
        seen = set()
        unique = []
        
        for rel in relations:
            key = (rel.source.id, rel.target.id, rel.relation_type)
            if key not in seen:
                seen.add(key)
                unique.append(rel)
        
        return unique
