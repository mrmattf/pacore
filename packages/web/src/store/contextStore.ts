import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrgRole = 'admin' | 'member' | 'viewer';

export type AppContext = { type: 'org'; orgId: string; orgName: string; role: OrgRole };

interface ContextState {
  context: AppContext;
  setContext: (ctx: AppContext) => void;
}

const DEFAULT_CONTEXT: AppContext = { type: 'org', orgId: '', orgName: '', role: 'member' };

export const useContextStore = create<ContextState>()(
  persist(
    (set) => ({
      context: DEFAULT_CONTEXT,
      setContext: (context) => set({ context }),
    }),
    {
      name: 'pacore-context',
      // Migration guard: reset any stale personal context from localStorage
      onRehydrateStorage: () => (state) => {
        if (state && (state.context as any).type === 'personal') {
          state.context = DEFAULT_CONTEXT;
        }
      },
    }
  )
);

/** Returns the skills API base path for the current context. */
export function skillsBasePath(ctx: AppContext): string {
  return `/v1/organizations/${ctx.orgId}/skills`;
}
