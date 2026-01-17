import * as THREE from 'three';
import type { Building, BuildingStatus, BuildingStyle } from '../../../shared/types';
import { store } from '../../store';

/**
 * Building mesh data structure
 */
export interface BuildingMeshData {
  group: THREE.Group;
  statusLight: THREE.Mesh;
  label: THREE.Sprite;
}

/**
 * Status colors for building lights
 */
const STATUS_COLORS: Record<BuildingStatus, number> = {
  running: 0x4aff9e,   // Green
  stopped: 0x888888,   // Gray
  error: 0xff4a4a,     // Red
  unknown: 0xffaa00,   // Orange
  starting: 0x4a9eff,  // Blue
  stopping: 0xffaa00,  // Orange
};

/**
 * Manages buildings on the battlefield.
 */
export class BuildingManager {
  private scene: THREE.Scene;
  private buildingMeshes = new Map<string, BuildingMeshData>();
  private selectedBuildingId: string | null = null;

  // Animation state
  private animationTime = 0;

  // Callbacks
  private onBuildingClick: ((buildingId: string) => void) | null = null;
  private onBuildingDoubleClick: ((buildingId: string) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Set click callback
   */
  setOnBuildingClick(callback: (buildingId: string) => void): void {
    this.onBuildingClick = callback;
  }

  /**
   * Set double-click callback
   */
  setOnBuildingDoubleClick(callback: (buildingId: string) => void): void {
    this.onBuildingDoubleClick = callback;
  }

  /**
   * Create a server building mesh using basic geometry.
   * Looks like a small server rack/tower.
   */
  private createServerBuildingMesh(building: Building): BuildingMeshData {
    const group = new THREE.Group();
    group.userData.buildingId = building.id;
    group.userData.isBuilding = true;

    const baseColor = building.color ? new THREE.Color(building.color) : new THREE.Color(0x2a2a3a);
    const accentColor = new THREE.Color(0x4a9eff);

    // Main tower body (server rack)
    const towerGeom = new THREE.BoxGeometry(1.2, 2.5, 0.8);
    const towerMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.7,
      roughness: 0.3,
    });
    const tower = new THREE.Mesh(towerGeom, towerMat);
    tower.position.y = 1.25;
    tower.castShadow = true;
    tower.receiveShadow = true;
    tower.name = 'buildingBody';
    group.add(tower);

    // Server slots (horizontal lines)
    for (let i = 0; i < 5; i++) {
      const slotGeom = new THREE.BoxGeometry(1.1, 0.02, 0.75);
      const slotMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2a,
        metalness: 0.5,
        roughness: 0.5,
      });
      const slot = new THREE.Mesh(slotGeom, slotMat);
      slot.position.set(0, 0.5 + i * 0.45, 0.03);
      group.add(slot);
    }

    // Front panel LEDs (small lights per slot)
    for (let i = 0; i < 5; i++) {
      const ledGeom = new THREE.BoxGeometry(0.08, 0.08, 0.05);
      const ledMat = new THREE.MeshBasicMaterial({
        color: 0x4aff9e,
        transparent: true,
        opacity: 0.9,
      });
      const led = new THREE.Mesh(ledGeom, ledMat);
      led.position.set(-0.45, 0.5 + i * 0.45, 0.43);
      led.name = `led_${i}`;
      group.add(led);

      // Activity LED (blinks when running)
      const activityLed = new THREE.Mesh(ledGeom.clone(), ledMat.clone());
      activityLed.position.set(-0.3, 0.5 + i * 0.45, 0.43);
      activityLed.name = `activityLed_${i}`;
      group.add(activityLed);
    }

    // Top vent/grill
    const ventGeom = new THREE.BoxGeometry(1.0, 0.1, 0.6);
    const ventMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2a,
      metalness: 0.3,
      roughness: 0.7,
    });
    const vent = new THREE.Mesh(ventGeom, ventMat);
    vent.position.set(0, 2.55, 0);
    group.add(vent);

    // Main status light on top
    const statusLightGeom = new THREE.SphereGeometry(0.15, 16, 16);
    const statusLightMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.95,
    });
    const statusLight = new THREE.Mesh(statusLightGeom, statusLightMat);
    statusLight.position.set(0, 2.75, 0);
    statusLight.name = 'statusLight';
    group.add(statusLight);

    // Status light glow (larger transparent sphere)
    const glowGeom = new THREE.SphereGeometry(0.25, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.set(0, 2.75, 0);
    glow.name = 'statusGlow';
    group.add(glow);

    // Base platform
    const baseGeom = new THREE.BoxGeometry(1.5, 0.1, 1.1);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      metalness: 0.5,
      roughness: 0.5,
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    group.add(base);

    // Name label
    const label = this.createLabel(building.name);
    label.position.set(0, 3.2, 0);
    label.name = 'buildingLabel';
    group.add(label);

    // Set position
    group.position.set(building.position.x, 0, building.position.z);

    return {
      group,
      statusLight,
      label,
    };
  }

  /**
   * Create a Control Tower building.
   * Tall tower with rotating antenna on top.
   */
  private createTowerBuildingMesh(building: Building): BuildingMeshData {
    const group = new THREE.Group();
    group.userData.buildingId = building.id;
    group.userData.isBuilding = true;

    const baseColor = building.color ? new THREE.Color(building.color) : new THREE.Color(0x2a3a4a);

    // Main tower body (octagonal)
    const towerGeom = new THREE.CylinderGeometry(0.5, 0.7, 3, 8);
    const towerMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.6,
      roughness: 0.4,
    });
    const tower = new THREE.Mesh(towerGeom, towerMat);
    tower.position.y = 1.5;
    tower.castShadow = true;
    tower.receiveShadow = true;
    tower.name = 'buildingBody';
    group.add(tower);

    // Window bands
    for (let i = 0; i < 4; i++) {
      const bandGeom = new THREE.CylinderGeometry(0.52 - i * 0.03, 0.62 - i * 0.03, 0.1, 8);
      const bandMat = new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.7,
      });
      const band = new THREE.Mesh(bandGeom, bandMat);
      band.position.y = 0.7 + i * 0.6;
      band.name = `windowBand_${i}`;
      group.add(band);
    }

    // Top platform
    const platformGeom = new THREE.CylinderGeometry(0.6, 0.5, 0.2, 8);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      metalness: 0.7,
      roughness: 0.3,
    });
    const platform = new THREE.Mesh(platformGeom, platformMat);
    platform.position.y = 3.1;
    group.add(platform);

    // Antenna base
    const antennaBaseGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.3, 6);
    const antennaBaseMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a5a,
      metalness: 0.8,
      roughness: 0.2,
    });
    const antennaBase = new THREE.Mesh(antennaBaseGeom, antennaBaseMat);
    antennaBase.position.y = 3.35;
    group.add(antennaBase);

    // Rotating antenna (will be animated)
    const antennaGroup = new THREE.Group();
    antennaGroup.position.y = 3.6;
    antennaGroup.name = 'antenna';

    const antennaGeom = new THREE.BoxGeometry(0.05, 0.6, 0.05);
    const antennaMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a7a,
      metalness: 0.9,
      roughness: 0.1,
    });
    const antenna = new THREE.Mesh(antennaGeom, antennaMat);
    antenna.position.y = 0.3;
    antennaGroup.add(antenna);

    // Antenna dishes
    const dishGeom = new THREE.ConeGeometry(0.15, 0.1, 8);
    for (let i = 0; i < 2; i++) {
      const dish = new THREE.Mesh(dishGeom, antennaMat);
      dish.rotation.x = Math.PI / 2;
      dish.position.set(i === 0 ? 0.2 : -0.2, 0.4, 0);
      dish.rotation.z = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      antennaGroup.add(dish);
    }

    group.add(antennaGroup);

    // Status light
    const statusLightGeom = new THREE.SphereGeometry(0.12, 16, 16);
    const statusLightMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.95,
    });
    const statusLight = new THREE.Mesh(statusLightGeom, statusLightMat);
    statusLight.position.set(0, 4.3, 0);
    statusLight.name = 'statusLight';
    group.add(statusLight);

    // Status glow
    const glowGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.set(0, 4.3, 0);
    glow.name = 'statusGlow';
    group.add(glow);

    // Base
    const baseGeom = new THREE.CylinderGeometry(0.9, 1.0, 0.15, 8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      metalness: 0.5,
      roughness: 0.5,
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.075;
    base.receiveShadow = true;
    group.add(base);

    // Name label
    const label = this.createLabel(building.name);
    label.position.set(0, 4.7, 0);
    label.name = 'buildingLabel';
    group.add(label);

    group.position.set(building.position.x, 0, building.position.z);

    return { group, statusLight, label };
  }

  /**
   * Create a Data Dome building.
   * Futuristic dome with energy ring.
   */
  private createDomeBuildingMesh(building: Building): BuildingMeshData {
    const group = new THREE.Group();
    group.userData.buildingId = building.id;
    group.userData.isBuilding = true;

    const baseColor = building.color ? new THREE.Color(building.color) : new THREE.Color(0x2a2a4a);

    // Main dome
    const domeGeom = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.4,
      roughness: 0.6,
      transparent: true,
      opacity: 0.9,
    });
    const dome = new THREE.Mesh(domeGeom, domeMat);
    dome.position.y = 0.15;
    dome.castShadow = true;
    dome.receiveShadow = true;
    dome.name = 'buildingBody';
    group.add(dome);

    // Inner dome (glowing core)
    const innerDomeGeom = new THREE.SphereGeometry(0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const innerDomeMat = new THREE.MeshBasicMaterial({
      color: 0x4a9eff,
      transparent: true,
      opacity: 0.3,
    });
    const innerDome = new THREE.Mesh(innerDomeGeom, innerDomeMat);
    innerDome.position.y = 0.15;
    innerDome.name = 'innerDome';
    group.add(innerDome);

    // Energy ring (rotating torus)
    const ringGeom = new THREE.TorusGeometry(1.0, 0.05, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4aff9e,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.y = 0.6;
    ring.rotation.x = Math.PI / 2;
    ring.name = 'energyRing';
    group.add(ring);

    // Second ring (counter-rotating)
    const ring2 = new THREE.Mesh(ringGeom.clone(), ringMat.clone());
    ring2.position.y = 0.8;
    ring2.rotation.x = Math.PI / 3;
    ring2.name = 'energyRing2';
    group.add(ring2);

    // Vertical energy beams
    for (let i = 0; i < 4; i++) {
      const beamGeom = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: 0.6,
      });
      const beam = new THREE.Mesh(beamGeom, beamMat);
      const angle = (i / 4) * Math.PI * 2;
      beam.position.set(Math.cos(angle) * 0.5, 0.75, Math.sin(angle) * 0.5);
      beam.name = `beam_${i}`;
      group.add(beam);
    }

    // Status light on top
    const statusLightGeom = new THREE.SphereGeometry(0.15, 16, 16);
    const statusLightMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.95,
    });
    const statusLight = new THREE.Mesh(statusLightGeom, statusLightMat);
    statusLight.position.set(0, 1.4, 0);
    statusLight.name = 'statusLight';
    group.add(statusLight);

    // Status glow
    const glowGeom = new THREE.SphereGeometry(0.25, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.set(0, 1.4, 0);
    glow.name = 'statusGlow';
    group.add(glow);

    // Base platform
    const baseGeom = new THREE.CylinderGeometry(1.4, 1.5, 0.15, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a,
      metalness: 0.6,
      roughness: 0.4,
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.075;
    base.receiveShadow = true;
    group.add(base);

    // Name label
    const label = this.createLabel(building.name);
    label.position.set(0, 1.9, 0);
    label.name = 'buildingLabel';
    group.add(label);

    group.position.set(building.position.x, 0, building.position.z);

    return { group, statusLight, label };
  }

  /**
   * Create a Power Pyramid building.
   * Egyptian-style pyramid with glowing core.
   */
  private createPyramidBuildingMesh(building: Building): BuildingMeshData {
    const group = new THREE.Group();
    group.userData.buildingId = building.id;
    group.userData.isBuilding = true;

    const baseColor = building.color ? new THREE.Color(building.color) : new THREE.Color(0x3a3a2a);

    // Main pyramid
    const pyramidGeom = new THREE.ConeGeometry(1.3, 2.5, 4);
    const pyramidMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness: 0.3,
      roughness: 0.7,
    });
    const pyramid = new THREE.Mesh(pyramidGeom, pyramidMat);
    pyramid.position.y = 1.25;
    pyramid.rotation.y = Math.PI / 4; // Rotate 45 degrees for diamond orientation
    pyramid.castShadow = true;
    pyramid.receiveShadow = true;
    pyramid.name = 'buildingBody';
    group.add(pyramid);

    // Glowing core (smaller inner pyramid)
    const coreGeom = new THREE.ConeGeometry(0.6, 1.2, 4);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.6,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.position.y = 0.8;
    core.rotation.y = Math.PI / 4;
    core.name = 'pyramidCore';
    group.add(core);

    // Energy lines on edges
    const edgePositions = [
      { x: 0.9, z: 0 },
      { x: -0.9, z: 0 },
      { x: 0, z: 0.9 },
      { x: 0, z: -0.9 },
    ];
    for (let i = 0; i < 4; i++) {
      const lineGeom = new THREE.CylinderGeometry(0.02, 0.02, 2.7, 8);
      const lineMat = new THREE.MeshBasicMaterial({
        color: 0x4aff9e,
        transparent: true,
        opacity: 0.7,
      });
      const line = new THREE.Mesh(lineGeom, lineMat);
      const pos = edgePositions[i];
      line.position.set(pos.x * 0.5, 1.25, pos.z * 0.5);
      // Tilt lines to follow pyramid edge
      const tiltAngle = Math.atan2(1.25, 0.65);
      if (i < 2) {
        line.rotation.z = i === 0 ? -tiltAngle : tiltAngle;
      } else {
        line.rotation.x = i === 2 ? tiltAngle : -tiltAngle;
      }
      line.name = `edgeLine_${i}`;
      group.add(line);
    }

    // Floating eye/orb at apex
    const eyeGeom = new THREE.SphereGeometry(0.15, 16, 16);
    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.9,
    });
    const eye = new THREE.Mesh(eyeGeom, eyeMat);
    eye.position.y = 2.7;
    eye.name = 'pyramidEye';
    group.add(eye);

    // Eye glow
    const eyeGlowGeom = new THREE.SphereGeometry(0.25, 16, 16);
    const eyeGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.3,
    });
    const eyeGlow = new THREE.Mesh(eyeGlowGeom, eyeGlowMat);
    eyeGlow.position.y = 2.7;
    eyeGlow.name = 'pyramidEyeGlow';
    group.add(eyeGlow);

    // Status light (separate from eye, below pyramid)
    const statusLightGeom = new THREE.SphereGeometry(0.12, 16, 16);
    const statusLightMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.95,
    });
    const statusLight = new THREE.Mesh(statusLightGeom, statusLightMat);
    statusLight.position.set(1.2, 0.3, 0);
    statusLight.name = 'statusLight';
    group.add(statusLight);

    // Status glow
    const glowGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: STATUS_COLORS[building.status],
      transparent: true,
      opacity: 0.3,
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.set(1.2, 0.3, 0);
    glow.name = 'statusGlow';
    group.add(glow);

    // Base platform (stone slab)
    const baseGeom = new THREE.BoxGeometry(2.8, 0.15, 2.8);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a3a,
      metalness: 0.2,
      roughness: 0.8,
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.075;
    base.receiveShadow = true;
    group.add(base);

    // Name label
    const label = this.createLabel(building.name);
    label.position.set(0, 3.2, 0);
    label.name = 'buildingLabel';
    group.add(label);

    group.position.set(building.position.x, 0, building.position.z);

    return { group, statusLight, label };
  }

  /**
   * Create a text label sprite.
   */
  private createLabel(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;

    canvas.width = 256;
    canvas.height = 64;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.roundRect(10, 10, canvas.width - 20, canvas.height - 20, 8);
    context.fill();

    // Text
    context.font = 'bold 24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);

    return sprite;
  }

  /**
   * Update label text
   */
  private updateLabel(meshData: BuildingMeshData, text: string): void {
    const oldLabel = meshData.label;
    const newLabel = this.createLabel(text);
    newLabel.position.copy(oldLabel.position);
    newLabel.name = 'buildingLabel';

    meshData.group.remove(oldLabel);
    if (oldLabel.material instanceof THREE.SpriteMaterial) {
      if (oldLabel.material.map) oldLabel.material.map.dispose();
      oldLabel.material.dispose();
    }

    meshData.group.add(newLabel);
    meshData.label = newLabel;
  }

  /**
   * Add a building to the scene.
   */
  addBuilding(building: Building): void {
    // Remove existing if present
    this.removeBuilding(building.id);

    // Create mesh based on building style
    const meshData = this.createBuildingMesh(building);

    this.scene.add(meshData.group);
    this.buildingMeshes.set(building.id, meshData);
  }

  /**
   * Create the appropriate mesh based on building style.
   */
  private createBuildingMesh(building: Building): BuildingMeshData {
    const style = building.style || 'server-rack';

    switch (style) {
      case 'tower':
        return this.createTowerBuildingMesh(building);
      case 'dome':
        return this.createDomeBuildingMesh(building);
      case 'pyramid':
        return this.createPyramidBuildingMesh(building);
      case 'server-rack':
      default:
        return this.createServerBuildingMesh(building);
    }
  }

  /**
   * Remove a building from the scene.
   */
  removeBuilding(buildingId: string): void {
    const meshData = this.buildingMeshes.get(buildingId);
    if (meshData) {
      this.scene.remove(meshData.group);
      this.disposeGroup(meshData.group);
      this.buildingMeshes.delete(buildingId);
    }
  }

  /**
   * Update building position directly (for dragging).
   * Does not update the store, just the visual.
   */
  setBuildingPosition(buildingId: string, pos: { x: number; z: number }): void {
    const meshData = this.buildingMeshes.get(buildingId);
    if (meshData) {
      meshData.group.position.set(pos.x, 0, pos.z);
    }
  }

  /**
   * Update a building's visuals.
   */
  updateBuilding(building: Building): void {
    const meshData = this.buildingMeshes.get(building.id);
    if (!meshData) {
      this.addBuilding(building);
      return;
    }

    // Update position
    meshData.group.position.set(building.position.x, 0, building.position.z);

    // Update status light color
    const statusColor = STATUS_COLORS[building.status];
    const statusLight = meshData.group.getObjectByName('statusLight') as THREE.Mesh;
    if (statusLight && statusLight.material instanceof THREE.MeshBasicMaterial) {
      statusLight.material.color.setHex(statusColor);
    }

    const statusGlow = meshData.group.getObjectByName('statusGlow') as THREE.Mesh;
    if (statusGlow && statusGlow.material instanceof THREE.MeshBasicMaterial) {
      statusGlow.material.color.setHex(statusColor);
    }

    // Update label if name changed
    const currentLabel = meshData.label;
    const canvas = (currentLabel.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement;
    if (canvas) {
      // Simple check - just update if needed
      this.updateLabel(meshData, building.name);
    }
  }

  /**
   * Highlight a building (when selected).
   */
  highlightBuilding(buildingId: string | null): void {
    // Remove highlight from previous selection
    if (this.selectedBuildingId) {
      const prevMeshData = this.buildingMeshes.get(this.selectedBuildingId);
      if (prevMeshData) {
        const body = prevMeshData.group.getObjectByName('buildingBody') as THREE.Mesh;
        if (body && body.material instanceof THREE.MeshStandardMaterial) {
          body.material.emissive.setHex(0x000000);
        }
      }
    }

    this.selectedBuildingId = buildingId;

    // Add highlight to new selection
    if (buildingId) {
      const meshData = this.buildingMeshes.get(buildingId);
      if (meshData) {
        const body = meshData.group.getObjectByName('buildingBody') as THREE.Mesh;
        if (body && body.material instanceof THREE.MeshStandardMaterial) {
          body.material.emissive.setHex(0x222244);
        }
      }
    }
  }

  /**
   * Get building at a world position (for click detection).
   */
  getBuildingAtPosition(pos: { x: number; z: number }): Building | null {
    const state = store.getState();

    for (const building of state.buildings.values()) {
      // Check if position is within building bounds (roughly 1.5 x 1.1 footprint)
      const dx = Math.abs(pos.x - building.position.x);
      const dz = Math.abs(pos.z - building.position.z);

      if (dx <= 0.75 && dz <= 0.55) {
        return building;
      }
    }

    return null;
  }

  /**
   * Get all building meshes for raycasting.
   */
  getBuildingMeshes(): THREE.Group[] {
    return Array.from(this.buildingMeshes.values()).map(m => m.group);
  }

  /**
   * Sync buildings from store.
   */
  syncFromStore(): void {
    const state = store.getState();

    // Remove meshes for deleted buildings
    for (const buildingId of this.buildingMeshes.keys()) {
      if (!state.buildings.has(buildingId)) {
        this.removeBuilding(buildingId);
      }
    }

    // Add/update meshes for existing buildings
    for (const building of state.buildings.values()) {
      if (this.buildingMeshes.has(building.id)) {
        this.updateBuilding(building);
      } else {
        this.addBuilding(building);
      }
    }
  }

  /**
   * Update animations (call in render loop).
   */
  update(deltaTime: number): void {
    this.animationTime += deltaTime;

    const state = store.getState();

    for (const [buildingId, meshData] of this.buildingMeshes) {
      const building = state.buildings.get(buildingId);
      if (!building) continue;

      const style = building.style || 'server-rack';

      // Common status glow animation
      const statusGlow = meshData.group.getObjectByName('statusGlow') as THREE.Mesh;

      if (building.status === 'running') {
        const pulse = Math.sin(this.animationTime * 3) * 0.2 + 0.8;
        if (statusGlow && statusGlow.material instanceof THREE.MeshBasicMaterial) {
          statusGlow.material.opacity = 0.3 * pulse;
        }

        // Style-specific running animations
        switch (style) {
          case 'server-rack':
            // Blink activity LEDs randomly
            for (let i = 0; i < 5; i++) {
              const activityLed = meshData.group.getObjectByName(`activityLed_${i}`) as THREE.Mesh;
              if (activityLed && activityLed.material instanceof THREE.MeshBasicMaterial) {
                const shouldBlink = Math.random() > 0.95;
                if (shouldBlink) {
                  activityLed.material.opacity = activityLed.material.opacity > 0.5 ? 0.2 : 0.9;
                }
              }
            }
            break;

          case 'tower':
            // Rotate antenna
            const antenna = meshData.group.getObjectByName('antenna');
            if (antenna) {
              antenna.rotation.y += deltaTime * 2;
            }
            // Pulse window bands
            for (let i = 0; i < 4; i++) {
              const band = meshData.group.getObjectByName(`windowBand_${i}`) as THREE.Mesh;
              if (band && band.material instanceof THREE.MeshBasicMaterial) {
                const bandPulse = Math.sin(this.animationTime * 4 + i * 0.5) * 0.3 + 0.7;
                band.material.opacity = bandPulse;
              }
            }
            break;

          case 'dome':
            // Rotate energy rings
            const ring1 = meshData.group.getObjectByName('energyRing') as THREE.Mesh;
            const ring2 = meshData.group.getObjectByName('energyRing2') as THREE.Mesh;
            if (ring1) ring1.rotation.z += deltaTime * 1.5;
            if (ring2) ring2.rotation.z -= deltaTime * 1.2;
            // Pulse inner dome
            const innerDome = meshData.group.getObjectByName('innerDome') as THREE.Mesh;
            if (innerDome && innerDome.material instanceof THREE.MeshBasicMaterial) {
              innerDome.material.opacity = 0.2 + Math.sin(this.animationTime * 2) * 0.15;
            }
            // Pulse beams
            for (let i = 0; i < 4; i++) {
              const beam = meshData.group.getObjectByName(`beam_${i}`) as THREE.Mesh;
              if (beam && beam.material instanceof THREE.MeshBasicMaterial) {
                const beamPulse = Math.sin(this.animationTime * 5 + i * 1.5) * 0.3 + 0.6;
                beam.material.opacity = beamPulse;
              }
            }
            break;

          case 'pyramid':
            // Pulse core
            const core = meshData.group.getObjectByName('pyramidCore') as THREE.Mesh;
            if (core && core.material instanceof THREE.MeshBasicMaterial) {
              core.material.opacity = 0.4 + Math.sin(this.animationTime * 2) * 0.2;
            }
            // Pulse eye
            const eye = meshData.group.getObjectByName('pyramidEye') as THREE.Mesh;
            const eyeGlow = meshData.group.getObjectByName('pyramidEyeGlow') as THREE.Mesh;
            if (eye && eye.material instanceof THREE.MeshBasicMaterial) {
              eye.material.opacity = 0.7 + Math.sin(this.animationTime * 3) * 0.3;
            }
            if (eyeGlow && eyeGlow.material instanceof THREE.MeshBasicMaterial) {
              eyeGlow.material.opacity = 0.2 + Math.sin(this.animationTime * 3) * 0.15;
            }
            // Float eye up and down
            if (eye) {
              eye.position.y = 2.7 + Math.sin(this.animationTime * 1.5) * 0.1;
            }
            if (eyeGlow) {
              eyeGlow.position.y = 2.7 + Math.sin(this.animationTime * 1.5) * 0.1;
            }
            break;
        }
      } else if (building.status === 'starting' || building.status === 'stopping') {
        // Fast pulse when starting/stopping
        const pulse = Math.sin(this.animationTime * 8) * 0.5 + 0.5;
        if (statusGlow && statusGlow.material instanceof THREE.MeshBasicMaterial) {
          statusGlow.material.opacity = 0.5 * pulse;
        }
      } else if (building.status === 'error') {
        // Slow pulse when error
        const pulse = Math.sin(this.animationTime * 2) * 0.5 + 0.5;
        if (statusGlow && statusGlow.material instanceof THREE.MeshBasicMaterial) {
          statusGlow.material.opacity = 0.4 * pulse;
        }
      }
    }
  }

  /**
   * Dispose of a group and its children.
   */
  private disposeGroup(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.Sprite) {
        const mat = child.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
  }

  /**
   * Cleanup.
   */
  dispose(): void {
    for (const buildingId of this.buildingMeshes.keys()) {
      this.removeBuilding(buildingId);
    }
  }
}
