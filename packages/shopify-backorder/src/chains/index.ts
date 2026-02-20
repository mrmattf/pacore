/**
 * Tool Chains
 *
 * Tool chains are deterministic execution paths that call MCP tools in sequence.
 * They follow the agent-first architecture:
 * - Agent decides WHEN to invoke a chain
 * - Chain executes HOW (deterministic)
 *
 * Available chains:
 * - backorder-chain: Detect backorders and create support tickets
 */

export {
  executeBackorderChain,
  BackorderChainInput,
  BackorderChainResult
} from './backorder-chain';
