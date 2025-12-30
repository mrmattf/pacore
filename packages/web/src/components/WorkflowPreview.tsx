import { WorkflowDAG } from '@pacore/core';
import { WorkflowNodeCard } from './WorkflowNodeCard';
import { Edit, Save, Sparkles, X } from 'lucide-react';

interface WorkflowPreviewProps {
  workflow: WorkflowDAG;
  onEdit: (workflow: WorkflowDAG) => void;
  onSave: (workflow: WorkflowDAG) => void;
  onRefine: () => void;
  onCancel: () => void;
}

export function WorkflowPreview({ workflow, onEdit, onSave, onRefine, onCancel }: WorkflowPreviewProps) {
  // Sort nodes in topological order (simple version - assumes nodes are already ordered)
  const sortedNodes = workflow.nodes;

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Workflow Preview</h3>
            </div>
            <p className="text-blue-100 text-sm">
              Review the AI-generated workflow before saving
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Workflow Info */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h4 className="text-xl font-bold text-gray-900 mb-2">{workflow.name}</h4>
        {workflow.description && (
          <p className="text-sm text-gray-700 mb-3">{workflow.description}</p>
        )}
        <div className="flex items-center gap-3">
          {workflow.category && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {workflow.category}
            </span>
          )}
          <span className="text-xs text-gray-600">
            {workflow.nodes.length} {workflow.nodes.length === 1 ? 'step' : 'steps'}
          </span>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="px-6 py-6 bg-gray-50">
        <h5 className="text-sm font-semibold text-gray-700 mb-4">Workflow Steps</h5>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sortedNodes.map((node, index) => (
            <WorkflowNodeCard
              key={node.id}
              node={node}
              stepNumber={index + 1}
              isFirst={index === 0}
              isLast={index === sortedNodes.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onRefine}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Refine with AI
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSave(workflow)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              Create Workflow
            </button>
            <button
              onClick={() => onEdit(workflow)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <Edit className="w-4 h-4" />
              Review & Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
