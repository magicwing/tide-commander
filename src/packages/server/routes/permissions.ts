/**
 * Permission Routes
 * HTTP endpoints for permission request handling (used by hooks)
 */

import { Router, Request, Response } from 'express';
import * as permissionService from '../services/permission-service.js';
import * as agentService from '../services/agent-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PermissionRoutes');
const router = Router();

/**
 * POST /api/permission-request
 * Called by the permission hook to request user approval
 * This endpoint blocks until the user responds or timeout
 */
router.post('/permission-request', async (req: Request, res: Response) => {
  try {
    const { id, sessionId, tool, toolInput, toolUseId, timestamp } = req.body;

    log.log(`Permission request received: ${id} for tool ${tool}, session ${sessionId}`);

    if (!id || !sessionId || !tool) {
      res.status(400).json({ error: 'Missing required fields: id, sessionId, tool' });
      return;
    }

    // Find the agent by session ID
    const agentId = permissionService.findAgentBySessionId(
      sessionId,
      agentService.getAgent,
      agentService.getAllAgents
    );

    if (!agentId) {
      log.log(`No agent found for session ${sessionId}`);
      // If we can't find the agent, we can't determine permission mode
      // Default to blocking for safety
      res.json({ decision: 'block', reason: 'Agent not found for session' });
      return;
    }

    const agent = agentService.getAgent(agentId);
    if (!agent) {
      res.json({ decision: 'block', reason: 'Agent not found' });
      return;
    }

    // Check if agent is in interactive permission mode
    if (agent.permissionMode !== 'interactive') {
      log.log(`Agent ${agentId} is in ${agent.permissionMode} mode, auto-approving`);
      // In bypass mode, auto-approve (though this shouldn't be called in bypass mode)
      res.json({ decision: 'approve' });
      return;
    }

    // Create permission request and wait for user response
    const decision = await permissionService.createPermissionRequest(
      {
        id,
        sessionId,
        tool,
        toolInput,
        toolUseId,
        timestamp,
      },
      agentId
    );

    log.log(`Permission request ${id} resolved: ${decision.decision}`);
    res.json(decision);
  } catch (err: any) {
    log.error('Permission request error:', err);
    res.status(500).json({ decision: 'block', reason: `Server error: ${err.message}` });
  }
});

/**
 * GET /api/permission-requests
 * Get all pending permission requests (for debugging/monitoring)
 */
router.get('/permission-requests', (_req: Request, res: Response) => {
  const requests = permissionService.getPendingRequests();
  res.json(requests);
});

/**
 * GET /api/permission-requests/:agentId
 * Get pending permission requests for a specific agent
 */
router.get('/permission-requests/:agentId', (req: Request, res: Response) => {
  const agentId = req.params.agentId as string;
  const requests = permissionService.getPendingRequestsForAgent(agentId);
  res.json(requests);
});

// ============================================================================
// Remembered Patterns API
// ============================================================================

/**
 * GET /api/remembered-patterns
 * Get all remembered permission patterns
 */
router.get('/remembered-patterns', (_req: Request, res: Response) => {
  const patterns = permissionService.getRememberedPatterns();
  res.json(patterns);
});

/**
 * DELETE /api/remembered-patterns
 * Clear all remembered patterns
 */
router.delete('/remembered-patterns', (_req: Request, res: Response) => {
  permissionService.clearRememberedPatterns();
  res.json({ success: true, message: 'All remembered patterns cleared' });
});

/**
 * DELETE /api/remembered-patterns/:tool/:pattern
 * Remove a specific remembered pattern
 */
router.delete('/remembered-patterns/:tool/:pattern', (req: Request<{ tool: string; pattern: string }>, res: Response) => {
  const tool = req.params.tool;
  const pattern = req.params.pattern;
  // Decode the pattern (it may be URL-encoded)
  const decodedPattern = decodeURIComponent(pattern);
  const removed = permissionService.removeRememberedPattern(tool, decodedPattern);

  if (removed) {
    res.json({ success: true, message: `Pattern removed: ${tool} -> ${decodedPattern}` });
  } else {
    res.status(404).json({ success: false, message: 'Pattern not found' });
  }
});

export default router;
