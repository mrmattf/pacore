import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { WorkflowNode } from '@pacore/core';

const NODE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  mcp_fetch: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-500' },
  transform: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-500' },
  filter: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-500' },
  merge: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-500' },
  action: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-500' },
  conditional: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-500' },
};

const NODE_TYPE_LABELS: Record<string, string> = {
  mcp_fetch: 'MCP Fetch',
  transform: 'Transform',
  filter: 'Filter',
  merge: 'Merge',
  action: 'Action',
  conditional: 'Conditional',
};

interface CustomNodeData {
  label: string;
  nodeData: WorkflowNode;
}

export const CustomWorkflowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => {
  const nodeType = data.nodeData.type;
  const colors = NODE_TYPE_COLORS[nodeType] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-500',
  };

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 ${colors.bg} ${
        selected ? 'border-blue-600 shadow-lg' : `${colors.border} shadow-sm`
      } min-w-[200px] max-w-[300px]`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-gray-400"
      />

      {/* Node Type Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
          {NODE_TYPE_LABELS[nodeType] || nodeType}
        </span>
      </div>

      {/* Node Label */}
      <div className="text-sm font-medium text-gray-900">
        {data.label}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-gray-400"
      />
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
