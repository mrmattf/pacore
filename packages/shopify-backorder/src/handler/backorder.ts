/**
 * Backorder Handler
 *
 * This is the entry point for backorder detection (webhook handler).
 * It delegates to the backorder tool chain for deterministic execution.
 *
 * In Phase 2, an AI agent will wrap this handler and decide whether to:
 * - Call the tool chain for standard cases
 * - Handle edge cases directly with reasoning
 * - Escalate to human for complex cases
 */

import { ShopifyOrder } from '../clients/shopify';
import { MCPServer } from '../mcp/server';
import { executeBackorderChain, BackorderChainResult } from '../chains';

// Re-export types for backwards compatibility
export type BackorderResult = BackorderChainResult;

/**
 * Handle backorder check for an order.
 *
 * This function delegates to the backorder tool chain.
 * Currently called directly by the webhook handler.
 * In Phase 2, will be called by AI agent.
 *
 * @param order - Shopify order to check
 * @param mcp - MCP server for tool calls
 * @returns Result with backorder details and ticket info
 */
export async function handleBackorderCheck(
  order: ShopifyOrder,
  mcp: MCPServer
): Promise<BackorderResult> {
  // Delegate to tool chain for deterministic execution
  return executeBackorderChain({ order }, mcp);
}
