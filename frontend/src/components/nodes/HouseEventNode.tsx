import React, { useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface HouseEventNodeProps {
  data: {
    label: string
    description?: string
    onLabelChange?: (label: string) => void
    nodeWidth?: number
    nodeHeight?: number
    onSizeChange?: (w: number, h: number) => void
    evidenceLevel?: string
  }
  selected?: boolean
}

const DEF_W = 70
const DEF_H = 60

const HouseEventNode: React.FC<HouseEventNodeProps> = ({ data, selected }) => {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(data.label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLabel(data.label)
  }, [data.label])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(true)
  }

  const handleBlur = () => {
    setEditing(false)
    if (data.onLabelChange && label !== data.label) {
      data.onLabelChange(label)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleBlur()
    if (e.key === 'Escape') { setLabel(data.label); setEditing(false) }
  }

  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF_W} height={data.nodeHeight || DEF_H} minWidth={50} minHeight={40} onSizeChange={data.onSizeChange} evidenceLevel={data.evidenceLevel}>
      {({ width, height }) => (
        <div
          className="fta-node fta-node-svg-shape"
          style={{
            width, height,
            boxShadow: selected ? '0 0 0 2px #1890ff' : undefined,
            background: '#fff',
            border: 'none',
            color: '#1890ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
          onDoubleClick={handleDoubleClick}
        >
          <Handle type="target" position={Position.Top} />
          <svg width="100%" height="100%" viewBox="0 0 60 50" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
            <polygon points="30,2 58,20 58,48 2,48 2,20" fill="none" stroke="#1890ff" strokeWidth="2" />
          </svg>
          {editing ? (
            <input
              ref={inputRef}
              value={label}
              onChange={(e) => { e.stopPropagation(); setLabel(e.target.value) }}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="fta-node-input"
              style={{ zIndex: 1, color: '#1890ff', maxWidth: width - 20 }}
            />
          ) : (
            <span style={{ zIndex: 1, fontSize: 11, textAlign: 'center', maxWidth: width - 20, marginTop: 8 }}>
              {data.label}
            </span>
          )}
          <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default HouseEventNode
