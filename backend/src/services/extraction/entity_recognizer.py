"""
实体识别器
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import json
import re
from typing import List, Dict, Any
from dataclasses import dataclass

from core.llm import LLMClient


@dataclass
class FTAEntity:
    """FTA实体"""
    id: str
    type: str
    name: str
    start: int = 0
    end: int = 0
    confidence: float = 0.0
    attributes: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.attributes is None:
            self.attributes = {}
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FTAEntity":
        """从字典创建实体"""
        return cls(
            id=data.get("id", ""),
            type=data.get("type", ""),
            name=data.get("name", ""),
            start=data.get("start", 0),
            end=data.get("end", 0),
            confidence=data.get("confidence", 0.0),
            attributes=data.get("attributes", {})
        )


class EntityRecognizer:
    """实体识别器"""
    
    # 实体类型定义
    ENTITY_SCHEMA = {
        "TOP_EVENT": {
            "description": "顶事件，系统最顶层的故障",
            "examples": ["登机梯故障", "发动机失效", "液压系统故障"]
        },
        "MIDDLE_EVENT": {
            "description": "中间事件，导致顶事件的过渡原因",
            "examples": ["回收故障", "释放故障", "压力不足"]
        },
        "BASIC_EVENT": {
            "description": "底事件，最基本的故障原因",
            "examples": ["梯子机械锁故障", "气路压力不足", "液压泵损坏"]
        },
        "DEVICE": {
            "description": "设备",
            "examples": ["登机梯", "液压系统", "发动机"]
        },
        "COMPONENT": {
            "description": "部件",
            "examples": ["机械锁", "液压泵", "传感器"]
        }
    }
    
    def __init__(self, llm_client: LLMClient = None):
        self.llm = llm_client or LLMClient()
    
    async def recognize(self, text: str, context: Dict[str, Any] = None) -> List[FTAEntity]:
        """
        识别文本中的FTA实体
        
        Args:
            text: 待识别文本
            context: 上下文信息
            
        Returns:
            识别出的实体列表
        """
        prompt = self._build_prompt(text, context)
        
        response = await self.llm.generate(
            prompt,
            temperature=0.1,
            max_tokens=2000
        )
        
        entities = self._parse_response(response)
        
        # 过滤低置信度实体
        entities = [e for e in entities if e.confidence > 0.6]
        
        return entities
    
    def _build_prompt(self, text: str, context: Dict[str, Any]) -> str:
        """构建实体识别Prompt"""
        context_str = json.dumps(context, ensure_ascii=False) if context else "无"
        
        return f"""你是工业故障树分析(FTA)领域的专家。请从以下文本中识别故障事件实体。

实体类型定义：
{json.dumps(self.ENTITY_SCHEMA, ensure_ascii=False, indent=2)}

待分析文本：
{text}

上下文信息：
{context_str}

请按以下JSON格式输出识别结果：
{{
    "entities": [
        {{
            "id": "唯一标识",
            "type": "实体类型",
            "name": "实体名称",
            "start": 起始位置,
            "end": 结束位置,
            "confidence": 置信度(0-1),
            "attributes": {{
                "description": "描述",
                "device_type": "设备类型",
                "component": "所属部件"
            }}
        }}
    ]
}}

注意：
1. 只输出JSON，不要有其他内容
2. 确保每个实体都有明确的类型和名称
3. confidence值反映识别置信度
"""
    
    def _parse_response(self, response: str) -> List[FTAEntity]:
        """解析LLM响应"""
        try:
            # 提取JSON块
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                data = json.loads(json_match.group())
                entities_data = data.get("entities", [])
                return [FTAEntity.from_dict(e) for e in entities_data]
        except json.JSONDecodeError as e:
            print(f"JSON解析失败: {e}")
        
        return []
