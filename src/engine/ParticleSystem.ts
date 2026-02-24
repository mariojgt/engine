
import * as THREE from 'three';
import { Component } from './Component';
import type { GameObject } from './GameObject';
import type { ScriptContext } from './ScriptComponent';

export type ParticleShape = 'sphere' | 'box' | 'cone';

export interface ParticleEmitterSettings {
    maxParticles: number;
    emissionRate: number; // Particles per second
    
    // Lifetime
    startLifetime: number;
    lifetimeVariance: number;
    
    // Speed
    startSpeed: number;
    speedVariance: number;
    
    // Size
    startSize: number;
    endSize: number;
    sizeVariance: number;
    
    // Color
    startColor: THREE.Color;
    endColor: THREE.Color;
    
    // Physics
    gravity: THREE.Vector3;
    drag: number;
    
    // Emission Shape
    shape: ParticleShape;
    shapeRadius: number;
    shapeAngle: number; // For cone
    
    // Rendering
    texture: THREE.Texture | null;
    blendMode: THREE.Blending;
    transparent: boolean;
    depthWrite: boolean;
}

export class ParticleSystemManager {
    private static _instance: ParticleSystemManager;
    private _emitters: ParticleEmitter[] = [];

    static getInstance(): ParticleSystemManager {
        if (!this._instance) this._instance = new ParticleSystemManager();
        return this._instance;
    }

    register(emitter: ParticleEmitter) {
        if (!this._emitters.includes(emitter)) this._emitters.push(emitter);
    }

    unregister(emitter: ParticleEmitter) {
        const idx = this._emitters.indexOf(emitter);
        if (idx >= 0) this._emitters.splice(idx, 1);
    }

    update(dt: number) {
        // Update all registered emitters
        // We pass a dummy context or just call internal update logic
        // Since we need ScriptContext for deltaTime, we can just pass dt if we modify signature
        // or create a mock context. 
        // Let's modify ParticleEmitter.update to take dt directly or use a helper.
        for (const e of this._emitters) {
             e.updateInternal(dt);
        }
    }
}

class Particle {
    position = new THREE.Vector3();
    velocity = new THREE.Vector3();
    lifetime = 0;
    maxLifetime = 0;
    size = 0;
    maxSize = 0;
    endSize = 0;
    color = new THREE.Color();
    startColor = new THREE.Color();
    endColor = new THREE.Color();
    active = false;
}

export class ParticleEmitter extends Component {
    public settings: ParticleEmitterSettings = {
        maxParticles: 1000,
        emissionRate: 50,
        startLifetime: 2.0,
        lifetimeVariance: 0.5,
        startSpeed: 2.0,
        speedVariance: 0.5,
        startSize: 0.5,
        endSize: 0.0,
        sizeVariance: 0.1,
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 0, 0),
        gravity: new THREE.Vector3(0, -9.8, 0),
        drag: 0.0,
        shape: 'cone',
        shapeRadius: 0.5,
        shapeAngle: 45,
        texture: null,
        blendMode: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    };

    private _geometry: THREE.BufferGeometry;
    private _material: THREE.PointsMaterial;
    private _points: THREE.Points;
    private _particles: Particle[] = [];
    private _emitAccumulator = 0;
    
    // Buffer Arrays
    private _posArray: Float32Array;
    private _colArray: Float32Array;
    
    // Reuse vector objects to reduce GC
    private _tempVec = new THREE.Vector3();

    constructor() {
        super();
        this._geometry = new THREE.BufferGeometry();
        this._material = new THREE.PointsMaterial({
            size: 1,
            map: null,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });
        
        // Allocate buffers once based on default max settings, 
        // will reallocate if settings change > buffer size (omitted for brevity)
        this._posArray = new Float32Array(this.settings.maxParticles * 3);
        this._colArray = new Float32Array(this.settings.maxParticles * 3);
        
        const posAttr = new THREE.BufferAttribute(this._posArray, 3);
        const colAttr = new THREE.BufferAttribute(this._colArray, 3);
        posAttr.setUsage(THREE.DynamicDrawUsage);
        colAttr.setUsage(THREE.DynamicDrawUsage);
        
        this._geometry.setAttribute('position', posAttr);
        this._geometry.setAttribute('color', colAttr);
        
        this._points = new THREE.Points(this._geometry, this._material);
        // Don't save this mesh with the scene serializer if possible, 
        // or handle it gracefully. For now, mark as frustumCulled=false 
        // if bounds aren't updated often.
        this._points.frustumCulled = false;
    }

    onAttach(gameObject: GameObject): void {
        super.onAttach(gameObject);
        this._initParticles();
        
        // Add valid object to scene
        if (this.gameObject.mesh) {
            this.gameObject.mesh.add(this._points);
        }
        
        // Register with manager
        ParticleSystemManager.getInstance().register(this);
    }

    onDetach(): void {
        if (this._points.parent) {
            this._points.parent.remove(this._points);
        }
        this._geometry.dispose();
        this._material.dispose();

        // Unregister
        ParticleSystemManager.getInstance().unregister(this);
    }

    // Called by Manager
    updateInternal(dt: number): void {
        if (!this.enabled) return;
        
        // 1. Emit new particles
        this._emitAccumulator += dt * this.settings.emissionRate;
        const emissionCount = Math.floor(this._emitAccumulator);
        this._emitAccumulator -= emissionCount;
        
        for (let i = 0; i < emissionCount; i++) {
            this._spawnParticle();
        }
        
        // 2. Update existing particles
        let activeCount = 0;
        
        for (let i = 0; i < this._particles.length; i++) {
            const p = this._particles[i];
            if (!p.active) continue;
            
            p.lifetime -= dt;
            if (p.lifetime <= 0) {
                p.active = false;
                continue;
            }
            
            // Physics
            p.velocity.addScaledVector(this.settings.gravity, dt);
            if (this.settings.drag > 0) {
                p.velocity.multiplyScalar(Math.max(0, 1 - this.settings.drag * dt));
            }
            p.position.addScaledVector(p.velocity, dt);
            
            // Color Lerp
            const lifeRatio = 1.0 - (p.lifetime / p.maxLifetime);
            p.color.lerpColors(p.startColor, p.endColor, lifeRatio);
            
            // Write directly to Float32Array
            this._posArray[activeCount * 3] = p.position.x;
            this._posArray[activeCount * 3 + 1] = p.position.y;
            this._posArray[activeCount * 3 + 2] = p.position.z;
            
            this._colArray[activeCount * 3] = p.color.r;
            this._colArray[activeCount * 3 + 1] = p.color.g;
            this._colArray[activeCount * 3 + 2] = p.color.b;
            
            activeCount++;
        }
        
        // 3. Update Geometry
        this._geometry.setDrawRange(0, activeCount);
        
        if (activeCount > 0) {
            this._geometry.attributes.position.needsUpdate = true;
            this._geometry.attributes.color.needsUpdate = true;
            // Hack for size since we don't have per-vertex size yet
            this._material.size = this.settings.startSize; 
        }
    }

    private _initParticles() {
        this._particles = [];
        for (let i = 0; i < this.settings.maxParticles; i++) {
            this._particles.push(new Particle());
        }
        // Reallocate if settings changed (simple check omitted)
    }

    private _spawnParticle() {
        // Find first inactive particle
        const p = this._particles.find(p => !p.active);
        if (!p) return; // Pool empty
        
        p.active = true;
        p.maxLifetime = this.settings.startLifetime + (Math.random() * this.settings.lifetimeVariance);
        p.lifetime = p.maxLifetime;
        
        // Reset Position (relative to emitter)
        // For simplicity, emit from 0,0,0 local space
        p.position.set(0, 0, 0);
        
        // Shape Logic
        const dir = new THREE.Vector3(0, 1, 0);
        if (this.settings.shape === 'sphere') {
             dir.randomDirection();
        } else if (this.settings.shape === 'cone') {
            // Simple cone approximation
             const angle = THREE.MathUtils.degToRad(this.settings.shapeAngle);
             const spread = Math.random() * angle;
             dir.set(
                 (Math.random() - 0.5) * Math.sin(spread),
                 1,
                 (Math.random() - 0.5) * Math.sin(spread)
             ).normalize();
        }
        
        p.position.addScaledVector(dir, Math.random() * this.settings.shapeRadius);
        
        // Speed
        const speed = this.settings.startSpeed + (Math.random() * this.settings.speedVariance);
        p.velocity.copy(dir).multiplyScalar(speed);
        
        // Size
        p.maxSize = this.settings.startSize + (Math.random() * this.settings.sizeVariance);
        p.endSize = this.settings.endSize;
        
        // Color
        p.startColor.copy(this.settings.startColor);
        p.endColor.copy(this.settings.endColor);
        p.color.copy(p.startColor);
    }
}
