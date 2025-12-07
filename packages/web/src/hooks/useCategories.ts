import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

const DEFAULT_CATEGORIES = ['work', 'family', 'hobby', 'legal', 'finance', 'health', 'general'];

export function useCategories() {
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((state) => state.token);

  const fetchCategories = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch('/v1/categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      // If user has no categories yet, use defaults
      // Otherwise use their custom categories
      if (data.length === 0) {
        setCategories(DEFAULT_CATEGORIES);
      } else {
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      setCategories(DEFAULT_CATEGORIES); // Fallback to defaults
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async (category: string, description?: string) => {
    if (!token) return;
    try {
      await fetch('/v1/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, description }),
      });
      await fetchCategories(); // Refresh list
    } catch (error) {
      console.error('Failed to add category:', error);
      throw error;
    }
  };

  const deleteCategory = async (category: string) => {
    if (!token) return;
    try {
      await fetch(`/v1/categories/${encodeURIComponent(category)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCategories(); // Refresh list
    } catch (error) {
      console.error('Failed to delete category:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (token) {
      fetchCategories();
    }
  }, [token]);

  return {
    categories,
    loading,
    addCategory,
    deleteCategory,
    refresh: fetchCategories,
  };
}
