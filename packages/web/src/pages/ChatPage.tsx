import { ChatBox } from '../components/ChatBox';
import { ChatInput } from '../components/ChatInput';
import { CategorySelector } from '../components/CategorySelector';
import { CategorySuggestionBanner } from '../components/CategorySuggestionBanner';
import { ProviderSelector } from '../components/ProviderSelector';
import { WorkflowPreview } from '../components/WorkflowPreview';
import { useChat } from '../hooks/useChat';
import { useCategories } from '../hooks/useCategories';
import { useCategoryStore } from '../store/categoryStore';
import { useProviderStore } from '../store/providerStore';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Settings, LogOut, Database, Workflow, Zap, CreditCard } from 'lucide-react';
import { WorkflowDAG } from '@pacore/core';
import { useState } from 'react';

export function ChatPage() {
  const { messages, sendMessage, addMessage, removeMessage, isLoading, lastSuggestion, clearSuggestion } = useChat();
  const category = useCategoryStore((state) => state.category);
  const setCategory = useCategoryStore((state) => state.setCategory);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const setSelectedProvider = useProviderStore((state) => state.setSelectedProvider);
  const { refresh: refreshCategories } = useCategories();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  // Workflow preview state
  const [draftWorkflow, setDraftWorkflow] = useState<WorkflowDAG | null>(null);
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAcceptSuggestion = () => {
    if (!lastSuggestion) return;
    setCategory(lastSuggestion.category);
    refreshCategories(); // Refresh category list
    clearSuggestion();
  };

  const handleConfirmExecution = async (workflowId: string) => {
    try {
      const token = useAuthStore.getState().token;
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

      const execution = await response.json();

      // Format execution results as a message
      let resultMessage = `**Workflow Execution Complete**\n\n`;
      resultMessage += `**Status:** ${execution.status}\n`;
      resultMessage += `**Workflow ID:** ${execution.workflowId}\n`;
      resultMessage += `**Started:** ${new Date(execution.startedAt).toLocaleString()}\n`;

      if (execution.completedAt) {
        resultMessage += `**Completed:** ${new Date(execution.completedAt).toLocaleString()}`;
      }

      // Add execution results to chat messages
      addMessage({ role: 'assistant', content: resultMessage });

    } catch (error) {
      console.error('Workflow execution error:', error);
      addMessage({
        role: 'assistant',
        content: `Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleCreateWorkflow = async () => {
    try {
      const token = useAuthStore.getState().token;

      // Get the last user message to understand what workflow they want to create
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        addMessage({
          role: 'assistant',
          content: 'Could not determine what workflow to create. Please try again.'
        });
        return;
      }

      // Add building status message
      addMessage({
        role: 'assistant',
        content: 'Building your workflow... This may take 30-60 seconds depending on your LLM provider.'
      });

      // Call the workflow builder API with extended timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      let response;
      try {
        response = await fetch('/v1/workflows/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: lastUserMessage.content,
            category: category || undefined,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to build workflow');
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Workflow build timed out. This might be due to slow LLM response. Please try again or use a faster LLM provider.');
        }
        throw fetchError;
      }

      const data = await response.json();
      const workflow = data.workflow;

      // NEW: Store workflow in state and show preview instead of auto-saving
      setDraftWorkflow(workflow);
      setShowWorkflowPreview(true);

    } catch (error) {
      console.error('Workflow creation error:', error);
      addMessage({
        role: 'assistant',
        content: `Failed to create workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleEditWorkflow = (workflow: WorkflowDAG) => {
    // Navigate to workflow builder with draft
    navigate('/workflows/builder', {
      state: { workflow }
    });
  };

  const handleSaveWorkflow = async (workflow: WorkflowDAG) => {
    try {
      const token = useAuthStore.getState().token;

      // Save the workflow to the database
      const response = await fetch('/v1/workflows', {
        method: 'POST',
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

      // Show success message with edit link
      const successMessage = `**Workflow Created Successfully!**\n\n` +
        `**Name:** ${savedWorkflow.name}\n` +
        `**Description:** ${savedWorkflow.description}\n` +
        `**Steps:** ${savedWorkflow.nodes?.length || 0}\n` +
        `**ID:** ${savedWorkflow.id}\n\n` +
        `**Actions:**\n` +
        `- [Edit Workflow](/workflows/${savedWorkflow.id}/edit)\n` +
        `- [Execute Now](/workflows/${savedWorkflow.id}/execute)\n` +
        `- [View Details](/workflows/${savedWorkflow.id})\n\n` +
        `You can also say "run ${savedWorkflow.name}" to execute it.`;

      addMessage({ role: 'assistant', content: successMessage });
      setShowWorkflowPreview(false);
      setDraftWorkflow(null);

    } catch (error) {
      console.error('Workflow save error:', error);
      addMessage({
        role: 'assistant',
        content: `Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleRefineWorkflow = () => {
    setShowWorkflowPreview(false);
    addMessage({
      role: 'assistant',
      content: 'I can help refine the workflow. What would you like to change?'
    });
  };

  const handleCancelWorkflow = () => {
    setShowWorkflowPreview(false);
    setDraftWorkflow(null);
  };

  const handleDismissIntent = (messageIndex: number) => {
    removeMessage(messageIndex);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">PA Core</h1>
        <div className="flex items-center gap-4">
          <ProviderSelector
            value={selectedProvider}
            onChange={setSelectedProvider}
          />
          <CategorySelector value={category} onChange={setCategory} />
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 hover:bg-gray-100 rounded"
            title="My Workflows"
          >
            <Workflow size={20} />
          </button>
          <button
            onClick={() => navigate('/skills')}
            className="p-2 hover:bg-gray-100 rounded"
            title="Skills"
          >
            <Zap size={20} />
          </button>
          <button
            onClick={() => navigate('/mcp')}
            className="p-2 hover:bg-gray-100 rounded"
            title="MCP Servers"
          >
            <Database size={20} />
          </button>
          <button
            onClick={() => navigate('/billing')}
            className="p-2 hover:bg-gray-100 rounded"
            title="Billing"
          >
            <CreditCard size={20} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="p-2 hover:bg-gray-100 rounded"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 hover:bg-gray-100 rounded"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {lastSuggestion && (
            <CategorySuggestionBanner
              suggestedCategory={lastSuggestion.category}
              conversationId={lastSuggestion.conversationId}
              onAccept={handleAcceptSuggestion}
              onDismiss={clearSuggestion}
            />
          )}
          <ChatBox
            messages={messages}
            onConfirmExecution={handleConfirmExecution}
            onCreateWorkflow={handleCreateWorkflow}
            onDismissIntent={handleDismissIntent}
          />

          {/* Workflow Preview */}
          {showWorkflowPreview && draftWorkflow && (
            <WorkflowPreview
              workflow={draftWorkflow}
              onEdit={handleEditWorkflow}
              onSave={handleSaveWorkflow}
              onRefine={handleRefineWorkflow}
              onCancel={handleCancelWorkflow}
            />
          )}
        </div>
      </div>

      <div className="border-t bg-white p-4">
        <div className="max-w-4xl mx-auto">
          <ChatInput
            onSend={sendMessage}
            disabled={isLoading}
            placeholder="Ask me anything..."
          />
        </div>
      </div>
    </div>
  );
}
