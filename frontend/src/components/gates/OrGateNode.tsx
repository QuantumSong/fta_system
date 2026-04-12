import React from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface OrGateNodeProps {
  data: {
    label?: string
    nodeWidth?: number
    nodeHeight?: number
    onSizeChange?: (w: number, h: number) => void
  }
  selected?: boolean
}

const DEF = 50

const OrGateNode: React.FC<OrGateNodeProps> = ({ data, selected }) => {
  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF} height={data.nodeHeight || DEF} minWidth={36} minHeight={36} onSizeChange={data.onSizeChange}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #52c41a)' : undefined }}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
            <path d="M5,8 Q5,2 13,2 L37,2 Q45,2 45,8 L45,28 Q45,48 25,48 Q5,48 5,28 Z" fill="#fff" stroke="#52c41a" strokeWidth="2" />
            <path d="M5,8 Q25,18 45,8" fill="none" stroke="#52c41a" strokeWidth="2" />
            <text x="25" y="32" textAnchor="middle" fontSize="11" fill="#52c41a" fontWeight="bold">OR</text>
          </svg>
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default OrGateNode
