import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { WorkflowDAG, WorkflowNode } from '@pacore/core';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { NodeConfigPanel } from '../components/NodeConfigPanel';
import { AddNodeModal } from '../components/AddNodeModal';
import { ArrowLeft, Save, Play, Plus, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { validateWorkflow, ValidationResult } from '../utils/workflowValidation';

export function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<WorkflowDAG | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddNodeModalOpen, setIsAddNodeModalOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Load workflow from location state (draft from chat) or fetch by ID
  useEffect(() => {
    const loadWorkflow = async () => {
      // Check if we have a draft workflow from navigation state
      if (location.state && (location.state as any).workflow) {
        const draftWorkflow = (location.state as any).workflow as WorkflowDAG;
        setWorkflow(draftWorkflow);
        return;
      }

      // Otherwise, fetch existing workflow by ID
      if (id) {
        try {
          const token = useAuthStore.getState().token;
          const response = await fetch(`/v1/workflows/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to load workflow');
          }

          const loadedWorkflow = await response.json();
          setWorkflow(loadedWorkflow);
        } catch (error) {
          console.error('Error loading workflow:', error);
          navigate('/chat');
        }
      }
    };

    loadWorkflow();
  }, [id, location.state, navigate]);

  // Update selected node when selection changes
  useEffect(() => {
    if (selectedNodeId && workflow) {
      const node = workflow.nodes.find((n) => n.id === selectedNodeId);
      setSelectedNode(node || null);
    } else {
      setSelectedNode(null);
    }
  }, [selectedNodeId, workflow]);

  // Keyboard shortcuts for node deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete or Backspace key to delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        // Don't delete if user is typing in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }

        e.preventDefault();
        if (confirm('Are you sure you want to delete this node?')) {
          handleNodeDelete(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  // Validate workflow whenever it changes
  useEffect(() => {
    if (workflow) {
      const result = validateWorkflow(workflow);
      setValidation(result);
    }
  }, [workflow]);

  const handleNodeUpdate = (nodeId: string, updates: Partial<WorkflowNode>) => {
    if (!workflow) return;

    setWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...updates } : node
      ),
    });
  };

  const handleNodeDelete = (nodeId: string) => {
    if (!workflow) return;

    // Remove the node
    const updatedNodes = workflow.nodes.filter((node) => node.id !== nodeId);

    // Remove references to this node from other nodes' inputs
    const cleanedNodes = updatedNodes.map((node) => ({
      ...node,
      inputs: node.inputs?.filter((inputId) => inputId !== nodeId),
    }));

    setWorkflow({
      ...workflow,
      nodes: cleanedNodes,
    });

    // Clear selection
    setSelectedNodeId(null);
  };

  const handleAddNode = (newNode: WorkflowNode) => {
    if (!workflow) return;

    setWorkflow({
      ...workflow,
      nodes: [...workflow.nodes, newNode],
    });
  };

  const handleSave = async () => {
    if (!workflow) return;

    // Validate before saving
    if (validation && !validation.valid) {
      const errorMessages = validation.errors.map((e) => e.message).join('\n');
      alert(`Cannot save workflow with errors:\n\n${errorMessages}`);
      return;
    }

    // Warn about validation warnings but allow save
    if (validation && validation.warnings.length > 0) {
      const warningMessages = validation.warnings.map((w) => w.message).join('\n');
      const proceed = confirm(
        `The workflow has warnings:\n\n${warningMessages}\n\nDo you want to save anyway?`
      );
      if (!proceed) return;
    }

    setIsSaving(true);
    try {
      const token = useAuthStore.getState().token;
      const url = workflow.id ? `/v1/workflows/${workflow.id}` : '/v1/workflows';
      const method = workflow.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: workflow.name,
          description: workflow.description,
          category: workflow.category,
          nodes: workflow.nodes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save workflow');
      }

      const savedWorkflow = await response.json();
      setWorkflow(savedWorkflow);

      // Navigate back to chat
      navigate('/chat');
    } catch (error) {
      console.error('Error saving workflow:', error);
      alert('Failed to save workflow. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!workflow || !workflow.id) {
      alert('Please save the workflow before testing');
      return;
    }

    try {
      const token = useAuthStore.getState().token;
      const response = await fetch(`/v1/workflows/${workflow.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to execute workflow');
      }

      const execution = await response.json();
      alert(`Workflow executed with status: ${execution.status}`);
    } catch (error) {
      console.error('Error executing workflow:', error);
      alert('Failed to execute workflow. Please try again.');
    }
  };

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-500">Loading workflow...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/chat')}
            className="p-2 hover:bg-gray-100 rounded"
            title="Back to Chat"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 max-w-2xl">
            <input
              type="text"
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              className="text-xl font-bold border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 w-full"
              placeholder="Workflow Name"
            />
            <input
              type="text"
              value={workflow.description || ''}
              onChange={(e) => setWorkflow({ ...workflow, description: e.target.value })}
              className="text-sm text-gray-600 border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 w-full mt-1"
              placeholder="Workflow Description"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {workflow.id && (
            <button
              onClick={handleTest}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Test Workflow
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </header>

      {/* Validation Banner */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="bg-white border-b">
          {validation.errors.length > 0 && (
            <div className="px-6 py-3 bg-red-50 border-l-4 border-red-500">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800">Workflow Errors</h3>
                  <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                    {validation.errors.map((error, idx) => (
                      <li key={idx}>{error.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="px-6 py-3 bg-yellow-50 border-l-4 border-yellow-500">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">Workflow Warnings</h3>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {validation.warnings.map((warning, idx) => (
                      <li key={idx}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content - Two Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Visual Graph */}
        <div className="flex-1 border-r border-gray-200">
          <WorkflowGraph
            workflow={workflow}
            onNodeSelect={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
        </div>

        {/* Right Panel - Node Configuration */}
        <div className="w-96 bg-white p-6 overflow-y-auto">
          {selectedNode ? (
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={handleNodeUpdate}
              onDelete={handleNodeDelete}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">Click on a node to edit its configuration</p>
            </div>
          )}
        </div>
      </div>

      {/* Floating Add Node Button */}
      <button
        onClick={() => setIsAddNodeModalOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        title="Add New Node"
      >
        <Plus className="w-6 h-6" />
        <span className="absolute right-16 bg-gray-900 text-white text-sm px-3 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Add Node
        </span>
      </button>

      {/* Add Node Modal */}
      <AddNodeModal
        isOpen={isAddNodeModalOpen}
        onClose={() => setIsAddNodeModalOpen(false)}
        onAddNode={handleAddNode}
        existingNodes={workflow.nodes}
      />
    </div>
  );
}
