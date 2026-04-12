"""
逻辑校验API路由
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any

from services.validation.validator import LogicValidator
from models.models import User
from core.auth import get_current_user

router = APIRouter()


class ValidationRequest(BaseModel):
    structure: Dict[str, Any]


@router.post("/")
async def validate_structure(request: ValidationRequest, user: User = Depends(get_current_user)):
    """校验故障树结构"""
    try:
        validator = LogicValidator()
        result = await validator.validate(request.structure)

        return {
            "is_valid": result.is_valid,
            "issues": [
                {
                    "type": issue.type.value,
                    "severity": issue.severity.value,
                    "message": issue.message,
                    "node_ids": issue.node_ids,
                }
                for issue in result.issues
            ],
            "suggestions": [
                {
                    "type": s.type,
                    "description": s.description,
                    "reason": s.reason,
                    "confidence": s.confidence,
                }
                for s in result.suggestions
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"校验失败: {str(e)}")
