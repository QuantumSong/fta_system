import React, { useCallback, useRef, useState } from 'react'

interface NodeResizeWrapperProps {
  selected?: boolean
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  onSizeChange?: (w: number, h: number) => void
  children: (size: { width: number; height: number }) => React.ReactNode
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

  return (
    <div style={{ position: 'relative', width: localW, height: localH }}>
      {children({ width: localW, height: localH })}
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
