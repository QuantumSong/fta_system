import React, { useCallback, useRef, useState } from 'react'

interface NodeResizeWrapperProps {
  selected?: boolean
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  onSizeChange?: (w: number, h: number) => void
  evidenceLevel?: string
  children: (size: { width: number; height: number }) => React.ReactNode
}

const EVIDENCE_BADGE: Record<string, { bg: string; border: string; icon: string; title: string }> = {
  none: { bg: '#f5f5f5', border: '#d9d9d9', icon: '○', title: '无证据' },
  single: { bg: '#fffbe6', border: '#faad14', icon: '◑', title: '单证据' },
  strong: { bg: '#f6ffed', border: '#52c41a', icon: '●', title: '强证据' },
  multi_doc: { bg: '#e6f7ff', border: '#1890ff', icon: '◉', title: '多文档证据' },
}

type HandlePos = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'

const CURSORS: Record<HandlePos, string> = {
  tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize',
  t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize',
}

const NodeResizeWrapper: React.FC<NodeResizeWrapperProps> = ({
  selected,
  width,
  height,
  minWidth = 50,
  minHeight = 36,
  onSizeChange,
  evidenceLevel,
  children,
}) => {
  const [localW, setLocalW] = useState(width)
  const [localH, setLocalH] = useState(height)
  const dragging = useRef(false)

  React.useEffect(() => {
    if (!dragging.current) {
      setLocalW(width)
      setLocalH(height)
    }
  }, [width, height])

  const sizeRef = useRef({ w: localW, h: localH })
  sizeRef.current = { w: localW, h: localH }

  const onHandlePointerDown = useCallback((e: React.PointerEvent, pos: HandlePos) => {
    // Must use pointer events to intercept before ReactFlow's drag system
    e.stopPropagation()
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startW = sizeRef.current.w
    const startH = sizeRef.current.h

    const onMove = (ev: PointerEvent) => {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      let nw = startW
      let nh = startH

      if (pos === 'r' || pos === 'tr' || pos === 'br') nw = Math.max(minWidth, startW + dx)
      if (pos === 'l' || pos === 'tl' || pos === 'bl') nw = Math.max(minWidth, startW - dx)
      if (pos === 'b' || pos === 'bl' || pos === 'br') nh = Math.max(minHeight, startH + dy)
      if (pos === 't' || pos === 'tl' || pos === 'tr') nh = Math.max(minHeight, startH - dy)

      sizeRef.current = { w: nw, h: nh }
      setLocalW(nw)
      setLocalH(nh)
    }

    const onUp = () => {
      dragging.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      onSizeChange?.(sizeRef.current.w, sizeRef.current.h)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [minWidth, minHeight, onSizeChange])

  // Positions for the 8 handles
  const handles: { pos: HandlePos; style: React.CSSProperties }[] = [
    { pos: 'tl', style: { top: -4, left: -4 } },
    { pos: 'tr', style: { top: -4, right: -4 } },
    { pos: 'bl', style: { bottom: -4, left: -4 } },
    { pos: 'br', style: { bottom: -4, right: -4 } },
    { pos: 't', style: { top: -4, left: '50%', transform: 'translateX(-50%)' } },
    { pos: 'b', style: { bottom: -4, left: '50%', transform: 'translateX(-50%)' } },
    { pos: 'l', style: { top: '50%', left: -4, transform: 'translateY(-50%)' } },
    { pos: 'r', style: { top: '50%', right: -4, transform: 'translateY(-50%)' } },
  ]

  const badge = evidenceLevel ? EVIDENCE_BADGE[evidenceLevel] : null

  return (
    <div style={{ position: 'relative', width: localW, height: localH }}>
      {children({ width: localW, height: localH })}
      {badge && (
        <div
          title={badge.title}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: badge.bg,
            border: `1.5px solid ${badge.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            lineHeight: 1,
            color: badge.border,
            zIndex: 10,
            pointerEvents: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
          }}
        >
          {badge.icon}
        </div>
      )}
      {selected && handles.map(h => (
        <div
          key={h.pos}
          onPointerDown={(e) => onHandlePointerDown(e, h.pos)}
          className="fta-resize-handle"
          style={{
            ...h.style,
            cursor: CURSORS[h.pos],
          }}
        />
      ))}
    </div>
  )
}

export default NodeResizeWrapper
