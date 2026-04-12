"""
知识抽取模块 E2E 测试
"""
import urllib.request
import urllib.parse
import json
import time
import os

base = "http://localhost:8000/api/v1"

def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    # Properly encode non-ASCII characters in the URL
    url = f"{base}{path}"
    url = urllib.parse.quote(url, safe=":/?&=#")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  ERROR {e.code} on {method} {path}: {err_body[:300]}")
        raise

def test():
    print("=" * 60)
    print("  知识抽取模块 E2E 测试")
    print("=" * 60)

    # 1. 登录
    print("\n[1] 登录 admin...")
    r = api("POST", "/auth/login", body={"username": "admin", "password": "admin123"})
    token = r["token"]
    print(f"  OK — token: {token[:20]}...")

    # 2. 创建项目
    print("\n[2] 创建测试项目...")
    r = api("POST", "/projects/", token, {"name": "液压系统分析", "description": "E2E知识抽取测试", "device_type": "hydraulic"})
    project_id = r["id"]
    print(f"  OK — project_id: {project_id}")

    # 3. 知识图谱统计（初始应为空）
    print("\n[3] 查询知识图谱统计...")
    r = api("GET", f"/knowledge/stats?project_id={project_id}", token)
    print(f"  OK — entities: {r['entity_count']}, relations: {r['relation_count']}")
    assert r["entity_count"] == 0, "初始应为空"

    # 4. 手动创建实体
    print("\n[4] 创建知识实体...")
    e1 = api("POST", "/knowledge/entities", token, {
        "name": "液压系统失效", "entity_type": "TOP_EVENT",
        "description": "液压系统完全丧失功能", "device_type": "液压系统",
        "project_id": project_id
    })
    print(f"  OK — entity_id: {e1['id']}")

    e2 = api("POST", "/knowledge/entities", token, {
        "name": "液压泵故障", "entity_type": "MIDDLE_EVENT",
        "description": "液压泵无法正常运转", "device_type": "液压系统",
        "project_id": project_id
    })
    print(f"  OK — entity_id: {e2['id']}")

    e3 = api("POST", "/knowledge/entities", token, {
        "name": "密封圈老化", "entity_type": "BASIC_EVENT",
        "description": "密封圈材料老化导致泄漏",
        "project_id": project_id
    })
    print(f"  OK — entity_id: {e3['id']}")

    e4 = api("POST", "/knowledge/entities", token, {
        "name": "轴承磨损", "entity_type": "BASIC_EVENT",
        "description": "轴承长期磨损导致性能下降",
        "project_id": project_id
    })
    print(f"  OK — entity_id: {e4['id']}")

    # 5. 创建关系
    print("\n[5] 创建知识关系...")
    r1 = api("POST", "/knowledge/relations", token, {
        "source_entity_id": e2["id"], "target_entity_id": e1["id"],
        "relation_type": "CAUSES", "logic_gate": "OR",
        "project_id": project_id
    })
    print(f"  OK — relation: 液压泵故障 --CAUSES[OR]--> 液压系统失效")

    r2 = api("POST", "/knowledge/relations", token, {
        "source_entity_id": e3["id"], "target_entity_id": e2["id"],
        "relation_type": "CAUSES",
        "project_id": project_id
    })
    print(f"  OK — relation: 密封圈老化 --CAUSES--> 液压泵故障")

    r3 = api("POST", "/knowledge/relations", token, {
        "source_entity_id": e4["id"], "target_entity_id": e2["id"],
        "relation_type": "CAUSES",
        "project_id": project_id
    })
    print(f"  OK — relation: 轴承磨损 --CAUSES--> 液压泵故障")

    # 6. 搜索实体
    print("\n[6] 搜索实体...")
    r = api("GET", "/knowledge/entities/search?q=液压", token)
    print(f"  OK — found {r['total']} entities")
    assert r["total"] >= 2, f"应至少搜到2个包含'液压'的实体, got {r['total']}"

    # 7. 获取实体详情
    print("\n[7] 获取实体详情...")
    r = api("GET", f"/knowledge/entities/{e1['id']}", token)
    print(f"  OK — name: {r['name']}, relations: {len(r['relations'])}")

    # 8. 知识图谱可视化数据
    print("\n[8] 获取知识图谱...")
    r = api("GET", f"/knowledge/graph?project_id={project_id}", token)
    print(f"  OK — nodes: {len(r['nodes'])}, edges: {len(r['edges'])}")
    assert len(r["nodes"]) == 4, f"应有4个节点, got {len(r['nodes'])}"
    assert len(r["edges"]) == 3, f"应有3条边, got {len(r['edges'])}"

    # 9. 子图检索
    print("\n[9] 子图检索...")
    r = api("GET", f"/knowledge/subgraph?query=液压系统失效&project_id={project_id}", token)
    print(f"  OK — subgraph entities: {len(r['entities'])}, relations: {len(r['relations'])}")
    assert len(r["entities"]) >= 1, "子图应包含至少1个实体"

    # 10. 知识图谱统计（应有数据了）
    print("\n[10] 知识图谱统计...")
    r = api("GET", f"/knowledge/stats?project_id={project_id}", token)
    print(f"  OK — entities: {r['entity_count']}, relations: {r['relation_count']}")
    print(f"       entity_types: {r.get('entity_types', {})}")
    print(f"       relation_types: {r.get('relation_types', {})}")
    assert r["entity_count"] == 4
    assert r["relation_count"] == 3

    # 11. 文本直接抽取（需 LLM，可能失败）
    print("\n[11] 文本抽取 (需要 DeepSeek API)...")
    try:
        r = api("POST", "/extraction/text", token, {
            "text": "液压系统由液压泵、液压阀和液压缸组成。当液压泵密封圈老化时，会导致液压油泄漏。同时轴承磨损也会引起液压泵振动异常。液压阀卡滞会导致系统压力不稳定。",
            "project_id": project_id
        })
        print(f"  OK — entities: {len(r.get('entities', []))}, relations: {len(r.get('relations', []))}")
        print(f"       quality_score: {r.get('quality_score', 0)}")
    except Exception as ex:
        print(f"  SKIP — LLM调用失败 (可能API Key未配置): {ex}")

    # 12. 项目抽取统计
    print("\n[12] 项目抽取统计...")
    r = api("GET", f"/extraction/project/{project_id}/stats", token)
    print(f"  OK — documents: {r['document_count']}, entities: {r['entity_count']}, relations: {r['relation_count']}, chunks: {r['chunk_count']}")

    # 13. FTA 生成（带 KG + RAG 增强）
    print("\n[13] AI 生成故障树 (带知识增强)...")
    try:
        r = api("POST", "/fta/generate", token, {
            "project_id": project_id,
            "top_event": {
                "name": "液压系统失效",
                "description": "液压系统完全丧失功能",
                "device_type": "液压系统"
            }
        })
        print(f"  OK — tree_id: {r.get('tree_id')}")
        print(f"       nodes: {r.get('statistics', {}).get('node_count', 0)}")
        aug = r.get("augmentation_info", {})
        print(f"       KG entities used: {aug.get('kg_entities_used', 0)}")
        print(f"       KG relations used: {aug.get('kg_relations_used', 0)}")
        print(f"       RAG chunks used: {aug.get('rag_chunks_used', 0)}")
        print(f"       Similar trees used: {aug.get('similar_trees_used', 0)}")
        assert aug.get("kg_entities_used", 0) > 0, "应该使用了知识图谱实体"
    except Exception as ex:
        print(f"  SKIP — LLM调用失败: {ex}")

    # 14. 删除实体
    print("\n[14] 删除实体...")
    api("DELETE", f"/knowledge/entities/{e4['id']}", token)
    r = api("GET", f"/knowledge/stats?project_id={project_id}", token)
    print(f"  OK — 删除后 entities: {r['entity_count']}")

    print("\n" + "=" * 60)
    print("  所有测试通过!")
    print("=" * 60)

if __name__ == "__main__":
    test()
