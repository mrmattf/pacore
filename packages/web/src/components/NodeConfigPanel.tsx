import { useState, useEffect } from 'react';
import { WorkflowNode, MCPFetchNodeConfig, TransformNodeConfig } from '@pacore/core';
import { useMCPServers } from '../hooks/useMCPServers';
import { SchemaFormBuilder } from './SchemaFormBuilder';
import { Trash2 } from 'lucide-react';

interface NodeConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  onDelete: (nodeId: string) => void;
  existingNodes: WorkflowNode[];
}

export function NodeConfigPanel({ node, onUpdate, onDelete, existingNodes }: NodeConfigPanelProps) {
  const { servers, loading: serversLoading, fetchServerTools } = useMCPServers();
  const [description, setDescription] = useState(node.description || '');
  const [tools, setTools] = useState<any[]>([]);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [selectedInputs, setSelectedInputs] = useState<string[]>([]);

  // For MCP Fetch nodes
  const [serverId, setServerId] = useState('');
  const [toolName, setToolName] = useState('');
  const [parameters, setParameters] = useState('{}');

  // For Transform nodes
  const [transformType, setTransformType] = useState<'llm' | 'code'>('llm');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [prompt, setPrompt] = useState('');

  // Initialize form values from node config
  useEffect(() => {
    setDescription(node.description || '');
    setSelectedInputs(node.inputs || []);

    if (node.type === 'mcp_fetch') {
      const config = node.config as MCPFetchNodeConfig;
      setServerId(config.serverId || '');
      setToolName(config.toolName || '');
      setParameters(JSON.stringify(config.parameters || {}, null, 2));
    } else if (node.type === 'transform') {
      const config = node.config as any;
      setTransformType(config.type || 'llm');
      setProvider(config.provider || 'anthropic');
      setModel(config.model || 'claude-3-5-sonnet-20241022');
      setPrompt(config.prompt || '');
    }
  }, [node]);

  // Load tools when server changes
  useEffect(() => {
    if (serverId && node.type === 'mcp_fetch') {
      fetchServerTools(serverId).then(setTools);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, node.type]);

  // Update selected tool when tools or toolName changes
  useEffect(() => {
    if (serverId && toolName && tools.length > 0) {
      const tool = tools.find(t => t.name === toolName);
      setSelectedTool(tool || null);
    } else {
      setSelectedTool(null);
    }
  }, [serverId, toolName, tools]);

  const handleSave = () => {
    const updates: Partial<WorkflowNode> = {
      description,
      inputs: selectedInputs.length > 0 ? selectedInputs : undefined,
    };

    if (node.type === 'mcp_fetch') {
      const selectedServer = servers.find((s) => s.id === serverId);
      try {
        updates.config = {
          serverId,
          serverName: selectedServer?.name || '',
          toolName,
          parameters: JSON.parse(parameters),
        } as MCPFetchNodeConfig;
      } catch (error) {
        alert('Invalid JSON in parameters');
        return;
      }
    } else if (node.type === 'transform') {
      updates.config = {
        type: transformType,
        provider,
        model,
        prompt,
      } as TransformNodeConfig;
    }

    onUpdate(node.id, updates);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this node?')) {
      onDelete(node.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Edit Node</h2>
        <button
          onClick={handleDelete}
          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Delete Node"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Common fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Node Type
        </label>
        <input
          type="text"
          value={node.type}
          disabled
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Describe what this node does"
        />
      </div>

      {/* Input Connections */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Input Connections
        </label>
        <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3 bg-gray-50">
          {existingNodes.filter(n => n.id !== node.id).length === 0 ? (
            <p className="text-sm text-gray-500">No other nodes available to connect</p>
          ) : (
            existingNodes
              .filter(n => n.id !== node.id)
              .map((availableNode) => (
                <div
                  key={availableNode.id}
                  className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded"
                >
                  <input
                    type="checkbox"
                    id={`input-${availableNode.id}`}
                    checked={selectedInputs.includes(availableNode.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (e.target.checked) {
                        setSelectedInputs([...selectedInputs, availableNode.id]);
                      } else {
                        setSelectedInputs(selectedInputs.filter(id => id !== availableNode.id));
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label
                    htmlFor={`input-${availableNode.id}`}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {availableNode.description || availableNode.type}
                    </div>
                    <div className="text-xs text-gray-500">{availableNode.type}</div>
                  </label>
                </div>
              ))
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Select which nodes should feed data into this node
        </p>
      </div>

      {/* MCP Fetch specific fields */}
      {node.type === 'mcp_fetch' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MCP Server
            </label>
            <select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              disabled={serversLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a server...</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tool
            </label>
            <select
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              disabled={!serverId || tools.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a tool...</option>
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name} - {tool.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tool Parameters
            </label>
            {selectedTool?.inputSchema ? (
              <SchemaFormBuilder
                schema={selectedTool.inputSchema}
                value={(() => {
                  try {
                    return JSON.parse(parameters);
                  } catch {
                    return {};
                  }
                })()}
                onChange={(value) => setParameters(JSON.stringify(value, null, 2))}
                existingNodes={existingNodes}
                currentNodeId={node.id}
              />
            ) : (
              <div>
                <textarea
                  value={parameters}
                  onChange={(e) => setParameters(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder='{"key": "value"}'
                />
                <p className="text-xs text-gray-500 mt-1">
                  {toolName ? 'No schema available for this tool. Use JSON format.' : 'Select a tool to see parameter form.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Transform specific fields */}
      {node.type === 'transform' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transform Type
            </label>
            <select
              value={transformType}
              onChange={(e) => setTransformType(e.target.value as 'llm' | 'code')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="llm">LLM Transform</option>
              <option value="code" disabled>
                Code Transform (Coming Soon)
              </option>
            </select>
          </div>

          {transformType === 'llm' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="claude-3-5-sonnet-20241022"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter transformation prompt..."
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Other node types - show read-only config */}
      {node.type !== 'mcp_fetch' && node.type !== 'transform' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Configuration
          </label>
          <pre className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-xs text-gray-700 overflow-auto max-h-96">
            {JSON.stringify(node.config, null, 2)}
          </pre>
          <p className="text-xs text-gray-500 mt-2">
            Editing for {node.type} nodes coming soon
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
