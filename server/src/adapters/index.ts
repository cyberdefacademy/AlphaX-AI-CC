import openclaw from './openclaw';
import hermes from './hermes';
import claude from './claude';
import opencode from './opencode';
import generic from './generic';
import type { AgentAdapter } from './types';

export const adapters: Record<string, AgentAdapter> = {
  openclaw,
  hermes,
  claude,
  opencode,
  generic,
};

export function adapterFor(type: string): AgentAdapter | null {
  return adapters[type] || null;
}

export { openclaw, hermes, claude, opencode, generic };
export type { AgentAdapter };
export * from './types';