// ============================================================
//  LODGenerator — Level of Detail mesh simplification
//  Generates LOD levels using Quadric Error Metric (QEM),
//  edge collapse, or vertex clustering algorithms.
//  Designed for Three.js BufferGeometry.
// ============================================================

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { LODSettings, LODDataJSON } from './MeshAsset';

// ── Export GLB helper ──

async function exportSceneToGLBBase64(scene: THREE.Object3D): Promise<string> {
  const exporter = new GLTFExporter();
  const glb: ArrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error),
      { binary: true },
    );
  });
  const bytes = new Uint8Array(glb);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Edge data structure for QEM ──

interface EdgeCandidate {
  i: number;
  j: number;
  cost: number;
  optimalPosition: THREE.Vector3;
}

// ── Quadric (4x4 symmetric matrix for error metric) ──

class Quadric {
  // Store upper triangle of 4x4 symmetric matrix
  a00 = 0; a01 = 0; a02 = 0; a03 = 0;
  a11 = 0; a12 = 0; a13 = 0;
  a22 = 0; a23 = 0;
  a33 = 0;

  static fromPlane(a: number, b: number, c: number, d: number): Quadric {
    const q = new Quadric();
    q.a00 = a * a; q.a01 = a * b; q.a02 = a * c; q.a03 = a * d;
    q.a11 = b * b; q.a12 = b * c; q.a13 = b * d;
    q.a22 = c * c; q.a23 = c * d;
    q.a33 = d * d;
    return q;
  }

  add(other: Quadric): Quadric {
    const q = new Quadric();
    q.a00 = this.a00 + other.a00;
    q.a01 = this.a01 + other.a01;
    q.a02 = this.a02 + other.a02;
    q.a03 = this.a03 + other.a03;
    q.a11 = this.a11 + other.a11;
    q.a12 = this.a12 + other.a12;
    q.a13 = this.a13 + other.a13;
    q.a22 = this.a22 + other.a22;
    q.a23 = this.a23 + other.a23;
    q.a33 = this.a33 + other.a33;
    return q;
  }

  evaluate(v: THREE.Vector3): number {
    const x = v.x, y = v.y, z = v.z;
    return (
      this.a00 * x * x + 2 * this.a01 * x * y + 2 * this.a02 * x * z + 2 * this.a03 * x +
      this.a11 * y * y + 2 * this.a12 * y * z + 2 * this.a13 * y +
      this.a22 * z * z + 2 * this.a23 * z +
      this.a33
    );
  }

  optimalVertex(v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
    // Try to solve the linear system; if singular, use midpoint
    const det =
      this.a00 * (this.a11 * this.a22 - this.a12 * this.a12) -
      this.a01 * (this.a01 * this.a22 - this.a12 * this.a02) +
      this.a02 * (this.a01 * this.a12 - this.a11 * this.a02);

    if (Math.abs(det) > 1e-10) {
      const invDet = 1 / det;
      const x = invDet * (
        -(this.a03) * (this.a11 * this.a22 - this.a12 * this.a12) +
        (this.a13) * (this.a01 * this.a22 - this.a02 * this.a12) -
        (this.a23) * (this.a01 * this.a12 - this.a02 * this.a11)
      );
      const y = invDet * (
        (this.a03) * (this.a01 * this.a22 - this.a02 * this.a12) -
        (this.a13) * (this.a00 * this.a22 - this.a02 * this.a02) +
        (this.a23) * (this.a00 * this.a12 - this.a01 * this.a02)
      );
      const z = invDet * (
        -(this.a03) * (this.a01 * this.a12 - this.a02 * this.a11) +
        (this.a13) * (this.a00 * this.a12 - this.a01 * this.a02) -
        (this.a23) * (this.a00 * this.a11 - this.a01 * this.a01)
      );
      return new THREE.Vector3(x, y, z);
    }

    // Fallback: pick best of v1, v2, or midpoint
    const mid = new THREE.Vector3().lerpVectors(v1, v2, 0.5);
    const e1 = this.evaluate(v1);
    const e2 = this.evaluate(v2);
    const em = this.evaluate(mid);
    if (e1 <= e2 && e1 <= em) return v1.clone();
    if (e2 <= e1 && e2 <= em) return v2.clone();
    return mid;
  }
}

// ── Simplify geometry using Quadric Error Metric ──

function simplifyGeometryQEM(
  geometry: THREE.BufferGeometry,
  targetRatio: number,
  preserveBoundaries: boolean,
): THREE.BufferGeometry {
  // Get vertex positions
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = posAttr.count;
  const targetVertexCount = Math.max(4, Math.floor(vertexCount * targetRatio));

  if (targetVertexCount >= vertexCount) {
    return geometry.clone();
  }

  // Extract vertices
  const vertices: THREE.Vector3[] = [];
  for (let i = 0; i < vertexCount; i++) {
    vertices.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }

  // Get indices
  let indices: number[];
  if (geometry.index) {
    indices = Array.from(geometry.index.array);
  } else {
    indices = [];
    for (let i = 0; i < vertexCount; i++) indices.push(i);
  }

  const triangleCount = Math.floor(indices.length / 3);

  // Build adjacency: which triangles use each vertex
  const vertexTriangles: Set<number>[] = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) vertexTriangles[i] = new Set();
  for (let t = 0; t < triangleCount; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    vertexTriangles[i0].add(t);
    vertexTriangles[i1].add(t);
    vertexTriangles[i2].add(t);
  }

  // Compute per-vertex Quadric from incident triangle planes
  const quadrics: Quadric[] = [];
  for (let i = 0; i < vertexCount; i++) {
    let q = new Quadric();
    for (const t of vertexTriangles[i]) {
      const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
      const v0 = vertices[i0], v1 = vertices[i1], v2 = vertices[i2];
      const e1 = new THREE.Vector3().subVectors(v1, v0);
      const e2 = new THREE.Vector3().subVectors(v2, v0);
      const normal = new THREE.Vector3().crossVectors(e1, e2).normalize();
      const d = -normal.dot(v0);
      q = q.add(Quadric.fromPlane(normal.x, normal.y, normal.z, d));
    }
    quadrics.push(q);
  }

  // Find boundary edges (for boundary preservation)
  const boundaryVertices = new Set<number>();
  if (preserveBoundaries) {
    const edgeCount = new Map<string, number>();
    for (let t = 0; t < triangleCount; t++) {
      const tri = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
      for (let e = 0; e < 3; e++) {
        const a = Math.min(tri[e], tri[(e + 1) % 3]);
        const b = Math.max(tri[e], tri[(e + 1) % 3]);
        const key = `${a}-${b}`;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      }
    }
    for (const [key, count] of edgeCount) {
      if (count === 1) {
        const [a, b] = key.split('-').map(Number);
        boundaryVertices.add(a);
        boundaryVertices.add(b);
      }
    }
  }

  // Build candidate edge list with costs
  const edgeMap = new Map<string, EdgeCandidate>();

  function computeEdgeCost(i: number, j: number): EdgeCandidate {
    const combinedQ = quadrics[i].add(quadrics[j]);
    const optimal = combinedQ.optimalVertex(vertices[i], vertices[j]);
    let cost = combinedQ.evaluate(optimal);

    // Penalize boundary edges
    if (preserveBoundaries && (boundaryVertices.has(i) || boundaryVertices.has(j))) {
      cost += 1000;
    }

    return { i, j, cost, optimalPosition: optimal };
  }

  // Collect unique edges
  for (let t = 0; t < triangleCount; t++) {
    const tri = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const a = Math.min(tri[e], tri[(e + 1) % 3]);
      const b = Math.max(tri[e], tri[(e + 1) % 3]);
      const key = `${a}-${b}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, computeEdgeCost(a, b));
      }
    }
  }

  // Track which vertices are still alive
  const alive = new Uint8Array(vertexCount).fill(1);
  // Remap: vertex -> representative vertex
  const remap = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) remap[i] = i;

  function find(x: number): number {
    while (remap[x] !== x) {
      remap[x] = remap[remap[x]]; // path compression
      x = remap[x];
    }
    return x;
  }

  let currentVertexCount = vertexCount;

  // Iteratively collapse cheapest edges
  while (currentVertexCount > targetVertexCount && edgeMap.size > 0) {
    // Find minimum cost edge (simple linear scan; a heap would be more efficient)
    let bestKey = '';
    let bestCost = Infinity;
    for (const [key, candidate] of edgeMap) {
      const ri = find(candidate.i);
      const rj = find(candidate.j);
      if (ri === rj) {
        edgeMap.delete(key);
        continue;
      }
      if (candidate.cost < bestCost) {
        bestCost = candidate.cost;
        bestKey = key;
      }
    }

    if (!bestKey) break;

    const edge = edgeMap.get(bestKey)!;
    edgeMap.delete(bestKey);

    const ri = find(edge.i);
    const rj = find(edge.j);
    if (ri === rj) continue;

    // Collapse: merge rj into ri
    vertices[ri].copy(edge.optimalPosition);
    quadrics[ri] = quadrics[ri].add(quadrics[rj]);
    remap[rj] = ri;
    alive[rj] = 0;
    currentVertexCount--;

    // Merge triangle sets
    for (const t of vertexTriangles[rj]) {
      vertexTriangles[ri].add(t);
    }
    vertexTriangles[rj].clear();
  }

  // Rebuild geometry from surviving vertices
  const newVertexMap = new Map<number, number>();
  const newPositions: number[] = [];
  let newIdx = 0;

  function getNewIndex(oldIdx: number): number {
    const representative = find(oldIdx);
    if (newVertexMap.has(representative)) return newVertexMap.get(representative)!;
    const idx = newIdx++;
    newVertexMap.set(representative, idx);
    newPositions.push(vertices[representative].x, vertices[representative].y, vertices[representative].z);
    return idx;
  }

  const newIndices: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const i0 = find(indices[t * 3]);
    const i1 = find(indices[t * 3 + 1]);
    const i2 = find(indices[t * 3 + 2]);

    // Skip degenerate triangles
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;

    newIndices.push(getNewIndex(i0), getNewIndex(i1), getNewIndex(i2));
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();

  return result;
}

// ── Simplify using vertex clustering (fastest, lowest quality) ──

function simplifyGeometryClustering(
  geometry: THREE.BufferGeometry,
  targetRatio: number,
): THREE.BufferGeometry {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = posAttr.count;

  // Compute bounding box
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox!;
  const size = new THREE.Vector3();
  bbox.getSize(size);

  // Determine grid resolution based on target ratio
  const targetVerts = Math.max(4, Math.floor(vertexCount * targetRatio));
  const gridRes = Math.max(2, Math.ceil(Math.pow(targetVerts, 1 / 3)));

  const cellSize = new THREE.Vector3(
    size.x / gridRes || 1,
    size.y / gridRes || 1,
    size.z / gridRes || 1,
  );

  // Map vertices to grid cells
  const cellMap = new Map<string, { positions: THREE.Vector3[]; count: number }>();
  const vertexToCell = new Int32Array(vertexCount);
  const cellIndices = new Map<string, number>();
  let cellCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);

    const cx = Math.floor((x - bbox.min.x) / cellSize.x);
    const cy = Math.floor((y - bbox.min.y) / cellSize.y);
    const cz = Math.floor((z - bbox.min.z) / cellSize.z);
    const key = `${cx},${cy},${cz}`;

    if (!cellMap.has(key)) {
      cellMap.set(key, { positions: [], count: 0 });
      cellIndices.set(key, cellCount++);
    }

    const cell = cellMap.get(key)!;
    cell.positions.push(new THREE.Vector3(x, y, z));
    cell.count++;
    vertexToCell[i] = cellIndices.get(key)!;
  }

  // Compute average position per cell
  const newPositions: number[] = [];
  const cellToNewIndex = new Map<number, number>();
  let newIdx = 0;

  for (const [key, cell] of cellMap) {
    const avg = new THREE.Vector3();
    for (const p of cell.positions) avg.add(p);
    avg.divideScalar(cell.count);
    newPositions.push(avg.x, avg.y, avg.z);
    cellToNewIndex.set(cellIndices.get(key)!, newIdx++);
  }

  // Rebuild indices
  const oldIndices = geometry.index ? Array.from(geometry.index.array) : [...Array(vertexCount).keys()];
  const triCount = Math.floor(oldIndices.length / 3);
  const newIndices: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = cellToNewIndex.get(vertexToCell[oldIndices[t * 3]])!;
    const i1 = cellToNewIndex.get(vertexToCell[oldIndices[t * 3 + 1]])!;
    const i2 = cellToNewIndex.get(vertexToCell[oldIndices[t * 3 + 2]])!;

    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    newIndices.push(i0, i1, i2);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  result.setIndex(newIndices);
  result.computeVertexNormals();

  return result;
}

// ── Main LOD Generation ──

/**
 * Generate LOD levels for a Three.js scene.
 * Returns an array of LODDataJSON with GLB data for each level.
 */
export async function generateLODs(
  scene: THREE.Object3D,
  settings: LODSettings,
  onProgress?: (msg: string) => void,
): Promise<LODDataJSON[]> {
  const lods: LODDataJSON[] = [];

  if (!settings.generateLODs || settings.lodCount < 1) return lods;

  // Collect all meshes from the scene
  const meshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      meshes.push(child as THREE.Mesh);
    }
  });

  if (meshes.length === 0) return lods;

  let totalVertexCount = 0;
  let maxMeshVertexCount = 0;
  for (const mesh of meshes) {
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const count = posAttr ? posAttr.count : 0;
    totalVertexCount += count;
    if (count > maxMeshVertexCount) maxMeshVertexCount = count;
  }

  const forceFastAlgorithm =
    settings.algorithm !== 'vertexClustering' &&
    (maxMeshVertexCount > 60000 || totalVertexCount > 180000);

  if (forceFastAlgorithm) {
    onProgress?.('Large mesh detected, using fast LOD generation...');
  }

  const algorithmToUse = forceFastAlgorithm ? 'vertexClustering' : settings.algorithm;

  for (let lodIdx = 0; lodIdx < settings.lodCount; lodIdx++) {
    const level = settings.levels[lodIdx];
    if (!level) continue;

    onProgress?.(`Generating LOD ${level.level}...`);

    // Compute cumulative reduction
    let cumulativeReduction = 1;
    for (let i = 0; i <= lodIdx; i++) {
      cumulativeReduction *= settings.levels[i].reductionPercent;
    }

    // Create a simplified copy of the scene
    const lodScene = new THREE.Group();
    let totalVertCount = 0;
    let totalTriCount = 0;

    for (const mesh of meshes) {
      let simplified: THREE.BufferGeometry;

      switch (algorithmToUse) {
        case 'vertexClustering':
          simplified = simplifyGeometryClustering(mesh.geometry, cumulativeReduction);
          break;
        case 'edgeCollapse':
        case 'quadricError':
        default:
          simplified = simplifyGeometryQEM(
            mesh.geometry,
            cumulativeReduction,
            settings.preserveBoundaries,
          );
          break;
      }

      const lodMesh = new THREE.Mesh(simplified, mesh.material);
      lodMesh.name = mesh.name + `_LOD${level.level}`;
      lodScene.add(lodMesh);

      totalVertCount += simplified.getAttribute('position').count;
      totalTriCount += simplified.index ? simplified.index.count / 3 : simplified.getAttribute('position').count / 3;
    }

    // Export LOD scene to GLB
    const glbBase64 = await exportSceneToGLBBase64(lodScene);

    lods.push({
      level: level.level,
      vertexCount: totalVertCount,
      triangleCount: Math.floor(totalTriCount),
      reductionPercent: cumulativeReduction * 100,
      screenSize: level.screenSize,
      glbDataBase64: glbBase64,
    });

    // Dispose simplified geometries
    lodScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).geometry.dispose();
      }
    });
  }

  return lods;
}

/**
 * Create a Three.js LOD object from LOD data for runtime use.
 */
export function createThreeLOD(
  baseMesh: THREE.Object3D,
  lodDatas: LODDataJSON[],
  loadedLodScenes: THREE.Object3D[],
): THREE.LOD {
  const lod = new THREE.LOD();

  // Add base mesh as LOD 0
  lod.addLevel(baseMesh, 0);

  // Add generated LODs
  for (let i = 0; i < lodDatas.length && i < loadedLodScenes.length; i++) {
    const distance = lodDatas[i].screenSize * 100; // Convert screen size to approximate distance
    lod.addLevel(loadedLodScenes[i], distance);
  }

  return lod;
}
