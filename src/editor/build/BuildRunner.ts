// ============================================================
//  BuildRunner — Main Build Orchestrator
//  Coordinates the full build pipeline from validation to output.
//
//  Pipeline:
//    1. Pre-build validation
//    2. Scene loading & dependency analysis
//    3. Asset cooking (incremental)
//    4. Platform-specific build (Tauri / Vite)
//    5. Output + cache save
//
//  Each step emits real-time log messages and progress events
//  that the BuildDashboardPanel subscribes to.
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildConfigurationJSON } from './BuildConfigurationAsset';
import type { DependencyAnalyzerContext } from './DependencyAnalyzer';
import type { SceneJSON } from '../SceneSerializer';
import { DependencyAnalyzer } from './DependencyAnalyzer';
import { AssetCookingPipeline } from './AssetCookingPipeline';
import { BuildValidator } from './BuildValidation';
import { PCBuildTarget } from './platforms/PCBuildTarget';
import { WebBuildTarget } from './platforms/WebBuildTarget';
import { MobileBuildTarget } from './platforms/MobileBuildTarget';
import { ConsoleBuildTarget } from './platforms/ConsoleBuildTarget';

// ── Event types ───────────────────────────────────────────────

export interface BuildEvent {
  type:
    | 'log'
    | 'step-started'
    | 'step-completed'
    | 'step-failed'
    | 'progress'
    | 'validation-result'
    | 'cook-progress'
    | 'build-complete'
    | 'build-failed'
    | 'cancelled';
  timestamp: number;
  message?: string;
  step?: string;
  stepIndex?: number;
  totalSteps?: number;
  overallProgress?: number;   // 0–100
  stepProgress?: number;      // 0–100
  data?: any;
}

export type BuildEventCallback = (event: BuildEvent) => void;

// ── Build result ──────────────────────────────────────────────

export interface BuildRunResult {
  success: boolean;
  cancelled: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
  outputPath: string;
  stats: {
    scenesCooked: number;
    assetsCooked: number;
    assetsCached: number;
    totalSizeBytes: number;
    texturesCooked: number;
    audioCooked: number;
    meshesCooked: number;
    blueprintsCooked: number;
  };
}

// ── Build steps ───────────────────────────────────────────────

const STEPS = [
  'Validate configuration',
  'Load scenes',
  'Analyze dependencies',
  'Cook assets',
  'Build platform target',
  'Finalize output',
] as const;

type BuildStep = typeof STEPS[number];

// ── Runner ────────────────────────────────────────────────────

export class BuildRunner {
  private _config: BuildConfigurationJSON;
  private _projectPath: string;
  private _analyzerCtx: DependencyAnalyzerContext;
  private _listeners: BuildEventCallback[] = [];
  private _cancelled = false;
  private _startTime = 0;

  constructor(
    config: BuildConfigurationJSON,
    projectPath: string,
    analyzerCtx: DependencyAnalyzerContext
  ) {
    this._config = config;
    this._projectPath = projectPath;
    this._analyzerCtx = analyzerCtx;
  }

  /** Subscribe to build events for live UI updates */
  onEvent(cb: BuildEventCallback): () => void {
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(l => l !== cb); };
  }

  /** Cancel an in-progress build (best-effort at safe checkpoints) */
  cancel(): void {
    this._cancelled = true;
    this._emit({ type: 'cancelled', message: 'Build cancelled by user' });
  }

  /** Run the full build pipeline */
  async run(): Promise<BuildRunResult> {
    this._cancelled = false;
    this._startTime = Date.now();

    const result: BuildRunResult = {
      success: false,
      cancelled: false,
      errors: [],
      warnings: [],
      durationMs: 0,
      outputPath: '',
      stats: {
        scenesCooked: 0,
        assetsCooked: 0,
        assetsCached: 0,
        totalSizeBytes: 0,
        texturesCooked: 0,
        audioCooked: 0,
        meshesCooked: 0,
        blueprintsCooked: 0,
      },
    };

    try {
      // ── Step 1: Validate configuration ────────────────────────
      this._startStep('Validate configuration', 1, STEPS.length);
      const validator = new BuildValidator(this._config, this._projectPath);

      // Load scenes for analysis first (needed by validator)
      const sceneDataMap = await this._loadScenes();
      if (this._cancelled) return this._cancelResult(result);

      // Run dependency analysis (needed for validation)
      this._startStep('Analyze dependencies', 3, STEPS.length);
      this._emitProgress(20);
      const analyzer = new DependencyAnalyzer(this._analyzerCtx);
      const includedScenes = this._config.scenes
        .filter(s => s.included)
        .map(s => s.sceneName);

      const manifest = analyzer.analyze(includedScenes, sceneDataMap);

      // Validate
      this._startStep('Validate configuration', 1, STEPS.length);
      const validation = await validator.validate(manifest);

      this._emit({
        type: 'validation-result',
        data: validation,
        message: validation.passed
          ? `Validation passed (${validation.warnings.length} warning(s))`
          : `Validation failed: ${validation.errors.length} error(s)`,
      });

      for (const err of validation.errors) result.errors.push(err.message);
      for (const warn of validation.warnings) result.warnings.push(warn.message);

      if (!validation.passed) {
        this._failStep('Validate configuration',
          `${validation.errors.length} validation error(s) must be fixed`);
        result.durationMs = Date.now() - this._startTime;
        this._emit({ type: 'build-failed', message: 'Build failed: validation errors', data: result });
        return result;
      }

      this._completeStep('Validate configuration');
      if (this._cancelled) return this._cancelResult(result);

      // ── Step 2: Scene loading (already done above) ─────────────
      this._startStep('Load scenes', 2, STEPS.length);
      this._log(`Loaded ${sceneDataMap.size} scene(s)`);
      this._completeStep('Load scenes');

      // ── Step 3: Dependency analysis (already done above) ────────
      this._completeStep('Analyze dependencies');
      this._log(`Found ${manifest.scenes.length} scene(s), ${manifest.assets.length} asset(s)`);

      const byKind = this._countByKind(manifest.assets);
      this._log(`  Textures: ${byKind.texture ?? 0}, Audio: ${byKind.sound ?? 0}, ` +
        `Meshes: ${byKind.mesh ?? 0}, Actors: ${byKind.actor ?? 0}`);

      if (this._cancelled) return this._cancelResult(result);
      this._emitProgress(30);

      // ── Step 4: Cook assets ─────────────────────────────────────
      this._startStep('Cook assets', 4, STEPS.length);
      const cooking = new AssetCookingPipeline(this._config, this._projectPath);

      const cookResult = await cooking.cookAll(manifest, (step, current, total) => {
        const pct = Math.round((current / total) * 100);
        this._emit({
          type: 'cook-progress',
          message: step,
          stepProgress: pct,
          overallProgress: 30 + Math.round((current / total) * 40),
        });
        if (current % 10 === 0 || current === total) {
          this._log(`  ${step} (${current}/${total})`);
        }
      });

      for (const e of cookResult.errors) result.errors.push(e);
      for (const w of cookResult.warnings) result.warnings.push(w);

      result.stats.assetsCooked = cookResult.cooked;
      result.stats.assetsCached = cookResult.cached;
      result.stats.totalSizeBytes = cookResult.totalCookedBytes;
      result.stats.scenesCooked = manifest.scenes.length;
      result.stats.texturesCooked = manifest.assets.filter(a => a.kind === 'texture').length;
      result.stats.audioCooked = manifest.assets.filter(a => a.kind === 'sound').length;
      result.stats.meshesCooked = manifest.assets.filter(a => a.kind === 'mesh').length;
      result.stats.blueprintsCooked = manifest.assets.filter(a => a.kind === 'actor').length;

      if (cookResult.failed > 0) {
        this._failStep('Cook assets', `${cookResult.failed} asset(s) failed to cook`);
        result.durationMs = Date.now() - this._startTime;
        this._emit({ type: 'build-failed', message: 'Build failed: asset cooking errors', data: result });
        return result;
      }

      this._completeStep('Cook assets');
      this._log(`Cooking complete: ${cookResult.cooked} cooked, ${cookResult.cached} cached`);
      if (this._cancelled) return this._cancelResult(result);

      this._emitProgress(70);

      // ── Step 5: Platform-specific build ─────────────────────────
      this._startStep('Build platform target', 5, STEPS.length);
      this._log(`Platform: ${this._config.general.platform}`);
      this._log(`Staging dir: ${cooking.stagingDir}`);
      const platformResult = await this._runPlatformBuild(cooking.stagingDir);

      if (!platformResult.success) {
        result.errors.push(platformResult.message);
        this._log(`Platform build failed: ${platformResult.message}`);
        this._failStep('Build platform target', platformResult.message);
        result.durationMs = Date.now() - this._startTime;
        this._emit({ type: 'build-failed', message: `Build failed: platform target failed\n${platformResult.message}`, data: result });
        return result;
      }

      result.outputPath = platformResult.outputPath ?? '';
      this._completeStep('Build platform target');
      this._emitProgress(95);

      // ── Step 6: Finalize ─────────────────────────────────────────
      this._startStep('Finalize output', 6, STEPS.length);
      result.durationMs = Date.now() - this._startTime;
      result.success = true;
      this._completeStep('Finalize output');
      this._emitProgress(100);

      this._emit({
        type: 'build-complete',
        message: `Build complete in ${(result.durationMs / 1000).toFixed(1)}s → ${result.outputPath}`,
        data: result,
      });

      return result;
    } catch (e: any) {
      result.durationMs = Date.now() - this._startTime;
      result.errors.push(e?.message ?? String(e));
      this._log(`Fatal build error: ${e?.message ?? e}`);
      this._emit({ type: 'build-failed', message: `Fatal error: ${e?.message ?? e}`, data: result });
      return result;
    }
  }

  // ── Private helpers ───────────────────────────────────────────

  private async _loadScenes(): Promise<Map<string, SceneJSON>> {
    const map = new Map<string, SceneJSON>();
    let includedScenes = this._config.scenes.filter(s => s.included);

    // If no scenes are configured, auto-discover ALL scene files from the project
    if (includedScenes.length === 0) {
      this._log('No scenes in build config — auto-discovering from project...');
      try {
        const files = await invoke<string[]>('list_dir_files', {
          path: `${this._projectPath}/Scenes`,
        });
        for (const f of files) {
          if (f.endsWith('.json')) {
            const name = f.replace(/\.json$/, '');
            this._config.scenes.push({ sceneName: name, included: true });
          }
        }
        includedScenes = this._config.scenes.filter(s => s.included);
        this._log(`  Auto-discovered ${includedScenes.length} scene(s): ${includedScenes.map(s => s.sceneName).join(', ')}`);
      } catch (e: any) {
        this._log(`  Warning: could not auto-discover scenes: ${e?.message ?? e}`);
      }
    }

    await Promise.all(
      includedScenes.map(async (scene) => {
        try {
          const json = await invoke<string>('read_file', {
            path: `${this._projectPath}/Scenes/${scene.sceneName}.json`,
          });
          map.set(scene.sceneName, JSON.parse(json));
        } catch {
          // Scene missing — will be caught by validation
        }
      }),
    );

    return map;
  }

  private async _runPlatformBuild(stagingDir: string): Promise<{ success: boolean; message: string; outputPath?: string }> {
    const platform = this._config.general.platform;

    const log = (msg: string) => this._log(msg);

    switch (platform) {
      case 'windows':
      case 'macos':
      case 'linux': {
        const target = new PCBuildTarget(this._config, this._projectPath, stagingDir, log);
        return target.build();
      }
      case 'web': {
        const target = new WebBuildTarget(this._config, this._projectPath, stagingDir, log);
        return target.build();
      }
      case 'android':
      case 'ios': {
        const target = new MobileBuildTarget(this._config, this._projectPath, stagingDir, log);
        return target.build();
      }
      case 'ps5':
      case 'xbox':
      case 'switch': {
        const target = new ConsoleBuildTarget(this._config, this._projectPath, stagingDir, log);
        const result = await target.build();
        return { success: false, message: result.message };
      }
      default:
        return { success: false, message: `Unknown platform: ${platform}` };
    }
  }

  private _countByKind(assets: { kind: string }[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      counts[a.kind] = (counts[a.kind] ?? 0) + 1;
    }
    return counts;
  }

  private _cancelResult(result: BuildRunResult): BuildRunResult {
    result.cancelled = true;
    result.durationMs = Date.now() - this._startTime;
    return result;
  }

  // ── Event emission helpers ────────────────────────────────────

  private _emit(event: Partial<BuildEvent>): void {
    const full: BuildEvent = {
      type: event.type ?? 'log',
      timestamp: Date.now(),
      ...event,
    };
    for (const l of this._listeners) {
      try { l(full); } catch { /* noop */ }
    }
  }

  private _log(message: string): void {
    this._emit({ type: 'log', message });
  }

  private _startStep(step: string, index: number, total: number): void {
    this._emit({ type: 'step-started', step, stepIndex: index, totalSteps: total, message: step });
  }

  private _completeStep(step: string): void {
    this._emit({ type: 'step-completed', step, message: `✓ ${step}` });
  }

  private _failStep(step: string, detail: string): void {
    this._emit({ type: 'step-failed', step, message: `✗ ${step}: ${detail}` });
  }

  private _emitProgress(pct: number): void {
    this._emit({ type: 'progress', overallProgress: pct });
  }
}
