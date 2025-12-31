import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { WorkflowDAG, WorkflowNode } from '@pacore/core';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { ArrowLeft, Save, Play } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<WorkflowDAG | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    if (!workflow) return;

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
          <div>
            <h1 className="text-xl font-bold">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-sm text-gray-600">{workflow.description}</p>
            )}
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
            <div>
              <h2 className="text-lg font-semibold mb-4">Node Configuration</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Node Type
                  </label>
                  <input
                    type="text"
                    value={selectedNode.type}
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
                    value={selectedNode.description || ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Configuration
                  </label>
                  <pre className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-xs text-gray-700 overflow-auto max-h-96">
                    {JSON.stringify(selectedNode.config, null, 2)}
                  </pre>
                </div>

                {selectedNode.inputs && selectedNode.inputs.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dependencies
                    </label>
                    <div className="text-sm text-gray-600">
                      {selectedNode.inputs.join(', ')}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Full editing capabilities coming in Sprint 3
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p className="text-sm">Click on a node to view its configuration</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
