import { useState } from 'react';
import { WorkflowNode, WorkflowNodeType } from '@pacore/core';
import { X, Database, Wand2, Filter, GitMerge, Zap, GitBranch } from 'lucide-react';

interface AddNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (node: WorkflowNode) => void;
  existingNodes: WorkflowNode[];
}

const nodeTypeInfo: Record<WorkflowNodeType, { icon: any; label: string; description: string; color: string }> = {
  mcp_fetch: {
    icon: Database,
    label: 'MCP Fetch',
    description: 'Fetch data from MCP server tools',
    color: 'bg-blue-100 text-blue-700',
  },
  transform: {
    icon: Wand2,
    label: 'Transform',
    description: 'Transform data using LLM or code',
    color: 'bg-purple-100 text-purple-700',
  },
  filter: {
    icon: Filter,
    label: 'Filter',
    description: 'Filter data based on conditions',
    color: 'bg-green-100 text-green-700',
  },
  merge: {
    icon: GitMerge,
    label: 'Merge',
    description: 'Combine data from multiple sources',
    color: 'bg-orange-100 text-orange-700',
  },
  action: {
    icon: Zap,
    label: 'Action',
    description: 'Perform an action (email, webhook, etc.)',
    color: 'bg-red-100 text-red-700',
  },
  conditional: {
    icon: GitBranch,
    label: 'Conditional',
    description: 'Branch based on conditions',
    color: 'bg-yellow-100 text-yellow-700',
  },
};

export function AddNodeModal({ isOpen, onClose, onAddNode, existingNodes }: AddNodeModalProps) {
  const [selectedType, setSelectedType] = useState<WorkflowNodeType | null>(null);
  const [description, setDescription] = useState('');
  const [selectedInputs, setSelectedInputs] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!selectedType) {
      alert('Please select a node type');
      return;
    }

    const newNode: WorkflowNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: selectedType,
      description: description || nodeTypeInfo[selectedType].label,
      config: getDefaultConfig(selectedType),
      inputs: selectedInputs.length > 0 ? selectedInputs : undefined,
    };

    onAddNode(newNode);

    // Reset form
    setSelectedType(null);
    setDescription('');
    setSelectedInputs([]);
    onClose();
  };

  const getDefaultConfig = (type: WorkflowNodeType): Record<string, any> => {
    switch (type) {
      case 'mcp_fetch':
        return { serverId: '', serverName: '', toolName: '', parameters: {} };
      case 'transform':
        return { type: 'llm', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', prompt: '' };
      case 'filter':
        return { conditions: [] };
      case 'merge':
        return { strategy: 'concat' };
      case 'action':
        return { action: 'webhook', config: {} };
      case 'conditional':
        return { condition: '', trueBranch: '', falseBranch: '' };
      default:
        return {};
    }
  };

  const toggleInput = (nodeId: string) => {
    setSelectedInputs((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Add New Node</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Node Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Node Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(nodeTypeInfo) as WorkflowNodeType[]).map((type) => {
                const info = nodeTypeInfo[type];
                const Icon = info.icon;
                const isSelected = selectedType === type;

                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded ${info.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{info.label}</div>
                        <div className="text-xs text-gray-500 mt-1">{info.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          {selectedType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`Describe this ${nodeTypeInfo[selectedType].label} node...`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Input Nodes Selection */}
          {selectedType && existingNodes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Connect Input Nodes (Optional)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                {existingNodes.map((node) => (
                  <label
                    key={node.id}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedInputs.includes(node.id)}
                      onChange={() => toggleInput(node.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {node.description || node.type}
                      </div>
                      <div className="text-xs text-gray-500">{nodeTypeInfo[node.type].label}</div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Select which nodes should feed data into this new node
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedType}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Node
          </button>
        </div>
      </div>
    </div>
  );
}