/**
 * WebSocket Handler
 * Real-time communication with clients
 */

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as fs from 'fs';
import type { Agent, ClientMessage, ServerMessage, DrawingArea, Building, PermissionRequest, DelegationDecision } from '../../shared/types.js';
import { agentService, claudeService, supervisorService, permissionService, bossService } from '../services/index.js';
import { loadAreas, saveAreas, loadBuildings, saveBuildings } from '../data/index.js';
import { logger, createLogger } from '../utils/logger.js';

const log = logger.ws;
const supervisorLog = createLogger('Supervisor');

// Connected clients
const clients = new Set<WebSocket>();

// ============================================================================
// Broadcasting
// ============================================================================

export function broadcast(message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
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

// ============================================================================
// Message Handling
// ============================================================================

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
  log.log(` Received: ${message.type}`);

  switch (message.type) {
    case 'spawn_agent':
      agentService
        .createAgent(
          message.payload.name,
          message.payload.class,
          message.payload.cwd,
          message.payload.position,
          message.payload.sessionId,
          message.payload.useChrome,
          message.payload.permissionMode
        )
        .then((agent) => {
          broadcast({
            type: 'agent_created',
            payload: agent,
          });
          sendActivity(agent.id, `${agent.name} deployed`);
        })
        .catch((err) => {
          log.error(' Failed to spawn agent:', err);
          // Check if this is a directory not found error
          if (err.message?.includes('Directory does not exist')) {
            ws.send(
              JSON.stringify({
                type: 'directory_not_found',
                payload: {
                  path: message.payload.cwd,
                  name: message.payload.name,
                  class: message.payload.class,
                },
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: err.message },
              })
            );
          }
        });
      break;

    case 'send_command':
      {
        const { agentId, command } = message.payload;
        const agent = agentService.getAgent(agentId);

        // If this is a boss agent, enhance the command with subordinate context
        if (agent?.class === 'boss') {
          // Check if this looks like a delegation request (action command vs question)
          const isQuestion = /^(what|who|how|why|where|when|which|tell me|show|list|status|report)/i.test(command.trim());

          if (!isQuestion) {
            // This looks like a task - route through delegation system
            log.log(` Boss ${agent.name} received task command, routing to delegation`);

            // Check if boss has subordinates
            const subordinates = bossService.getSubordinates(agentId);
            if (subordinates.length === 0) {
              // No subordinates - boss handles it directly with context
              buildBossContext(agentId, agent.name, command)
                .then((enhancedCommand) => {
                  claudeService.sendCommand(agentId, enhancedCommand);
                })
                .catch(() => {
                  claudeService.sendCommand(agentId, command);
                });
            } else {
              // Has subordinates - delegate the task
              bossService
                .delegateCommand(agentId, command)
                .then((decision) => {
                  // Notify boss about the delegation
                  sendActivity(agentId, `Delegating to ${decision.selectedAgentName}: ${decision.reasoning}`);

                  // Send the command to the selected subordinate
                  claudeService
                    .sendCommand(decision.selectedAgentId, command)
                    .then(() => {
                      sendActivity(decision.selectedAgentId, `Task from boss: ${command.slice(0, 50)}...`);
                    })
                    .catch((err) => {
                      log.error(' Failed to send delegated command:', err);
                      sendActivity(agentId, `Delegation failed: ${err.message}`);
                    });
                })
                .catch((err) => {
                  log.error(' Delegation failed:', err);
                  sendActivity(agentId, `Delegation error: ${err.message}`);
                  // Fall back to sending directly to boss with context
                  buildBossContext(agentId, agent.name, command)
                    .then((enhancedCommand) => {
                      claudeService.sendCommand(agentId, enhancedCommand);
                    })
                    .catch(() => {
                      claudeService.sendCommand(agentId, command);
                    });
                });
            }
          } else {
            // This is a question - enhance with full subordinate context including supervisor history
            buildBossContext(agentId, agent.name, command)
              .then((enhancedCommand) => {
                claudeService.sendCommand(agentId, enhancedCommand);
              })
              .catch(() => {
                // Fall back to sending without context
                claudeService.sendCommand(agentId, command);
              });
          }
        } else {
          // Regular agent - send command directly
          claudeService
            .sendCommand(agentId, command)
            .catch((err) => {
              log.error(' Failed to send command:', err);
              sendActivity(agentId, `Error: ${err.message}`);
            });
        }
      }
      break;

    case 'move_agent':
      // Don't update lastActivity for position changes (false = don't update activity timer)
      agentService.updateAgent(message.payload.agentId, {
        position: message.payload.position,
      }, false);
      break;

    case 'kill_agent':
      claudeService.stopAgent(message.payload.agentId).then(() => {
        agentService.deleteAgent(message.payload.agentId);
      });
      break;

    case 'stop_agent':
      // Stop current operation but keep agent alive
      claudeService.stopAgent(message.payload.agentId).then(() => {
        agentService.updateAgent(message.payload.agentId, {
          status: 'idle',
          currentTask: undefined,
          currentTool: undefined,
        });
        sendActivity(message.payload.agentId, 'Operation cancelled');
      });
      break;

    case 'remove_agent':
      // Remove from persistence only (keeps Claude session running)
      agentService.deleteAgent(message.payload.agentId);
      break;

    case 'rename_agent':
      // Don't update lastActivity for name changes
      agentService.updateAgent(message.payload.agentId, {
        name: message.payload.name,
      }, false);
      break;

    case 'create_directory':
      try {
        // Create directory recursively
        fs.mkdirSync(message.payload.path, { recursive: true });
        log.log(` Created directory: ${message.payload.path}`);

        // Now spawn the agent
        agentService
          .createAgent(
            message.payload.name,
            message.payload.class,
            message.payload.path
          )
          .then((agent) => {
            broadcast({
              type: 'agent_created',
              payload: agent,
            });
            sendActivity(agent.id, `${agent.name} deployed`);
          })
          .catch((err) => {
            log.error(' Failed to spawn agent after creating directory:', err);
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: err.message },
              })
            );
          });
      } catch (err: any) {
        log.error(' Failed to create directory:', err);
        ws.send(
          JSON.stringify({
            type: 'error',
            payload: { message: `Failed to create directory: ${err.message}` },
          })
        );
      }
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

    case 'sync_areas':
      // Save areas to persistent storage and broadcast to all clients
      saveAreas(message.payload);
      log.log(` Saved ${message.payload.length} areas`);
      // Broadcast to all other clients
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'areas_update',
            payload: message.payload,
          }));
        }
      }
      break;

    case 'sync_buildings':
      // Save buildings to persistent storage and broadcast to all clients
      saveBuildings(message.payload);
      log.log(` Saved ${message.payload.length} buildings`);
      // Broadcast to all other clients
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'buildings_update',
            payload: message.payload,
          }));
        }
      }
      break;

    case 'building_command':
      handleBuildingCommand(ws, message.payload.buildingId, message.payload.command);
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
      agentService
        .createAgent(
          message.payload.name,
          'boss', // Always boss class
          message.payload.cwd,
          message.payload.position,
          undefined, // sessionId - bosses start fresh
          message.payload.useChrome,
          message.payload.permissionMode
        )
        .then((agent) => {
          // Assign initial subordinates if provided
          if (message.payload.subordinateIds && message.payload.subordinateIds.length > 0) {
            bossService.assignSubordinates(agent.id, message.payload.subordinateIds);
          }
          broadcast({
            type: 'agent_created',
            payload: agentService.getAgent(agent.id) || agent, // Get updated version with subordinates
          });
          sendActivity(agent.id, `Boss ${agent.name} deployed`);
        })
        .catch((err) => {
          log.error(' Failed to spawn boss agent:', err);
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: { message: err.message },
            })
          );
        });
      break;

    case 'assign_subordinates':
      try {
        bossService.assignSubordinates(
          message.payload.bossId,
          message.payload.subordinateIds
        );
        const boss = agentService.getAgent(message.payload.bossId);
        if (boss) {
          broadcast({
            type: 'boss_subordinates_updated',
            payload: {
              bossId: message.payload.bossId,
              subordinateIds: boss.subordinateIds || [],
            },
          });
          sendActivity(message.payload.bossId, `Team updated: ${message.payload.subordinateIds.length} subordinates`);
        }
      } catch (err: any) {
        log.error(' Failed to assign subordinates:', err);
        ws.send(
          JSON.stringify({
            type: 'error',
            payload: { message: err.message },
          })
        );
      }
      break;

    case 'remove_subordinate':
      try {
        bossService.removeSubordinate(
          message.payload.bossId,
          message.payload.subordinateId
        );
        const boss = agentService.getAgent(message.payload.bossId);
        if (boss) {
          broadcast({
            type: 'boss_subordinates_updated',
            payload: {
              bossId: message.payload.bossId,
              subordinateIds: boss.subordinateIds || [],
            },
          });
        }
      } catch (err: any) {
        log.error(' Failed to remove subordinate:', err);
        ws.send(
          JSON.stringify({
            type: 'error',
            payload: { message: err.message },
          })
        );
      }
      break;

    case 'send_boss_command':
      {
        const { bossId, command } = message.payload;
        log.log(` Boss command: ${bossId} -> "${command.slice(0, 50)}..."`);

        bossService
          .delegateCommand(bossId, command)
          .then((decision) => {
            // Send the command to the selected subordinate
            claudeService
              .sendCommand(decision.selectedAgentId, command)
              .then(() => {
                sendActivity(bossId, `Delegated to ${decision.selectedAgentName}`);
              })
              .catch((err) => {
                log.error(' Failed to send delegated command:', err);
                sendActivity(bossId, `Delegation failed: ${err.message}`);
              });
          })
          .catch((err) => {
            log.error(' Delegation failed:', err);
            sendActivity(bossId, `Delegation error: ${err.message}`);
            ws.send(
              JSON.stringify({
                type: 'error',
                payload: { message: `Delegation failed: ${err.message}` },
              })
            );
          });
      }
      break;

    case 'request_delegation_history':
      {
        const history = bossService.getDelegationHistory(message.payload.bossId);
        ws.send(
          JSON.stringify({
            type: 'delegation_history',
            payload: {
              bossId: message.payload.bossId,
              decisions: history,
            },
          })
        );
      }
      break;
  }
}

// ============================================================================
// Building Command Handling
// ============================================================================

async function handleBuildingCommand(
  ws: WebSocket,
  buildingId: string,
  command: 'start' | 'stop' | 'restart' | 'healthCheck' | 'logs'
): Promise<void> {
  const buildings = loadBuildings();
  const building = buildings.find(b => b.id === buildingId);

  if (!building) {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: `Building not found: ${buildingId}` },
    }));
    return;
  }

  const cmdString = building.commands?.[command];
  if (!cmdString && command !== 'logs') {
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: `No ${command} command configured for building: ${building.name}` },
    }));
    return;
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Update building status
    const updateStatus = (status: Building['status']) => {
      const idx = buildings.findIndex(b => b.id === buildingId);
      if (idx !== -1) {
        buildings[idx] = { ...buildings[idx], status, lastActivity: Date.now() };
        saveBuildings(buildings);
        broadcast({
          type: 'building_updated',
          payload: buildings[idx],
        });
      }
    };

    if (command === 'start') {
      updateStatus('starting');
      exec(cmdString!, { cwd: building.cwd }, (error) => {
        if (error) {
          updateStatus('error');
          broadcast({
            type: 'building_logs',
            payload: { buildingId, logs: `Start error: ${error.message}`, timestamp: Date.now() },
          });
        } else {
          updateStatus('running');
        }
      });
      log.log(` Building ${building.name}: starting with command: ${cmdString}`);

    } else if (command === 'stop') {
      updateStatus('stopping');
      exec(cmdString!, { cwd: building.cwd }, (error) => {
        if (error) {
          broadcast({
            type: 'building_logs',
            payload: { buildingId, logs: `Stop error: ${error.message}`, timestamp: Date.now() },
          });
        }
        updateStatus('stopped');
      });
      log.log(` Building ${building.name}: stopping with command: ${cmdString}`);

    } else if (command === 'restart') {
      updateStatus('starting');
      exec(cmdString!, { cwd: building.cwd }, (error) => {
        if (error) {
          updateStatus('error');
          broadcast({
            type: 'building_logs',
            payload: { buildingId, logs: `Restart error: ${error.message}`, timestamp: Date.now() },
          });
        } else {
          updateStatus('running');
        }
      });
      log.log(` Building ${building.name}: restarting with command: ${cmdString}`);

    } else if (command === 'healthCheck') {
      try {
        const { stdout, stderr } = await execAsync(cmdString!, { cwd: building.cwd, timeout: 10000 });
        const idx = buildings.findIndex(b => b.id === buildingId);
        if (idx !== -1) {
          buildings[idx] = {
            ...buildings[idx],
            status: 'running',
            lastHealthCheck: Date.now(),
          };
          saveBuildings(buildings);
          broadcast({
            type: 'building_updated',
            payload: buildings[idx],
          });
        }
        log.log(` Building ${building.name}: health check passed`);
      } catch (error: any) {
        const idx = buildings.findIndex(b => b.id === buildingId);
        if (idx !== -1) {
          buildings[idx] = {
            ...buildings[idx],
            status: 'error',
            lastHealthCheck: Date.now(),
            lastError: error.message,
          };
          saveBuildings(buildings);
          broadcast({
            type: 'building_updated',
            payload: buildings[idx],
          });
        }
        log.log(` Building ${building.name}: health check failed: ${error.message}`);
      }

    } else if (command === 'logs') {
      const logsCmd = building.commands?.logs || 'echo "No logs command configured"';
      exec(logsCmd, { cwd: building.cwd, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        const logs = error ? `Error: ${error.message}\n${stderr}` : stdout;
        broadcast({
          type: 'building_logs',
          payload: { buildingId, logs, timestamp: Date.now() },
        });
      });
      log.log(` Building ${building.name}: fetching logs`);
    }

  } catch (error: any) {
    log.error(` Building command error:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      payload: { message: `Building command error: ${error.message}` },
    }));
  }
}

// ============================================================================
// Tool Details Formatting
// ============================================================================

function formatToolDetails(
  toolName?: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolName) return 'Using unknown tool';

  // Get the key parameter for this tool type
  const param = toolInput ? getKeyParam(toolName, toolInput) : null;

  if (param) {
    return `${toolName}: ${param}`;
  }
  return `Using ${toolName}`;
}

function getKeyParam(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  switch (toolName) {
    case 'WebSearch':
      return truncate(input.query as string, 50);
    case 'WebFetch':
      return truncate(input.url as string, 60);
    case 'Read':
    case 'Write':
    case 'Edit':
      const filePath = (input.file_path || input.path) as string;
      if (!filePath) return null;
      // Show just the filename for long paths
      if (filePath.length > 40) {
        const parts = filePath.split('/');
        return '.../' + parts.slice(-2).join('/');
      }
      return filePath;
    case 'Bash':
      const cmd = input.command as string;
      return cmd ? truncate(cmd, 60) : null;
    case 'Grep':
      return input.pattern ? `"${truncate(input.pattern as string, 40)}"` : null;
    case 'Glob':
      return truncate(input.pattern as string, 50);
    case 'Task':
      return truncate(input.description as string, 50);
    case 'TodoWrite':
      const todos = input.todos as unknown[];
      if (todos?.length) {
        return `${todos.length} item${todos.length > 1 ? 's' : ''}`;
      }
      return null;
    default:
      // Try to find any meaningful string parameter
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string' && value.length > 0 && value.length < 100) {
          return truncate(value, 50);
        }
      }
      return null;
  }
}

function truncate(str: string | undefined | null, maxLen: number): string | null {
  if (!str) return null;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ============================================================================
// Boss Context Builder
// ============================================================================

/**
 * Build comprehensive context for boss agent including:
 * - Subordinate status and current tasks
 * - Supervisor history for each subordinate
 * - Working directories and responsibilities
 */
async function buildBossContext(bossId: string, bossName: string, userCommand: string): Promise<string> {
  const contexts = await bossService.gatherSubordinateContext(bossId);
  const subordinates = bossService.getSubordinates(bossId);

  if (contexts.length === 0) {
    return `[BOSS AGENT CONTEXT]
You are "${bossName}", a Boss Agent in Tide Commander.

ROLE: You are a team coordinator and task router. Your job is to:
1. Understand your team's capabilities and current work
2. Route incoming tasks to the most appropriate subordinate
3. Monitor team progress and provide status updates
4. Coordinate work across multiple agents when needed

CURRENT TEAM: No subordinates assigned yet.

To be effective, you need subordinate agents assigned to your team. Ask the user to assign agents to you.

USER MESSAGE: ${userCommand}`;
  }

  // Build detailed subordinate info with supervisor history
  const subordinateDetails = await Promise.all(contexts.map(async (ctx, i) => {
    const sub = subordinates[i];
    const history = supervisorService.getAgentSupervisorHistory(ctx.id);
    const latestAnalysis = history.entries[0]?.analysis;

    // Get working directory
    const cwd = sub?.cwd || 'Unknown';

    // Build supervisor summary
    let supervisorSummary = 'No supervisor analysis yet.';
    if (latestAnalysis) {
      const parts = [];
      if (latestAnalysis.recentWorkSummary) {
        parts.push(`Recent work: ${latestAnalysis.recentWorkSummary}`);
      }
      if (latestAnalysis.currentFocus) {
        parts.push(`Focus: ${latestAnalysis.currentFocus}`);
      }
      if (latestAnalysis.suggestions && latestAnalysis.suggestions.length > 0) {
        parts.push(`Suggestions: ${latestAnalysis.suggestions.slice(0, 2).join('; ')}`);
      }
      if (parts.length > 0) {
        supervisorSummary = parts.join(' | ');
      }
    }

    // Get last assigned task
    const lastTask = ctx.lastAssignedTask || sub?.lastAssignedTask || 'None';

    return `
## ${ctx.name} (${ctx.class})
- **Status**: ${ctx.status}
- **Current Task**: ${ctx.currentTask || 'None'}
- **Last Assigned Task**: ${lastTask}
- **Working Directory**: ${cwd}
- **Context Usage**: ${ctx.contextPercent}% (${ctx.tokensUsed?.toLocaleString() || 0} tokens)
- **Supervisor Analysis**: ${supervisorSummary}`;
  }));

  // Get recent delegation history for this boss
  const delegationHistory = bossService.getDelegationHistory(bossId).slice(0, 5);
  const delegationSummary = delegationHistory.length > 0
    ? delegationHistory.map(d =>
        `- "${d.userCommand.slice(0, 50)}${d.userCommand.length > 50 ? '...' : ''}" → ${d.selectedAgentName} (${d.confidence})`
      ).join('\n')
    : 'No recent delegations.';

  return `[BOSS AGENT CONTEXT]
You are "${bossName}", a Boss Agent in Tide Commander.

## YOUR ROLE
You are a team coordinator and intelligent task router. Your responsibilities:
1. **Route Tasks**: Analyze incoming requests and delegate to the best-suited subordinate based on their class, current workload, and recent work context
2. **Monitor Progress**: Track what each team member is working on and their context usage
3. **Coordinate Work**: When tasks span multiple areas, coordinate between agents
4. **Provide Updates**: When asked, give detailed status reports on your team

## CLASS SPECIALIZATIONS
- **scout**: Exploration, finding files, understanding codebase structure
- **builder**: Implementing features, writing new code, adding functionality
- **debugger**: Fixing bugs, debugging issues, error investigation
- **architect**: Planning, design decisions, system architecture
- **warrior**: Refactoring, migrations, aggressive code changes
- **support**: Documentation, tests, cleanup, maintenance

## YOUR SUBORDINATES
${subordinateDetails.join('\n')}

## RECENT DELEGATION HISTORY
${delegationSummary}

## ROUTING GUIDELINES
When given a task to delegate:
1. Match task type to agent class (e.g., bug fix → debugger, new feature → builder)
2. Prefer idle agents over working ones
3. Consider context usage - avoid agents with >80% context (risk of overflow)
4. Check if an agent was recently working on related code
5. For complex tasks, you may need to coordinate multiple agents

When asked questions about your team, provide detailed information from the context above.

---
USER MESSAGE: ${userCommand}`;
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
        const updatedAgent = data as Agent;
        log.log(` Broadcasting agent_updated: ${updatedAgent.id} name=${updatedAgent.name} status=${updatedAgent.status}, contextUsed=${updatedAgent.contextUsed}, tokensUsed=${updatedAgent.tokensUsed}, clients=${clients.size}`);
        broadcast({
          type: 'agent_updated',
          payload: updatedAgent,
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
      const details = formatToolDetails(event.toolName, event.toolInput);
      sendActivity(agentId, details);
    } else if (event.type === 'error') {
      sendActivity(agentId, `Error: ${event.errorMessage}`);
    }

    // Broadcast raw event
    broadcast({
      type: 'event',
      payload: { ...event, agentId } as any,
    });
  });

  claudeService.on('output', (agentId, text, isStreaming) => {
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

  // Set up queue update callback
  claudeService.setQueueUpdateCallback((agentId, pendingCommands) => {
    broadcast({
      type: 'queue_update',
      payload: { agentId, pendingCommands },
    });
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
}

// ============================================================================
// Initialization
// ============================================================================

export function init(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws) => {
    log.log(' Client connected');
    clients.add(ws);

    // Sync agent status with actual process state before sending to client
    // This only corrects 'working' -> 'idle' if the process is dead
    await claudeService.syncAllAgentStatus();

    // Send current state
    const agents = agentService.getAllAgents();
    log.log(` Sending initial agents_update with ${agents.length} agents:`);
    for (const agent of agents) {
      console.log(`  - ${agent.name}: status=${agent.status}`);
    }

    ws.send(
      JSON.stringify({
        type: 'agents_update',
        payload: agents,
      })
    );

    // Send current areas
    const areas = loadAreas();
    log.log(` Sending initial areas_update with ${areas.length} areas`);
    ws.send(
      JSON.stringify({
        type: 'areas_update',
        payload: areas,
      })
    );

    // Send current buildings
    const buildings = loadBuildings();
    log.log(` Sending initial buildings_update with ${buildings.length} buildings`);
    ws.send(
      JSON.stringify({
        type: 'buildings_update',
        payload: buildings,
      })
    );

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
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        handleClientMessage(ws, message);
      } catch (err) {
        log.error(' Invalid message:', err);
      }
    });

    ws.on('close', () => {
      log.log(' Client disconnected');
      clients.delete(ws);
    });
  });

  // Set up service event listeners
  setupServiceListeners();

  log.log(' Handler initialized');
  return wss;
}
