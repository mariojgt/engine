export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface Vector2Like {
  x: number;
  y: number;
}

export interface Transform {
  position: Vector3Like;
  rotation: Vector3Like; // Euler angles in degrees or radians depending on implementation, usually degrees in editor, radians in three.js
  scale: Vector3Like;
  
  setPosition(x: number, y: number, z?: number): void;
  setRotation(x: number, y: number, z?: number): void;
  setScale(x: number, y: number, z?: number): void;
  
  getPosition(): Vector3Like;
  getRotation(): Vector3Like;
  getScale(): Vector3Like;
}
