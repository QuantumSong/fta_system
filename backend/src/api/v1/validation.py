"""
领域化逻辑校验 API — 校验 / 规则查询 / 忽略 / AI 自动修复
"""
import json
import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Set

from services.validation.validator import (
    LogicValidator, DEFAULT_RULES, DEVICE_RULE_PACKS,
)
from models.models import User
from core.auth import get_current_user
from core.llm import llm_client

router = APIRouter()


# ===================== Request / Response Models =====================

class ValidationRequest(BaseModel):
    structure: Dict[str, Any]
    device_type: Optional[str] = None
    rule_config: Optional[Dict[str, Dict[str, Any]]] = None
    ignored_issues: Optional[List[str]] = None   # ["rule_id", "rule_id::node_id"]


class AutoFixRequest(BaseModel):
    structure: Dict[str, Any]
    issue_indices: List[int] = []     # 要修复的 issue 序号（空=全部 auto_fixable）
    device_type: Optional[str] = None
    rule_config: Optional[Dict[str, Dict[str, Any]]] = None
    ignored_issues: Optional[List[str]] = None


# ===================== 校验端点 =====================

@router.post("/")
async def validate_structure(request: ValidationRequest, user: User = Depends(get_current_user)):
    """校验故障树结构（支持设备类型规则包、规则配置、忽略列表）"""
    try:
        validator = LogicValidator(
            rule_config=request.rule_config,
            device_type=request.device_type,
            ignored_issues=set(request.ignored_issues) if request.ignored_issues else None,
        )
        result = await validator.validate(request.structure)

        return {
            "is_valid": result.is_valid,
            "quality_score": result.quality_score,
            "score_breakdown": result.score_breakdown,
            "issues": [
                {
                    "type": issue.type.value,
                    "severity": issue.severity.value,
                    "message": issue.message,
                    "node_ids": issue.node_ids,
                    "edge_ids": issue.edge_ids,
                    "rule_id": issue.rule_id,
                    "category": issue.category,
                    "targets": [
                        {"kind": t.kind.value, "id": t.id, "label": t.label}
                        for t in issue.targets
                    ],
                    "fix_actions": [
                        {
                            "action": fa.action,
                            "description": fa.description,
                            "auto_fixable": fa.auto_fixable,
                            "params": fa.params,
                        }
                        for fa in issue.fix_actions
                    ],
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


# ===================== 规则查询端点 =====================

@router.get("/rules")
async def get_rules(
    device_type: Optional[str] = None,
    user: User = Depends(get_current_user),
):
    """获取所有可用校验规则（含设备专属包）"""
    rules = {k: dict(v) for k, v in DEFAULT_RULES.items()}
    if device_type and device_type in DEVICE_RULE_PACKS:
        for drule in DEVICE_RULE_PACKS[device_type]:
            rules[drule["rule_id"]] = {
                k: v for k, v in drule.items() if k != "check"
            }
    return {
        "rules": rules,
        "device_types": list(DEVICE_RULE_PACKS.keys()),
    }


# ===================== AI 自动修复端点 =====================

_FIX_SYSTEM_PROMPT = """你是一名工业故障树分析（FTA）专家。
用户会给你一棵故障树的 JSON 结构和校验器发现的问题列表。
你需要输出修复后的完整故障树 JSON（nodes + links），只返回 JSON，不要解释。

修复原则：
1. 保留现有正确节点和边，仅做最小改动
2. 新增节点 id 格式: "fix-<序号>"
3. 节点 data 字段需包含 label、probability（事件节点）及工业字段（fault_code, fault_mode, severity 等）
4. 边只需 source 和 target
5. 不要修改未涉及的节点"""


@router.post("/auto-fix")
async def auto_fix(request: AutoFixRequest, user: User = Depends(get_current_user)):
    """AI 自动修复校验发现的问题"""
    try:
        # 1) 先校验
        validator = LogicValidator(
            rule_config=request.rule_config,
            device_type=request.device_type,
            ignored_issues=set(request.ignored_issues) if request.ignored_issues else None,
        )
        result = await validator.validate(request.structure)

        # 2) 筛选要修复的 issue（只取 auto_fixable 的）
        fixable_issues = []
        for idx, iss in enumerate(result.issues):
            if request.issue_indices and idx not in request.issue_indices:
                continue
            has_auto = any(fa.auto_fixable for fa in iss.fix_actions)
            if has_auto:
                fixable_issues.append({
                    "rule_id": iss.rule_id,
                    "message": iss.message,
                    "node_ids": iss.node_ids,
                    "edge_ids": iss.edge_ids,
                    "fix_actions": [
                        {"action": fa.action, "description": fa.description, "params": fa.params}
                        for fa in iss.fix_actions if fa.auto_fixable
                    ],
                })

        if not fixable_issues:
            return {"fixed": False, "reason": "没有可自动修复的问题", "structure": request.structure}

        # 3) 构建 LLM prompt
        user_prompt = (
            f"当前故障树结构:\n```json\n{json.dumps(request.structure, ensure_ascii=False, indent=2)}\n```\n\n"
            f"校验器发现以下可修复问题:\n```json\n{json.dumps(fixable_issues, ensure_ascii=False, indent=2)}\n```\n\n"
            "请输出修复后的完整故障树 JSON（包含 nodes 和 links 两个数组）。"
        )

        text = await llm_client.generate(
            prompt=user_prompt,
            system_prompt=_FIX_SYSTEM_PROMPT,
            temperature=0.2,
        )

        # 4) 解析 LLM 响应
        # 提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', text)
        if not json_match:
            return {"fixed": False, "reason": "AI 返回格式异常", "raw": text[:500]}

        fixed_structure = json.loads(json_match.group())

        # 5) 对修复后的结构再跑一次校验，返回对比
        result_after = await validator.validate(fixed_structure)

        return {
            "fixed": True,
            "structure": fixed_structure,
            "issues_before": len(result.issues),
            "issues_after": len(result_after.issues),
            "score_before": result.quality_score,
            "score_after": result_after.quality_score,
            "fixed_issues": [fi["rule_id"] for fi in fixable_issues],
        }

    except json.JSONDecodeError:
        return {"fixed": False, "reason": "AI 返回的 JSON 解析失败"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"自动修复失败: {str(e)}")
