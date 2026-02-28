import * as THREE from 'three';

const scene = new THREE.Scene();
const group = new THREE.Group();
group.userData.__navmeshHelper = true;

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
mesh.name = "ChildMesh";
group.add(mesh);
scene.add(group);

let foundMeshes = [];
scene.traverse((obj: any) => {
  if (obj.userData.__navmeshHelper) return;
  if (obj.isMesh) foundMeshes.push(obj.name);
});
console.log("Found meshes directly:", foundMeshes);
