// ============================================================
//  ImportDialog — UE-style mesh import settings dialog
//  Full tabbed interface with 8 tabs:
//    General | Mesh | Skeleton | Animation |
//    Materials | LODs | Collision | Advanced
//  Matches Unreal Engine's import pipeline workflow.
// ============================================================

import {
  type MeshImportSettings,
  type FileDetectionResult,
  type ImportPreset,
  type NormalsMode,
  type LODAlgorithm,
  type LODStrategy,
  type CollisionType,
  type CollisionComplexity,
  type MaterialWorkflow,
  type MaterialType,
  type TextureResolution,
  type TextureFilter,
  type TextureWrap,
  type TargetPlatform,
  type OptimizationLevel,
  type AnimSampleRate,
  type AnimCompression,
  defaultImportSettings,
  getImportFormat,
  applyPreset,
  suggestPreset,
  suggestPrefix,
  type ImportMeshFormat,
} from './MeshAsset';

export interface ImportDialogResult {
  settings: MeshImportSettings;
  cancelled: boolean;
}

/**
 * Show an enhanced UE-style import settings dialog with 8 tabs.
 * Returns a Promise that resolves when the user clicks Import or Cancel.
 */
export function showImportDialog(
  file: File,
  detectedInfo?: FileDetectionResult,
): Promise<ImportDialogResult> {
  return new Promise((resolve) => {
    const settings = defaultImportSettings(file.name);
    const format = getImportFormat(file.name);
    const supportsAnimation = ['gltf', 'glb', 'fbx', 'dae'].includes(format);
    const supportsMaterials = ['gltf', 'glb', 'fbx', 'obj', 'dae'].includes(format);

    // Apply detected info to settings
    if (detectedInfo) {
      settings.suggestedPreset = detectedInfo.suggestedPreset;
      settings.prefix = suggestPrefix(settings.importAs, detectedInfo.hasSkeletalData);
      if (detectedInfo.suggestedPreset !== 'custom') {
        applyPreset(settings, detectedInfo.suggestedPreset);
      }
      // Set LOD recommendation
      if (detectedInfo.recommendations.generateLODs) {
        settings.lod.generateLODs = true;
      }
      // Set collision recommendation
      if (detectedInfo.hasSkeletalData) {
        settings.collision.generateCollision = true;
        settings.collision.collisionType = 'capsule';
      }
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'import-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'import-dialog import-dialog-tabbed';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'import-dialog-header';

    const titleLine = document.createElement('div');
    titleLine.className = 'import-dialog-title-line';
    titleLine.innerHTML = `
      <span class="import-dialog-title">📦 Import: ${file.name}</span>
      <span class="import-dialog-subtitle">${formatLabel(format)} · ${formatSize(file.size)}</span>
    `;
    header.appendChild(titleLine);

    // Detection info bar
    if (detectedInfo) {
      const infoBar = document.createElement('div');
      infoBar.className = 'import-detection-bar';
      infoBar.innerHTML = `
        <div class="import-detection-stats">
          <span title="Meshes">🔷 ${detectedInfo.complexity.meshCount} mesh${detectedInfo.complexity.meshCount !== 1 ? 'es' : ''}</span>
          <span title="Vertices">📐 ${formatNumber(detectedInfo.complexity.vertexCount)} verts</span>
          <span title="Triangles">🔺 ${formatNumber(detectedInfo.complexity.triangleCount)} tris</span>
          ${detectedInfo.complexity.boneCount ? `<span title="Bones">🦴 ${detectedInfo.complexity.boneCount} bones</span>` : ''}
          ${detectedInfo.complexity.animationCount ? `<span title="Animations">🎬 ${detectedInfo.complexity.animationCount} anims</span>` : ''}
          ${detectedInfo.complexity.materialCount ? `<span title="Materials">🎨 ${detectedInfo.complexity.materialCount} mats</span>` : ''}
        </div>
        <div class="import-detection-preset">
          Suggested: <strong>${detectedInfo.suggestedPreset}</strong>
        </div>
      `;
      header.appendChild(infoBar);

      // Warnings
      if (detectedInfo.warnings.length > 0) {
        const warnDiv = document.createElement('div');
        warnDiv.className = 'import-warnings';
        for (const w of detectedInfo.warnings) {
          const wLine = document.createElement('div');
          wLine.className = 'import-warning-line';
          wLine.textContent = `⚠️ ${w}`;
          warnDiv.appendChild(wLine);
        }
        header.appendChild(warnDiv);
      }
    }

    dialog.appendChild(header);

    // ── Tab Bar ──
    const tabNames = ['General', 'Mesh', 'Skeleton', 'Animation', 'Materials', 'LODs', 'Collision', 'Advanced'];
    const tabBar = document.createElement('div');
    tabBar.className = 'import-tab-bar';

    const tabPanels: HTMLElement[] = [];
    let activeTabIndex = 0;

    for (let i = 0; i < tabNames.length; i++) {
      const tab = document.createElement('button');
      tab.className = 'import-tab-btn' + (i === 0 ? ' active' : '');
      tab.textContent = tabNames[i];
      tab.addEventListener('click', () => {
        // Deactivate all, activate clicked
        tabBar.querySelectorAll('.import-tab-btn').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        tabPanels.forEach((p, j) => p.style.display = j === i ? 'block' : 'none');
        activeTabIndex = i;
      });
      tabBar.appendChild(tab);
    }
    dialog.appendChild(tabBar);

    // ── Body (scrollable) ──
    const body = document.createElement('div');
    body.className = 'import-dialog-body';

    // ── TAB 0: General ──
    const generalPanel = createTabPanel();
    generalPanel.appendChild(createSection('Import Type', [
      createSelectRow('Import As', settings.importAs, ['auto', 'staticMesh', 'skeletalMesh'],
        ['Auto-detect (recommended)', 'Static Mesh', 'Skeletal Mesh'],
        (v) => { settings.importAs = v as any; }),
    ]));
    generalPanel.appendChild(createSection('Preset', [
      createSelectRow('Import Preset', settings.suggestedPreset,
        ['custom', 'character', 'prop', 'environment', 'simple'],
        ['Custom', 'Character', 'Prop', 'Environment', 'Simple Object'],
        (v) => { applyPreset(settings, v as ImportPreset); }),
    ]));
    generalPanel.appendChild(createSection('Asset Naming', [
      createTextRow('Asset Name', settings.assetName, (v) => { settings.assetName = v; }),
      createTextRow('Prefix', settings.prefix, (v) => { settings.prefix = v; }),
      createTextRow('Suffix', settings.suffix, (v) => { settings.suffix = v; }),
      createCheckRow('Auto-generate sub-asset names', settings.autoGenerateSubNames, (v) => { settings.autoGenerateSubNames = v; }),
    ]));
    generalPanel.appendChild(createSection('Scale & Units', [
      createNumberRow('Import Scale', settings.scale, 0.001, 1000, 0.1, (v) => { settings.scale = v; }),
      createSelectRow('Unit', settings.unit, ['meters', 'centimeters', 'millimeters'],
        ['Meters', 'Centimeters', 'Millimeters'],
        (v) => { settings.unit = v as any; }),
      createInfoRow('Quick presets: 1.0 = Meters, 0.01 = cm→m, 0.001 = mm→m'),
    ]));
    generalPanel.appendChild(createSection('Coordinate System', [
      createCheckRow('Convert to Y-Up (from Z-Up)', settings.convertToYUp, (v) => { settings.convertToYUp = v; }),
      createSelectRow('Forward Axis', settings.forwardAxis, ['X', 'Y', 'Z'], ['X', 'Y', 'Z'], (v) => { settings.forwardAxis = v as any; }),
      createSelectRow('Up Axis', settings.upAxis, ['X', 'Y', 'Z'], ['X', 'Y', 'Z'], (v) => { settings.upAxis = v as any; }),
    ]));
    generalPanel.appendChild(createSection('Post-Import', [
      createCheckRow('Open in editor after import', settings.openAfterImport, (v) => { settings.openAfterImport = v; }),
      createCheckRow('Generate thumbnails', settings.generateThumbnails, (v) => { settings.generateThumbnails = v; }),
    ]));
    tabPanels.push(generalPanel);
    body.appendChild(generalPanel);

    // ── TAB 1: Mesh ──
    const meshPanel = createTabPanel(false);
    meshPanel.appendChild(createSection('Geometry', [
      createCheckRow('Import Mesh Geometry', settings.importMesh, (v) => { settings.importMesh = v; }),
      createCheckRow('Combine Meshes', settings.combineMeshes, (v) => { settings.combineMeshes = v; }),
      createCheckRow('Split by Materials', settings.splitByMaterials, (v) => { settings.splitByMaterials = v; }),
      createCheckRow('Weld Vertices', settings.weldVertices, (v) => { settings.weldVertices = v; }),
      createNumberRow('Weld Threshold', settings.weldThreshold, 0, 1, 0.0001, (v) => { settings.weldThreshold = v; }),
      createCheckRow('Remove Degenerate Triangles', settings.removeDegenerateTriangles, (v) => { settings.removeDegenerateTriangles = v; }),
      createCheckRow('Optimize Vertex Order', settings.optimizeVertexOrder, (v) => { settings.optimizeVertexOrder = v; }),
    ]));
    meshPanel.appendChild(createSection('Normals & Tangents', [
      createSelectRow('Normals', settings.normalsMode,
        ['useExisting', 'recomputeFlat', 'recomputeSmooth', 'weightedByArea'],
        ['Use Existing', 'Recompute (Flat)', 'Recompute (Smooth)', 'Weighted by Area'],
        (v) => { settings.normalsMode = v as NormalsMode; }),
      createCheckRow('Import Tangents', settings.importTangents, (v) => { settings.importTangents = v; }),
      createCheckRow('Recompute Tangents (for normal maps)', settings.recomputeTangents, (v) => { settings.recomputeTangents = v; }),
    ]));
    meshPanel.appendChild(createSection('UVs', [
      createCheckRow('Import UVs', settings.importUVs, (v) => { settings.importUVs = v; }),
      createCheckRow('Generate Lightmap UVs (UV channel 2)', settings.generateLightmapUVs, (v) => { settings.generateLightmapUVs = v; }),
      createNumberRow('Lightmap Resolution', settings.lightmapResolution, 64, 2048, 64, (v) => { settings.lightmapResolution = v; }),
    ]));
    meshPanel.appendChild(createSection('Vertex Colors', [
      createCheckRow('Import Vertex Colors', settings.importVertexColors, (v) => { settings.importVertexColors = v; }),
    ]));
    meshPanel.appendChild(createSection('Optimization & Compression', [
      createSelectRow('Target Platform', settings.targetPlatform,
        ['web', 'desktop', 'mobile'],
        ['Web (optimize for size)', 'Desktop (balance)', 'Mobile (aggressive)'],
        (v) => { settings.targetPlatform = v as TargetPlatform; }),
      createCheckRow('Use Draco Compression (geometry)', settings.useDracoCompression, (v) => { settings.useDracoCompression = v; }),
      createNumberRow('Compression Level (0=fast, 10=smallest)', settings.dracoCompressionLevel, 0, 10, 1, (v) => { settings.dracoCompressionLevel = v; }),
    ]));
    tabPanels.push(meshPanel);
    body.appendChild(meshPanel);

    // ── TAB 2: Skeleton ──
    const skelPanel = createTabPanel(false);
    if (supportsAnimation) {
      skelPanel.appendChild(createSection('Skeleton', [
        createCheckRow('Import Skeleton', settings.importSkeleton, (v) => { settings.importSkeleton = v; }),
        createCheckRow('Create New Skeleton', settings.createNewSkeleton, (v) => { settings.createNewSkeleton = v; }),
      ]));
      skelPanel.appendChild(createSection('Skinning', [
        createSelectRow('Max Bone Influences', String(settings.maxBoneInfluences),
          ['4', '8'], ['4 (mobile compatible)', '8 (desktop)'],
          (v) => { settings.maxBoneInfluences = parseInt(v); }),
        createNumberRow('Bone Weight Threshold', settings.boneWeightThreshold, 0, 1, 0.01, (v) => { settings.boneWeightThreshold = v; }),
        createCheckRow('Normalize Bone Weights', settings.normalizeBoneWeights, (v) => { settings.normalizeBoneWeights = v; }),
      ]));
      skelPanel.appendChild(createSection('Bone Settings', [
        createCheckRow('Remove End Bones (leaf bones)', settings.removeEndBones, (v) => { settings.removeEndBones = v; }),
        createCheckRow('Convert Bone Names (spaces to underscores)', settings.convertBoneNames, (v) => { settings.convertBoneNames = v; }),
      ]));
      skelPanel.appendChild(createSection('Sockets', [
        createCheckRow('Auto-detect Common Sockets', settings.sockets.autoDetectSockets, (v) => { settings.sockets.autoDetectSockets = v; }),
        createCheckRow('Create from Bone Names', settings.sockets.createFromBoneNames, (v) => { settings.sockets.createFromBoneNames = v; }),
        createInfoRow('Detects: hand_r, hand_l, head, spine, foot_r, foot_l'),
      ]));
    } else {
      skelPanel.appendChild(createInfoRow('This format does not support skeleton/animation data.'));
    }
    tabPanels.push(skelPanel);
    body.appendChild(skelPanel);

    // ── TAB 3: Animation ──
    const animPanel = createTabPanel(false);
    if (supportsAnimation) {
      animPanel.appendChild(createSection('Import Animations', [
        createCheckRow('Import Animations', settings.animation.importAnimations, (v) => { settings.animation.importAnimations = v; }),
        createSelectRow('Import Mode', settings.animation.importMode,
          ['all', 'selected', 'separateFiles'],
          ['Import All (recommended)', 'Select Specific', 'Import as Separate Files'],
          (v) => { settings.animation.importMode = v as any; }),
      ]));

      // Show detected animations if available
      if (detectedInfo && detectedInfo.detectedAnimations.length > 0) {
        const animRows: HTMLElement[] = [];
        for (const anim of detectedInfo.detectedAnimations) {
          const isLoop = anim.name.toLowerCase().includes('idle') || anim.name.toLowerCase().includes('walk') || anim.name.toLowerCase().includes('run');
          settings.animation.animationOverrides[anim.name] = { import: true, loop: isLoop };
          animRows.push(createCheckRow(
            `${anim.name} (${anim.duration.toFixed(1)}s, ${anim.frameCount} frames${isLoop ? ', loop' : ''})`,
            true,
            (v) => { settings.animation.animationOverrides[anim.name].import = v; }
          ));
        }
        animPanel.appendChild(createSection(`Detected Animations (${detectedInfo.detectedAnimations.length})`, animRows));
      }

      animPanel.appendChild(createSection('Processing', [
        createSelectRow('Sample Rate', String(settings.animation.sampleRate),
          ['24', '30', '60', 'original'],
          ['24 FPS (film)', '30 FPS (standard)', '60 FPS (smooth)', 'Keep Original'],
          (v) => { settings.animation.sampleRate = (v === 'original' ? 'original' : parseInt(v)) as AnimSampleRate; }),
        createCheckRow('Resample Animation', settings.animation.resample, (v) => { settings.animation.resample = v; }),
        createCheckRow('Remove Redundant Keys', settings.animation.removeRedundantKeys, (v) => { settings.animation.removeRedundantKeys = v; }),
        createNumberRow('Redundancy Tolerance', settings.animation.redundantKeyTolerance, 0, 1, 0.001, (v) => { settings.animation.redundantKeyTolerance = v; }),
        createCheckRow('Split Animations by Name', settings.animation.splitByName, (v) => { settings.animation.splitByName = v; }),
      ]));
      animPanel.appendChild(createSection('Root Motion', [
        createCheckRow('Enable Root Motion', settings.animation.enableRootMotion, (v) => { settings.animation.enableRootMotion = v; }),
        createCheckRow('Lock Root Rotation', settings.animation.lockRootRotation, (v) => { settings.animation.lockRootRotation = v; }),
        createCheckRow('Lock Root Height (Z)', settings.animation.lockRootHeight, (v) => { settings.animation.lockRootHeight = v; }),
      ]));
      animPanel.appendChild(createSection('Compression', [
        createSelectRow('Compression', settings.animation.compression,
          ['none', 'low', 'medium', 'high'],
          ['None', 'Low', 'Medium', 'High'],
          (v) => { settings.animation.compression = v as AnimCompression; }),
        createNumberRow('Max Animation Error', settings.animation.maxError, 0, 1, 0.001, (v) => { settings.animation.maxError = v; }),
      ]));
    } else {
      animPanel.appendChild(createInfoRow('This format does not support animation data.'));
    }
    tabPanels.push(animPanel);
    body.appendChild(animPanel);

    // ── TAB 4: Materials ──
    const matPanel = createTabPanel(false);
    if (supportsMaterials) {
      matPanel.appendChild(createSection('Material Import', [
        createCheckRow('Import Materials', settings.importMaterials, (v) => { settings.importMaterials = v; }),
        createCheckRow('Import Textures', settings.importTextures, (v) => { settings.importTextures = v; }),
        createCheckRow('Create Material Instances', settings.createMaterialInstances, (v) => { settings.createMaterialInstances = v; }),
      ]));
      matPanel.appendChild(createSection('Material Workflow', [
        createSelectRow('Workflow', settings.materialWorkflow,
          ['pbrMetallicRoughness', 'pbrSpecularGlossiness', 'legacy'],
          ['PBR Metallic-Roughness (GLTF standard)', 'PBR Specular-Glossiness', 'Legacy (Phong/Blinn)'],
          (v) => { settings.materialWorkflow = v as MaterialWorkflow; }),
        createSelectRow('Material Type', settings.materialType,
          ['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial'],
          ['MeshStandardMaterial (PBR)', 'MeshPhysicalMaterial (advanced)', 'MeshBasicMaterial (unlit)', 'MeshLambertMaterial (simple)'],
          (v) => { settings.materialType = v as MaterialType; }),
      ]));
      matPanel.appendChild(createSection('Texture Settings', [
        createSelectRow('Texture Resolution', settings.textureResolution,
          ['original', '4096', '2048', '1024', '512', '256'],
          ['Keep Original', '4096x4096 (ultra)', '2048x2048 (high)', '1024x1024 (medium)', '512x512 (low)', '256x256 (mobile)'],
          (v) => { settings.textureResolution = v as TextureResolution; }),
        createCheckRow('Generate Mipmaps', settings.generateMipmaps, (v) => { settings.generateMipmaps = v; }),
        createCheckRow('Compress Textures (KTX2)', settings.compressTextures, (v) => { settings.compressTextures = v; }),
        createCheckRow('Convert to Power-of-Two', settings.convertPowerOfTwo, (v) => { settings.convertPowerOfTwo = v; }),
      ]));
      matPanel.appendChild(createSection('Texture Filtering', [
        createSelectRow('Min Filter', settings.textureMinFilter,
          ['Nearest', 'Linear', 'LinearMipmapLinear', 'LinearMipmapNearest'],
          ['Nearest', 'Linear', 'Linear Mipmap Linear', 'Linear Mipmap Nearest'],
          (v) => { settings.textureMinFilter = v as TextureFilter; }),
        createSelectRow('Mag Filter', settings.textureMagFilter,
          ['Nearest', 'Linear'],
          ['Nearest', 'Linear'],
          (v) => { settings.textureMagFilter = v as TextureFilter; }),
        createSelectRow('Wrap S', settings.textureWrapS,
          ['Repeat', 'ClampToEdge', 'MirroredRepeat'],
          ['Repeat', 'Clamp to Edge', 'Mirrored Repeat'],
          (v) => { settings.textureWrapS = v as TextureWrap; }),
        createSelectRow('Wrap T', settings.textureWrapT,
          ['Repeat', 'ClampToEdge', 'MirroredRepeat'],
          ['Repeat', 'Clamp to Edge', 'Mirrored Repeat'],
          (v) => { settings.textureWrapT = v as TextureWrap; }),
      ]));

      // Show detected material slots
      if (detectedInfo && detectedInfo.complexity.materialCount > 0) {
        matPanel.appendChild(createSection(`Detected Materials (${detectedInfo.complexity.materialCount})`, [
          createInfoRow(`${detectedInfo.complexity.materialCount} material slot(s) detected. ${detectedInfo.complexity.textureCount} texture(s) found.`),
        ]));
      }
    } else {
      matPanel.appendChild(createInfoRow('This format has limited material support.'));
    }
    tabPanels.push(matPanel);
    body.appendChild(matPanel);

    // ── TAB 5: LODs ──
    const lodPanel = createTabPanel(false);
    lodPanel.appendChild(createSection('LOD Generation', [
      createCheckRow('Generate LODs Automatically', settings.lod.generateLODs, (v) => { settings.lod.generateLODs = v; }),
      createNumberRow('Number of LODs', settings.lod.lodCount, 1, 4, 1, (v) => {
        settings.lod.lodCount = v;
        // Rebuild levels
        while (settings.lod.levels.length < v) {
          const prevLevel = settings.lod.levels.length;
          settings.lod.levels.push({
            level: prevLevel + 1,
            reductionPercent: 0.5,
            screenSize: 1.0 / Math.pow(2, prevLevel + 1),
            maxDeviation: Math.pow(2, prevLevel),
          });
        }
        settings.lod.levels.length = v;
      }),
      createSelectRow('LOD Strategy', settings.lod.strategy,
        ['screenSize', 'distance', 'manual'],
        ['Screen Size (default)', 'Distance', 'Manual'],
        (v) => { settings.lod.strategy = v as LODStrategy; }),
    ]));
    lodPanel.appendChild(createSection('Algorithm', [
      createSelectRow('Simplification', settings.lod.algorithm,
        ['quadricError', 'edgeCollapse', 'vertexClustering'],
        ['Quadric Error Metric (best quality)', 'Edge Collapse (faster)', 'Vertex Clustering (fastest)'],
        (v) => { settings.lod.algorithm = v as LODAlgorithm; }),
      createCheckRow('Preserve Mesh Boundaries', settings.lod.preserveBoundaries, (v) => { settings.lod.preserveBoundaries = v; }),
      createCheckRow('Preserve UVs', settings.lod.preserveUVs, (v) => { settings.lod.preserveUVs = v; }),
      createCheckRow('Preserve Normals', settings.lod.preserveNormals, (v) => { settings.lod.preserveNormals = v; }),
    ]));
    // LOD level details
    for (let li = 0; li < settings.lod.levels.length; li++) {
      const level = settings.lod.levels[li];
      lodPanel.appendChild(createSection(`LOD ${level.level}`, [
        createNumberRow('Reduction %', level.reductionPercent * 100, 10, 90, 5, (v) => { level.reductionPercent = v / 100; }),
        createNumberRow('Screen Size', level.screenSize, 0.01, 1, 0.05, (v) => { level.screenSize = v; }),
        createNumberRow('Max Deviation', level.maxDeviation, 0.1, 100, 0.5, (v) => { level.maxDeviation = v; }),
      ]));
    }

    // Show estimated LOD vertex counts
    if (detectedInfo) {
      const lodEstimates: string[] = [`LOD 0: ${formatNumber(detectedInfo.complexity.vertexCount)} verts (100%)`];
      let prevCount = detectedInfo.complexity.vertexCount;
      for (let li = 0; li < settings.lod.lodCount; li++) {
        const reduction = settings.lod.levels[li]?.reductionPercent || 0.5;
        prevCount = Math.floor(prevCount * reduction);
        lodEstimates.push(`LOD ${li + 1}: ~${formatNumber(prevCount)} verts (${Math.round(100 * prevCount / detectedInfo.complexity.vertexCount)}%)`);
      }
      lodPanel.appendChild(createSection('Estimated LOD Sizes', [
        createInfoRow(lodEstimates.join('\n')),
      ]));
    }
    tabPanels.push(lodPanel);
    body.appendChild(lodPanel);

    // ── TAB 6: Collision ──
    const collPanel = createTabPanel(false);
    collPanel.appendChild(createSection('Collision Generation', [
      createCheckRow('Generate Collision', settings.collision.generateCollision, (v) => { settings.collision.generateCollision = v; }),
      createSelectRow('Complexity', settings.collision.complexity,
        ['simple', 'complex', 'useMesh'],
        ['Simple (auto-generated, recommended)', 'Complex (per-polygon)', 'Use Mesh as Collision'],
        (v) => { settings.collision.complexity = v as CollisionComplexity; }),
    ]));
    collPanel.appendChild(createSection('Simple Collision', [
      createSelectRow('Collision Type', settings.collision.collisionType,
        ['box', 'sphere', 'capsule', 'convexHull', 'autoConvex', 'none'],
        ['Box (fastest)', 'Sphere', 'Capsule', 'Convex Hull', 'Auto-Convex (multiple hulls, best)', 'None'],
        (v) => { settings.collision.collisionType = v as CollisionType; }),
    ]));
    collPanel.appendChild(createSection('Auto-Convex Settings', [
      createNumberRow('Max Convex Hulls', settings.collision.maxConvexHulls, 1, 32, 1, (v) => { settings.collision.maxConvexHulls = v; }),
      createNumberRow('Max Hull Vertices', settings.collision.maxHullVertices, 8, 256, 8, (v) => { settings.collision.maxHullVertices = v; }),
      createNumberRow('Concavity', settings.collision.concavity, 0, 1, 0.001, (v) => { settings.collision.concavity = v; }),
      createNumberRow('Resolution', settings.collision.resolution, 10000, 1000000, 10000, (v) => { settings.collision.resolution = v; }),
    ]));
    collPanel.appendChild(createSection('Physics', [
      createCheckRow('Simulate Physics', settings.collision.simulatePhysics, (v) => { settings.collision.simulatePhysics = v; }),
    ]));
    tabPanels.push(collPanel);
    body.appendChild(collPanel);

    // ── TAB 7: Advanced ──
    const advPanel = createTabPanel(false);
    advPanel.appendChild(createSection('Transform', [
      createVec3Row('Position Offset', settings.positionOffset, (v) => { settings.positionOffset = v; }),
      createVec3Row('Rotation Offset', settings.rotationOffset, (v) => { settings.rotationOffset = v; }),
    ]));
    advPanel.appendChild(createSection('Miscellaneous', [
      createCheckRow('Preserve Hierarchy', settings.preserveHierarchy, (v) => { settings.preserveHierarchy = v; }),
      createCheckRow('Import Metadata', settings.importMetadata, (v) => { settings.importMetadata = v; }),
      createCheckRow('Import Morph Targets (blend shapes)', settings.importMorphTargets, (v) => { settings.importMorphTargets = v; }),
    ]));
    advPanel.appendChild(createSection('Validation', [
      createCheckRow('Check for Errors', settings.validation.checkErrors, (v) => { settings.validation.checkErrors = v; }),
      createCheckRow('Warn on Large File Size', settings.validation.warnLargeFileSize, (v) => { settings.validation.warnLargeFileSize = v; }),
      createNumberRow('File Size Threshold (MB)', settings.validation.fileSizeThreshold / (1024 * 1024), 1, 500, 10, (v) => { settings.validation.fileSizeThreshold = v * 1024 * 1024; }),
      createCheckRow('Warn on High Poly Count', settings.validation.warnHighPolyCount, (v) => { settings.validation.warnHighPolyCount = v; }),
      createNumberRow('Poly Count Threshold', settings.validation.polyCountThreshold, 1000, 10000000, 10000, (v) => { settings.validation.polyCountThreshold = v; }),
      createCheckRow('Validate Skeleton Hierarchy', settings.validation.validateSkeletonHierarchy, (v) => { settings.validation.validateSkeletonHierarchy = v; }),
    ]));
    advPanel.appendChild(createSection('Performance', [
      createSelectRow('Target Platform', settings.targetPlatform,
        ['web', 'desktop', 'mobile'],
        ['Web (download size)', 'Desktop (quality/size)', 'Mobile (aggressive)'],
        (v) => { settings.targetPlatform = v as TargetPlatform; }),
      createSelectRow('Optimization Level', settings.optimizationLevel,
        ['none', 'low', 'medium', 'high'],
        ['None (keep original)', 'Low (basic)', 'Medium (balanced)', 'High (aggressive)'],
        (v) => { settings.optimizationLevel = v as OptimizationLevel; }),
    ]));
    advPanel.appendChild(createSection('Debugging', [
      createCheckRow('Verbose Logging', settings.verboseLogging, (v) => { settings.verboseLogging = v; }),
      createCheckRow('Generate Import Report', settings.generateImportReport, (v) => { settings.generateImportReport = v; }),
    ]));
    tabPanels.push(advPanel);
    body.appendChild(advPanel);

    dialog.appendChild(body);

    // ── Estimated Import Summary ──
    if (detectedInfo) {
      const summary = document.createElement('div');
      summary.className = 'import-summary-bar';
      const estAssets = 1 + (detectedInfo.complexity.materialCount || 0) + (detectedInfo.complexity.textureCount || 0)
        + (detectedInfo.complexity.animationCount || 0) + (detectedInfo.hasSkeletalData ? 1 : 0);
      summary.innerHTML = `
        <span>Assets to create: <strong>${estAssets}</strong></span>
        <span>Total size: <strong>~${formatSize(file.size * 1.5)}</strong></span>
      `;
      dialog.appendChild(summary);
    }

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'import-dialog-footer';

    const presetBtnGroup = document.createElement('div');
    presetBtnGroup.className = 'import-dialog-btn-group';

    const savePresetBtn = document.createElement('button');
    savePresetBtn.className = 'import-dialog-btn import-dialog-btn-secondary';
    savePresetBtn.textContent = '💾 Save Preset';
    savePresetBtn.addEventListener('click', () => {
      const presetName = prompt('Preset name:', settings.suggestedPreset);
      if (presetName) {
        try {
          localStorage.setItem(`import-preset-${presetName}`, JSON.stringify(settings));
        } catch { /* localStorage might be full */ }
      }
    });

    const loadPresetBtn = document.createElement('button');
    loadPresetBtn.className = 'import-dialog-btn import-dialog-btn-secondary';
    loadPresetBtn.textContent = '📂 Load Preset';
    loadPresetBtn.addEventListener('click', () => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('import-preset-'));
      if (keys.length === 0) { alert('No saved presets found.'); return; }
      const names = keys.map(k => k.replace('import-preset-', ''));
      const selected = prompt(`Available presets:\n${names.join('\n')}\n\nEnter name:`);
      if (selected) {
        const data = localStorage.getItem(`import-preset-${selected}`);
        if (data) {
          try {
            Object.assign(settings, JSON.parse(data));
            overlay.remove();
            document.removeEventListener('keydown', keyHandler);
            // Re-open dialog with loaded settings
            showImportDialog(file, detectedInfo).then(resolve);
          } catch { alert('Failed to load preset.'); }
        }
      }
    });

    presetBtnGroup.appendChild(savePresetBtn);
    presetBtnGroup.appendChild(loadPresetBtn);

    const actionBtnGroup = document.createElement('div');
    actionBtnGroup.className = 'import-dialog-btn-group';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'import-dialog-btn import-dialog-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve({ settings, cancelled: true });
    });

    const importBtn = document.createElement('button');
    importBtn.className = 'import-dialog-btn import-dialog-btn-import';
    importBtn.textContent = '📦 Import';
    importBtn.addEventListener('click', () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler);
      resolve({ settings, cancelled: false });
    });

    actionBtnGroup.appendChild(cancelBtn);
    actionBtnGroup.appendChild(importBtn);

    footer.appendChild(presetBtnGroup);
    footer.appendChild(actionBtnGroup);
    dialog.appendChild(footer);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus Import button
    importBtn.focus();

    // ESC to cancel, Enter to import
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', keyHandler);
        resolve({ settings, cancelled: true });
      } else if (e.key === 'Enter' && !(document.activeElement instanceof HTMLInputElement)) {
        overlay.remove();
        document.removeEventListener('keydown', keyHandler);
        resolve({ settings, cancelled: false });
      }
    };
    document.addEventListener('keydown', keyHandler);
  });
}

/**
 * Show a progress overlay for import operations.
 * Enhanced with step tracking and detailed progress.
 */
export function showImportProgress(): {
  update: (msg: string, pct?: number) => void;
  setStep: (step: number, totalSteps: number, msg: string) => void;
  addWarning: (msg: string) => void;
  close: () => void;
} {
  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'import-progress-dialog';

  dialog.innerHTML = `
    <div class="import-progress-title">📦 Importing Asset...</div>
    <div class="import-progress-step" id="__imp_step"></div>
    <div class="import-progress-bar-bg">
      <div class="import-progress-bar" id="__imp_bar"></div>
    </div>
    <div class="import-progress-msg" id="__imp_msg">Initializing...</div>
    <div class="import-progress-warnings" id="__imp_warns"></div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const bar = dialog.querySelector('#__imp_bar') as HTMLElement;
  const msg = dialog.querySelector('#__imp_msg') as HTMLElement;
  const step = dialog.querySelector('#__imp_step') as HTMLElement;
  const warns = dialog.querySelector('#__imp_warns') as HTMLElement;

  return {
    update(message: string, pct?: number) {
      msg.textContent = message;
      if (pct !== undefined) {
        bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
      }
    },
    setStep(stepNum: number, totalSteps: number, message: string) {
      step.textContent = `[${stepNum}/${totalSteps}]`;
      msg.textContent = message;
      bar.style.width = Math.round((stepNum / totalSteps) * 100) + '%';
    },
    addWarning(warning: string) {
      const w = document.createElement('div');
      w.className = 'import-progress-warning-line';
      w.textContent = `⚠️ ${warning}`;
      warns.appendChild(w);
    },
    close() {
      overlay.remove();
    },
  };
}

// ── Helper builders (enhanced) ──

function createTabPanel(visible = true): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'import-tab-panel';
  panel.style.display = visible ? 'block' : 'none';
  return panel;
}

function createSection(title: string, rows: HTMLElement[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'import-section';

  const header = document.createElement('div');
  header.className = 'import-section-header';
  header.textContent = title;
  let collapsed = false;
  const contentDiv = document.createElement('div');
  contentDiv.className = 'import-section-content';
  for (const r of rows) contentDiv.appendChild(r);

  header.addEventListener('click', () => {
    collapsed = !collapsed;
    contentDiv.style.display = collapsed ? 'none' : 'block';
    header.classList.toggle('collapsed', collapsed);
  });

  section.appendChild(header);
  section.appendChild(contentDiv);
  return section;
}

function createTextRow(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'import-row-input';
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  row.appendChild(input);
  return row;
}

function createNumberRow(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'import-row-input import-row-number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener('change', () => onChange(parseFloat(input.value) || value));
  row.appendChild(input);
  return row;
}

function createCheckRow(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  const lbl = document.createElement('label');
  lbl.className = 'import-row-label import-row-check-label';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.className = 'import-row-checkbox';
  cb.addEventListener('change', () => onChange(cb.checked));
  lbl.appendChild(cb);
  lbl.appendChild(document.createTextNode(' ' + label));
  row.appendChild(lbl);
  return row;
}

function createSelectRow(label: string, value: string, options: string[], labels: string[], onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const sel = document.createElement('select');
  sel.className = 'import-row-select';
  for (let i = 0; i < options.length; i++) {
    const opt = document.createElement('option');
    opt.value = options[i];
    opt.textContent = labels[i] || options[i];
    if (options[i] === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  row.appendChild(sel);
  return row;
}

function createVec3Row(label: string, value: { x: number; y: number; z: number }, onChange: (v: { x: number; y: number; z: number }) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row import-row-vec3';
  row.innerHTML = `<label class="import-row-label">${label}</label>`;
  const container = document.createElement('div');
  container.className = 'import-vec3-inputs';

  for (const axis of ['x', 'y', 'z'] as const) {
    const lbl = document.createElement('span');
    lbl.className = 'import-vec3-axis';
    lbl.textContent = axis.toUpperCase();
    container.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'import-row-input import-vec3-input';
    input.value = String(value[axis]);
    input.step = '0.1';
    input.addEventListener('change', () => {
      value[axis] = parseFloat(input.value) || 0;
      onChange({ ...value });
    });
    container.appendChild(input);
  }

  row.appendChild(container);
  return row;
}

function createInfoRow(text: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'import-row import-row-info';
  row.textContent = text;
  row.style.whiteSpace = 'pre-wrap';
  return row;
}

function formatLabel(format: ImportMeshFormat): string {
  const labels: Record<ImportMeshFormat, string> = {
    gltf: 'glTF Text',
    glb: 'glTF Binary',
    fbx: 'Autodesk FBX',
    obj: 'Wavefront OBJ',
    dae: 'Collada DAE',
    stl: 'STL',
    ply: 'PLY',
  };
  return labels[format] || format.toUpperCase();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// ============================================================
//  Texture Import Dialog
// ============================================================

import { TextureLibrary, type TextureSettings, type TextureCategory, defaultTextureSettings } from './TextureLibrary';

export interface TextureImportResult {
  cancelled: boolean;
  textureIds: string[];
}

/**
 * Show a texture import dialog with settings (category, filtering, wrapping, 9-slice, etc.)
 * Supports importing multiple files at once.
 */
export function showTextureImportDialog(files?: File[]): Promise<TextureImportResult> {
  return new Promise((resolve) => {
    const settings: any = { ...defaultTextureSettings(), category: 'UI' };
    const selectedFiles: File[] = files ? [...files] : [];

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';

    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:8px;padding:20px;width:460px;max-height:600px;overflow-y:auto;color:#ddd;';

    // Title
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:12px;color:#fff;';
    titleEl.textContent = 'Import Texture(s)';
    dlg.appendChild(titleEl);

    // File selection area
    const fileArea = document.createElement('div');
    fileArea.style.cssText = 'border:2px dashed #444;border-radius:6px;padding:20px;text-align:center;margin-bottom:12px;cursor:pointer;transition:border-color 0.2s;';
    fileArea.innerHTML = selectedFiles.length > 0
      ? `<div style="color:#aaa;font-size:12px;">${selectedFiles.length} file(s) selected</div>`
      : '<div style="color:#666;font-size:12px;">Click to select image files or drag & drop</div>';

    fileArea.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', () => {
        if (input.files) {
          selectedFiles.length = 0;
          for (let i = 0; i < input.files.length; i++) selectedFiles.push(input.files[i]);
          fileArea.innerHTML = `<div style="color:#aaa;font-size:12px;">${selectedFiles.length} file(s) selected</div>`;
          for (const f of selectedFiles) {
            const fEl = document.createElement('div');
            fEl.style.cssText = 'font-size:10px;color:#888;';
            fEl.textContent = `  ${f.name} (${formatSize(f.size)})`;
            fileArea.appendChild(fEl);
          }
        }
      });
      input.click();
    });
    fileArea.addEventListener('dragover', (e) => { e.preventDefault(); fileArea.style.borderColor = '#2a5db0'; });
    fileArea.addEventListener('dragleave', () => { fileArea.style.borderColor = '#444'; });
    fileArea.addEventListener('drop', (e) => {
      e.preventDefault();
      fileArea.style.borderColor = '#444';
      if (e.dataTransfer?.files) {
        selectedFiles.length = 0;
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const f = e.dataTransfer.files[i];
          if (f.type.startsWith('image/')) selectedFiles.push(f);
        }
        fileArea.innerHTML = `<div style="color:#aaa;font-size:12px;">${selectedFiles.length} file(s) selected</div>`;
        for (const f of selectedFiles) {
          const fEl = document.createElement('div');
          fEl.style.cssText = 'font-size:10px;color:#888;';
          fEl.textContent = `  ${f.name} (${formatSize(f.size)})`;
          fileArea.appendChild(fEl);
        }
      }
    });
    dlg.appendChild(fileArea);

    // Settings section
    const settingsSection = document.createElement('div');
    settingsSection.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:16px;';

    const addRow = (label: string, control: HTMLElement) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:11px;color:#999;width:100px;flex-shrink:0;';
      lbl.textContent = label;
      row.appendChild(lbl);
      row.appendChild(control);
      settingsSection.appendChild(row);
    };

    // Category
    const catSel = document.createElement('select');
    catSel.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:3px 6px;border-radius:3px;font-size:11px;';
    for (const cat of ['UI', 'Sprite', 'NormalMap', 'RenderTarget'] as TextureCategory[]) {
      const o = document.createElement('option');
      o.value = cat;
      o.textContent = cat;
      if (cat === settings.category) o.selected = true;
      catSel.appendChild(o);
    }
    catSel.addEventListener('change', () => { settings.category = catSel.value as TextureCategory; });
    addRow('Category', catSel);

    // Filter
    const filterSel = document.createElement('select');
    filterSel.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:3px 6px;border-radius:3px;font-size:11px;';
    for (const f of ['Linear', 'Nearest']) {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      if (f === settings.filter) o.selected = true;
      filterSel.appendChild(o);
    }
    filterSel.addEventListener('change', () => { settings.filter = filterSel.value as any; });
    addRow('Filter', filterSel);

    // Wrap
    const wrapSel = document.createElement('select');
    wrapSel.style.cssText = 'flex:1;background:#111;border:1px solid #333;color:#ddd;padding:3px 6px;border-radius:3px;font-size:11px;';
    for (const w of ['Repeat', 'Clamp', 'Mirror']) {
      const o = document.createElement('option');
      o.value = w;
      o.textContent = w;
      if (w === settings.wrap) o.selected = true;
      wrapSel.appendChild(o);
    }
    wrapSel.addEventListener('change', () => { settings.wrap = wrapSel.value as any; });
    addRow('Wrap', wrapSel);

    // Generate Mipmaps
    const mipChk = document.createElement('input');
    mipChk.type = 'checkbox';
    mipChk.checked = settings.generateMipmaps;
    mipChk.addEventListener('change', () => { settings.generateMipmaps = mipChk.checked; });
    addRow('Mipmaps', mipChk);

    // sRGB
    const srgbChk = document.createElement('input');
    srgbChk.type = 'checkbox';
    srgbChk.checked = settings.sRGB;
    srgbChk.addEventListener('change', () => { settings.sRGB = srgbChk.checked; });
    addRow('sRGB', srgbChk);

    dlg.appendChild(settingsSection);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:6px 16px;font-size:12px;cursor:pointer;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve({ cancelled: true, textureIds: [] });
    });

    const importBtn = document.createElement('button');
    importBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:4px;padding:6px 16px;font-size:12px;cursor:pointer;font-weight:bold;';
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', async () => {
      if (selectedFiles.length === 0) return;
      const texLib = TextureLibrary.instance;
      if (!texLib) { overlay.remove(); resolve({ cancelled: true, textureIds: [] }); return; }
      const ids: string[] = [];
      for (const file of selectedFiles) {
        const result = await texLib.importFromFile(file, settings);
        if (result?.assetId) ids.push(result.assetId);
      }
      overlay.remove();
      resolve({ cancelled: false, textureIds: ids });
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(importBtn);
    dlg.appendChild(btnRow);

    overlay.appendChild(dlg);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve({ cancelled: true, textureIds: [] }); }
    });
    document.body.appendChild(overlay);
  });
}

// ============================================================
//  Font Import Dialog
// ============================================================

import { FontLibrary } from './FontLibrary';

export interface FontImportResult {
  cancelled: boolean;
  fontId?: string;
}

/**
 * Show a font import dialog with preview.
 */
export function showFontImportDialog(file?: File): Promise<FontImportResult> {
  return new Promise((resolve) => {
    let selectedFile: File | null = file ?? null;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';

    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:#1e1e2e;border:1px solid #444;border-radius:8px;padding:20px;width:400px;color:#ddd;';

    // Title
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:15px;font-weight:bold;margin-bottom:12px;color:#fff;';
    titleEl.textContent = 'Import Font';
    dlg.appendChild(titleEl);

    // File selection
    const fileArea = document.createElement('div');
    fileArea.style.cssText = 'border:2px dashed #444;border-radius:6px;padding:16px;text-align:center;margin-bottom:12px;cursor:pointer;';
    fileArea.innerHTML = selectedFile
      ? `<div style="color:#aaa;font-size:12px;">${selectedFile.name} (${formatSize(selectedFile.size)})</div>`
      : '<div style="color:#666;font-size:12px;">Click to select a font file (.ttf, .otf, .woff, .woff2)</div>';

    fileArea.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ttf,.otf,.woff,.woff2';
      input.addEventListener('change', () => {
        if (input.files?.[0]) {
          selectedFile = input.files[0];
          fileArea.innerHTML = `<div style="color:#aaa;font-size:12px;">${selectedFile.name} (${formatSize(selectedFile.size)})</div>`;
          updatePreview();
        }
      });
      input.click();
    });
    dlg.appendChild(fileArea);

    // Preview
    const previewEl = document.createElement('div');
    previewEl.style.cssText = 'background:#111;border:1px solid #333;border-radius:4px;padding:12px;margin-bottom:12px;min-height:40px;';
    previewEl.innerHTML = '<div style="color:#555;font-size:12px;text-align:center;">Preview will appear here</div>';
    dlg.appendChild(previewEl);

    const updatePreview = () => {
      if (!selectedFile) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataURL = reader.result as string;
        const fontName = 'preview_' + Date.now();
        const face = new FontFace(fontName, `url(${dataURL})`);
        face.load().then((loaded) => {
          (document.fonts as any).add(loaded);
          previewEl.innerHTML = '';
          const sample = document.createElement('div');
          sample.style.cssText = `font-family:'${fontName}';font-size:20px;color:#ddd;text-align:center;`;
          sample.textContent = 'The quick brown fox jumps over the lazy dog';
          previewEl.appendChild(sample);
          const sample2 = document.createElement('div');
          sample2.style.cssText = `font-family:'${fontName}';font-size:14px;color:#aaa;text-align:center;margin-top:4px;`;
          sample2.textContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789';
          previewEl.appendChild(sample2);
        }).catch(() => {
          previewEl.innerHTML = '<div style="color:#f55;font-size:11px;text-align:center;">Failed to load font preview</div>';
        });
      };
      reader.readAsDataURL(selectedFile);
    };
    if (selectedFile) updatePreview();

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'background:#333;color:#ccc;border:none;border-radius:4px;padding:6px 16px;font-size:12px;cursor:pointer;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve({ cancelled: true });
    });

    const importBtn = document.createElement('button');
    importBtn.style.cssText = 'background:#2a5db0;color:#fff;border:none;border-radius:4px;padding:6px 16px;font-size:12px;cursor:pointer;font-weight:bold;';
    importBtn.textContent = 'Import';
    importBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      const fontLib = FontLibrary.instance;
      if (!fontLib) { overlay.remove(); resolve({ cancelled: true }); return; }
      const result = await fontLib.importFont(selectedFile);
      overlay.remove();
      resolve({ cancelled: false, fontId: result.assetId });
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(importBtn);
    dlg.appendChild(btnRow);

    overlay.appendChild(dlg);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); resolve({ cancelled: true }); }
    });
    document.body.appendChild(overlay);
  });
}
