import { ChatBox } from '../components/ChatBox';
import { ChatInput } from '../components/ChatInput';
import { CategorySelector } from '../components/CategorySelector';
import { CategorySuggestionBanner } from '../components/CategorySuggestionBanner';
import { ProviderSelector } from '../components/ProviderSelector';
import { useChat } from '../hooks/useChat';
import { useCategories } from '../hooks/useCategories';
import { useCategoryStore } from '../store/categoryStore';
import { useProviderStore } from '../store/providerStore';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Settings, LogOut, Database } from 'lucide-react';

export function ChatPage() {
  const { messages, sendMessage, addMessage, removeMessage, isLoading, lastSuggestion, clearSuggestion } = useChat();
  const category = useCategoryStore((state) => state.category);
  const setCategory = useCategoryStore((state) => state.setCategory);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);
  const setSelectedProvider = useProviderStore((state) => state.setSelectedProvider);
  const { refresh: refreshCategories } = useCategories();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

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

  const handleCreateWorkflow = () => {
    // Navigate to workflow builder (to be implemented)
    console.log('Create workflow');
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
            onClick={() => navigate('/mcp')}
            className="p-2 hover:bg-gray-100 rounded"
            title="MCP Servers"
          >
            <Database size={20} />
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
