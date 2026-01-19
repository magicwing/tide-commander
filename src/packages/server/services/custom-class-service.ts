/**
 * Custom Agent Class Service
 * Manages user-defined agent classes with associated default skills
 */

import { EventEmitter } from 'events';
import { loadCustomAgentClasses, saveCustomAgentClasses } from '../data/index.js';
import type { CustomAgentClass } from '../../shared/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CustomClassService');

// In-memory store
let customClasses: Map<string, CustomAgentClass> = new Map();

// Event emitter for broadcasting changes
export const customClassEvents = new EventEmitter();

/**
 * Initialize the custom class service - load from disk
 */
export function initCustomClasses(): void {
  const loaded = loadCustomAgentClasses();
  customClasses = new Map(loaded.map(c => [c.id, c]));
  log.log(`Initialized with ${customClasses.size} custom agent classes`);
}

/**
 * Persist custom classes to disk
 */
function persistClasses(): void {
  saveCustomAgentClasses(Array.from(customClasses.values()));
}

/**
 * Get all custom agent classes
 */
export function getAllCustomClasses(): CustomAgentClass[] {
  return Array.from(customClasses.values());
}

/**
 * Get a custom agent class by ID
 */
export function getCustomClass(id: string): CustomAgentClass | undefined {
  return customClasses.get(id);
}

/**
 * Generate a slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create a new custom agent class
 */
export function createCustomClass(
  data: Omit<CustomAgentClass, 'id' | 'createdAt' | 'updatedAt'>
): CustomAgentClass {
  const now = Date.now();
  const id = generateSlug(data.name) || `class-${now}`;

  // Ensure unique ID
  let uniqueId = id;
  let counter = 1;
  while (customClasses.has(uniqueId)) {
    uniqueId = `${id}-${counter++}`;
  }

  const customClass: CustomAgentClass = {
    ...data,
    id: uniqueId,
    createdAt: now,
    updatedAt: now,
  };

  customClasses.set(uniqueId, customClass);
  persistClasses();

  log.log(`Created custom class: ${customClass.name} (${uniqueId})`);
  customClassEvents.emit('created', customClass);

  return customClass;
}

/**
 * Update a custom agent class
 */
export function updateCustomClass(
  id: string,
  updates: Partial<CustomAgentClass>
): CustomAgentClass | null {
  const existing = customClasses.get(id);
  if (!existing) {
    log.warn(`Custom class not found: ${id}`);
    return null;
  }

  const updated: CustomAgentClass = {
    ...existing,
    ...updates,
    id, // Prevent ID changes
    createdAt: existing.createdAt, // Preserve creation time
    updatedAt: Date.now(),
  };

  customClasses.set(id, updated);
  persistClasses();

  log.log(`Updated custom class: ${updated.name} (${id})`);
  customClassEvents.emit('updated', updated);

  return updated;
}

/**
 * Delete a custom agent class
 */
export function deleteCustomClass(id: string): boolean {
  if (!customClasses.has(id)) {
    log.warn(`Custom class not found: ${id}`);
    return false;
  }

  customClasses.delete(id);
  persistClasses();

  log.log(`Deleted custom class: ${id}`);
  customClassEvents.emit('deleted', id);

  return true;
}

/**
 * Check if a class ID is a custom class
 */
export function isCustomClass(classId: string): boolean {
  return customClasses.has(classId);
}

/**
 * Get the visual model file for a custom agent class
 * Returns the model file (e.g., 'character-male-a.glb') or undefined if not a custom class
 */
export function getClassModelFile(classId: string): string | undefined {
  const customClass = customClasses.get(classId);
  if (customClass) {
    return customClass.model || 'character-male-a.glb';
  }
  return undefined;
}

/**
 * Get class info (works for both custom and built-in)
 */
export function getClassInfo(classId: string): { icon: string; color: string; description: string } | null {
  const customClass = customClasses.get(classId);
  if (customClass) {
    return {
      icon: customClass.icon,
      color: customClass.color,
      description: customClass.description,
    };
  }
  return null; // Built-in classes handled elsewhere
}

/**
 * Get default skill IDs for a custom class
 */
export function getClassDefaultSkillIds(classId: string): string[] {
  const customClass = customClasses.get(classId);
  return customClass?.defaultSkillIds || [];
}

// Export as a service object for consistency
export const customClassService = {
  initCustomClasses,
  getAllCustomClasses,
  getCustomClass,
  createCustomClass,
  updateCustomClass,
  deleteCustomClass,
  isCustomClass,
  getClassModelFile,
  getClassInfo,
  getClassDefaultSkillIds,
};
