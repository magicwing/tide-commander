import type * as THREE from 'three';
import type { AgentMeshData } from '../characters/CharacterFactory';

/**
 * Callbacks for input events.
 */
export interface InputCallbacks {
  onAgentClick: (agentId: string, shiftKey: boolean) => void;
  onAgentDoubleClick: (agentId: string) => void;
  onGroundClick: () => void;
  onMoveCommand: (position: THREE.Vector3, agentIds: string[]) => void;
  onSelectionBox: (agentIds: string[], buildingIds: string[]) => void;
  // Drawing callbacks
  onDrawStart?: (pos: { x: number; z: number }) => void;
  onDrawMove?: (pos: { x: number; z: number }) => void;
  onDrawEnd?: (pos: { x: number; z: number }) => void;
  onAreaRightClick?: (pos: { x: number; z: number }) => void;
  // Resize callbacks
  onResizeStart?: (handle: THREE.Mesh, pos: { x: number; z: number }) => void;
  onResizeMove?: (pos: { x: number; z: number }) => void;
  onResizeEnd?: () => void;
  // Area callbacks
  onAreaDoubleClick?: (areaId: string) => void;
  onGroundClickOutsideArea?: () => void;
  // Building callbacks
  onBuildingClick?: (buildingId: string) => void;
  onBuildingDoubleClick?: (buildingId: string) => void;
  onBuildingDragStart?: (buildingId: string, pos: { x: number; z: number }) => void;
  onBuildingDragMove?: (buildingId: string, pos: { x: number; z: number }) => void;
  onBuildingDragEnd?: (buildingId: string, pos: { x: number; z: number }) => void;
}

/**
 * Drawing mode checker function type.
 */
export type DrawingModeChecker = () => boolean;

/**
 * Resize handles getter function type.
 */
export type ResizeHandlesGetter = () => THREE.Mesh[];

/**
 * Resize mode checker function type.
 */
export type ResizeModeChecker = () => boolean;

/**
 * Area at position getter function type.
 */
export type AreaAtPositionGetter = (pos: { x: number; z: number }) => { id: string } | null;

/**
 * Building at position getter function type.
 */
export type BuildingAtPositionGetter = (pos: { x: number; z: number }) => { id: string } | null;

/**
 * Building positions getter for drag selection.
 */
export type BuildingPositionsGetter = () => Map<string, THREE.Vector3>;

/**
 * 2D screen position.
 */
export interface ScreenPosition {
  x: number;
  y: number;
}

/**
 * Ground position (XZ plane).
 */
export interface GroundPosition {
  x: number;
  z: number;
}

/**
 * Scene references needed for raycasting.
 */
export interface SceneReferences {
  ground: THREE.Object3D | null;
  agentMeshes: Map<string, AgentMeshData>;
}
