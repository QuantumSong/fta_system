"""End-to-end test for auth + collaboration + versioning"""
import urllib.request
import json

base = "http://localhost:8000/api/v1"

def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  ERROR {e.code} on {method} {path}: {err_body}")
        print(f"  Headers sent: Authorization={'Bearer ...' if token else 'None'}")
        raise

# 1. Login as admin
r = api("POST", "/auth/login", body={"username": "admin", "password": "admin123"})
t1 = r["token"]
print(f"1. Login OK: {r['user']['username']} ({r['user']['role']})")

# 2. Create project
r = api("POST", "/projects/", t1, {"name": "Collab Test", "description": "E2E", "device_type": "hydraulic"})
pid = r["id"]
print(f"2. Project created: id={pid}")

# 3. Enable collaboration
r = api("POST", f"/projects/{pid}/collab/enable", t1)
code = r["collab_code"]
print(f"3. Collab enabled: code={code}")

# 4. List projects (admin sees all)
r = api("GET", "/projects/", t1)
p = [x for x in r["projects"] if x["id"] == pid][0]
print(f"4. Projects: count={len(r['projects'])}, collab={p['collab_enabled']}, code={p.get('collab_code')}")

# 5. Register user2
r = api("POST", "/auth/register", body={"username": "user2", "email": "u2@test.com", "password": "123456"})
t2 = r["token"]
print(f"5. User2 registered: {r['user']['username']}")

# 6. User2 joins via code
r = api("POST", "/collab/join", t2, {"code": code})
print(f"6. User2 joined: project={r['project_name']}")

# 7. Check members
r = api("GET", f"/projects/{pid}/collab/members", t1)
names = [m["username"] for m in r["members"]]
print(f"7. Members: {names}")

# 8. Create fault tree
r = api("POST", "/fta/", t1, {
    "name": "Test FTA", "project_id": pid,
    "structure": {"nodes": [{"id": "n1", "type": "topEvent", "position": {"x": 200, "y": 50}, "data": {"label": "Top"}}], "links": []}
})
tid = r["id"]
print(f"8. FaultTree created: id={tid}")

# 9. Update fault tree (creates version history)
r = api("PUT", f"/fta/{tid}", t1, {
    "structure": {
        "nodes": [
            {"id": "n1", "type": "topEvent", "position": {"x": 200, "y": 50}, "data": {"label": "Top Updated"}},
            {"id": "n2", "type": "basicEvent", "position": {"x": 200, "y": 200}, "data": {"label": "Basic"}},
        ],
        "links": [{"id": "e1", "source": "n1", "target": "n2"}],
    }
})
print(f"9. FaultTree updated: version={r['version']}")

# 10. Check version history
r = api("GET", f"/fault-trees/{tid}/versions", t1)
print(f"10. Versions: {len(r['versions'])} entries")
for v in r["versions"]:
    print(f"    v{v['version']}: {v['change_summary']} ({v['node_count']} nodes)")

# 11. User2 can see the project
r = api("GET", "/projects/", t2)
user2_pids = [x["id"] for x in r["projects"]]
assert pid in user2_pids, "User2 should see collab project"
print(f"11. User2 sees {len(r['projects'])} projects (includes collab)")

# 12. Admin list users
r = api("GET", "/auth/users", t1)
# Note: auth endpoints don't need trailing slash since they have unique paths
print(f"12. Admin sees {len(r['users'])} users: {[u['username'] for u in r['users']]}")

print("\nAll E2E tests PASSED!")
