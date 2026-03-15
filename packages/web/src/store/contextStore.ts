import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrgRole = 'admin' | 'member' | 'viewer';

export type AppContext =
  | { type: 'personal' }
  | { type: 'org'; orgId: string; orgName: string; role: OrgRole };

interface ContextState {
  context: AppContext;
  setContext: (ctx: AppContext) => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set) => ({
      context: { type: 'personal' },
      setContext: (context) => set({ context }),
    }),
    { name: 'pacore-context' }
  )
);

/** Returns the skills API base path for the current context. */
export function skillsBasePath(ctx: AppContext): string {
  return ctx.type === 'org'
    ? `/v1/organizations/${ctx.orgId}/skills`
    : '/v1/me/skills';
}
