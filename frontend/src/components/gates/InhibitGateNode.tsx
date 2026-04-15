import React from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface InhibitGateNodeProps {
  data: { label?: string; nodeWidth?: number; nodeHeight?: number; onSizeChange?: (w: number, h: number) => void; evidenceLevel?: string }
  selected?: boolean
}

const DEF = 50

const InhibitGateNode: React.FC<InhibitGateNodeProps> = ({ data, selected }) => {
  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF} height={data.nodeHeight || DEF} minWidth={36} minHeight={36} onSizeChange={data.onSizeChange} evidenceLevel={data.evidenceLevel}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #722ed1)' : undefined }}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 50 50" preserveAspectRatio="xMidYMid meet">
            <polygon points="25,2 46,14 46,36 25,48 4,36 4,14" fill="#fff" stroke="#722ed1" strokeWidth="2" />
            <text x="25" y="29" textAnchor="middle" fontSize="8" fill="#722ed1" fontWeight="bold">INHIBIT</text>
          </svg>
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default InhibitGateNode
