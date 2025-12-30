import { WorkflowNode } from '@pacore/core';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface WorkflowNodeCardProps {
  node: WorkflowNode;
  stepNumber: number;
  isFirst: boolean;
  isLast: boolean;
}

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

export function WorkflowNodeCard({ node, stepNumber, isFirst, isLast }: WorkflowNodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const colors = NODE_TYPE_COLORS[node.type] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-500',
  };

  const hasDependencies = node.inputs && node.inputs.length > 0;

  return (
    <div className="relative">
      {/* Connection line from previous node */}
      {!isFirst && (
        <div className="absolute left-6 -top-4 w-0.5 h-4 bg-gray-300" />
      )}

      {/* Node Card */}
      <div className={`border-l-4 ${colors.border} ${colors.bg} rounded-r-lg p-4 shadow-sm`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3 flex-1">
            {/* Step Number */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-sm font-semibold text-gray-700">
              {stepNumber}
            </div>

            {/* Node Info */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                  {NODE_TYPE_LABELS[node.type] || node.type}
                </span>
              </div>
              <h4 className="text-sm font-medium text-gray-900">
                {node.description || `Step ${stepNumber}`}
              </h4>
            </div>
          </div>

          {/* Expand/Collapse Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-2 p-1 hover:bg-white rounded transition-colors"
            title={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>

        {/* Dependencies */}
        {hasDependencies && (
          <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
            <span>↑ Depends on:</span>
            <span className="font-medium">{node.inputs?.join(', ')}</span>
          </div>
        )}

        {/* Expanded Config Section */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2">Configuration</h5>
            <div className="bg-white rounded p-2 text-xs">
              <pre className="text-gray-700 whitespace-pre-wrap break-words">
                {JSON.stringify(node.config, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Connection line to next node */}
      {!isLast && (
        <div className="absolute left-6 bottom-0 w-0.5 h-4 bg-gray-300 translate-y-full" />
      )}
    </div>
  );
}
