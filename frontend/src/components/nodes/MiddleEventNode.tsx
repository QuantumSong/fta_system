import React, { useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface MiddleEventNodeProps {
  data: {
    label: string
    description?: string
    probability?: number
    onLabelChange?: (label: string) => void
    nodeWidth?: number
    nodeHeight?: number
    onSizeChange?: (w: number, h: number) => void
    evidenceLevel?: string
  }
  selected?: boolean
}

const DEF_W = 130
const DEF_H = 48

const MiddleEventNode: React.FC<MiddleEventNodeProps> = ({ data, selected }) => {
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
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF_W} height={data.nodeHeight || DEF_H} minWidth={80} minHeight={36} onSizeChange={data.onSizeChange} evidenceLevel={data.evidenceLevel}>
      {({ width, height }) => (
        <div
          className="fta-node fta-node-middle"
          style={{ width, height, boxShadow: selected ? '0 0 0 2px #1890ff' : undefined, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onDoubleClick={handleDoubleClick}
        >
          <Handle type="target" position={Position.Top} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ExclamationCircleOutlined />
            {editing ? (
              <input
                ref={inputRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="fta-node-input"
              />
            ) : (
              <span>{data.label}</span>
            )}
          </div>
          {data.probability !== undefined && (
            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
              P = {data.probability.toExponential(2)}
            </div>
          )}
          <Handle type="source" position={Position.Bottom} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default MiddleEventNode
