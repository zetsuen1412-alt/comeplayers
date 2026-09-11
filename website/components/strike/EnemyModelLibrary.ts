import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

export type EnemyModelId = "jokowi" | "prabowo";

export type LoadedEnemyParts = {
  root: THREE.Group;
  body?: THREE.Object3D;
  head?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  rifle?: THREE.Object3D;
  muzzle?: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
};

const MODEL_URLS: Record<EnemyModelId, string> = {
  jokowi: "/strike/models/enemies/jokowi-enemy-v2.glb",
  prabowo: "/strike/models/enemies/prabowo-enemy-v2.glb",
};

export class EnemyModelLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<EnemyModelId, THREE.Group>();
  private pending = new Map<EnemyModelId, Promise<THREE.Group>>();

  preload() {
    void this.load("jokowi");
    void this.load("prabowo");
  }

  async create(id: EnemyModelId): Promise<LoadedEnemyParts> {
    const template = await this.load(id);
    const root = cloneSkeleton(template) as THREE.Group;
    const materials: THREE.MeshStandardMaterial[] = [];
    root.name = `${id}-enemy-model-v2`;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clonedMaterials = sourceMaterials.map((source) => {
        const material = source.clone();
        const standard = material as THREE.MeshStandardMaterial;
        if (standard.isMeshStandardMaterial) {
          standard.envMapIntensity = 1.12;
          standard.userData.cpBaseEmissive = standard.emissive.getHex();
          standard.userData.cpBaseEmissiveIntensity = standard.emissiveIntensity;
          standard.userData.cpBaseOpacity = standard.opacity;
          materials.push(standard);
        }
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
    });
    const muzzle = root.getObjectByName("Muzzle");
    if (muzzle) muzzle.visible = false;
    return {
      root,
      body: root.getObjectByName("Body"),
      head: root.getObjectByName("Head"),
      leftArm: root.getObjectByName("LeftArm"),
      rightArm: root.getObjectByName("RightArm"),
      leftLeg: root.getObjectByName("LeftLeg"),
      rightLeg: root.getObjectByName("RightLeg"),
      rifle: root.getObjectByName("Rifle"),
      muzzle,
      materials,
    };
  }

  private load(id: EnemyModelId): Promise<THREE.Group> {
    const cached = this.cache.get(id);
    if (cached) return Promise.resolve(cached);
    const active = this.pending.get(id);
    if (active) return active;
    const request = this.loader.loadAsync(MODEL_URLS[id]).then((gltf) => {
      const root = gltf.scene;
      root.name = `${id}-enemy-template-v2`;
      this.cache.set(id, root);
      this.pending.delete(id);
      return root;
    }).catch((error: unknown) => {
      this.pending.delete(id);
      throw error;
    });
    this.pending.set(id, request);
    return request;
  }
}
