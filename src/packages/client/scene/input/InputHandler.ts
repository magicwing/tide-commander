import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { store } from '../../store';
import { DRAG_THRESHOLD, FORMATION_SPACING } from '../config';
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
 * Handles all mouse and keyboard input for the scene.
 */
export class InputHandler {
  private canvas: HTMLCanvasElement;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private selectionBox: HTMLDivElement;

  // Drag selection state
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private dragCurrent = { x: 0, y: 0 };

  // Right-click drag state
  private isRightDragging = false;
  private rightDragStart = { x: 0, y: 0 };

  // Drawing state
  private isDrawing = false;
  private drawingModeChecker: DrawingModeChecker = () => false;

  // Resize state
  private isResizing = false;
  private resizeHandlesGetter: ResizeHandlesGetter = () => [];
  private resizeModeChecker: ResizeModeChecker = () => false;

  // Area detection
  private areaAtPositionGetter: AreaAtPositionGetter = () => null;

  // Building detection and dragging
  private buildingAtPositionGetter: BuildingAtPositionGetter = () => null;
  private buildingPositionsGetter: BuildingPositionsGetter = () => new Map();
  private isDraggingBuilding = false;
  private draggingBuildingId: string | null = null;
  private buildingDragStartPos: { x: number; z: number } | null = null;

  // Double-click detection for buildings
  private lastBuildingClickTime = 0;
  private lastBuildingClickId: string | null = null;
  private buildingClickTimer: ReturnType<typeof setTimeout> | null = null;

  // Double-click detection for areas
  private lastAreaClickTime = 0;
  private lastAreaClickId: string | null = null;
  private areaClickTimer: ReturnType<typeof setTimeout> | null = null;

  // Double-click detection
  private lastClickTime = 0;
  private lastClickAgentId: string | null = null;
  private doubleClickThreshold = 300; // ms
  private singleClickTimer: ReturnType<typeof setTimeout> | null = null;

  private callbacks: InputCallbacks;
  private ground: THREE.Object3D | null = null;
  private agentMeshes: Map<string, AgentMeshData> = new Map();

  constructor(
    canvas: HTMLCanvasElement,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    selectionBox: HTMLDivElement,
    callbacks: InputCallbacks
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.controls = controls;
    this.selectionBox = selectionBox;
    this.callbacks = callbacks;

    this.setupEventListeners();
  }

  /**
   * Update references for raycasting.
   */
  setReferences(ground: THREE.Object3D | null, agentMeshes: Map<string, AgentMeshData>): void {
    this.ground = ground;
    this.agentMeshes = agentMeshes;
  }

  /**
   * Set the drawing mode checker function.
   */
  setDrawingModeChecker(checker: DrawingModeChecker): void {
    this.drawingModeChecker = checker;
  }

  /**
   * Set the resize handles getter and mode checker.
   */
  setResizeHandlers(getter: ResizeHandlesGetter, checker: ResizeModeChecker): void {
    this.resizeHandlesGetter = getter;
    this.resizeModeChecker = checker;
  }

  /**
   * Set the area at position getter.
   */
  setAreaAtPositionGetter(getter: AreaAtPositionGetter): void {
    this.areaAtPositionGetter = getter;
  }

  /**
   * Set the building at position getter.
   */
  setBuildingAtPositionGetter(getter: BuildingAtPositionGetter): void {
    this.buildingAtPositionGetter = getter;
  }

  /**
   * Set the building positions getter (for drag selection).
   */
  setBuildingPositionsGetter(getter: BuildingPositionsGetter): void {
    this.buildingPositionsGetter = getter;
  }

  /**
   * Raycast to ground and return world position.
   */
  raycastGround(event: MouseEvent): { x: number; z: number } | null {
    if (!this.ground) return null;

    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObject(this.ground);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      return { x: point.x, z: point.z };
    }
    return null;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown, true);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /**
   * Remove event listeners.
   */
  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, true);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
    if (this.singleClickTimer) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }
    if (this.areaClickTimer) {
      clearTimeout(this.areaClickTimer);
      this.areaClickTimer = null;
    }
    if (this.buildingClickTimer) {
      clearTimeout(this.buildingClickTimer);
      this.buildingClickTimer = null;
    }
  }

  /**
   * Reattach to new canvas element and controls.
   */
  reattach(canvas: HTMLCanvasElement, selectionBox: HTMLDivElement, controls: OrbitControls): void {
    this.dispose();
    this.canvas = canvas;
    this.selectionBox = selectionBox;
    this.controls = controls;
    this.setupEventListeners();
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) {
      this.controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;

      // Check if clicking on a resize handle first
      const resizeHandle = this.checkResizeHandleClick(event);
      if (resizeHandle) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          this.isResizing = true;
          this.callbacks.onResizeStart?.(resizeHandle, groundPos);
        }
        return;
      }

      // Check if in drawing mode
      if (this.drawingModeChecker()) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          this.isDrawing = true;
          this.callbacks.onDrawStart?.(groundPos);
        }
        return;
      }

      // Check if clicking on a building (for drag or selection)
      const groundPos = this.raycastGround(event);
      if (groundPos) {
        const building = this.buildingAtPositionGetter(groundPos);
        if (building) {
          // Start potential building drag
          this.draggingBuildingId = building.id;
          this.buildingDragStartPos = groundPos;
          this.isDraggingBuilding = false; // Will become true if mouse moves past threshold
          return;
        }
      }

      this.isDragging = false;
      this.dragStart = { x: event.clientX, y: event.clientY };
      this.dragCurrent = { x: event.clientX, y: event.clientY };
    }

    if (event.button === 2) {
      if (event.altKey) {
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      } else {
        this.controls.mouseButtons.RIGHT = null as unknown as THREE.MOUSE;
      }
      this.isRightDragging = false;
      this.rightDragStart = { x: event.clientX, y: event.clientY };
    }
  };

  /**
   * Check if clicking on a resize handle.
   */
  private checkResizeHandleClick(event: PointerEvent): THREE.Mesh | null {
    const handles = this.resizeHandlesGetter();
    if (handles.length === 0) return null;

    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(handles);
    if (intersects.length > 0) {
      return intersects[0].object as THREE.Mesh;
    }
    return null;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (event.buttons & 1) {
      // Handle resize mode
      if (this.isResizing) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          this.callbacks.onResizeMove?.(groundPos);
        }
        return;
      }

      // Handle drawing mode
      if (this.isDrawing) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          this.callbacks.onDrawMove?.(groundPos);
        }
        return;
      }

      // Handle building drag mode
      if (this.draggingBuildingId && this.buildingDragStartPos) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          const dx = groundPos.x - this.buildingDragStartPos.x;
          const dz = groundPos.z - this.buildingDragStartPos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          // Start drag if moved past threshold
          if (!this.isDraggingBuilding && distance > 0.2) {
            this.isDraggingBuilding = true;
            this.callbacks.onBuildingDragStart?.(this.draggingBuildingId, this.buildingDragStartPos);
          }

          // Update position during drag
          if (this.isDraggingBuilding) {
            this.callbacks.onBuildingDragMove?.(this.draggingBuildingId, groundPos);
          }
        }
        return;
      }

      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;

      if (!this.isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        this.isDragging = true;
        this.selectionBox.classList.add('active');
      }

      if (this.isDragging) {
        this.dragCurrent = { x: event.clientX, y: event.clientY };
        this.updateSelectionBox();
      }
    }

    if (event.buttons & 2) {
      const dx = event.clientX - this.rightDragStart.x;
      const dy = event.clientY - this.rightDragStart.y;

      if (!this.isRightDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        this.isRightDragging = true;
      }
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0) {
      this.controls.mouseButtons.LEFT = null as unknown as THREE.MOUSE;

      // Handle resize mode
      if (this.isResizing) {
        this.callbacks.onResizeEnd?.();
        this.isResizing = false;
        return;
      }

      // Handle drawing mode
      if (this.isDrawing) {
        const groundPos = this.raycastGround(event);
        if (groundPos) {
          this.callbacks.onDrawEnd?.(groundPos);
        }
        this.isDrawing = false;
        return;
      }

      // Handle building drag/click
      if (this.draggingBuildingId) {
        const buildingId = this.draggingBuildingId;
        const groundPos = this.raycastGround(event);

        if (this.isDraggingBuilding && groundPos) {
          // End drag
          this.callbacks.onBuildingDragEnd?.(buildingId, groundPos);
        } else {
          // Was a click, not a drag - handle building click/double-click
          this.handleBuildingClick(buildingId);
        }

        this.draggingBuildingId = null;
        this.buildingDragStartPos = null;
        this.isDraggingBuilding = false;
        return;
      }

      if (this.isDragging) {
        this.isDragging = false;
        this.selectionBox.classList.remove('active');
        this.selectAgentsInBox(this.dragStart, this.dragCurrent);
      } else if (!event.ctrlKey) {
        this.handleSingleClick(event);
      }
    }

    if (event.button === 2) {
      this.controls.mouseButtons.RIGHT = null as unknown as THREE.MOUSE;
      this.isRightDragging = false;
    }
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();

    if (event.altKey) return;

    this.controls.mouseButtons.RIGHT = null as unknown as THREE.MOUSE;

    if (this.isRightDragging) {
      this.isRightDragging = false;
      return;
    }

    const state = store.getState();

    if (!this.ground) return;

    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObject(this.ground);
    if (intersects.length > 0) {
      const point = intersects[0].point;

      // Check if right-clicking on an area (for agent assignment)
      if (state.selectedAgentIds.size > 0 && this.callbacks.onAreaRightClick) {
        this.callbacks.onAreaRightClick({ x: point.x, z: point.z });
      }

      // Move command for selected agents
      if (state.selectedAgentIds.size > 0) {
        const agentIds = Array.from(state.selectedAgentIds);
        this.callbacks.onMoveCommand(point, agentIds);
      }
    }
  };

  /**
   * Handle wheel event for intelligent zoom towards mouse position.
   * Zooms in/out while keeping the point under the mouse relatively stable.
   */
  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();

    // Get zoom direction: positive deltaY = zoom out, negative = zoom in
    const zoomIn = event.deltaY < 0;
    const zoomFactor = 0.1; // How much to zoom per scroll tick

    // Get current distance from camera to target
    const cameraToTarget = this.camera.position.clone().sub(this.controls.target);
    const currentDistance = cameraToTarget.length();

    // Calculate new distance (respecting min/max)
    const minDistance = this.controls.minDistance;
    const maxDistance = this.controls.maxDistance;
    const newDistance = zoomIn
      ? Math.max(minDistance, currentDistance * (1 - zoomFactor))
      : Math.min(maxDistance, currentDistance * (1 + zoomFactor));

    // If at limits, don't bother calculating
    if (newDistance === currentDistance) return;

    // Cast ray from mouse position to find world point under cursor
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Try to intersect with ground first
    let targetPoint: THREE.Vector3 | null = null;
    if (this.ground) {
      const groundIntersects = this.raycaster.intersectObject(this.ground);
      if (groundIntersects.length > 0) {
        targetPoint = groundIntersects[0].point;
      }
    }

    // If no ground intersection, project onto a horizontal plane at y=0
    if (!targetPoint) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      targetPoint = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(plane, targetPoint);
    }

    if (!targetPoint) {
      // Fallback: just zoom without moving target
      const direction = cameraToTarget.normalize();
      this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(newDistance));
      return;
    }

    // Calculate how much we're zooming (ratio)
    const zoomRatio = newDistance / currentDistance;

    // Move the orbit target towards the mouse world position proportionally
    // When zooming in, move target towards mouse; when zooming out, move away
    const targetToMouse = targetPoint.clone().sub(this.controls.target);
    const moveAmount = 1 - zoomRatio; // Positive when zooming in, negative when zooming out

    // Apply movement to the orbit target
    const newTarget = this.controls.target.clone().add(targetToMouse.multiplyScalar(moveAmount));

    // Keep target on the ground plane (y=0 or at least reasonable)
    newTarget.y = Math.max(0, newTarget.y);

    // Update the orbit target
    this.controls.target.copy(newTarget);

    // Update camera position to maintain the new distance from the new target
    const newCameraDirection = cameraToTarget.normalize();
    this.camera.position.copy(newTarget).add(newCameraDirection.multiplyScalar(newDistance));
  };

  /**
   * Handle building click/double-click.
   */
  private handleBuildingClick(buildingId: string): void {
    const now = performance.now();

    // Check for double-click
    if (
      this.lastBuildingClickId === buildingId &&
      now - this.lastBuildingClickTime < this.doubleClickThreshold
    ) {
      // Double-click detected - open config modal
      if (this.buildingClickTimer) {
        clearTimeout(this.buildingClickTimer);
        this.buildingClickTimer = null;
      }
      this.callbacks.onBuildingDoubleClick?.(buildingId);
      this.lastBuildingClickId = null;
      this.lastBuildingClickTime = 0;
    } else {
      // Single click - select building
      this.callbacks.onBuildingClick?.(buildingId);

      // Track for potential double-click
      this.lastBuildingClickId = buildingId;
      this.lastBuildingClickTime = now;

      // Reset double-click tracking after threshold
      if (this.buildingClickTimer) {
        clearTimeout(this.buildingClickTimer);
      }
      this.buildingClickTimer = setTimeout(() => {
        this.buildingClickTimer = null;
        this.lastBuildingClickId = null;
        this.lastBuildingClickTime = 0;
      }, this.doubleClickThreshold);
    }
  }

  private updateSelectionBox(): void {
    const left = Math.min(this.dragStart.x, this.dragCurrent.x);
    const top = Math.min(this.dragStart.y, this.dragCurrent.y);
    const width = Math.abs(this.dragCurrent.x - this.dragStart.x);
    const height = Math.abs(this.dragCurrent.y - this.dragStart.y);

    this.selectionBox.style.left = `${left}px`;
    this.selectionBox.style.top = `${top}px`;
    this.selectionBox.style.width = `${width}px`;
    this.selectionBox.style.height = `${height}px`;
  }

  private handleSingleClick(event: PointerEvent): void {
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const meshArray = Array.from(this.agentMeshes.values()).map((d) => d.group);
    const intersects = this.raycaster.intersectObjects(meshArray, true);

    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.userData.agentId) {
        obj = obj.parent;
      }

      if (obj && obj.userData.agentId) {
        const agentId = obj.userData.agentId;
        const now = performance.now();

        // Check for double-click
        if (
          this.lastClickAgentId === agentId &&
          now - this.lastClickTime < this.doubleClickThreshold
        ) {
          // Double-click detected - open terminal
          this.callbacks.onAgentDoubleClick(agentId);
          this.lastClickAgentId = null;
          this.lastClickTime = 0;
        } else {
          // Single click - select immediately (no delay)
          this.callbacks.onAgentClick(agentId, event.shiftKey);

          // Track for potential double-click
          this.lastClickAgentId = agentId;
          this.lastClickTime = now;

          // Reset double-click tracking after threshold
          if (this.singleClickTimer) {
            clearTimeout(this.singleClickTimer);
          }
          this.singleClickTimer = setTimeout(() => {
            this.singleClickTimer = null;
            this.lastClickAgentId = null;
            this.lastClickTime = 0;
          }, this.doubleClickThreshold);
        }
        return;
      }
    }

    // Clicked on ground - reset double-click state
    if (this.singleClickTimer) {
      clearTimeout(this.singleClickTimer);
      this.singleClickTimer = null;
    }
    this.lastClickAgentId = null;
    this.lastClickTime = 0;

    // Check if clicked on an area (for area double-click detection)
    const groundPos = this.raycastGround(event);
    if (groundPos) {
      const area = this.areaAtPositionGetter(groundPos);
      const now = performance.now();

      if (area) {
        // Check for area double-click
        if (
          this.lastAreaClickId === area.id &&
          now - this.lastAreaClickTime < this.doubleClickThreshold
        ) {
          // Double-click on area detected
          if (this.areaClickTimer) {
            clearTimeout(this.areaClickTimer);
            this.areaClickTimer = null;
          }
          this.callbacks.onAreaDoubleClick?.(area.id);
          this.lastAreaClickId = null;
          this.lastAreaClickTime = 0;
        } else {
          // Single click on area - set up for potential double-click
          if (this.areaClickTimer) {
            clearTimeout(this.areaClickTimer);
          }

          this.lastAreaClickId = area.id;
          this.lastAreaClickTime = now;

          this.areaClickTimer = setTimeout(() => {
            // Single click completed (no double-click)
            this.areaClickTimer = null;
            this.lastAreaClickId = null;
            this.lastAreaClickTime = 0;
          }, this.doubleClickThreshold);
        }
        return; // Don't trigger ground click if clicked on area
      }
    }

    // Reset area double-click state
    if (this.areaClickTimer) {
      clearTimeout(this.areaClickTimer);
      this.areaClickTimer = null;
    }
    this.lastAreaClickId = null;
    this.lastAreaClickTime = 0;

    if (!event.shiftKey) {
      this.callbacks.onGroundClick();
      // Also notify about clicking outside any area
      this.callbacks.onGroundClickOutsideArea?.();
    }
  }

  private selectAgentsInBox(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const rect = this.canvas.getBoundingClientRect();
    const boxLeft = Math.min(start.x, end.x);
    const boxRight = Math.max(start.x, end.x);
    const boxTop = Math.min(start.y, end.y);
    const boxBottom = Math.max(start.y, end.y);

    const agentsInBox: string[] = [];
    const buildingsInBox: string[] = [];

    // Check agents
    for (const [agentId, meshData] of this.agentMeshes) {
      const screenPos = meshData.group.position.clone().project(this.camera);
      const screenX = ((screenPos.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-screenPos.y + 1) / 2) * rect.height + rect.top;

      if (
        screenX >= boxLeft &&
        screenX <= boxRight &&
        screenY >= boxTop &&
        screenY <= boxBottom
      ) {
        agentsInBox.push(agentId);
      }
    }

    // Check buildings
    const buildingPositions = this.buildingPositionsGetter();
    for (const [buildingId, position] of buildingPositions) {
      const screenPos = position.clone().project(this.camera);
      const screenX = ((screenPos.x + 1) / 2) * rect.width + rect.left;
      const screenY = ((-screenPos.y + 1) / 2) * rect.height + rect.top;

      if (
        screenX >= boxLeft &&
        screenX <= boxRight &&
        screenY >= boxTop &&
        screenY <= boxBottom
      ) {
        buildingsInBox.push(buildingId);
      }
    }

    this.callbacks.onSelectionBox(agentsInBox, buildingsInBox);
  }

  private updateMouse(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Calculate formation positions for multiple agents.
   */
  calculateFormationPositions(
    center: THREE.Vector3,
    count: number
  ): { x: number; y: number; z: number }[] {
    const positions: { x: number; y: number; z: number }[] = [];

    if (count === 1) {
      return [{ x: center.x, y: 0, z: center.z }];
    }

    if (count <= 6) {
      // Circle formation
      const radius = FORMATION_SPACING * Math.max(1, count / 3);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        positions.push({
          x: center.x + Math.cos(angle) * radius,
          y: 0,
          z: center.z + Math.sin(angle) * radius,
        });
      }
    } else {
      // Grid formation
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const offsetX = ((cols - 1) * FORMATION_SPACING) / 2;
      const offsetZ = ((rows - 1) * FORMATION_SPACING) / 2;

      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.push({
          x: center.x + col * FORMATION_SPACING - offsetX,
          y: 0,
          z: center.z + row * FORMATION_SPACING - offsetZ,
        });
      }
    }

    return positions;
  }
}
