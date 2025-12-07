import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CategoryState {
  category: string | null;
  setCategory: (category: string | null) => void;
}

export const useCategoryStore = create<CategoryState>()(
  persist(
    (set) => ({
      category: null,
      setCategory: (category) => set({ category }),
    }),
    {
      name: 'pacore-category',
    }
  )
);
