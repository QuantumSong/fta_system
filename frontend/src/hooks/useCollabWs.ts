import { useEffect, useRef, useCallback, useState } from 'react'

interface CollabMessage {
  type: string
  tree_id?: number
  structure?: any
  position?: any
  from?: string
  username?: string
  online_count?: number
}

interface UseCollabWsOptions {
  projectId: number | null
  token: string | null
  username: string
  onTreeUpdate?: (msg: CollabMessage) => void
  onUserJoin?: (msg: CollabMessage) => void
  onUserLeave?: (msg: CollabMessage) => void
}

export default function useCollabWs({
  projectId,
  token,
  username,
  onTreeUpdate,
  onUserJoin,
  onUserLeave,
}: UseCollabWsOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const [onlineCount, setOnlineCount] = useState(0)
  const [connected, setConnected] = useState(false)

  // Store callbacks and username in refs so connect() doesn't depend on them
  const onTreeUpdateRef = useRef(onTreeUpdate)
  const onUserJoinRef = useRef(onUserJoin)
  const onUserLeaveRef = useRef(onUserLeave)
  const usernameRef = useRef(username)
  onTreeUpdateRef.current = onTreeUpdate
  onUserJoinRef.current = onUserJoin
  onUserLeaveRef.current = onUserLeave
  usernameRef.current = username

  // Flag to prevent onclose from reconnecting during intentional cleanup
  const intentionalCloseRef = useRef(false)
  // Track which room we're connected to, to avoid redundant reconnects
  const connectedRoomRef = useRef<string | null>(null)

  const connect = useCallback(() => {
    if (!projectId || !token) return

    const roomKey = `${projectId}::${token}`

    // Skip if already connected to same room
    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      connectedRoomRef.current === roomKey
    ) {
      return
    }

    // Close existing connection first
    if (wsRef.current) {
      intentionalCloseRef.current = true
      wsRef.current.close()
      wsRef.current = null
    }

    intentionalCloseRef.current = false
    connectedRoomRef.current = roomKey

    // Build ws url relative to current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/collab/${projectId}?token=${token}&username=${encodeURIComponent(usernameRef.current)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg: CollabMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'tree_update':
            onTreeUpdateRef.current?.(msg)
            break
          case 'user_join':
            setOnlineCount(msg.online_count || 0)
            onUserJoinRef.current?.(msg)
            break
          case 'user_leave':
            setOnlineCount(msg.online_count || 0)
            onUserLeaveRef.current?.(msg)
            break
          case 'pong':
            break
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      connectedRoomRef.current = null
      // Only auto-reconnect if the close was NOT intentional
      if (!intentionalCloseRef.current) {
        reconnectTimer.current = setTimeout(() => {
          connect()
        }, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [projectId, token])

  useEffect(() => {
    connect()
    return () => {
      // Mark as intentional close so onclose won't schedule reconnect
      intentionalCloseRef.current = true
      connectedRoomRef.current = null
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // Ping every 30s to keep alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const sendTreeUpdate = useCallback((treeId: number, structure: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'tree_update',
        tree_id: treeId,
        structure,
      }))
    }
  }, [])

  return { connected, onlineCount, sendTreeUpdate }
}
