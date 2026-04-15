import React from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface NotGateNodeProps {
  data: { label?: string; nodeWidth?: number; nodeHeight?: number; onSizeChange?: (w: number, h: number) => void; evidenceLevel?: string }
  selected?: boolean
}

const DEF_W = 50
const DEF_H = 54

const NotGateNode: React.FC<NotGateNodeProps> = ({ data, selected }) => {
  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF_W} height={data.nodeHeight || DEF_H} minWidth={36} minHeight={40} onSizeChange={data.onSizeChange} evidenceLevel={data.evidenceLevel}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #eb2f96)' : undefined }}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 50 54" preserveAspectRatio="xMidYMid meet">
            <polygon points="25,4 46,40 4,40" fill="#fff" stroke="#eb2f96" strokeWidth="2" />
            <circle cx="25" cy="46" r="5" fill="#fff" stroke="#eb2f96" strokeWidth="2" />
            <text x="25" y="30" textAnchor="middle" fontSize="10" fill="#eb2f96" fontWeight="bold">NOT</text>
          </svg>
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default NotGateNode
