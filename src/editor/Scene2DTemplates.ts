// ============================================================
//  Scene2DTemplates — Pre-built scene templates for quick start
//  Returns SceneJSON-compatible data for common 2D game types.
// ============================================================

import type { SceneJSON } from './SceneSerializer';

/**
 * Blank 2D scene — just the grid and camera, no actors.
 */
export function blankScene2D(name = 'Blank2D'): SceneJSON {
  return {
    schemaVersion: 1,
    name,
    gameObjects: [],
    sceneMode: '2D',
    scene2DConfig: {
      sceneMode: '2D',
      renderSettings: {
        cameraType: 'orthographic',
        pixelsPerUnit: 100,
        referenceResolution: { width: 1920, height: 1080 },
        backgroundColor: '#1a1a2e',
      },
      worldSettings: {
        gravity: { x: 0, y: -980 },
        physicsMode: '2D',
        pixelsPerUnit: 100,
      },
      sortingLayers: [
        { name: 'Background', z: 0, visible: true, locked: false },
        { name: 'Ground', z: 10, visible: true, locked: false },
        { name: 'Default', z: 20, visible: true, locked: false },
        { name: 'Characters', z: 30, visible: true, locked: false },
        { name: 'Foreground', z: 40, visible: true, locked: false },
        { name: 'UI', z: 90, visible: true, locked: false },
      ],
    },
  };
}

/**
 * Platformer 2D — Side-scrolling scene with gravity, a ground plane,
 * and pre-configured sorting layers for a classic platformer.
 */
export function platformerScene2D(name = 'Platformer'): SceneJSON {
  return {
    schemaVersion: 1,
    name,
    gameObjects: [],
    sceneMode: '2D',
    scene2DConfig: {
      sceneMode: '2D',
      renderSettings: {
        cameraType: 'orthographic',
        pixelsPerUnit: 100,
        referenceResolution: { width: 1920, height: 1080 },
        backgroundColor: '#0d1b2a',
      },
      worldSettings: {
        gravity: { x: 0, y: -980 },
        physicsMode: '2D',
        pixelsPerUnit: 100,
      },
      sortingLayers: [
        { name: 'Background', z: 0, visible: true, locked: false },
        { name: 'Parallax Far', z: 5, visible: true, locked: false },
        { name: 'Parallax Near', z: 8, visible: true, locked: false },
        { name: 'Tilemap', z: 10, visible: true, locked: false },
        { name: 'Items', z: 15, visible: true, locked: false },
        { name: 'Characters', z: 20, visible: true, locked: false },
        { name: 'Foreground', z: 30, visible: true, locked: false },
        { name: 'UI', z: 90, visible: true, locked: false },
      ],
    },
  };
}

/**
 * Top-Down 2D — Overhead view scene with no gravity,
 * configured for RPG or action game style.
 */
export function topDownScene2D(name = 'TopDown'): SceneJSON {
  return {
    schemaVersion: 1,
    name,
    gameObjects: [],
    sceneMode: '2D',
    scene2DConfig: {
      sceneMode: '2D',
      renderSettings: {
        cameraType: 'orthographic',
        pixelsPerUnit: 100,
        referenceResolution: { width: 1920, height: 1080 },
        backgroundColor: '#1a2332',
      },
      worldSettings: {
        gravity: { x: 0, y: 0 }, // No gravity for top-down
        physicsMode: '2D',
        pixelsPerUnit: 100,
      },
      sortingLayers: [
        { name: 'Ground', z: 0, visible: true, locked: false },
        { name: 'Floor Decor', z: 5, visible: true, locked: false },
        { name: 'Walls', z: 10, visible: true, locked: false },
        { name: 'Items', z: 15, visible: true, locked: false },
        { name: 'Characters', z: 20, visible: true, locked: false },
        { name: 'Overhead', z: 30, visible: true, locked: false },
        { name: 'UI', z: 90, visible: true, locked: false },
      ],
    },
  };
}

/** All available 2D scene templates */
export const SCENE_2D_TEMPLATES = [
  { label: 'Blank 2D', description: 'Empty 2D scene with grid', factory: blankScene2D },
  { label: 'Platformer', description: 'Side-scrolling with gravity and parallax layers', factory: platformerScene2D },
  { label: 'Top-Down', description: 'Overhead view with no gravity (RPG/action)', factory: topDownScene2D },
] as const;
