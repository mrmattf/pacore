import { useState, useEffect } from 'react';
import { WorkflowNode, MCPFetchNodeConfig } from '@pacore/core';
import { useMCPServers } from '../hooks/useMCPServers';

interface NodeOutputMapperProps {
  existingNodes: WorkflowNode[];
  currentNodeId: string; // To exclude self from selection
  value: string; // Current reference like "$input[0].email"
  onChange: (value: string) => void;
}

export function NodeOutputMapper({
  existingNodes,
  currentNodeId,
  value,
  onChange
}: NodeOutputMapperProps) {
  const { fetchServerTools } = useMCPServers();
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Parse existing value to pre-select node and path
  useEffect(() => {
    if (!value || !value.startsWith('$input')) {
      setSelectedNodeId('');
      setSelectedPath('');
      return;
    }

    const match = value.match(/^\$input\[(\d+)\]\.?(.*)$/);
    if (match) {
      const index = parseInt(match[1]);
      const path = match[2];

      // Find node at this index (based on current node's inputs order)
      if (index < existingNodes.length) {
        const node = existingNodes[index];
        setSelectedNodeId(node.id);
        setSelectedPath(path);
      }
    }
  }, [value, existingNodes]);

  // Fetch output schema when node is selected
  useEffect(() => {
    if (!selectedNodeId) {
      setAvailableFields([]);
      return;
    }

    const node = existingNodes.find(n => n.id === selectedNodeId);
    if (!node) {
      setAvailableFields([]);
      return;
    }

    // Only MCP Fetch nodes have discoverable output schemas
    if (node.type === 'mcp_fetch') {
      const config = node.config as MCPFetchNodeConfig;

      if (!config.serverId || !config.toolName) {
        setAvailableFields([]);
        return;
      }

      setIsLoadingFields(true);
      fetchServerTools(config.serverId)
        .then(tools => {
          const tool = tools.find((t: any) => t.name === config.toolName);
          if (tool?.outputSchema?.properties) {
            const fields = Object.keys(tool.outputSchema.properties);
            setAvailableFields(fields);
          } else {
            setAvailableFields([]);
          }
        })
        .catch(() => {
          setAvailableFields([]);
        })
        .finally(() => {
          setIsLoadingFields(false);
        });
    } else {
      // Other node types - no output schema available
      setAvailableFields([]);
    }
  }, [selectedNodeId, existingNodes, fetchServerTools]);

  const handleNodeChange = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedPath('');

    if (!nodeId) {
      onChange('');
      return;
    }

    // Find node index in workflow
    const index = existingNodes.findIndex(n => n.id === nodeId);
    if (index >= 0) {
      onChange(`$input[${index}]`);
    }
  };

  const handlePathChange = (path: string) => {
    setSelectedPath(path);

    const index = existingNodes.findIndex(n => n.id === selectedNodeId);
    if (index >= 0) {
      onChange(path ? `$input[${index}].${path}` : `$input[${index}]`);
    }
  };

  // Filter out current node (can't reference self)
  const availableNodes = existingNodes.filter(n => n.id !== currentNodeId);

  return (
    <div className="space-y-2">
      {/* Node Selector */}
      <select
        value={selectedNodeId}
        onChange={(e) => handleNodeChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="">Select source node...</option>
        {availableNodes.map(node => (
          <option key={node.id} value={node.id}>
            {node.description || `${node.type} node`}
          </option>
        ))}
      </select>

      {/* Field Path Selector (only if output schema available) */}
      {selectedNodeId && !isLoadingFields && availableFields.length > 0 && (
        <select
          value={selectedPath}
          onChange={(e) => handlePathChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Use entire output</option>
          {availableFields.map(field => (
            <option key={field} value={field}>
              {field}
            </option>
          ))}
        </select>
      )}

      {/* Loading State */}
      {selectedNodeId && isLoadingFields && (
        <p className="text-xs text-gray-500">Loading output fields...</p>
      )}

      {/* No Schema Message */}
      {selectedNodeId && !isLoadingFields && availableFields.length === 0 && (
        <p className="text-xs text-gray-500">
          No output schema available. Will use entire output.
        </p>
      )}

      {/* Helper Text */}
      {!selectedNodeId && availableNodes.length === 0 && (
        <p className="text-xs text-gray-500">
          No upstream nodes available to map from.
        </p>
      )}
    </div>
  );
}
