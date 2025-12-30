import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useCategoryStore } from '../store/categoryStore';
import { useProviderStore } from '../store/providerStore';

interface Message {
  role: 'user' | 'assistant' | 'workflow-intent';
  content: string;
  workflowIntent?: WorkflowIntent;
}

interface CategorySuggestion {
  category: string;
  conversationId: string;
}

interface WorkflowIntent {
  detected: boolean;
  intentType?: 'create' | 'execute';
  confidence: number;
  description: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  nodeCount?: number;
  executionId?: string;
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

      // Only add assistant message if there's actual content
      if (data.response && data.response.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.response },
        ]);
      }

      // Check if there's a suggested category in the response metadata
      // The backend may return this when autoClassify detects a new category
      if (data.suggestedCategory && data.conversationId) {
        setLastSuggestion({
          category: data.suggestedCategory,
          conversationId: data.conversationId,
        });
      }

      // Check for workflow intent detection
      if (data.workflowIntent?.detected) {
        // Add workflow intent as a special message in the chat
        setMessages((prev) => [
          ...prev,
          {
            role: 'workflow-intent',
            content: '', // Content is in workflowIntent object
            workflowIntent: data.workflowIntent,
          },
        ]);
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

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const removeMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    messages,
    sendMessage,
    addMessage,
    removeMessage,
    isLoading,
    lastSuggestion,
    clearSuggestion: () => setLastSuggestion(null),
  };
}
