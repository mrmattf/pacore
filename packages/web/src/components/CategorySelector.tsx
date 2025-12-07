import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';

interface Props {
  value: string | null;
  onChange: (category: string | null) => void;
}

export function CategorySelector({ value, onChange }: Props) {
  const { categories, addCategory, loading } = useCategories();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;

    setAddingCategory(true);
    try {
      await addCategory(newCategory.toLowerCase());
      onChange(newCategory.toLowerCase()); // Auto-select the new category
      setNewCategory('');
      setShowAddForm(false);
    } catch (error) {
      alert('Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="px-3 py-1.5 border rounded text-sm"
        disabled={loading}
      >
        <option value="">No Category</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </option>
        ))}
      </select>

      {!showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="p-1.5 border rounded hover:bg-gray-100"
          title="Add custom category"
        >
          <Plus size={16} />
        </button>
      ) : (
        <form onSubmit={handleAddCategory} className="flex gap-1">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category"
            className="px-2 py-1 border rounded text-sm w-32"
            autoFocus
          />
          <button
            type="submit"
            disabled={addingCategory || !newCategory.trim()}
            className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
          >
            {addingCategory ? '...' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm(false);
              setNewCategory('');
            }}
            className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
