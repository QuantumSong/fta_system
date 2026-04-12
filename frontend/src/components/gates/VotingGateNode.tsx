import React, { useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface VotingGateNodeProps {
  data: {
    label?: string
    k?: number
    n?: number
    onLabelChange?: (label: string) => void
    nodeWidth?: number
    nodeHeight?: number
    onSizeChange?: (w: number, h: number) => void
  }
  selected?: boolean
}

const DEF = 50

const VotingGateNode: React.FC<VotingGateNodeProps> = ({ data, selected }) => {
  const k = data.k || 2
  const n = data.n || 3
  const [editing, setEditing] = useState(false)
  const [editK, setEditK] = useState(String(k))
  const [editN, setEditN] = useState(String(n))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(true)
  }

  const handleBlur = () => {
    setEditing(false)
    const newK = parseInt(editK) || 2
    const newN = parseInt(editN) || 3
    if (data.onLabelChange) {
      data.onLabelChange(`${newK}/${newN}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleBlur()
    if (e.key === 'Escape') { setEditK(String(k)); setEditN(String(n)); setEditing(false) }
  }

  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF} height={data.nodeHeight || DEF} minWidth={36} minHeight={36} onSizeChange={data.onSizeChange}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #fa8c16)' : undefined }}
          onDoubleClick={handleDoubleClick}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
            <path d="M5,30 L5,10 Q5,2 13,2 L37,2 Q45,2 45,10 L45,30 Q45,48 25,48 Q5,48 5,30 Z" fill="#fff" stroke="#fa8c16" strokeWidth="2" />
            {!editing && (
              <text x="25" y="30" textAnchor="middle" fontSize="13" fill="#fa8c16" fontWeight="bold">{k}/{n}</text>
            )}
          </svg>
          {editing && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 12,
            }}>
              <input
                ref={inputRef}
                value={editK}
                onChange={(e) => { e.stopPropagation(); setEditK(e.target.value) }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{ width: 16, textAlign: 'center', border: 'none', borderBottom: '1px solid #fa8c16', outline: 'none', fontSize: 12, background: 'transparent', color: '#fa8c16' }}
              />
              <span style={{ color: '#fa8c16' }}>/</span>
              <input
                value={editN}
                onChange={(e) => { e.stopPropagation(); setEditN(e.target.value) }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                style={{ width: 16, textAlign: 'center', border: 'none', borderBottom: '1px solid #fa8c16', outline: 'none', fontSize: 12, background: 'transparent', color: '#fa8c16' }}
              />
            </div>
          )}
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default VotingGateNode
