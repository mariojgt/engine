// ============================================================
//  CollisionGenerator — Collision mesh generation system
//  Generates collision shapes: box, sphere, capsule,
//  convex hull, and auto-convex decomposition.
//  Works with Three.js BufferGeometry.
// ============================================================

import * as THREE from 'three';
import type { CollisionSettings, CollisionDataJSON, CollisionHullData, CollisionType } from './MeshAsset';

// ── Helper: extract all vertex positions from a scene ──

function extractVertices(scene: THREE.Object3D): Float32Array {
  const positions: number[] = [];

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;

    // Apply world transform
    mesh.updateMatrixWorld(true);
    const matrix = mesh.matrixWorld;

    const vec = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      vec.applyMatrix4(matrix);
      positions.push(vec.x, vec.y, vec.z);
    }
  });

  return new Float32Array(positions);
}

// ── Box Collision ──

function generateBoxCollision(scene: THREE.Object3D): CollisionHullData {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;

  // 8 vertices of the box
  const vertices = [
    center.x - hx, center.y - hy, center.z - hz,
    center.x + hx, center.y - hy, center.z - hz,
    center.x + hx, center.y + hy, center.z - hz,
    center.x - hx, center.y + hy, center.z - hz,
    center.x - hx, center.y - hy, center.z + hz,
    center.x + hx, center.y - hy, center.z + hz,
    center.x + hx, center.y + hy, center.z + hz,
    center.x - hx, center.y + hy, center.z + hz,
  ];

  // 12 triangles (2 per face)
  const indices = [
    0, 1, 2, 0, 2, 3, // front
    4, 6, 5, 4, 7, 6, // back
    0, 4, 5, 0, 5, 1, // bottom
    2, 6, 7, 2, 7, 3, // top
    0, 3, 7, 0, 7, 4, // left
    1, 5, 6, 1, 6, 2, // right
  ];

  return {
    type: 'box',
    vertexCount: 8,
    vertices,
    indices,
    center: { x: center.x, y: center.y, z: center.z },
    halfExtents: { x: hx, y: hy, z: hz },
  };
}

// ── Sphere Collision ──

function generateSphereCollision(scene: THREE.Object3D): CollisionHullData {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const radius = Math.max(size.x, size.y, size.z) / 2;

  // Generate icosphere approximation (12 vertices, 20 triangles)
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseVerts = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];

  const vertices: number[] = [];
  for (const v of baseVerts) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    vertices.push(
      center.x + (v[0] / len) * radius,
      center.y + (v[1] / len) * radius,
      center.z + (v[2] / len) * radius,
    );
  }

  const indices = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];

  return {
    type: 'sphere',
    vertexCount: 12,
    vertices,
    indices,
    center: { x: center.x, y: center.y, z: center.z },
    radius,
  };
}

// ── Capsule Collision ──

function generateCapsuleCollision(scene: THREE.Object3D): CollisionHullData {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  // Capsule oriented along Y axis
  const radius = Math.max(size.x, size.z) / 2;
  const height = size.y;
  const halfHeight = height / 2;

  // Generate capsule vertices (simplified: 2 hemispheres + cylinder)
  const segments = 8;
  const rings = 4;
  const vertices: number[] = [];
  const indices: number[] = [];

  // Top hemisphere
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (Math.PI / 2) * (ring / rings);
    const y = Math.cos(phi) * radius + halfHeight;
    const r = Math.sin(phi) * radius;
    for (let seg = 0; seg < segments; seg++) {
      const theta = (2 * Math.PI * seg) / segments;
      vertices.push(
        center.x + Math.cos(theta) * r,
        center.y + y,
        center.z + Math.sin(theta) * r,
      );
    }
  }

  // Bottom hemisphere
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (Math.PI / 2) * (ring / rings);
    const y = -(Math.cos(phi) * radius + halfHeight);
    const r = Math.sin(phi) * radius;
    for (let seg = 0; seg < segments; seg++) {
      const theta = (2 * Math.PI * seg) / segments;
      vertices.push(
        center.x + Math.cos(theta) * r,
        center.y + y,
        center.z + Math.sin(theta) * r,
      );
    }
  }

  const totalRings = (rings + 1) * 2;
  // Build triangle indices
  for (let ring = 0; ring < totalRings - 1; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * segments + seg;
      const b = ring * segments + (seg + 1) % segments;
      const c = (ring + 1) * segments + seg;
      const d = (ring + 1) * segments + (seg + 1) % segments;
      indices.push(a, c, b, b, c, d);
    }
  }

  return {
    type: 'capsule',
    vertexCount: vertices.length / 3,
    vertices,
    indices,
    center: { x: center.x, y: center.y, z: center.z },
    radius,
    height,
  };
}

// ── Convex Hull (Gift wrapping / Quickhull approximation) ──

function generateConvexHull(scene: THREE.Object3D): CollisionHullData {
  const allVerts = extractVertices(scene);
  const pointCount = allVerts.length / 3;

  if (pointCount < 4) {
    return generateBoxCollision(scene);
  }

  // Simplified convex hull using extreme points + interior sampling
  // For a production system, use a proper Quickhull implementation
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pointCount; i++) {
    points.push(new THREE.Vector3(allVerts[i * 3], allVerts[i * 3 + 1], allVerts[i * 3 + 2]));
  }

  // Find extreme points along principal axes
  const extremes = new Set<number>();
  const axes = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(1, 1, 0).normalize(), new THREE.Vector3(1, 0, 1).normalize(),
    new THREE.Vector3(0, 1, 1).normalize(), new THREE.Vector3(1, 1, 1).normalize(),
    new THREE.Vector3(-1, 1, 0).normalize(), new THREE.Vector3(-1, 0, 1).normalize(),
    new THREE.Vector3(0, -1, 1).normalize(), new THREE.Vector3(-1, -1, 1).normalize(),
  ];

  for (const axis of axes) {
    let maxDot = -Infinity;
    let maxIdx = 0;
    for (let i = 0; i < points.length; i++) {
      const d = points[i].dot(axis);
      if (d > maxDot) {
        maxDot = d;
        maxIdx = i;
      }
    }
    extremes.add(maxIdx);
  }

  // Add some uniformly distributed samples
  const sampleCount = Math.min(64, pointCount);
  const step = Math.max(1, Math.floor(pointCount / sampleCount));
  for (let i = 0; i < pointCount; i += step) {
    extremes.add(i);
  }

  // Collect hull vertices
  const hullPoints = Array.from(extremes).map(i => points[i]);

  // Build convex hull using simple approach:
  // Compute center, then sort triangles by outward-facing normals
  const center = new THREE.Vector3();
  for (const p of hullPoints) center.add(p);
  center.divideScalar(hullPoints.length);

  const hullVerts: number[] = [];
  for (const p of hullPoints) {
    hullVerts.push(p.x, p.y, p.z);
  }

  // Simple triangulation: connect all points to form a convex surface
  // Using a fan from each extreme point (simplified)
  const hullIndices: number[] = [];
  if (hullPoints.length >= 3) {
    // Build triangles using a simple fan approach
    for (let i = 1; i < hullPoints.length - 1; i++) {
      hullIndices.push(0, i, i + 1);
    }
    // Connect back faces
    for (let i = 1; i < hullPoints.length - 1; i++) {
      hullIndices.push(0, i + 1, i);
    }
  }

  return {
    type: 'convexHull',
    vertexCount: hullPoints.length,
    vertices: hullVerts,
    indices: hullIndices,
    center: { x: center.x, y: center.y, z: center.z },
  };
}

// ── Auto-Convex Decomposition (simplified VHACD-like approach) ──

function generateAutoConvexHulls(
  scene: THREE.Object3D,
  maxHulls: number,
  maxHullVertices: number,
): CollisionHullData[] {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const allVerts = extractVertices(scene);
  const pointCount = allVerts.length / 3;

  if (pointCount < 4 || maxHulls <= 1) {
    return [generateConvexHull(scene)];
  }

  // Simple spatial decomposition: split bounding box along longest axis
  // then generate convex hull for each partition
  const hulls: CollisionHullData[] = [];

  // Determine split axes based on hull count
  const splitsPerAxis = Math.ceil(Math.pow(maxHulls, 1 / 3));
  const cellSizeX = size.x / splitsPerAxis || size.x;
  const cellSizeY = size.y / splitsPerAxis || size.y;
  const cellSizeZ = size.z / splitsPerAxis || size.z;

  // Partition vertices into cells
  const cells = new Map<string, THREE.Vector3[]>();

  for (let i = 0; i < pointCount; i++) {
    const x = allVerts[i * 3];
    const y = allVerts[i * 3 + 1];
    const z = allVerts[i * 3 + 2];

    const cx = Math.min(splitsPerAxis - 1, Math.floor((x - box.min.x) / cellSizeX));
    const cy = Math.min(splitsPerAxis - 1, Math.floor((y - box.min.y) / cellSizeY));
    const cz = Math.min(splitsPerAxis - 1, Math.floor((z - box.min.z) / cellSizeZ));
    const key = `${cx},${cy},${cz}`;

    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(new THREE.Vector3(x, y, z));
  }

  // Generate convex hull for each non-empty cell
  for (const [, cellPoints] of cells) {
    if (cellPoints.length < 4) continue;
    if (hulls.length >= maxHulls) break;

    // Subsample if too many vertices
    let points = cellPoints;
    if (points.length > maxHullVertices) {
      const step = Math.ceil(points.length / maxHullVertices);
      points = points.filter((_, i) => i % step === 0);
    }

    const hullCenter = new THREE.Vector3();
    for (const p of points) hullCenter.add(p);
    hullCenter.divideScalar(points.length);

    const vertices: number[] = [];
    for (const p of points) {
      vertices.push(p.x, p.y, p.z);
    }

    // Simple triangulation
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      indices.push(0, i, i + 1);
    }

    hulls.push({
      type: 'autoConvex',
      vertexCount: points.length,
      vertices,
      indices,
      center: { x: hullCenter.x, y: hullCenter.y, z: hullCenter.z },
    });
  }

  // If we didn't generate any hulls, fall back to a single convex hull
  if (hulls.length === 0) {
    hulls.push(generateConvexHull(scene));
  }

  return hulls;
}

// ============================================================
//  Public API — generateCollision
// ============================================================

/**
 * Generate collision data for a Three.js scene based on settings.
 * Returns CollisionDataJSON with all collision hulls.
 */
export function generateCollision(
  scene: THREE.Object3D,
  settings: CollisionSettings,
  onProgress?: (msg: string) => void,
): CollisionDataJSON | null {
  if (!settings.generateCollision || settings.collisionType === 'none') {
    return null;
  }

  onProgress?.(`Generating ${settings.collisionType} collision...`);

  let hulls: CollisionHullData[];

  switch (settings.collisionType) {
    case 'box':
      hulls = [generateBoxCollision(scene)];
      break;

    case 'sphere':
      hulls = [generateSphereCollision(scene)];
      break;

    case 'capsule':
      hulls = [generateCapsuleCollision(scene)];
      break;

    case 'convexHull':
      hulls = [generateConvexHull(scene)];
      break;

    case 'autoConvex':
      hulls = generateAutoConvexHulls(
        scene,
        settings.maxConvexHulls,
        settings.maxHullVertices,
      );
      break;

    default:
      return null;
  }

  return {
    hulls,
    hullCount: hulls.length,
    collisionType: settings.collisionType,
  };
}

/**
 * Create Three.js helper meshes to visualize collision data.
 * Returns a Group containing wireframe collision meshes.
 */
export function createCollisionVisualization(collisionData: CollisionDataJSON): THREE.Group {
  const group = new THREE.Group();
  group.name = 'CollisionVisualization';

  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });

  for (const hull of collisionData.hulls) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(hull.vertices, 3));
    if (hull.indices.length > 0) {
      geometry.setIndex(hull.indices);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Collision_${hull.type}`;
    group.add(mesh);
  }

  return group;
}
