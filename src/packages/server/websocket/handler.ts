/**
 * WebSocket Handler
 * Real-time communication with clients
 */

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Agent, AgentClass, ClientMessage, ServerMessage, DrawingArea, Building, PermissionRequest, DelegationDecision, Skill, CustomAgentClass } from '../../shared/types.js';
import { agentService, claudeService, supervisorService, permissionService, bossService, skillService, customClassService, bossMessageService, agentLifecycleService } from '../services/index.js';
import { loadAreas, saveAreas, loadBuildings, saveBuildings } from '../data/index.js';
import { parseContextOutput } from '../claude/backend.js';
import { logger, createLogger, formatToolActivity } from '../utils/index.js';
import type { HandlerContext } from './handlers/types.js';
import {
  handleSpawnAgent,
  handleKillAgent,
  handleStopAgent,
  handleClearContext,
  handleCollapseContext,
  handleRequestContextStats,
  handleMoveAgent,
  handleRemoveAgent,
  handleRenameAgent,
  handleUpdateAgentProperties,
  handleCreateDirectory,
  unlinkAgentFromBossHierarchy,
} from './handlers/agent-handler.js';
import {
  handleCreateSkill,
  handleUpdateSkill,
  handleDeleteSkill,
  handleAssignSkill,
  handleUnassignSkill,
  handleRequestAgentSkills,
} from './handlers/skill-handler.js';
import {
  handleSpawnBossAgent,
  handleAssignSubordinates,
  handleRemoveSubordinate,
  handleSendBossCommand,
  handleRequestDelegationHistory,
} from './handlers/boss-handler.js';
import {
  handleCreateCustomAgentClass,
  handleUpdateCustomAgentClass,
  handleDeleteCustomAgentClass,
} from './handlers/custom-class-handler.js';
import { handleBuildingCommand } from './handlers/building-handler.js';
import { handleSendCommand } from './handlers/command-handler.js';
import { parseBossDelegation, parseBossSpawn } from './handlers/boss-response-handler.js';

const log = logger.ws;
const supervisorLog = createLogger('Supervisor');

// Connected clients
const clients = new Set<WebSocket>();

// ============================================================================
// Output Deduplication
// ============================================================================

/**
 * Tracks seen output hashes per agent to prevent duplicates.
 * Key: agentId, Value: Set of output hashes
 */
const seenOutputs = new Map<string, Set<string>>();

// Max hashes to keep per agent before trimming (FIFO)
const MAX_SEEN_HASHES = 200;

/**
 * Generate a hash key for an output message.
 * Uses full text content to ensure uniqueness.
 */
function getOutputHash(text: string): string {
  // Simple string hash for the full text
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16);
}

/**
 * Check if an output is a duplicate and should be skipped.
 * Simply checks if we've seen this exact text before for this agent.
 */
function isDuplicateOutput(agentId: string, text: string, _isStreaming: boolean): boolean {
  const hash = getOutputHash(text);

  // Get or create agent's seen set
  let seen = seenOutputs.get(agentId);
  if (!seen) {
    seen = new Set();
    seenOutputs.set(agentId, seen);
  }

  // Check if we've seen this hash before
  if (seen.has(hash)) {
    log.log(`[DEDUP] Skipping duplicate output for ${agentId}: "${text.slice(0, 50)}..."`);
    return true;
  }

  // Record this hash
  seen.add(hash);

  // Trim if too many (keep most recent by converting to array and back)
  if (seen.size > MAX_SEEN_HASHES) {
    const arr = Array.from(seen);
    const trimmed = arr.slice(-MAX_SEEN_HASHES);
    seenOutputs.set(agentId, new Set(trimmed));
  }

  return false;
}

/**
 * Clear dedup cache for an agent (called when agent is deleted/killed)
 */
export function clearOutputDedup(agentId: string): void {
  seenOutputs.delete(agentId);
}

// ============================================================================
// Broadcasting
// ============================================================================

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch (err) {
        log.error(`Failed to send ${message.type} to client:`, err);
      }
    }
  }
}

function sendActivity(agentId: string, message: string): void {
  const agent = agentService.getAgent(agentId);
  broadcast({
    type: 'activity',
    payload: {
      agentId,
      agentName: agent?.name || 'Unknown',
      message,
      timestamp: Date.now(),
    },
  });
}

/**
 * Handle sync messages by saving data and broadcasting to other clients
 */
function handleSyncMessage<T>(
  ws: WebSocket,
  payload: T[],
  entityName: string,
  saveFn: (data: T[]) => void,
  updateType: string
): void {
  saveFn(payload);
  log.log(` Saved ${payload.length} ${entityName}`);
  // Broadcast to all other clients (exclude sender)
  for (const client of clients) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: updateType, payload }));
    }
  }
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Create a handler context for the given WebSocket client
 */
function createHandlerContext(ws: WebSocket): HandlerContext {
  return {
    ws,
    broadcast,
    sendToClient: (message: ServerMessage) => {
      ws.send(JSON.stringify(message));
    },
    sendError: (message: string) => {
      ws.send(JSON.stringify({ type: 'error', payload: { message } }));
    },
    sendActivity,
  };
}

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {

  const ctx = createHandlerContext(ws);

  switch (message.type) {
    case 'spawn_agent':
      handleSpawnAgent(ctx, message.payload);
      break;

    case 'send_command':
      handleSendCommand(ctx, message.payload, bossMessageService.buildBossMessage);
      break;

    case 'move_agent':
      handleMoveAgent(ctx, message.payload);
      break;

    case 'kill_agent':
      handleKillAgent(ctx, message.payload);
      break;

    case 'stop_agent':
      handleStopAgent(ctx, message.payload);
      break;

    case 'clear_context':
      handleClearContext(ctx, message.payload);
      break;

    case 'collapse_context':
      handleCollapseContext(ctx, message.payload);
      break;

    case 'request_context_stats':
      handleRequestContextStats(ctx, message.payload);
      break;

    case 'remove_agent':
      handleRemoveAgent(ctx, message.payload);
      break;

    case 'rename_agent':
      handleRenameAgent(ctx, message.payload);
      break;

    case 'update_agent_properties':
      handleUpdateAgentProperties(ctx, message.payload);
      break;

    case 'create_directory':
      handleCreateDirectory(ctx, message.payload);
      break;

    case 'set_supervisor_config':
      supervisorService.setConfig(message.payload);
      break;

    case 'request_supervisor_report':
      supervisorLog.log('Report requested by frontend');
      supervisorService
        .generateReport()
        .then((report) => {
          ws.send(
            JSON.stringify({
              type: 'supervisor_report',
              payload: report,
            })
          );
        })
        .catch((err) => {
          log.error(' Supervisor report failed:', err);
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: { message: `Supervisor report failed: ${err.message}` },
            })
          );
        });
      break;

    case 'request_agent_supervisor_history':
      {
        const history = supervisorService.getAgentSupervisorHistory(message.payload.agentId);
        ws.send(
          JSON.stringify({
            type: 'agent_supervisor_history',
            payload: history,
          })
        );
      }
      break;

    case 'request_global_usage':
      {
        console.log('[WS] Received request_global_usage');
        // First, send current cached usage if available
        const cachedUsage = supervisorService.getGlobalUsage();
        console.log('[WS] Cached usage:', cachedUsage);
        if (cachedUsage) {
          ws.send(
            JSON.stringify({
              type: 'global_usage',
              payload: cachedUsage,
            })
          );
        }

        // Then request a refresh from an idle agent
        console.log('[WS] Requesting usage refresh from idle agent...');
        supervisorService.requestUsageRefresh().then((agentId) => {
          console.log('[WS] Usage refresh result - agentId:', agentId);
          if (!agentId && !cachedUsage) {
            console.log('[WS] No agent available and no cached usage, sending null');
            ws.send(
              JSON.stringify({
                type: 'global_usage',
                payload: null, // No data available
              })
            );
          }
          // If refresh was requested, the response will come through the event system
        });
      }
      break;

    case 'sync_areas':
      handleSyncMessage(ws, message.payload, 'areas', saveAreas, 'areas_update');
      break;

    case 'sync_buildings':
      handleSyncMessage(ws, message.payload, 'buildings', saveBuildings, 'buildings_update');
      break;

    case 'building_command':
      handleBuildingCommand(ctx, message.payload);
      break;

    case 'permission_response':
      {
        const { requestId, approved, reason, remember } = message.payload;
        log.log(` Permission response: ${requestId} -> ${approved ? 'approved' : 'denied'}${remember ? ' (remember)' : ''}`);
        const handled = permissionService.respondToPermissionRequest({
          requestId,
          approved,
          reason,
          remember,
        });
        if (handled) {
          // Broadcast that the permission was resolved
          broadcast({
            type: 'permission_resolved',
            payload: { requestId, approved },
          });
        } else {
          log.log(` No pending request found for ${requestId}`);
        }
      }
      break;

    // ========================================================================
    // Boss Agent Messages
    // ========================================================================

    case 'spawn_boss_agent':
      handleSpawnBossAgent(ctx, message.payload);
      break;

    case 'assign_subordinates':
      handleAssignSubordinates(ctx, message.payload);
      break;

    case 'remove_subordinate':
      handleRemoveSubordinate(ctx, message.payload);
      break;

    case 'send_boss_command':
      handleSendBossCommand(ctx, message.payload);
      break;

    case 'request_delegation_history':
      handleRequestDelegationHistory(ctx, message.payload);
      break;

    // ========================================================================
    // Skill Messages
    // ========================================================================

    case 'create_skill':
      handleCreateSkill(ctx, message.payload);
      break;

    case 'update_skill':
      handleUpdateSkill(ctx, message.payload);
      break;

    case 'delete_skill':
      handleDeleteSkill(ctx, message.payload);
      break;

    case 'assign_skill':
      handleAssignSkill(ctx, message.payload);
      break;

    case 'unassign_skill':
      handleUnassignSkill(ctx, message.payload);
      break;

    case 'request_agent_skills':
      handleRequestAgentSkills(ctx, message.payload);
      break;

    // ========================================================================
    // Custom Agent Class Messages
    // ========================================================================

    case 'create_custom_agent_class':
      handleCreateCustomAgentClass(ctx, message.payload);
      break;

    case 'update_custom_agent_class':
      handleUpdateCustomAgentClass(ctx, message.payload);
      break;

    case 'delete_custom_agent_class':
      handleDeleteCustomAgentClass(ctx, message.payload);
      break;
  }
}


// ============================================================================
// Service Event Handlers
// ============================================================================

function setupServiceListeners(): void {
  // Agent events
  agentService.subscribe((event, data) => {
    switch (event) {
      case 'created':
        // Already handled in handleClientMessage
        break;
      case 'updated':
        broadcast({
          type: 'agent_updated',
          payload: data as Agent,
        });
        break;
      case 'deleted':
        broadcast({
          type: 'agent_deleted',
          payload: { id: data as string },
        });
        sendActivity(data as string, 'Agent terminated');
        break;
    }
  });

  // Claude events
  claudeService.on('event', (agentId, event) => {
    // Send activity for important events
    if (event.type === 'init') {
      sendActivity(agentId, `Session initialized (${event.model})`);
    } else if (event.type === 'tool_start') {
      const details = formatToolActivity(event.toolName, event.toolInput);
      sendActivity(agentId, details);
    } else if (event.type === 'error') {
      sendActivity(agentId, `Error: ${event.errorMessage}`);
    }

    // For boss agents, parse delegation and spawn blocks from step_complete result text
    if (event.type === 'step_complete' && event.resultText) {
      const agent = agentService.getAgent(agentId);
      if (agent?.isBoss || agent?.class === 'boss') {
        parseBossDelegation(agentId, agent.name, event.resultText, broadcast);
        parseBossSpawn(agentId, agent.name, event.resultText, broadcast, sendActivity);
      }
    }

    // Parse and broadcast context stats from /context command
    if (event.type === 'context_stats' && event.contextStatsRaw) {
      const stats = parseContextOutput(event.contextStatsRaw);
      if (stats) {
        agentService.updateAgent(agentId, { contextStats: stats }, false);
        broadcast({
          type: 'context_stats',
          payload: { agentId, stats },
        });
      }
    }

    // Broadcast raw event
    broadcast({
      type: 'event',
      payload: { ...event, agentId } as any,
    });
  });

  claudeService.on('output', (agentId, text, isStreaming) => {
    // Server-side deduplication to prevent duplicate messages during streaming
    const isDuplicate = isDuplicateOutput(agentId, text, isStreaming || false);

    // Debug logging for tool outputs to track duplicates
    if (text.startsWith('Using tool:') || text.startsWith('Tool input:') || text.startsWith('Tool result:')) {
      const textPreview = text.slice(0, 80).replace(/\n/g, '\\n');
      log.log(`[OUTPUT] agent=${agentId.slice(0,4)} streaming=${isStreaming} duplicate=${isDuplicate} text="${textPreview}..."`);
    }

    if (isDuplicate) {
      return;
    }

    broadcast({
      type: 'output' as any,
      payload: {
        agentId,
        text,
        isStreaming: isStreaming || false,
        timestamp: Date.now(),
      },
    });
  });

  claudeService.on('complete', (agentId, success) => {
    sendActivity(agentId, success ? 'Task completed' : 'Task failed');
  });

  claudeService.on('error', (agentId, error) => {
    sendActivity(agentId, `Error: ${error}`);
  });

  // Set up command started callback
  claudeService.setCommandStartedCallback((agentId, command) => {
    broadcast({
      type: 'command_started',
      payload: { agentId, command },
    });
  });

  // Permission events
  permissionService.subscribe((request: PermissionRequest) => {
    log.log(` Broadcasting permission_request: ${request.id} for tool ${request.tool}`);
    broadcast({
      type: 'permission_request',
      payload: request,
    });
    // Also update agent status to 'waiting' while waiting for permission
    const agent = agentService.getAgent(request.agentId);
    if (agent) {
      agentService.updateAgent(request.agentId, {
        status: 'waiting',
        currentTask: `Waiting for permission: ${request.tool}`,
      });
    }
  });

  // Supervisor events
  supervisorService.subscribe((event, data) => {
    switch (event) {
      case 'report':
        broadcast({
          type: 'supervisor_report',
          payload: data,
        } as ServerMessage);
        break;
      case 'agent_analysis':
        // Single agent analysis update
        broadcast({
          type: 'agent_analysis',
          payload: data,
        } as ServerMessage);
        break;
      case 'narrative':
        broadcast({
          type: 'narrative_update',
          payload: data,
        } as ServerMessage);
        break;
      case 'config_changed':
        broadcast({
          type: 'supervisor_status',
          payload: supervisorService.getStatus(),
        } as ServerMessage);
        break;
      case 'global_usage':
        console.log('[WS] Broadcasting global_usage event:', data);
        broadcast({
          type: 'global_usage',
          payload: data,
        } as ServerMessage);
        break;
    }
  });

  // Boss service events
  bossService.subscribe((event, data) => {
    switch (event) {
      case 'delegation_decision':
        broadcast({
          type: 'delegation_decision',
          payload: data as DelegationDecision,
        });
        break;
      case 'subordinates_updated':
        const { bossId, subordinateIds } = data as { bossId: string; subordinateIds: string[] };
        broadcast({
          type: 'boss_subordinates_updated',
          payload: { bossId, subordinateIds },
        });
        break;
    }
  });

  // Skill service events
  skillService.subscribe((event, data) => {
    switch (event) {
      case 'created':
        broadcast({
          type: 'skill_created',
          payload: data as Skill,
        });
        break;
      case 'updated':
        broadcast({
          type: 'skill_updated',
          payload: data as Skill,
        });
        // Auto-restart agents using this skill so they get the updated content
        agentLifecycleService.restartAgentsWithSkill(data as Skill, sendActivity);
        break;
      case 'deleted':
        broadcast({
          type: 'skill_deleted',
          payload: { id: data as string },
        });
        break;
      case 'assigned':
        // Assignment changes (adding/removing agents) - broadcast but don't restart
        // This fixes the bug where assigning a skill to a new agent would restart
        // all other agents that already had the skill
        broadcast({
          type: 'skill_updated',
          payload: data as Skill,
        });
        break;
    }
  });

  // Custom agent class service events
  customClassService.customClassEvents.on('created', (customClass: CustomAgentClass) => {
    broadcast({
      type: 'custom_agent_class_created',
      payload: customClass,
    });
  });

  customClassService.customClassEvents.on('updated', (customClass: CustomAgentClass) => {
    broadcast({
      type: 'custom_agent_class_updated',
      payload: customClass,
    });

    // Auto-restart agents when their class instructions are updated
    // This ensures running agents get the new instructions
    agentLifecycleService.restartAgentsWithClass(customClass.id, sendActivity);
  });

  customClassService.customClassEvents.on('deleted', (id: string) => {
    broadcast({
      type: 'custom_agent_class_deleted',
      payload: { id },
    });
  });
}

// ============================================================================
// Initialization
// ============================================================================

export function init(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws) => {
    clients.add(ws);
    log.log(`🔗 Client connected (total: ${clients.size})`);

    // Sync agent status with actual process state before sending to client
    // This only corrects 'working' -> 'idle' if the process is dead
    await claudeService.syncAllAgentStatus();

    // Send current state
    const agents = agentService.getAllAgents();
    ws.send(JSON.stringify({ type: 'agents_update', payload: agents }));

    // Send current areas
    const areas = loadAreas();
    ws.send(JSON.stringify({ type: 'areas_update', payload: areas }));

    // Send current buildings
    const buildings = loadBuildings();
    ws.send(JSON.stringify({ type: 'buildings_update', payload: buildings }));

    // Send current skills
    const skills = skillService.getAllSkills();
    ws.send(JSON.stringify({ type: 'skills_update', payload: skills }));

    // Send current custom agent classes
    const customClasses = customClassService.getAllCustomClasses();
    ws.send(JSON.stringify({ type: 'custom_agent_classes_update', payload: customClasses }));

    // Send pending permission requests
    const pendingPermissions = permissionService.getPendingRequests();
    if (pendingPermissions.length > 0) {
      log.log(` Sending ${pendingPermissions.length} pending permission requests`);
      for (const request of pendingPermissions) {
        ws.send(
          JSON.stringify({
            type: 'permission_request',
            payload: request,
          })
        );
      }
    }

    ws.on('message', (data) => {
      const dataStr = data.toString();
      try {
        const message = JSON.parse(dataStr) as ClientMessage;
        handleClientMessage(ws, message);
      } catch (err) {
        log.error('Invalid message:', err, dataStr.substring(0, 100));
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      log.log(`🔴 Client disconnected (remaining: ${clients.size})`);
    });
  });

  // Set up service event listeners
  setupServiceListeners();

  log.log(' Handler initialized');
  return wss;
}
 
