import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const tc = new TransformControls(new THREE.Camera() as any, {} as any);
console.log('isTransformControls', tc.isTransformControls);
