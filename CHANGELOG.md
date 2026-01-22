# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-01-21

### Added
- Context menu component with right-click support for scene interactions
- `useContextMenu` hook for managing context menu state
- Direct folder path access in file explorer via `useExplorerFolderPath` store hook
- Enhanced file tree with expand/collapse all, refresh, and home navigation
- Bottom toolbar styling component
- Agent bar scroll buttons for horizontal navigation
- Building config modal backdrop blur styling
- New input handler interaction types (`rightClick`, `areaRightClick`)
- Scene manager `getWorldPositionFromScreen` method for coordinate conversion

### Changed
- File explorer panel now supports opening directly to a folder path
- Improved file tree hook with better state management and navigation
- Updated App component to integrate context menu and folder path features
- Enhanced input handler with right-click detection and modifier key support
- Refactored spawn modal and boss spawn modal prop types

### Removed
- Removed `openAreaExplorer` from toolbox (moved to context menu)

## [0.1.0] - Initial Release

- Initial release of Tide Commander
- RTS/MOBA-style interface for Claude Code agents
- Real-time agent visualization and management
- WebSocket-based communication
- File explorer integration
- Skills panel for agent configuration
