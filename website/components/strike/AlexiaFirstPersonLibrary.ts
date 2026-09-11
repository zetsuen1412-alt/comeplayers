import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export type LoadedAlexiaFirstPersonParts = {
  root: THREE.Group;
  cp47?: THREE.Object3D;
  magazine?: THREE.Object3D;
  sight?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  muzzle?: THREE.Object3D;
  ejection?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
};

const MODEL_URL = "/strike/models/player/alexia-first-person-cp47-v1.glb";

function rememberBaseTransform(object?: THREE.Object3D) {
  if (!object) return;
  object.userData.cpBasePosition = object.position.clone();
  object.userData.cpBaseRotation = object.rotation.clone();
  object.userData.cpBaseScale = object.scale.clone();
}

export class AlexiaFirstPersonLibrary {
  private loader = new GLTFLoader();
  private cache: THREE.Group | null = null;
  private pending: Promise<THREE.Group> | null = null;

  preload() {
    void this.load();
  }

  async create(): Promise<LoadedAlexiaFirstPersonParts> {
    const template = await this.load();
    const root = cloneSkeleton(template) as THREE.Group;
    const materials: THREE.MeshStandardMaterial[] = [];
    root.name = "alexia-first-person-cp47-v1";
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = sources.map((source) => {
        const material = source.clone();
        const standard = material as THREE.MeshStandardMaterial;
        if (standard.isMeshStandardMaterial) {
          standard.envMapIntensity = 1.18;
          standard.depthTest = true;
          standard.depthWrite = true;
          standard.toneMapped = true;
          materials.push(standard);
        }
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
    });

    const parts: LoadedAlexiaFirstPersonParts = {
      root,
      cp47: root.getObjectByName("CP47"),
      magazine: root.getObjectByName("Magazine"),
      sight: root.getObjectByName("Sight"),
      leftArm: root.getObjectByName("LeftArm"),
      rightArm: root.getObjectByName("RightArm"),
      muzzle: root.getObjectByName("Muzzle"),
      ejection: root.getObjectByName("Ejection"),
      materials,
    };
    rememberBaseTransform(parts.root);
    rememberBaseTransform(parts.cp47);
    rememberBaseTransform(parts.magazine);
    rememberBaseTransform(parts.sight);
    rememberBaseTransform(parts.leftArm);
    rememberBaseTransform(parts.rightArm);
    if (parts.muzzle) parts.muzzle.visible = false;
    if (parts.ejection) parts.ejection.visible = false;
    return parts;
  }

  private load(): Promise<THREE.Group> {
    if (this.cache) return Promise.resolve(this.cache);
    if (this.pending) return this.pending;
    this.pending = this.loader.loadAsync(MODEL_URL).then((gltf) => {
      this.cache = gltf.scene;
      this.cache.name = "alexia-first-person-template-v1";
      this.pending = null;
      return this.cache;
    }).catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }
}
