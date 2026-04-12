"""
逻辑校验器
"""
from typing import List, Dict, Any
from dataclasses import dataclass
from enum import Enum


class IssueSeverity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


class IssueType(Enum):
    STRUCTURE = "STRUCTURE"
    LOGIC = "LOGIC"
    DATA = "DATA"


@dataclass
class Issue:
    type: IssueType
    severity: IssueSeverity
    message: str
    node_ids: List[str] = None

    def __post_init__(self):
        if self.node_ids is None:
            self.node_ids = []


@dataclass
class Suggestion:
    type: str
    description: str
    reason: str
    confidence: float


@dataclass
class ValidationResult:
    is_valid: bool
    issues: List[Issue]
    suggestions: List[Suggestion]


class LogicValidator:
    """逻辑校验器"""

    async def validate(self, structure: Dict[str, Any]) -> ValidationResult:
        """校验故障树结构"""
        issues = []

        issues.extend(self._validate_structure(structure))
        issues.extend(self._validate_logic(structure))
        issues.extend(self._validate_data(structure))

        suggestions = self._generate_suggestions(structure, issues)

        is_valid = not any(i.severity == IssueSeverity.ERROR for i in issues)

        return ValidationResult(is_valid=is_valid, issues=issues, suggestions=suggestions)

    def _validate_structure(self, structure: Dict[str, Any]) -> List[Issue]:
        issues = []
        nodes = structure.get("nodes", [])
        links = structure.get("links", [])

        if not nodes:
            issues.append(Issue(
                type=IssueType.STRUCTURE,
                severity=IssueSeverity.ERROR,
                message="故障树为空，没有节点",
            ))
            return issues

        top_events = [n for n in nodes if n.get("type") == "topEvent"]
        if len(top_events) == 0:
            issues.append(Issue(
                type=IssueType.STRUCTURE,
                severity=IssueSeverity.ERROR,
                message="缺少顶事件",
            ))
        elif len(top_events) > 1:
            issues.append(Issue(
                type=IssueType.STRUCTURE,
                severity=IssueSeverity.WARNING,
                message="存在多个顶事件",
                node_ids=[n.get("id") for n in top_events],
            ))

        connected_ids = set()
        for link in links:
            connected_ids.add(link.get("source"))
            connected_ids.add(link.get("target"))

        for node in nodes:
            if node.get("type") != "topEvent" and node.get("id") not in connected_ids:
                issues.append(Issue(
                    type=IssueType.STRUCTURE,
                    severity=IssueSeverity.WARNING,
                    message=f"节点 '{node.get('data', {}).get('label', node.get('name', ''))}' 是孤立节点",
                    node_ids=[node.get("id")],
                ))

        return issues

    def _validate_logic(self, structure: Dict[str, Any]) -> List[Issue]:
        issues = []
        nodes = structure.get("nodes", [])
        links = structure.get("links", [])

        graph = {}
        for link in links:
            source = link.get("source")
            target = link.get("target")
            if source not in graph:
                graph[source] = []
            graph[source].append(target)

        cycles = self._detect_cycles(graph, nodes)
        for cycle in cycles:
            issues.append(Issue(
                type=IssueType.LOGIC,
                severity=IssueSeverity.ERROR,
                message=f"检测到循环引用: {' -> '.join(cycle)}",
                node_ids=cycle,
            ))

        gate_nodes = [n for n in nodes if n.get("type") in ["andGate", "orGate"]]
        for gate in gate_nodes:
            gate_id = gate.get("id")
            inputs = [l for l in links if l.get("source") == gate_id]
            if len(inputs) < 2:
                gate_label = gate.get("data", {}).get("label", gate.get("name", gate_id))
                issues.append(Issue(
                    type=IssueType.LOGIC,
                    severity=IssueSeverity.WARNING,
                    message=f"逻辑门 '{gate_label}' 输出不足（至少需要2个子节点）",
                    node_ids=[gate_id],
                ))

        return issues

    def _validate_data(self, structure: Dict[str, Any]) -> List[Issue]:
        issues = []
        nodes = structure.get("nodes", [])

        for node in nodes:
            data = node.get("data", {})
            probability = data.get("probability", node.get("probability"))
            if probability is not None:
                if probability < 0 or probability > 1:
                    label = data.get("label", node.get("name", ""))
                    issues.append(Issue(
                        type=IssueType.DATA,
                        severity=IssueSeverity.ERROR,
                        message=f"节点 '{label}' 的概率值无效（应在0-1之间）",
                        node_ids=[node.get("id")],
                    ))

            label = data.get("label", node.get("name", ""))
            if not label or len(str(label).strip()) == 0:
                issues.append(Issue(
                    type=IssueType.DATA,
                    severity=IssueSeverity.WARNING,
                    message="存在未命名的节点",
                    node_ids=[node.get("id")],
                ))

        return issues

    def _detect_cycles(self, graph: Dict[str, List[str]], nodes: List[Dict]) -> List[List[str]]:
        cycles = []
        visited = set()
        rec_stack = set()

        def dfs(node_id, path):
            visited.add(node_id)
            rec_stack.add(node_id)
            path.append(node_id)

            for neighbor in graph.get(node_id, []):
                if neighbor not in visited:
                    dfs(neighbor, path)
                elif neighbor in rec_stack:
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    cycles.append(cycle)

            path.pop()
            rec_stack.remove(node_id)

        for node in nodes:
            node_id = node.get("id")
            if node_id not in visited:
                dfs(node_id, [])

        return cycles

    def _generate_suggestions(self, structure: Dict[str, Any], issues: List[Issue]) -> List[Suggestion]:
        suggestions = []

        for issue in issues:
            if issue.type == IssueType.STRUCTURE and "孤立节点" in issue.message:
                suggestions.append(Suggestion(
                    type="CONNECT_NODE",
                    description="建议将孤立节点连接到故障树中",
                    reason="孤立节点无法参与故障分析",
                    confidence=0.9,
                ))
            elif issue.type == IssueType.LOGIC and "循环引用" in issue.message:
                suggestions.append(Suggestion(
                    type="BREAK_CYCLE",
                    description="建议打破循环引用",
                    reason="循环引用会导致逻辑错误",
                    confidence=1.0,
                ))

        nodes = structure.get("nodes", [])
        basic_events = [n for n in nodes if n.get("type") == "basicEvent"]

        if len(basic_events) < 3 and len(nodes) > 0:
            suggestions.append(Suggestion(
                type="ADD_BASIC_EVENTS",
                description="建议添加更多底事件",
                reason="底事件数量较少，可能导致故障分析不全面",
                confidence=0.7,
            ))

        return suggestions
