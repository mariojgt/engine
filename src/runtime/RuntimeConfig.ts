// ============================================================
//  RuntimeConfig — Configuration for FeatherRuntime
//
//  Passed to FeatherRuntime.initialize() to configure the
//  runtime before the game loop starts. Both Play mode and
//  exported builds provide the same config structure.
// ============================================================

export interface RuntimeConfig {
  /** Name of the start scene (without path/extension) */
  startScene: string;

  /** Game name (for window title, logging) */
  gameName: string;

  /** Game version string */
  version: string;

  /** Target frame rate (0 = uncapped / requestAnimationFrame) */
  targetFPS: number;

  /** Whether to show loading screen */
  showLoadingScreen: boolean;

  /** Physics settings */
  physics: {
    /** Gravity vector */
    gravity: { x: number; y: number; z: number };
    /** Fixed timestep for physics (seconds) */
    fixedTimestep: number;
  };

  /** Renderer settings */
  renderer: {
    antialias: boolean;
    shadows: boolean;
    shadowMapSize: number;
    toneMapping: string;
    toneMappingExposure: number;
    /** Max pixel ratio (0 = uncapped) */
    maxPixelRatio: number;
  };

  /** Whether this is a 2D project (hint — scenes can override) */
  defaultIs2D: boolean;

  /** Additional platform-specific config (opaque to runtime) */
  platformConfig?: Record<string, any>;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  startScene: '',
  gameName: 'Feather Game',
  version: '1.0.0',
  targetFPS: 0,
  showLoadingScreen: true,
  physics: {
    gravity: { x: 0, y: -9.81, z: 0 },
    fixedTimestep: 1 / 60,
  },
  renderer: {
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    toneMapping: 'ACESFilmic',
    toneMappingExposure: 0.75,
    maxPixelRatio: 0,
  },
  defaultIs2D: false,
};
