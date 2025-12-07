import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProviderState {
  selectedProvider: string;
  setSelectedProvider: (provider: string) => void;
}

export const useProviderStore = create<ProviderState>()(
  persist(
    (set) => ({
      selectedProvider: 'anthropic',
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
    }),
    {
      name: 'pacore-provider',
    }
  )
);
