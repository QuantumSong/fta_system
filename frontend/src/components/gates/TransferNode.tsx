import React from 'react'
import { Handle, Position } from '@xyflow/react'
import NodeResizeWrapper from '@/components/common/NodeResizeWrapper'

interface TransferNodeProps {
  data: { label?: string; nodeWidth?: number; nodeHeight?: number; onSizeChange?: (w: number, h: number) => void }
  selected?: boolean
}

const DEF = 44

const TransferNode: React.FC<TransferNodeProps> = ({ data, selected }) => {
  return (
    <NodeResizeWrapper selected={selected} width={data.nodeWidth || DEF} height={data.nodeHeight || DEF} minWidth={30} minHeight={30} onSizeChange={data.onSizeChange}>
      {({ width, height }) => (
        <div
          className="fta-gate-wrap"
          style={{ width, height, filter: selected ? 'drop-shadow(0 0 2px #595959)' : undefined }}
        >
          <Handle type="target" position={Position.Top} style={{ top: -2 }} />
          <svg width="100%" height="100%" viewBox="0 0 44 44" preserveAspectRatio="xMidYMid meet">
            <polygon points="22,2 42,40 2,40" fill="#fff" stroke="#595959" strokeWidth="2" />
            <text x="22" y="32" textAnchor="middle" fontSize="11" fill="#595959" fontWeight="bold">{data.label || 'T'}</text>
          </svg>
          <Handle type="source" position={Position.Bottom} style={{ bottom: -2 }} />
        </div>
      )}
    </NodeResizeWrapper>
  )
}

export default TransferNode
