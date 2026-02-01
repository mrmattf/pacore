import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { WorkflowDAG } from '@pacore/core';
import { ArrowLeft, Plus, Play, Edit, Trash2, Clock, Calendar } from 'lucide-react';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const [workflows, setWorkflows] = useState<WorkflowDAG[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/v1/workflows', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load workflows');
      }

      const data = await response.json();
      // API returns array directly, not wrapped in object
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading workflows:', err);
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (workflow: WorkflowDAG) => {
    navigate('/workflows/builder', { state: { workflow } });
  };

  const handleExecute = async (workflowId: string) => {
    try {
      const response = await fetch(`/v1/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to execute workflow');
      }

      alert('Workflow execution started! Check the execution history for results.');
    } catch (err) {
      console.error('Error executing workflow:', err);
      alert(err instanceof Error ? err.message : 'Failed to execute workflow');
    }
  };

  const handleDelete = async (workflowId: string, workflowName: string) => {
    if (!confirm(`Are you sure you want to delete "${workflowName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/v1/workflows/${workflowId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete workflow');
      }

      // Reload workflows after deletion
      loadWorkflows();
    } catch (err) {
      console.error('Error deleting workflow:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete workflow');
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/chat')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Chat"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">My Workflows</h1>
            </div>
            <button
              onClick={() => navigate('/workflows/builder')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading workflows...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {!loading && !error && workflows.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Calendar className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No workflows yet</h3>
            <p className="text-gray-500 mb-6">Create your first workflow to get started</p>
            <button
              onClick={() => navigate('/workflows/builder')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Workflow
            </button>
          </div>
        )}

        {!loading && !error && workflows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                {/* Workflow Header */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{workflow.name}</h3>
                  {workflow.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{workflow.description}</p>
                  )}
                </div>

                {/* Category Badge */}
                {workflow.category && (
                  <div className="mb-4">
                    <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {workflow.category}
                    </span>
                  </div>
                )}

                {/* Node Count */}
                <div className="text-sm text-gray-500 mb-4">
                  {workflow.nodes.length} {workflow.nodes.length === 1 ? 'node' : 'nodes'}
                </div>

                {/* Timestamps */}
                <div className="text-xs text-gray-400 mb-4 space-y-1">
                  {workflow.createdAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Created: {formatDate(workflow.createdAt)}</span>
                    </div>
                  )}
                  {workflow.updatedAt && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Updated: {formatDate(workflow.updatedAt)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => handleEdit(workflow)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleExecute(workflow.id!)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <Play className="w-4 h-4" />
                    Run
                  </button>
                  <button
                    onClick={() => handleDelete(workflow.id!, workflow.name)}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete workflow"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
