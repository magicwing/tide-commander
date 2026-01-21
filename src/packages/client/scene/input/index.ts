// Main InputHandler
export { InputHandler } from './InputHandler';

// Extracted modules
export { DoubleClickDetector } from './DoubleClickDetector';
export { TouchGestureHandler } from './TouchGestureHandler';
export type { TouchGestureCallbacks } from './TouchGestureHandler';
export { SceneRaycaster } from './SceneRaycaster';
export { CameraController } from './CameraController';
export type { RaycastProvider } from './CameraController';

// Types
export type {
  InputCallbacks,
  DrawingModeChecker,
  ResizeHandlesGetter,
  ResizeModeChecker,
  AreaAtPositionGetter,
  BuildingAtPositionGetter,
  BuildingPositionsGetter,
  ScreenPosition,
  GroundPosition,
  SceneReferences,
} from './types';
