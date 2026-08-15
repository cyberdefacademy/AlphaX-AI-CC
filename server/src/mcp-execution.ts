import { getDb } from './db';
import { authorizeTool, recordToolCall, type ToolRequest } from './mcp';
import { type SecurityContext } from './security';
import { requireApprovedApproval } from './approval-queue';
import { GovernedMcpAdapter } from './mcp-adapters';
import { assertExecutionEnabled } from './safety';
import { assertTargetInScope } from './scope';
import { beginReceipt, finishReceipt } from './mcp-receipts';
import { normalizeMcpResult } from './mcp-normalizers';

export async function executeGovernedMcp(ctx: SecurityContext, req: ToolRequest, approvalId?: string, signal?: AbortSignal) {
  assertExecutionEnabled();
  if (!req.missionId) throw new Error('missionId is required for governed MCP execution');
  if (!req.agentId) throw new Error('agentId is required for governed MCP execution');
  assertTargetInScope(ctx.actor, ctx.projectId, req.target);

  const auth = authorizeTool(ctx, req);
  if (auth.decision === 'deny') throw new Error('policy denied tool execution');
  if (auth.approvalRequired) {
    if (!approvalId) return { status: 'approval_required', tool: auth.tool.name, missionId: req.missionId, taskId: req.taskId ?? null, agentId: req.agentId, target: req.target ?? null };
    requireApprovedApproval(approvalId, { ...ctx, tool: auth.tool.name, target: req.target, risk: auth.tool.risk }, req.missionId, req.taskId, req.agentId);
  }

  const row: any = getDb().prepare('SELECT id,name,endpoint,kind,enabled FROM mcp_servers WHERE id=?').get(auth.tool.server);
  if (!row) throw new Error(`MCP server '${auth.tool.server}' is not registered`);
  if (!row.enabled) throw new Error(`MCP provider '${row.name}' is disabled`);
  const health: any = getDb().prepare('SELECT status FROM mcp_provider_health WHERE provider_id=?').get(row.id);
  if (health?.status === 'unreachable') throw new Error(`MCP provider '${row.name}' is currently unreachable`);

  const callId = recordToolCall(ctx, req, 'approved', approvalId);
  const receiptId = beginReceipt(ctx, { callId, providerId: row.id, tool: auth.tool.name, target: req.target, risk: auth.tool.risk, approvalId, arguments: req.arguments ?? {} });
  try {
    const adapter = new GovernedMcpAdapter();
    const result = await adapter.invoke(ctx, { id: row.id, name: row.name, kind: row.kind === 'kali' ? 'kali' : row.kind === 'hexstrike' ? 'hexstrike' : 'generic', endpoint: row.endpoint, enabled: Boolean(row.enabled) }, auth.tool.upstreamName ?? auth.tool.name, req.arguments ?? {}, auth.tool.inputSchema, signal);
    const timedOut = /abort|timeout/i.test(result.error || '');
    const normalized = result.ok ? normalizeMcpResult(row.id, auth.tool.name, result.result) : undefined;
    finishReceipt(ctx, receiptId, result.ok ? 'completed' : timedOut ? 'timeout' : 'failed', normalized ?? result.result, result.error);
    return { status: result.ok ? 'completed' : timedOut ? 'timeout' : 'failed', callId, receiptId, ...result, normalized };
  } catch (e) {
    const error = String((e as Error).message);
    finishReceipt(ctx, receiptId, /abort|timeout/i.test(error) ? 'timeout' : 'failed', undefined, error);
    throw e;
  }
}
