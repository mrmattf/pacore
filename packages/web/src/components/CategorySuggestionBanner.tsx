import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Props {
  suggestedCategory: string;
  conversationId: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function CategorySuggestionBanner({
  suggestedCategory,
  conversationId,
  onAccept,
  onDismiss,
}: Props) {
  const [accepting, setAccepting] = useState(false);
  const token = useAuthStore((state) => state.token);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await fetch(`/v1/conversations/${conversationId}/accept-category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category: suggestedCategory }),
      });
      onAccept();
    } catch (error) {
      console.error('Failed to accept category:', error);
      alert('Failed to accept category suggestion');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Lightbulb className="text-blue-600" size={20} />
        <div>
          <p className="text-sm font-medium text-blue-900">
            New category suggested: <strong>{suggestedCategory}</strong>
          </p>
          <p className="text-xs text-blue-700">
            Accept to add this to your categories and apply to this conversation
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
        >
          {accepting ? 'Accepting...' : 'Accept'}
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
          title="Dismiss suggestion"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
