// ============================================================
//  BuildCache — Incremental Build Cache
//  Stores hashes of source assets keyed by (platform, assetId).
//  On subsequent builds, if the source hash matches the cached
//  hash, the cooked version is reused — skipping re-cooking.
//
//  Stored at: <projectRoot>/BuildCache/<platform>/build_cache.json
// ============================================================

import { invoke } from '@tauri-apps/api/core';
import type { BuildPlatform } from './BuildConfigurationAsset';

export interface CacheEntry {
  /** SHA-256 (or simpler FNV-like string hash) of the source file at cook time */
  sourceHash: string;
  /** ISO timestamp of when this asset was cached */
  cachedAt: string;
  /** Size in bytes of the cooked output */
  cookedSizeBytes: number;
  /** Engine version when this was cached — cache invalidated on engine update */
  engineVersion: string;
}

export type BuildCacheJSON = Record<string, CacheEntry>;

const ENGINE_VERSION = '0.1.0';

export class BuildCache {
  private _entries: Map<string, CacheEntry> = new Map();
  private _platform: BuildPlatform;
  private _projectPath: string;
  private _dirty = false;

  constructor(projectPath: string, platform: BuildPlatform) {
    this._projectPath = projectPath;
    this._platform = platform;
  }

  get cachePath(): string {
    return `${this._projectPath}/BuildCache/${this._platform}/build_cache.json`;
  }

  /** Load cache from disk. Silently proceeds with empty cache if not found. */
  async load(): Promise<void> {
    try {
      const json = await invoke<string>('read_file', { path: this.cachePath });
      const data: BuildCacheJSON = JSON.parse(json);
      this._entries.clear();
      for (const [key, entry] of Object.entries(data)) {
        // Invalidate entries from a different engine version
        if (entry.engineVersion === ENGINE_VERSION) {
          this._entries.set(key, entry);
        }
      }
    } catch {
      // Cache file doesn't exist or is corrupt — start fresh
      this._entries.clear();
    }
  }

  /** Save cache to disk. */
  async save(): Promise<void> {
    if (!this._dirty) return;
    const data: BuildCacheJSON = {};
    for (const [key, entry] of this._entries) {
      data[key] = entry;
    }
    await invoke('write_file', {
      path: this.cachePath,
      contents: JSON.stringify(data, null, 2),
    });
    this._dirty = false;
  }

  /** Returns true if asset with this id + sourceHash is already cooked. */
  isCached(assetId: string, sourceHash: string): boolean {
    const entry = this._entries.get(assetId);
    return !!entry && entry.sourceHash === sourceHash && entry.engineVersion === ENGINE_VERSION;
  }

  /** Record that an asset has been cooked. */
  record(assetId: string, sourceHash: string, cookedSizeBytes: number): void {
    this._entries.set(assetId, {
      sourceHash,
      cachedAt: new Date().toISOString(),
      cookedSizeBytes,
      engineVersion: ENGINE_VERSION,
    });
    this._dirty = true;
  }

  /** Remove a specific cached entry (e.g. when asset is deleted). */
  invalidate(assetId: string): void {
    if (this._entries.delete(assetId)) {
      this._dirty = true;
    }
  }

  /** Nuke the entire cache (clean build). */
  clear(): void {
    this._entries.clear();
    this._dirty = true;
  }

  /** Number of cached entries */
  get size(): number {
    return this._entries.size;
  }
}

// ── Simple string hash (FNV-1a 32-bit) ───────────────────────
// Used when we can't read the binary content of a file directly;
// gives a fast hash of JSON-serialized asset data.

export function hashString(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Hash a Uint8Array (for binary assets) using FNV-1a */
export function hashBytes(bytes: Uint8Array): string {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Hash an object by stringifying it (for JSON assets) */
export function hashObject(obj: any): string {
  return hashString(JSON.stringify(obj));
}
