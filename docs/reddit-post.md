# Title
I Built a Warcraft-Style Commander for Claude Code - Free and Open Source

# Post

Hey folks! I'm sharing **Tide Commander**, a free and open source visual interface I built specifically for managing multiple Claude Code CLI instances.

## What it is

A game-like orchestrator for Claude Code. Instead of juggling multiple terminal windows, you manage your Claude Code agents on a 3D battlefield inspired by RTS games like Warcraft. It looks like a game, but it's a full developer workstation with built-in file diff viewers, file explorer with git status, and real-time output rendering.

## How Claude helped

This entire project was built using Claude Code itself. Claude helped architect the WebSocket communication layer, the agent lifecycle management, and even helped write the permission hook system. It was a great example of using Claude Code to build tools for Claude Code.

## Key features built for Claude Code

- **Boss agents**: A boss has context of subordinate agents and delegates tasks to the most capable one. No more wondering which terminal has which context.
- **Supervisor**: Watches all agents, detects when they finish, and generates task summaries in a centralized panel.
- **Commander view**: See all Claude Code terminals in a single view, grouped by project areas.
- **Context tracking**: Visual mana bar showing each agent's context usage.
- **Permission control**: Run agents permissionless or with approval prompts per agent.
- **File tracking**: See which files each agent has modified.
- **Classes**: Assign instructions (like claude.md) and skills to agent characters.

## Other features

- Group Areas for organizing agents by project
- Custom hotkeys
- Screenshot and large text paste support
- HTML-rendered output (no terminal flicker)
- Multiplayer support (WebSocket)
- Mobile compatible

## Requirements

- Node.js
- Linux or macOS
- Claude Code CLI

## Free and open source

The project is completely free under the MIT license. No paid tiers, no sign-up required.

**GitHub**: https://github.com/deivid11/tide-commander

**Demo video**: https://www.youtube.com/watch?v=r1Op_xfhqOM

Hope this helps others who work with multiple Claude Code instances. Feedback welcome!
