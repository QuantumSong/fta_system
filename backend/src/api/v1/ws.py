"""
WebSocket路由 - 实时协同编辑
"""
import json
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from config import settings

router = APIRouter()

# 房间管理: project_id -> set of WebSocket connections
rooms: Dict[int, Set[WebSocket]] = {}
# 连接 -> 用户信息
conn_users: Dict[WebSocket, dict] = {}


async def _authenticate_ws(websocket: WebSocket) -> dict | None:
    """从 query param 中读取 token 并验证"""
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return {"user_id": user_id}
    except JWTError:
        return None


async def _broadcast(project_id: int, message: dict, exclude: WebSocket = None):
    """向同房间所有连接广播消息"""
    if project_id not in rooms:
        return
    dead = set()
    for ws in rooms[project_id]:
        if ws is exclude:
            continue
        try:
            await ws.send_json(message)
        except Exception:
            dead.add(ws)
    # 清理断开的连接
    for ws in dead:
        rooms[project_id].discard(ws)
        conn_users.pop(ws, None)


@router.websocket("/ws/collab/{project_id}")
async def collab_websocket(websocket: WebSocket, project_id: int):
    """
    协同编辑 WebSocket 端点。
    客户端连接时带上 ?token=xxx&username=xxx
    消息协议 (JSON):
      客户端 -> 服务器:
        { "type": "tree_update", "tree_id": 1, "structure": {...} }
        { "type": "cursor",      "position": {...} }
      服务器 -> 客户端:
        { "type": "tree_update", "tree_id": 1, "structure": {...}, "from": "username" }
        { "type": "cursor",      "position": {...}, "from": "username" }
        { "type": "user_join",   "username": "xxx", "online_count": N }
        { "type": "user_leave",  "username": "xxx", "online_count": N }
    """
    user_info = await _authenticate_ws(websocket)
    if not user_info:
        await websocket.close(code=4001, reason="未认证")
        return

    username = websocket.query_params.get("username", f"用户{user_info['user_id']}")
    await websocket.accept()

    # 加入房间
    if project_id not in rooms:
        rooms[project_id] = set()
    rooms[project_id].add(websocket)
    conn_users[websocket] = {"user_id": user_info["user_id"], "username": username}

    # 广播用户加入
    await _broadcast(project_id, {
        "type": "user_join",
        "username": username,
        "online_count": len(rooms[project_id]),
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = data.get("type")

            if msg_type == "tree_update":
                # 转发故障树结构更新给其他用户
                await _broadcast(project_id, {
                    "type": "tree_update",
                    "tree_id": data.get("tree_id"),
                    "structure": data.get("structure"),
                    "from": username,
                }, exclude=websocket)

            elif msg_type == "cursor":
                # 转发光标位置
                await _broadcast(project_id, {
                    "type": "cursor",
                    "position": data.get("position"),
                    "from": username,
                }, exclude=websocket)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    finally:
        # 离开房间
        rooms.get(project_id, set()).discard(websocket)
        conn_users.pop(websocket, None)
        online = len(rooms.get(project_id, set()))
        await _broadcast(project_id, {
            "type": "user_leave",
            "username": username,
            "online_count": online,
        })
        if project_id in rooms and not rooms[project_id]:
            del rooms[project_id]
