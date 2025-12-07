import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCategoryStore } from '../store/categoryStore';
import { useProviderStore } from '../store/providerStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CategorySuggestion {
  category: string;
  conversationId: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSuggestion, setLastSuggestion] = useState<CategorySuggestion | null>(null);
  const token = useAuthStore((state) => state.token);
  const category = useCategoryStore((state) => state.category);
  const selectedProvider = useProviderStore((state) => state.selectedProvider);

  const sendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch('/v1/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: [userMessage],
          options: {
            providerId: selectedProvider,
            saveToMemory: true,
            autoClassify: true,
            contextSearch: category ? { categories: [category] } : true,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ]);

      // Check if there's a suggested category in the response metadata
      // The backend may return this when autoClassify detects a new category
      if (data.suggestedCategory && data.conversationId) {
        setLastSuggestion({
          category: data.suggestedCategory,
          conversationId: data.conversationId,
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, an error occurred.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    sendMessage,
    isLoading,
    lastSuggestion,
    clearSuggestion: () => setLastSuggestion(null),
  };
}
