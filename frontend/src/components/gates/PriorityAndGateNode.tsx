import React from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface PriorityAndGateNodeProps {
  data: { label?: string; nodeWidth?: number; nodeHeight?: number; onSizeChange?: (w: number, h: number) => void; evidenceLevel?: string }
  selected?: boolean
}

const DEF = 50

const PriorityAndGateNode: React.FC<PriorityAndGateNodeProps> = ({ data, selected }) => {
  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF} height={data.nodeHeight || DEF} minWidth={36} minHeight={36} onSizeChange={data.onSizeChange} evidenceLevel={data.evidenceLevel}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #2f54eb)' : undefined }}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
            <path d="M5,30 L5,10 Q5,2 13,2 L37,2 Q45,2 45,10 L45,30 Q45,48 25,48 Q5,48 5,30 Z" fill="#fff" stroke="#2f54eb" strokeWidth="2" />
            <line x1="10" y1="36" x2="40" y2="36" stroke="#2f54eb" strokeWidth="2" />
            <text x="25" y="26" textAnchor="middle" fontSize="9" fill="#2f54eb" fontWeight="bold">PAND</text>
          </svg>
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default PriorityAndGateNode
