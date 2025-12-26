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
  const { messages, sendMessage, isLoading, lastSuggestion, clearSuggestion } = useChat();
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
          <ChatBox messages={messages} />
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
