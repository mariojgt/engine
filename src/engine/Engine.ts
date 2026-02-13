import * as THREE from 'three';
import { Scene } from './Scene';
import { PhysicsWorld } from './PhysicsWorld';
import type { ScriptContext } from './ScriptComponent';

export class Engine {
  public scene: Scene;
  public physics: PhysicsWorld;

  private _clock = new THREE.Clock();
  private _elapsedTime = 0;
  private _playStarted = false;
  private _onUpdate: ((dt: number) => void)[] = [];

  /** Pluggable print handler — editor wires this to the output log */
  public onPrint: (value: any) => void = (v) => console.log('[Print]', v);

  constructor() {
    this.scene = new Scene();
    this.physics = new PhysicsWorld();
  }

  async init(): Promise<void> {
    await this.physics.init();
    console.log('Feather Engine initialized');
  }

  /** Called when Play is pressed — fires BeginPlay on all scripts */
  onPlayStarted(): void {
    this._elapsedTime = 0;
    this._playStarted = true;
    const print = (v: any) => this.onPrint(v);
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: 0, print };
        script.beginPlay(ctx);
      }
    }
  }

  /** Called when Stop is pressed — fires OnDestroy on all scripts */
  onPlayStopped(): void {
    const print = (v: any) => this.onPrint(v);
    for (const go of this.scene.gameObjects) {
      for (const script of go.scripts) {
        const ctx: ScriptContext = { gameObject: go, deltaTime: 0, elapsedTime: this._elapsedTime, print };
        script.onDestroy(ctx);
        script.reset();
      }
    }
    this._playStarted = false;
    this._elapsedTime = 0;
  }

  update(): void {
    const dt = this._clock.getDelta();

    // Run scripts on all game objects (tick)
    if (this.physics.isPlaying) {
      this._elapsedTime += dt;
      const print = (v: any) => this.onPrint(v);
      for (const go of this.scene.gameObjects) {
        for (const script of go.scripts) {
          const ctx: ScriptContext = { gameObject: go, deltaTime: dt, elapsedTime: this._elapsedTime, print };
          script.tick(ctx);
        }
      }
    }

    // Step physics
    this.physics.step(this.scene);

    // Notify update listeners
    for (const cb of this._onUpdate) cb(dt);
  }

  onUpdate(cb: (dt: number) => void): void {
    this._onUpdate.push(cb);
  }
}
