import * as THREE from "three";

export type StrikePhase = "menu" | "playing" | "paused" | "gameover";
export type StrikeQuality = "low" | "medium" | "high";
export type StrikeMode =
  | "team-deathmatch"
  | "bomb-defusal"
  | "free-for-all"
  | "zombie"
  | "zombie-adventure";
export type StrikeOutcome = "victory" | "defeat" | null;

export type StrikeHudState = {
  health: number;
  armor: number;
  ammo: number;
  reserveAmmo: number;
  kills: number;
  deaths: number;
  alliesScore: number;
  enemiesScore: number;
  timerSeconds: number;
  message: string;
  objectiveDistance: number;
  objectiveProgress: number;
  wave: number;
  round: number;
  outcome: StrikeOutcome;
  reloading: boolean;
  hitMarker: boolean;
  damageFlash: boolean;
  bossName: string;
  bossHealth: number;
  bossMaxHealth: number;
  adventureStage: number;
  adventureStageMax: number;
  adventureObjective: string;
  reviveTokens: number;
  combo: number;
  overdriveSeconds: number;
  bossPhase: number;
};

type StrikeCallbacks = {
  onHud: (state: StrikeHudState) => void;
  onPhase: (phase: StrikePhase) => void;
  onError?: (message: string) => void;
};

type BotKind = "soldier" | "walker" | "runner" | "crawler" | "brute" | "spitter" | "screamer" | "boss";

type Bot = {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  rifle: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  specialParts: THREE.Group;
  health: number;
  maxHealth: number;
  alive: boolean;
  speed: number;
  shootCooldown: number;
  abilityCooldown: number;
  nextDecision: number;
  wanderTarget: THREE.Vector3;
  respawnAt: number;
  enabled: boolean;
  kind: BotKind;
  enragedUntil: number;
};

type Obstacle = {
  box: THREE.Box3;
  mesh: THREE.Mesh;
  active: boolean;
};

type PickupKind = "health" | "ammo" | "armor" | "overdrive";

type Pickup = {
  kind: PickupKind;
  group: THREE.Group;
  active: boolean;
  respawnAt: number;
};

type ExplosiveBarrel = {
  group: THREE.Group;
  body: THREE.Mesh;
  health: number;
  exploded: boolean;
  obstacle: Obstacle;
};

type ToxicHazard = {
  mesh: THREE.Mesh;
  radius: number;
};

const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.42;
const ARENA_LIMIT = 42;
const MATCH_SECONDS = 180;
const MAX_BOTS = 22;
const SURVIVAL_WAVES = 8;
const ADVENTURE_STAGES = 7;
const DEFAULT_OBJECTIVE = new THREE.Vector3(0, 0, -23);
const GATE_OBJECTIVE = new THREE.Vector3(0, 0, 8);
const REACTOR_OBJECTIVE = new THREE.Vector3(7.1, 0, -21.8);
const SUPPLY_OBJECTIVE = new THREE.Vector3(-16.5, 0, 30.5);
const GENERATOR_A = new THREE.Vector3(-20.5, 0, -4.5);
const GENERATOR_B = new THREE.Vector3(20.5, 0, -12.5);
const EXTRACTION_OBJECTIVE = new THREE.Vector3(0, 0, 34);

export class StrikeGame {
  private container: HTMLDivElement;
  private minimap: HTMLCanvasElement;
  private minimapContext: CanvasRenderingContext2D | null;
  private callbacks: StrikeCallbacks;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 260);
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private animationFrame = 0;

  private phase: StrikePhase = "menu";
  private mode: StrikeMode = "team-deathmatch";
  private quality: StrikeQuality = "high";
  private sensitivity = 0.0018;
  private yaw = 0;
  private pitch = 0;
  private velocityY = 0;
  private grounded = true;
  private playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 34);
  private playerSpawn = new THREE.Vector3(0, PLAYER_HEIGHT, 34);
  private playerHealth = 100;
  private playerArmor = 50;
  private ammo = 30;
  private reserveAmmo = 120;
  private kills = 0;
  private deaths = 0;
  private alliesScore = 0;
  private enemiesScore = 0;
  private timerSeconds = MATCH_SECONDS;
  private matchDuration = MATCH_SECONDS;
  private targetScore = 20;
  private outcome: StrikeOutcome = null;
  private wave = 1;
  private round = 1;
  private activeBotCount = 6;
  private wavePendingAt = 0;
  private rivalTickAt = 0;
  private bombState: "idle" | "planting" | "planted" | "defused" | "exploded" = "idle";
  private bombProgress = 0;
  private bombTimer = 35;
  private bombDefuseProgress = 0;
  private reloading = false;
  private reloadFinishAt = 0;
  private respawnAt = 0;
  private lastShotAt = 0;
  private nextBotId = 1;
  private message = "Capture Point A";
  private hitMarkerUntil = 0;
  private damageFlashUntil = 0;

  private adventureStage = 1;
  private adventureProgress = 0;
  private adventureObjective = "Secure the arrival yard";
  private adventureGateOpen = false;
  private adventureSubObjective = 0;
  private checkpointSpawn = new THREE.Vector3(0, PLAYER_HEIGHT, 34);
  private reviveTokens = 1;
  private boss: Bot | null = null;
  private bossPhase = 0;
  private bossSummonAt = 0;
  private combo = 0;
  private comboExpiresAt = 0;
  private damageBoostUntil = 0;
  private lastHazardDamageAt = 0;

  private keys = new Set<string>();
  private mousePrimary = false;
  private mouseSecondary = false;
  private obstacles: Obstacle[] = [];
  private bots: Bot[] = [];
  private weapon = new THREE.Group();
  private muzzleFlash: THREE.PointLight;
  private muzzleMesh: THREE.Mesh;
  private gunBasePosition = new THREE.Vector3(0.34, -0.29, -0.72);
  private audioContext: AudioContext | null = null;
  private lastHudEmit = 0;
  private disposed = false;

  private objectivePosition = DEFAULT_OBJECTIVE.clone();
  private objectiveBeacon = new THREE.Group();
  private objectiveRing: THREE.Mesh | null = null;
  private objectiveBeam: THREE.Mesh | null = null;
  private adventureGate = new THREE.Group();
  private reactorCore = new THREE.Group();
  private decorGroup = new THREE.Group();
  private droneProps: THREE.Group[] = [];
  private flickerLights: THREE.PointLight[] = [];
  private pickups: Pickup[] = [];
  private explosiveBarrels: ExplosiveBarrel[] = [];
  private toxicHazards: ToxicHazard[] = [];
  private generatorProps: THREE.Group[] = [];

  private onResizeBound = () => this.onResize();
  private onKeyDownBound = (event: KeyboardEvent) => this.onKeyDown(event);
  private onKeyUpBound = (event: KeyboardEvent) => this.onKeyUp(event);
  private onMouseMoveBound = (event: MouseEvent) => this.onMouseMove(event);
  private onMouseDownBound = (event: MouseEvent) => this.onMouseDown(event);
  private onMouseUpBound = (event: MouseEvent) => this.onMouseUp(event);
  private onContextMenuBound = (event: MouseEvent) => event.preventDefault();
  private onPointerLockBound = () => this.onPointerLockChange();

  constructor(
    container: HTMLDivElement,
    minimap: HTMLCanvasElement,
    callbacks: StrikeCallbacks
  ) {
    this.container = container;
    this.minimap = minimap;
    this.minimapContext = minimap.getContext("2d");
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "ComePlayers Strike 3D game canvas");
    this.container.appendChild(this.renderer.domElement);

    this.muzzleFlash = new THREE.PointLight(0xffb300, 0, 6, 2);
    this.muzzleMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.42, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0 })
    );

    this.buildScene();
    this.bindEvents();
    this.onResize();
    this.emitHud(true);
    this.clock.start();
    this.loop();
  }

  setQuality(quality: StrikeQuality) {
    this.quality = quality;
    this.applyQuality();
  }

  setSensitivity(value: number) {
    this.sensitivity = THREE.MathUtils.clamp(value, 0.0007, 0.0042);
  }

  setMode(mode: StrikeMode) {
    this.mode = mode;
    if (this.phase === "menu") this.applyModeVisuals();
  }

  startMatch(mode: StrikeMode = this.mode) {
    this.mode = mode;
    this.resetMatch();
    this.phase = "playing";
    this.callbacks.onPhase("playing");
    this.ensureAudio();
    this.requestPointerLock();
  }

  resume() {
    if (this.phase === "gameover") return;
    this.phase = "playing";
    this.callbacks.onPhase("playing");
    this.requestPointerLock();
  }

  restart() {
    this.startMatch(this.mode);
  }

  returnToMenu() {
    this.phase = "menu";
    this.callbacks.onPhase("menu");
    this.mousePrimary = false;
    this.mouseSecondary = false;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.applyModeVisuals();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.callbacks.onPhase("paused");
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.onResizeBound);
    window.removeEventListener("keydown", this.onKeyDownBound);
    window.removeEventListener("keyup", this.onKeyUpBound);
    document.removeEventListener("mousemove", this.onMouseMoveBound);
    document.removeEventListener("mousedown", this.onMouseDownBound);
    document.removeEventListener("mouseup", this.onMouseUpBound);
    document.removeEventListener("contextmenu", this.onContextMenuBound);
    document.removeEventListener("pointerlockchange", this.onPointerLockBound);

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          const map = (material as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          material.dispose();
        });
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.audioContext?.close();
  }

  private bindEvents() {
    window.addEventListener("resize", this.onResizeBound);
    window.addEventListener("keydown", this.onKeyDownBound);
    window.addEventListener("keyup", this.onKeyUpBound);
    document.addEventListener("mousemove", this.onMouseMoveBound);
    document.addEventListener("mousedown", this.onMouseDownBound);
    document.addEventListener("mouseup", this.onMouseUpBound);
    document.addEventListener("contextmenu", this.onContextMenuBound);
    document.addEventListener("pointerlockchange", this.onPointerLockBound);
  }

  private isZombieMode() {
    return this.mode === "zombie" || this.mode === "zombie-adventure";
  }

  private getModeSettings() {
    switch (this.mode) {
      case "bomb-defusal":
        return { duration: 150, bots: 5, target: 1, armor: 75, reserve: 90 };
      case "free-for-all":
        return { duration: 180, bots: 7, target: 15, armor: 25, reserve: 150 };
      case "zombie":
        return { duration: 540, bots: 6, target: SURVIVAL_WAVES, armor: 100, reserve: 270 };
      case "zombie-adventure":
        return { duration: 900, bots: 9, target: ADVENTURE_STAGES, armor: 125, reserve: 360 };
      default:
        return { duration: 180, bots: 6, target: 20, armor: 50, reserve: 120 };
    }
  }

  private applyModeVisuals() {
    const adventure = this.mode === "zombie-adventure";
    const zombie = this.mode === "zombie";
    const bomb = this.mode === "bomb-defusal";
    this.scene.background = new THREE.Color(adventure ? 0x020608 : zombie ? 0x020807 : bomb ? 0x070604 : 0x05070b);
    const fogColor = adventure ? 0x061019 : zombie ? 0x06120e : bomb ? 0x100c06 : 0x070a10;
    const fogDensity = adventure ? 0.021 : zombie ? 0.026 : bomb ? 0.019 : 0.016;
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    this.flickerLights.forEach((light, index) => {
      light.color.set(adventure || zombie ? (index % 2 ? 0x2fff8c : 0xff6a18) : 0xffb300);
    });
    for (const [index, bot] of this.bots.entries()) this.configureBotVisuals(bot, index);
    this.pickups.forEach((pickup) => {
      pickup.group.visible = this.isZombieMode() && pickup.active;
    });
    this.toxicHazards.forEach((hazard) => {
      hazard.mesh.visible = this.isZombieMode();
    });
  }

  private finishMatch(outcome: Exclude<StrikeOutcome, null>, message: string) {
    if (this.phase === "gameover") return;
    this.outcome = outcome;
    this.message = message;
    this.phase = "gameover";
    this.callbacks.onPhase("gameover");
    this.mousePrimary = false;
    this.mouseSecondary = false;
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.emitHud(true);
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0x05070b);
    this.scene.fog = new THREE.FogExp2(0x070a10, 0.016);

    this.camera.rotation.order = "YXZ";
    this.camera.position.copy(this.playerPosition);
    this.scene.add(this.camera);
    this.scene.add(this.decorGroup);

    const hemisphere = new THREE.HemisphereLight(0x7893b7, 0x07090c, 1.2);
    this.scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.35);
    keyLight.position.set(-18, 30, 18);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 120;
    keyLight.shadow.camera.left = -48;
    keyLight.shadow.camera.right = 48;
    keyLight.shadow.camera.top = 48;
    keyLight.shadow.camera.bottom = -48;
    this.scene.add(keyLight);

    const warmLight = new THREE.PointLight(0xffb300, 115, 48, 2);
    warmLight.position.set(0, 11, 3);
    this.scene.add(warmLight);

    this.addTerrainAndRoad();
    this.addArenaWalls();
    this.addIndustrialDistrict();
    this.addGameplayObjects();
    this.addObjectiveBeacon();
    this.addBrandBillboard(-41.3, 8.4, -5, Math.PI / 2);
    this.addBrandBillboard(41.3, 8.4, -5, -Math.PI / 2);
    this.addBrandBillboard(0, 10.5, -41.3, 0);
    this.addWeapon();

    for (let index = 0; index < MAX_BOTS; index += 1) this.spawnBot(index);
  }

  private createAsphaltTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#111821";
    context.fillRect(0, 0, 512, 512);
    for (let index = 0; index < 9500; index += 1) {
      const value = 18 + Math.floor(Math.random() * 25);
      context.fillStyle = `rgba(${value},${value + 4},${value + 8},${Math.random() * 0.22})`;
      const size = Math.random() * 2.4 + 0.3;
      context.fillRect(Math.random() * 512, Math.random() * 512, size, size);
    }
    context.strokeStyle = "rgba(255,255,255,.06)";
    context.lineWidth = 2;
    for (let index = 0; index < 16; index += 1) {
      context.beginPath();
      context.moveTo(Math.random() * 512, Math.random() * 512);
      context.lineTo(Math.random() * 512, Math.random() * 512);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(7, 10);
    texture.anisotropy = 4;
    return texture;
  }

  private addTerrainAndRoad() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(96, 96),
      new THREE.MeshStandardMaterial({ color: 0x0d1319, roughness: 0.88, metalness: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const asphaltTexture = this.createAsphaltTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(56, 92),
      new THREE.MeshStandardMaterial({ color: 0x151c25, map: asphaltTexture ?? undefined, roughness: 0.78, metalness: 0.28 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.002;
    road.receiveShadow = true;
    this.scene.add(road);

    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.7, metalness: 0.25 });
    for (const x of [-29.2, 29.2]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 92), curbMaterial);
      curb.position.set(x, 0.13, 0);
      curb.receiveShadow = true;
      this.scene.add(curb);
    }

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd99d00, transparent: true, opacity: 0.55 });
    for (let z = -38; z <= 38; z += 8) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 4.2), lineMaterial);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.02, z);
      this.scene.add(line);
    }

    for (const side of [-1, 1]) {
      const geometry = new THREE.PlaneGeometry(18, 92, 10, 28);
      const positions = geometry.attributes.position;
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        positions.setZ(index, Math.sin(x * 0.45 + y * 0.12) * 0.35 + Math.sin(y * 0.28) * 0.18);
      }
      geometry.computeVertexNormals();
      const terrain = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: side < 0 ? 0x192018 : 0x171d1c, roughness: 0.94, metalness: 0.08 })
      );
      terrain.rotation.x = -Math.PI / 2;
      terrain.position.set(side * 38, -0.12, 0);
      terrain.receiveShadow = true;
      this.scene.add(terrain);
    }
  }

  private addArenaWalls() {
    this.addCover(0, 5, -43.5, 88, 10, 2, 0x101720);
    this.addCover(0, 5, 43.5, 88, 10, 2, 0x101720);
    this.addCover(-43.5, 5, 0, 2, 10, 88, 0x101720);
    this.addCover(43.5, 5, 0, 2, 10, 88, 0x101720);
  }

  private addIndustrialDistrict() {
    this.addBuilding(-36, -30, 11, 12, 11, 0x141b23, 0xffa700);
    this.addBuilding(36, -29, 11, 16, 13, 0x121923, 0x59b6ff);
    this.addBuilding(-36, -10, 11, 17, 13, 0x131a22, 0xff6a18);
    this.addBuilding(36, -7, 11, 12, 15, 0x101820, 0xffc400);
    this.addBuilding(-36, 16, 11, 14, 12, 0x151c24, 0x77ff9c);
    this.addBuilding(36, 19, 11, 18, 12, 0x111820, 0xffb300);
    this.addBuilding(-36, 35, 11, 10, 10, 0x141a22, 0xff8a00);
    this.addBuilding(36, 35, 11, 13, 10, 0x131a23, 0x77bfff);

    this.addContainerStack(-18, -24, 0xffa000, 2, 1);
    this.addContainerStack(18, -25, 0x244566, 2, 2);
    this.addContainerStack(-20, 18, 0x5c2a20, 2, 1);
    this.addContainerStack(20, 20, 0x253d34, 2, 1);
    this.addContainerStack(-11, -4, 0x343c46, 1, 1);
    this.addContainerStack(13, -2, 0x343c46, 1, 1);

    this.addCover(-9, 1.4, 28, 5.5, 2.8, 3.4, 0x202932);
    this.addCover(9, 1.4, 29, 5.5, 2.8, 3.4, 0x202932);
    this.addBarricade(-13, 10, 0.2);
    this.addBarricade(13, 10, -0.25);
    this.addBarricade(-10, -15, 0.12);
    this.addBarricade(12, -18, -0.18);
    this.addVehicle(-17, 2, Math.PI / 2, 0x222a33);
    this.addVehicle(18, -11, -Math.PI / 2, 0x2e2519);
    this.addVehicle(-18, 34, Math.PI / 2, 0x27313b);

    this.addGateComplex();
    this.addReactorComplex();

    for (const [x, z] of [[-27, 32], [27, 30], [-27, 6], [27, 4], [-27, -19], [27, -22]] as const) {
      this.addStreetLamp(x, z);
    }

    for (const [x, z] of [[-23, 25], [23, 26], [-25, -3], [25, -1], [-21, -31], [22, -34], [-4, 14], [6, -10]] as const) {
      this.addRubble(x, z);
    }

    this.addPipeCluster(-27, -5);
    this.addPipeCluster(27, 13);
    this.addDrone(-18, 11, -19, 0.42);
    this.addDrone(20, 14, -8, -0.35);
    this.addDrone(3, 18, 25, 0.15);
  }

  private addGameplayObjects() {
    const catwalkMaterial = new THREE.MeshStandardMaterial({ color: 0x252d36, roughness: 0.48, metalness: 0.82 });
    const catwalk = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(23, 0.32, 2.4), catwalkMaterial);
    deck.position.y = 6.2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    catwalk.add(deck);
    for (const x of [-10.5, 10.5]) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.55), catwalkMaterial);
      support.position.set(x, 3.1, 0);
      support.castShadow = true;
      catwalk.add(support);
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(23, 0.12, 0.12), catwalkMaterial);
      rail.position.set(0, 7.05, side * 1.05);
      catwalk.add(rail);
      for (let x = -11; x <= 11; x += 2.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), catwalkMaterial);
        post.position.set(x, 6.65, side * 1.05);
        catwalk.add(post);
      }
    }
    catwalk.position.z = 2.5;
    this.decorGroup.add(catwalk);

    const fenceMaterial = new THREE.MeshStandardMaterial({ color: 0x303841, roughness: 0.55, metalness: 0.82 });
    for (const side of [-1, 1]) {
      for (let z = -36; z <= 36; z += 6) {
        const fence = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.08, 0.08), fenceMaterial);
        top.position.y = 1.55;
        fence.add(top);
        for (let i = -2; i <= 2; i += 1) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.55, 0.06), fenceMaterial);
          bar.position.set(i * 1.15, 0.78, 0);
          fence.add(bar);
        }
        fence.position.set(side * 31.2, 0, z);
        fence.rotation.y = Math.PI / 2;
        this.decorGroup.add(fence);
      }
    }

    for (const [x, z] of [[-10, 24], [12, 16], [-19, -10], [19, -18], [-8, -29], [13, -34], [25, 30]] as const) {
      this.addExplosiveBarrel(x, z);
    }

    this.addPickup("health", -14, 21);
    this.addPickup("ammo", 15, 12);
    this.addPickup("armor", -17, -17);
    this.addPickup("overdrive", 18, -30);
    this.addPickup("ammo", 2, -28);

    this.addToxicHazard(8, -25, 3.2);
    this.addToxicHazard(-4, -30, 2.4);
    this.addToxicHazard(22, -2, 2.1);

    this.addGenerator(GENERATOR_A.x, GENERATOR_A.z, 0x5b9dff);
    this.addGenerator(GENERATOR_B.x, GENERATOR_B.z, 0xffb300);
  }

  private addExplosiveBarrel(x: number, z: number) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.5, 1.35, 18),
      new THREE.MeshStandardMaterial({ color: 0x722318, roughness: 0.42, metalness: 0.72, emissive: 0x240300, emissiveIntensity: 0.35 })
    );
    body.position.y = 0.68;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xffb300, roughness: 0.35, metalness: 0.85 });
    for (const y of [0.2, 0.67, 1.14]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 22), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      group.add(ring);
    }
    const warning = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.26),
      new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    warning.position.set(0, 0.72, 0.49);
    group.add(warning);
    group.position.set(x, 0, z);
    this.scene.add(group);
    group.updateMatrixWorld(true);
    const obstacle: Obstacle = { box: new THREE.Box3().setFromObject(body), mesh: body, active: true };
    const barrel: ExplosiveBarrel = { group, body, health: 70, exploded: false, obstacle };
    body.userData.barrel = barrel;
    this.obstacles.push(obstacle);
    this.explosiveBarrels.push(barrel);
  }

  private addPickup(kind: PickupKind, x: number, z: number) {
    const colors: Record<PickupKind, number> = { health: 0x55ffad, ammo: 0xffc229, armor: 0x59b8ff, overdrive: 0xc467ff };
    const group = new THREE.Group();
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.78, 0.22, 20),
      new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.45, metalness: 0.8 })
    );
    pedestal.position.y = 0.11;
    group.add(pedestal);
    const core = new THREE.Mesh(
      kind === "ammo" ? new THREE.BoxGeometry(0.55, 0.48, 0.34) : new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshStandardMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: 1.7, roughness: 0.25, metalness: 0.3 })
    );
    core.position.y = 0.9;
    core.userData.pickupCore = true;
    group.add(core);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({ color: colors[kind], transparent: true, opacity: 0.75 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.72;
    group.add(halo);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.pickups.push({ kind, group, active: true, respawnAt: 0 });
  }

  private addToxicHazard(x: number, z: number, radius: number) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 40),
      new THREE.MeshStandardMaterial({ color: 0x1ebd67, emissive: 0x0b9a4b, emissiveIntensity: 1.35, transparent: true, opacity: 0.48, roughness: 0.28, metalness: 0.15, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.035, z);
    this.scene.add(mesh);
    this.toxicHazards.push({ mesh, radius });
  }

  private addGenerator(x: number, z: number, accent: number) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 1.7, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.5, metalness: 0.78 })
    );
    base.position.y = 0.85;
    base.castShadow = true;
    group.add(base);
    for (const side of [-1, 1]) {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.09, 10, 28),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.7 })
      );
      coil.rotation.y = Math.PI / 2;
      coil.position.set(side * 0.72, 1.1, 0.92);
      coil.userData.generatorCoil = true;
      group.add(coil);
    }
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 0.46),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.78 })
    );
    screen.position.set(0, 0.92, 0.906);
    group.add(screen);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.generatorProps.push(group);
  }

  private addCover(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: number
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.64 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x8e6b00, transparent: true, opacity: 0.38 })
    );
    mesh.add(edge);
    mesh.updateMatrixWorld(true);
    this.obstacles.push({ box: new THREE.Box3().setFromObject(mesh), mesh, active: true });
    return mesh;
  }

  private addBuilding(x: number, z: number, width: number, height: number, depth: number, color: number, windowColor: number) {
    const building = this.addCover(x, height / 2, z, width, height, depth, color);
    const facadeX = x > 0 ? x - width / 2 - 0.012 : x + width / 2 + 0.012;
    const rotationY = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    const rows = Math.max(2, Math.floor(height / 3));
    const columns = Math.max(2, Math.floor(depth / 3));
    const material = new THREE.MeshBasicMaterial({ color: windowColor, transparent: true, opacity: 0.42 });
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if ((row + column) % 4 === 0) continue;
        const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), material);
        windowMesh.position.set(facadeX, 1.9 + row * 2.55, z - depth / 2 + 1.6 + column * 2.7);
        windowMesh.rotation.y = rotationY;
        this.decorGroup.add(windowMesh);
      }
    }
    const rooftop = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.28, 1.8, depth * 0.32),
      new THREE.MeshStandardMaterial({ color: 0x202832, roughness: 0.7, metalness: 0.55 })
    );
    rooftop.position.set(x, height + 0.9, z);
    rooftop.castShadow = true;
    this.decorGroup.add(rooftop);
    building.userData.kind = "building";
  }

  private addContainerStack(x: number, z: number, color: number, columns: number, levels: number) {
    for (let level = 0; level < levels; level += 1) {
      for (let column = 0; column < columns; column += 1) {
        const offsetX = (column - (columns - 1) / 2) * 4.5;
        const container = this.addCover(x + offsetX, 1.35 + level * 2.75, z, 4.1, 2.6, 7.2, color);
        const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xf7b500, transparent: true, opacity: 0.5 });
        for (const stripeX of [-1.6, -0.8, 0, 0.8, 1.6]) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 7.24), stripeMaterial);
          stripe.position.set(stripeX, 0, 0);
          container.add(stripe);
        }
      }
    }
  }

  private addBarricade(x: number, z: number, rotationY: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    const beam = this.addCover(x, 0.75, z, 5, 1.2, 0.45, 0x343a40);
    beam.rotation.y = rotationY;
    beam.updateMatrixWorld(true);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xffb300 });
    for (let index = -2; index <= 2; index += 1) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.24, 0.47), stripeMaterial);
      stripe.position.set(index * 0.9, 0.75, 0);
      stripe.rotation.z = 0.45;
      group.add(stripe);
    }
    this.decorGroup.add(group);
  }

  private addVehicle(x: number, z: number, rotationY: number, color: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.2, 2.5), new THREE.MeshStandardMaterial({ color, roughness: 0.52, metalness: 0.62 }));
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.4, 2.3), new THREE.MeshStandardMaterial({ color: 0x1b222a, roughness: 0.4, metalness: 0.72 }));
    cabin.position.set(1.25, 2.0, 0);
    cabin.castShadow = true;
    group.add(cabin);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.88, metalness: 0.08 });
    for (const wx of [-1.8, 1.8]) for (const wz of [-1.35, 1.35]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 14), wheelMaterial);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.6, wz);
      group.add(wheel);
    }
    this.scene.add(group);
    const collision = new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 2.8), new THREE.MeshBasicMaterial({ visible: false }));
    collision.position.set(x, 1.4, z);
    collision.rotation.y = rotationY;
    this.scene.add(collision);
    collision.updateMatrixWorld(true);
    this.obstacles.push({ box: new THREE.Box3().setFromObject(collision), mesh: collision, active: true });
  }

  private addStreetLamp(x: number, z: number) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 6.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x242b33, roughness: 0.4, metalness: 0.82 })
    );
    pole.position.set(x, 3.1, z);
    pole.castShadow = true;
    this.decorGroup.add(pole);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.22, 0.45),
      new THREE.MeshBasicMaterial({ color: 0xffc342 })
    );
    lamp.position.set(x, 6.15, z);
    this.decorGroup.add(lamp);
    const light = new THREE.PointLight(0xffb300, 32, 13, 2);
    light.position.set(x, 5.7, z);
    this.scene.add(light);
    this.flickerLights.push(light);
  }

  private addRubble(x: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color: 0x30363c, roughness: 0.9, metalness: 0.14 });
    for (let index = 0; index < 12; index += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.45, 0), material);
      rock.scale.set(1.2 + Math.random(), 0.5 + Math.random() * 0.7, 0.8 + Math.random());
      rock.position.set(x + THREE.MathUtils.randFloatSpread(3.8), 0.18, z + THREE.MathUtils.randFloatSpread(3.8));
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      this.decorGroup.add(rock);
    }
  }

  private addPipeCluster(x: number, z: number) {
    const material = new THREE.MeshStandardMaterial({ color: 0x4b4f53, roughness: 0.42, metalness: 0.78 });
    for (let index = 0; index < 4; index += 1) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6 + index * 0.45, 12), material);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(x, 0.55 + index * 0.66, z + index * 0.45);
      pipe.castShadow = true;
      this.decorGroup.add(pipe);
    }
  }

  private addGateComplex() {
    this.addCover(-12.5, 3.4, 8, 5, 6.8, 4.2, 0x151d26);
    this.addCover(12.5, 3.4, 8, 5, 6.8, 4.2, 0x151d26);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x262f38, roughness: 0.46, metalness: 0.78 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 1.1), frameMaterial);
    top.position.set(0, 6.3, 8);
    top.castShadow = true;
    this.scene.add(top);
    this.adventureGate.position.set(0, 0, 8);
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x1f272f, roughness: 0.5, metalness: 0.82 });
    for (let index = -8; index <= 8; index += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 5.8, 0.32), gateMaterial);
      bar.position.set(index * 1.05, 3, 0);
      bar.castShadow = true;
      this.adventureGate.add(bar);
    }
    this.scene.add(this.adventureGate);
    this.addTerminal(-8.7, 8.4, 0, 0xffbf00);
  }

  private addReactorComplex() {
    this.addCover(0, 1.8, -27, 13, 3.6, 8, 0x121b24);
    this.addCover(-13, 1.3, -28, 5, 2.6, 6, 0x1d2630);
    this.addCover(13, 1.3, -28, 5, 2.6, 6, 0x1d2630);
    this.reactorCore.position.set(0, 4.5, -27);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.75, 1.75, 7.2, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x162831, emissive: 0x04212a, emissiveIntensity: 1.2, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    this.reactorCore.add(shell);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 2),
      new THREE.MeshBasicMaterial({ color: 0x41ffc0, transparent: true, opacity: 0.82 })
    );
    this.reactorCore.add(core);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.65 });
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1 + index * 0.45, 0.05, 8, 48), ringMaterial);
      ring.rotation.x = Math.PI / 2 + index * 0.45;
      this.reactorCore.add(ring);
    }
    this.scene.add(this.reactorCore);
    this.addTerminal(7.1, -22.4, -Math.PI / 2, 0x3dffb0);
  }

  private addTerminal(x: number, z: number, rotationY: number, color: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.42, metalness: 0.78 }));
    base.position.y = 1.1;
    base.castShadow = true;
    group.add(base);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.58), new THREE.MeshBasicMaterial({ color }));
    screen.position.set(0, 1.42, 0.405);
    group.add(screen);
    this.decorGroup.add(group);
  }

  private addDrone(x: number, y: number, z: number, rotation: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotation;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.2), new THREE.MeshStandardMaterial({ color: 0x171d23, roughness: 0.35, metalness: 0.82 }));
    group.add(body);
    const gold = new THREE.MeshStandardMaterial({ color: 0xf7b500, roughness: 0.3, metalness: 0.7 });
    for (const sx of [-1.25, 1.25]) for (const sz of [-0.75, 0.75]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), gold);
      arm.position.set(sx * 0.48, 0, sz * 0.55);
      arm.rotation.y = sz > 0 ? 0.55 : -0.55;
      group.add(arm);
      const rotor = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xb7c4d0 }));
      rotor.position.set(sx, 0.05, sz);
      rotor.rotation.x = Math.PI / 2;
      rotor.userData.rotor = true;
      group.add(rotor);
    }
    const light = new THREE.PointLight(0xffb300, 13, 8, 2);
    light.position.y = -0.3;
    group.add(light);
    this.droneProps.push(group);
    this.decorGroup.add(group);
  }

  private addObjectiveBeacon() {
    this.objectiveBeacon.position.copy(this.objectivePosition);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.08, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.82 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    this.objectiveRing = ring;
    this.objectiveBeacon.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 2.8, 14, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffbd00, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 7;
    this.objectiveBeam = beam;
    this.objectiveBeacon.add(beam);

    const light = new THREE.PointLight(0xffb300, 28, 18, 2);
    light.position.y = 2;
    this.objectiveBeacon.add(light);
    this.scene.add(this.objectiveBeacon);
  }

  private setObjective(position: THREE.Vector3, color = 0xffbf00) {
    this.objectivePosition.copy(position);
    this.objectiveBeacon.position.copy(position);
    const ringMaterial = this.objectiveRing?.material as THREE.MeshBasicMaterial | undefined;
    const beamMaterial = this.objectiveBeam?.material as THREE.MeshBasicMaterial | undefined;
    ringMaterial?.color.set(color);
    beamMaterial?.color.set(color);
  }

  private addBrandBillboard(x: number, y: number, z: number, rotationY: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#080b10";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#f7b500";
    context.lineWidth = 12;
    context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    context.font = "900 82px Arial";
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.fillText("COMEPLAYERS", canvas.width / 2, 112);
    context.fillStyle = "#f7b500";
    context.font = "900 68px Arial";
    context.fillText("STRIKE // OUTBREAK", canvas.width / 2, 204);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    this.scene.add(mesh);
  }

  private addWeapon() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x101419, roughness: 0.28, metalness: 0.9 });
    const black = new THREE.MeshStandardMaterial({ color: 0x06080b, roughness: 0.42, metalness: 0.78 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4b400, roughness: 0.25, metalness: 0.78 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.22, 0.8), dark);
    receiver.position.set(0, 0, -0.12);
    this.weapon.add(receiver);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.72), black);
    upper.position.set(0, 0.13, -0.18);
    this.weapon.add(upper);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 1.05), gold);
    rail.position.set(0, 0.22, -0.31);
    this.weapon.add(rail);
    for (let index = 0; index < 10; index += 1) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.035), black);
      tooth.position.set(0, 0.255, -0.72 + index * 0.095);
      this.weapon.add(tooth);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.72, 12), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.86);
    this.weapon.add(barrel);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.22, 12), black);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.01, -1.31);
    this.weapon.add(muzzleBrake);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.19, 0.54), dark);
    handguard.position.set(0, 0.005, -0.69);
    this.weapon.add(handguard);
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.38), gold);
      vent.position.set(side * 0.105, 0.025, -0.69);
      this.weapon.add(vent);
    }
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.23), black);
    magazine.rotation.x = -0.16;
    magazine.position.set(0, -0.27, -0.14);
    this.weapon.add(magazine);
    const magAccent = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.045, 0.235), gold);
    magAccent.position.set(0, -0.43, -0.19);
    magAccent.rotation.x = -0.16;
    this.weapon.add(magAccent);
    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.15), black);
    pistolGrip.position.set(0, -0.25, 0.13);
    pistolGrip.rotation.x = -0.34;
    this.weapon.add(pistolGrip);
    const foreGrip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.31, 0.1), black);
    foreGrip.position.set(0, -0.23, -0.66);
    foreGrip.rotation.x = 0.12;
    this.weapon.add(foreGrip);
    const stockBeam = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.48), dark);
    stockBeam.position.set(0, 0.015, 0.48);
    this.weapon.add(stockBeam);
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.38, 0.13), black);
    stockPad.position.set(0, 0, 0.76);
    this.weapon.add(stockPad);
    const stockAccent = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), gold);
    stockAccent.position.set(0, -0.145, 0.76);
    this.weapon.add(stockAccent);
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.23), black);
    sightBase.position.set(0, 0.26, -0.16);
    this.weapon.add(sightBase);
    const sightFrame = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 7, 18), gold);
    sightFrame.position.set(0, 0.34, -0.24);
    sightFrame.rotation.x = Math.PI / 2;
    this.weapon.add(sightFrame);
    const sightGlass = new THREE.Mesh(new THREE.CircleGeometry(0.058, 18), new THREE.MeshBasicMaterial({ color: 0xffcb33, transparent: true, opacity: 0.32 }));
    sightGlass.position.set(0, 0.34, -0.241);
    this.weapon.add(sightGlass);

    this.muzzleMesh.rotation.x = -Math.PI / 2;
    this.muzzleMesh.position.set(0, 0.01, -1.57);
    this.weapon.add(this.muzzleMesh);
    this.muzzleFlash.position.set(0, 0.01, -1.48);
    this.weapon.add(this.muzzleFlash);
    this.weapon.position.copy(this.gunBasePosition);
    this.camera.add(this.weapon);
  }

  private createLimb(material: THREE.Material, length: number, radius: number) {
    const pivot = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), material);
    limb.position.y = -length / 2;
    limb.castShadow = true;
    pivot.add(limb);
    return pivot;
  }

  private spawnBot(index: number) {
    const group = new THREE.Group();
    const armorMaterial = new THREE.MeshStandardMaterial({ color: 0x3b1012, roughness: 0.52, metalness: 0.48 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xe64231, emissive: 0x4b0804, emissiveIntensity: 1.1, roughness: 0.45 });

    const leftLeg = this.createLimb(armorMaterial, 0.78, 0.14);
    leftLeg.position.set(-0.22, 0.92, 0);
    group.add(leftLeg);
    const rightLeg = this.createLimb(armorMaterial, 0.78, 0.14);
    rightLeg.position.set(0.22, 0.92, 0);
    group.add(rightLeg);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 0.84, 5, 10), armorMaterial);
    body.position.y = 1.35;
    body.castShadow = true;
    group.add(body);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.42), armorMaterial);
    chest.position.set(0, 1.55, 0.02);
    chest.castShadow = true;
    group.add(chest);

    const leftArm = this.createLimb(armorMaterial, 0.72, 0.12);
    leftArm.position.set(-0.53, 1.72, 0);
    leftArm.rotation.z = -0.12;
    group.add(leftArm);
    const rightArm = this.createLimb(armorMaterial, 0.72, 0.12);
    rightArm.position.set(0.53, 1.72, 0);
    rightArm.rotation.z = 0.12;
    group.add(rightArm);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 12), accentMaterial);
    head.position.y = 2.24;
    head.castShadow = true;
    group.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.36), accentMaterial);
    jaw.position.set(0, 2.05, 0.04);
    group.add(jaw);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.08), new THREE.MeshBasicMaterial({ color: 0xff5b45 }));
    eyes.position.set(0, 2.29, 0.29);
    group.add(eyes);

    const rifle = new THREE.Group();
    const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.88), new THREE.MeshStandardMaterial({ color: 0x121317, roughness: 0.35, metalness: 0.85 }));
    rifle.add(rifleBody);
    const rifleAccent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.55), new THREE.MeshBasicMaterial({ color: 0xf2b400 }));
    rifleAccent.position.y = 0.085;
    rifle.add(rifleAccent);
    rifle.position.set(0.42, 1.45, 0.12);
    rifle.rotation.x = 0.12;
    group.add(rifle);

    const specialParts = new THREE.Group();
    const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x43140e, emissive: 0x2f0500, emissiveIntensity: 0.8, roughness: 0.5 });
    for (let spike = 0; spike < 5; spike += 1) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 7), spikeMaterial);
      cone.position.set((spike - 2) * 0.19, 2.68 - Math.abs(spike - 2) * 0.08, -0.05);
      cone.rotation.z = (spike - 2) * 0.16;
      specialParts.add(cone);
    }
    specialParts.visible = false;
    group.add(specialParts);

    const bot: Bot = {
      id: this.nextBotId++,
      group,
      body,
      head,
      rifle,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      specialParts,
      health: 100,
      maxHealth: 100,
      alive: true,
      speed: 2.4 + Math.random() * 0.8,
      shootCooldown: 0.7 + Math.random(),
      abilityCooldown: 2 + Math.random() * 2,
      nextDecision: 0,
      wanderTarget: new THREE.Vector3(),
      respawnAt: 0,
      enabled: index < 6,
      kind: "soldier",
      enragedUntil: 0,
    };

    body.userData = { bot, hitZone: "body" };
    head.userData = { bot, hitZone: "head" };
    group.position.copy(this.randomBotSpawn(index));
    this.pickBotTarget(bot);
    group.visible = bot.enabled;
    this.bots.push(bot);
    this.scene.add(group);
  }

  private setBotKind(bot: Bot, kind: BotKind, strength = 1) {
    bot.kind = kind;
    bot.specialParts.visible = kind === "boss" || kind === "brute";
    let health = 100;
    let speed = 2.5;
    let scale = 1;
    switch (kind) {
      case "runner":
        health = 72;
        speed = 4.8;
        scale = 0.88;
        break;
      case "crawler":
        health = 58;
        speed = 5.65;
        scale = 0.72;
        break;
      case "brute":
        health = 310;
        speed = 2.05;
        scale = 1.42;
        break;
      case "spitter":
        health = 145;
        speed = 2.65;
        scale = 1.03;
        break;
      case "screamer":
        health = 185;
        speed = 2.45;
        scale = 1.08;
        break;
      case "boss":
        health = this.mode === "zombie-adventure" ? 2600 : 2100;
        speed = 1.8;
        scale = 2.2;
        break;
      case "walker":
        health = 110;
        speed = 2.75;
        break;
      default:
        health = 100;
        speed = 2.4;
    }
    bot.maxHealth = Math.round(health * strength);
    bot.health = bot.maxHealth;
    bot.speed = speed * Math.min(1.35, 0.92 + strength * 0.08);
    bot.group.scale.setScalar(scale);
    bot.shootCooldown = THREE.MathUtils.randFloat(0.65, 1.2);
    bot.abilityCooldown = THREE.MathUtils.randFloat(2.4, 4.8);
    bot.enragedUntil = 0;
    this.configureBotVisuals(bot, bot.id - 1);
  }

  private configureBotVisuals(bot: Bot, index: number) {
    const bodyMaterial = bot.body.material as THREE.MeshStandardMaterial;
    const headMaterial = bot.head.material as THREE.MeshStandardMaterial;
    const zombie = this.isZombieMode() && bot.kind !== "soldier";
    if (!zombie) {
      bodyMaterial.color.set(index % 2 === 0 ? 0x291318 : 0x32151a);
      bodyMaterial.emissive.set(0x050000);
      bodyMaterial.emissiveIntensity = 0.2;
      headMaterial.color.set(this.mode === "bomb-defusal" ? 0xff663d : 0xe64231);
      headMaterial.emissive.set(0x4b0804);
      headMaterial.emissiveIntensity = 1.1;
      bot.rifle.visible = true;
      bot.specialParts.visible = false;
      bot.body.position.y = 1.08;
      bot.head.position.y = 1.95;
      return;
    }

    const palette: Record<Exclude<BotKind, "soldier">, [number, number, number]> = {
      walker: [0x1b3828, 0x5b2b22, 0x0a1a10],
      runner: [0x4b211c, 0x9c3a20, 0x290604],
      crawler: [0x312117, 0xd06c22, 0x371000],
      brute: [0x293b22, 0x694322, 0x13270b],
      spitter: [0x123c3a, 0x2f8c65, 0x003c2d],
      screamer: [0x25143c, 0x9d54ff, 0x26004f],
      boss: [0x381713, 0x9b2619, 0x500800],
    };
    const [bodyColor, headColor, emissive] = palette[bot.kind as Exclude<BotKind, "soldier">];
    bodyMaterial.color.set(bodyColor);
    bodyMaterial.emissive.set(emissive);
    bodyMaterial.emissiveIntensity = bot.kind === "boss" ? 1.15 : 0.6;
    headMaterial.color.set(headColor);
    headMaterial.emissive.set(emissive);
    headMaterial.emissiveIntensity = bot.kind === "spitter" ? 1.8 : bot.kind === "boss" ? 2.1 : 1.25;
    bot.rifle.visible = false;
    bot.specialParts.visible = bot.kind === "boss" || bot.kind === "brute" || bot.kind === "screamer";
    bot.body.position.y = bot.kind === "crawler" ? 0.62 : 1.08;
    bot.head.position.y = bot.kind === "crawler" ? 1.18 : 1.95;
  }

  private randomBotSpawn(index = 0) {
    const spawns = [
      new THREE.Vector3(-25, 0, -36), new THREE.Vector3(-13, 0, -36), new THREE.Vector3(13, 0, -36),
      new THREE.Vector3(25, 0, -36), new THREE.Vector3(-26, 0, -12), new THREE.Vector3(26, 0, -21),
      new THREE.Vector3(-26, 0, 30), new THREE.Vector3(26, 0, 32), new THREE.Vector3(-4, 0, 20),
      new THREE.Vector3(4, 0, 4), new THREE.Vector3(-4, 0, -12), new THREE.Vector3(8, 0, -18),
    ];
    return spawns[index % spawns.length].clone();
  }

  private adventureSpawn(index: number, stage: number) {
    const sets: Record<number, THREE.Vector3[]> = {
      1: [
        new THREE.Vector3(-22, 0, 26), new THREE.Vector3(20, 0, 27), new THREE.Vector3(-15, 0, 18),
        new THREE.Vector3(15, 0, 18), new THREE.Vector3(-26, 0, 34), new THREE.Vector3(26, 0, 35),
        new THREE.Vector3(0, 0, 14), new THREE.Vector3(-9, 0, 33), new THREE.Vector3(10, 0, 32),
      ],
      4: [
        new THREE.Vector3(-25, 0, 2), new THREE.Vector3(25, 0, 1), new THREE.Vector3(-18, 0, -8),
        new THREE.Vector3(18, 0, -9), new THREE.Vector3(-27, 0, -16), new THREE.Vector3(27, 0, -18),
        new THREE.Vector3(-8, 0, -15), new THREE.Vector3(9, 0, -14), new THREE.Vector3(-20, 0, 10),
        new THREE.Vector3(21, 0, 11), new THREE.Vector3(0, 0, -18), new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-4, 0, -4), new THREE.Vector3(5, 0, -5),
      ],
      7: [
        new THREE.Vector3(0, 0, -15), new THREE.Vector3(-25, 0, -32), new THREE.Vector3(25, 0, -32),
        new THREE.Vector3(-23, 0, -18), new THREE.Vector3(23, 0, -18), new THREE.Vector3(-27, 0, -8),
        new THREE.Vector3(27, 0, -8), new THREE.Vector3(0, 0, -10), new THREE.Vector3(-10, 0, -35),
        new THREE.Vector3(12, 0, -34), new THREE.Vector3(-18, 0, -26), new THREE.Vector3(18, 0, -25),
      ],
    };
    const list = sets[stage] ?? sets[1];
    return list[index % list.length].clone();
  }

  private pickBotTarget(bot: Bot) {
    bot.wanderTarget.set(THREE.MathUtils.randFloatSpread(68), 0, THREE.MathUtils.randFloatSpread(68));
    bot.nextDecision = performance.now() + THREE.MathUtils.randFloat(1800, 4200);
  }

  private loop = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.loop);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();

    this.updateEnvironment(delta, now);
    if (this.phase === "playing") {
      this.updatePlayer(delta, now);
      this.updateBots(delta, now);
      this.updateMatch(delta, now);
    } else {
      this.updateMenuCamera(delta);
    }

    this.updateWeapon(delta, now);
    this.drawMinimap();
    this.emitHud(false, now);
    this.renderer.render(this.scene, this.camera);
  };

  private updateEnvironment(delta: number, now: number) {
    if (this.objectiveRing) this.objectiveRing.rotation.z += delta * 0.75;
    if (this.objectiveBeam) {
      const material = this.objectiveBeam.material as THREE.MeshBasicMaterial;
      material.opacity = 0.055 + Math.sin(now * 0.003) * 0.018;
    }
    this.reactorCore.rotation.y += delta * 0.24;
    this.reactorCore.children.forEach((child, index) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.TorusGeometry) child.rotation.z += delta * (0.18 + index * 0.05);
    });
    for (const [index, drone] of this.droneProps.entries()) {
      drone.position.y += Math.sin(now * 0.0014 + index) * delta * 0.16;
      drone.children.forEach((child) => {
        if (child.userData.rotor) child.rotation.z += delta * 13;
      });
    }
    this.flickerLights.forEach((light, index) => {
      light.intensity = 25 + Math.sin(now * 0.004 + index * 1.7) * 6;
    });
    for (const [index, pickup] of this.pickups.entries()) {
      if (!pickup.active && pickup.respawnAt > 0 && now >= pickup.respawnAt && this.isZombieMode()) {
        pickup.active = true;
        pickup.group.visible = true;
      }
      if (!pickup.active) continue;
      pickup.group.rotation.y += delta * (0.75 + index * 0.05);
      pickup.group.position.y = Math.sin(now * 0.0022 + index) * 0.12;
    }
    this.toxicHazards.forEach((hazard, index) => {
      const material = hazard.mesh.material as THREE.MeshStandardMaterial;
      material.opacity = 0.4 + Math.sin(now * 0.003 + index) * 0.1;
      hazard.mesh.rotation.z += delta * (index % 2 ? -0.08 : 0.08);
    });
    this.generatorProps.forEach((generator, index) => {
      generator.children.forEach((child) => {
        if (child.userData.generatorCoil) child.rotation.z += delta * (index % 2 ? -1.3 : 1.3);
      });
    });
    const gateTargetY = this.adventureGateOpen ? 6.4 : 0;
    this.adventureGate.position.y = THREE.MathUtils.lerp(this.adventureGate.position.y, gateTargetY, Math.min(1, delta * 2.2));
  }

  private updateMenuCamera(delta: number) {
    if (this.phase === "paused" || this.phase === "gameover") return;
    const time = performance.now() * 0.00013;
    this.camera.position.x = Math.sin(time) * 5.5;
    this.camera.position.y = 5.2 + Math.sin(time * 2) * 0.28;
    this.camera.position.z = 38;
    this.camera.lookAt(0, 3, -7);
    this.weapon.visible = false;
    this.scene.rotation.y += delta * 0.0035;
  }

  private updatePlayer(delta: number, now: number) {
    this.weapon.visible = true;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.playerHealth <= 0) {
      if ((this.mode === "team-deathmatch" || this.mode === "free-for-all") && now >= this.respawnAt) this.respawnPlayer();
      else if (this.mode === "zombie-adventure" && this.respawnAt > 0 && now >= this.respawnAt) this.respawnAdventureCheckpoint();
      return;
    }

    if (this.reloading && now >= this.reloadFinishAt) {
      const needed = 30 - this.ammo;
      const loaded = Math.min(needed, this.reserveAmmo);
      this.ammo += loaded;
      this.reserveAmmo -= loaded;
      this.reloading = false;
      this.message = "Reload complete";
    }

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const direction = new THREE.Vector3();
    if (this.keys.has("KeyW")) direction.add(forward);
    if (this.keys.has("KeyS")) direction.sub(forward);
    if (this.keys.has("KeyD")) direction.add(right);
    if (this.keys.has("KeyA")) direction.sub(right);
    if (direction.lengthSq() > 0) direction.normalize();

    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const crouching = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    const speedBoost = this.mode === "zombie-adventure" ? 1.06 : 1;
    const speed = (crouching ? 3.4 : sprinting ? 10.2 : 6.5) * speedBoost;
    const move = direction.multiplyScalar(speed * delta);
    this.movePlayerAxis("x", move.x);
    this.movePlayerAxis("z", move.z);

    this.velocityY -= 22 * delta;
    this.playerPosition.y += this.velocityY * delta;
    if (this.playerPosition.y <= PLAYER_HEIGHT) {
      this.playerPosition.y = PLAYER_HEIGHT;
      this.velocityY = 0;
      this.grounded = true;
    }
    const targetHeight = crouching ? 1.18 : PLAYER_HEIGHT;
    this.playerPosition.y = THREE.MathUtils.lerp(this.playerPosition.y, targetHeight, Math.min(1, delta * 12));
    this.camera.position.copy(this.playerPosition);
    this.updatePickupsAndHazards(now);
    if (this.mousePrimary && !this.reloading) this.fire(now);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.mouseSecondary ? 56 : 74, Math.min(1, delta * 10));
    this.camera.updateProjectionMatrix();
  }

  private updatePickupsAndHazards(now: number) {
    if (!this.isZombieMode() || this.playerHealth <= 0) return;
    const flatPlayer = this.playerPosition.clone().setY(0);
    for (const pickup of this.pickups) {
      if (!pickup.active || !pickup.group.visible) continue;
      if (pickup.group.position.distanceTo(flatPlayer) > 1.55) continue;
      pickup.active = false;
      pickup.group.visible = false;
      pickup.respawnAt = now + (this.mode === "zombie" ? 32000 : 48000);
      if (pickup.kind === "health") {
        this.playerHealth = Math.min(100, this.playerHealth + 42);
        this.message = "Medical injector collected · +42 health";
      } else if (pickup.kind === "armor") {
        this.playerArmor = Math.min(150, this.playerArmor + 55);
        this.message = "Reactive armor collected · +55 armor";
      } else if (pickup.kind === "ammo") {
        this.reserveAmmo = Math.min(420, this.reserveAmmo + 105);
        this.ammo = Math.min(30, this.ammo + 12);
        this.message = "Ammunition cache collected";
      } else {
        this.damageBoostUntil = now + 15000;
        this.message = "OVERDRIVE ACTIVE · weapon damage increased for 15s";
      }
      this.playTone(pickup.kind === "overdrive" ? 880 : 620, 0.04, 0.11);
    }

    if (now < this.lastHazardDamageAt) return;
    for (const hazard of this.toxicHazards) {
      if (hazard.mesh.position.distanceTo(flatPlayer) <= hazard.radius) {
        this.lastHazardDamageAt = now + 720;
        this.damagePlayer(7, "Toxic waste is burning through your gear", now, 0.1);
        break;
      }
    }
  }

  private damageBarrel(barrel: ExplosiveBarrel, amount: number, now: number) {
    if (barrel.exploded) return;
    barrel.health -= amount;
    const material = barrel.body.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = Math.min(2.3, material.emissiveIntensity + 0.38);
    this.message = barrel.health > 0 ? "Explosive barrel damaged" : "BARREL DETONATED";
    if (barrel.health <= 0) this.explodeBarrel(barrel, now);
  }

  private explodeBarrel(barrel: ExplosiveBarrel, now: number) {
    if (barrel.exploded) return;
    barrel.exploded = true;
    barrel.obstacle.active = false;
    barrel.group.visible = false;
    const origin = barrel.group.position.clone().setY(0.7);
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xff9d1c, transparent: true, opacity: 0.9, wireframe: true })
    );
    flash.position.copy(origin);
    this.scene.add(flash);
    const light = new THREE.PointLight(0xff6b1a, 140, 18, 2);
    light.position.copy(origin);
    this.scene.add(light);
    const started = performance.now();
    const animate = () => {
      const progress = Math.min(1, (performance.now() - started) / 420);
      flash.scale.setScalar(1 + progress * 9);
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress);
      light.intensity = 140 * (1 - progress);
      if (progress < 1) requestAnimationFrame(animate);
      else {
        this.scene.remove(flash, light);
        flash.geometry.dispose();
        (flash.material as THREE.Material).dispose();
      }
    };
    animate();

    for (const bot of this.bots) {
      if (!bot.enabled || !bot.alive) continue;
      const distance = bot.group.position.distanceTo(origin);
      if (distance > 9) continue;
      const damage = Math.round(330 * (1 - distance / 10));
      bot.health -= Math.max(45, damage);
      if (bot.health <= 0) this.eliminateBot(bot, now, false);
    }
    const playerDistance = this.playerPosition.distanceTo(origin);
    if (playerDistance < 7.5) this.damagePlayer(Math.max(1, Math.round(48 * (1 - playerDistance / 8))), "Caught in an explosive blast", now, 0.16);
    for (const other of this.explosiveBarrels) {
      if (other === barrel || other.exploded || other.group.position.distanceTo(origin) > 4.8) continue;
      window.setTimeout(() => this.explodeBarrel(other, performance.now()), 170);
    }
    this.playTone(58, 0.1, 0.22);
  }

  private movePlayerAxis(axis: "x" | "z", amount: number) {
    if (amount === 0) return;
    const candidate = this.playerPosition.clone();
    candidate[axis] += amount;
    candidate.x = THREE.MathUtils.clamp(candidate.x, -ARENA_LIMIT, ARENA_LIMIT);
    candidate.z = THREE.MathUtils.clamp(candidate.z, -ARENA_LIMIT, ARENA_LIMIT);
    if (!this.collides(candidate)) this.playerPosition[axis] = candidate[axis];
  }

  private collides(position: THREE.Vector3) {
    const minY = position.y - PLAYER_HEIGHT + 0.05;
    const maxY = position.y + 0.1;
    return this.obstacles.some(({ box, active }) => {
      if (!active) return false;
      if (maxY < box.min.y || minY > box.max.y) return false;
      return position.x + PLAYER_RADIUS > box.min.x && position.x - PLAYER_RADIUS < box.max.x && position.z + PLAYER_RADIUS > box.min.z && position.z - PLAYER_RADIUS < box.max.z;
    });
  }

  private updateBots(delta: number, now: number) {
    for (const bot of this.bots) {
      if (!bot.enabled) continue;
      if (!bot.alive) {
        if ((this.mode === "team-deathmatch" || this.mode === "free-for-all") && now >= bot.respawnAt) this.respawnBot(bot);
        continue;
      }
      this.animateBot(bot, delta, now);
      if (this.isZombieMode()) this.updateZombieBot(bot, delta, now);
      else this.updateSoldierBot(bot, delta, now);
    }
  }

  private animateBot(bot: Bot, delta: number, now: number) {
    const movingPhase = Math.sin(now * 0.008 * Math.max(0.7, bot.speed / 3) + bot.id);
    const amplitude = bot.kind === "boss" ? 0.26 : 0.42;
    bot.leftArm.rotation.x = THREE.MathUtils.lerp(bot.leftArm.rotation.x, movingPhase * amplitude, Math.min(1, delta * 8));
    bot.rightArm.rotation.x = THREE.MathUtils.lerp(bot.rightArm.rotation.x, -movingPhase * amplitude, Math.min(1, delta * 8));
    bot.leftLeg.rotation.x = THREE.MathUtils.lerp(bot.leftLeg.rotation.x, -movingPhase * amplitude * 0.8, Math.min(1, delta * 8));
    bot.rightLeg.rotation.x = THREE.MathUtils.lerp(bot.rightLeg.rotation.x, movingPhase * amplitude * 0.8, Math.min(1, delta * 8));
    bot.body.rotation.z = Math.sin(now * 0.004 + bot.id) * (bot.kind === "runner" ? 0.08 : 0.035);
  }

  private updateZombieBot(bot: Bot, delta: number, now: number) {
    const toPlayer = this.playerPosition.clone().sub(bot.group.position).setY(0);
    const distance = toPlayer.length();
    if (toPlayer.lengthSq() > 0.01) {
      const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
      bot.group.rotation.y = THREE.MathUtils.lerp(bot.group.rotation.y, targetYaw, Math.min(1, delta * (bot.kind === "runner" || bot.kind === "crawler" ? 10 : 6)));
    }

    bot.shootCooldown -= delta;
    bot.abilityCooldown -= delta;
    if (bot.kind === "boss") this.updateBossPhase(bot, now);

    if (bot.kind === "screamer" && bot.abilityCooldown <= 0 && distance < 17) {
      bot.abilityCooldown = THREE.MathUtils.randFloat(5.4, 7.2);
      this.botScream(bot, distance, now);
      return;
    }

    if (bot.kind === "spitter" && distance > 4.3 && distance < 18 && this.hasLineOfSight(bot)) {
      if (bot.shootCooldown <= 0) {
        bot.shootCooldown = THREE.MathUtils.randFloat(2.0, 3.2);
        this.botSpit(bot, distance, now);
      }
      if (distance > 10 && toPlayer.lengthSq() > 0.01) this.moveBot(bot, toPlayer.normalize().multiplyScalar(bot.speed * delta * 0.42));
      return;
    }

    if (bot.kind === "boss") {
      if (this.bossPhase >= 2 && distance > 8 && distance < 25 && bot.shootCooldown <= 0 && this.hasLineOfSight(bot)) {
        bot.shootCooldown = this.bossPhase >= 3 ? 1.65 : 2.25;
        this.bossVolley(bot, distance, now);
      }
      if (bot.abilityCooldown <= 0 && distance < 14.5) {
        bot.abilityCooldown = this.bossPhase >= 3 ? 3.2 : THREE.MathUtils.randFloat(4.2, 5.8);
        this.bossSlam(bot, distance, now);
      }
    }

    const meleeRange = bot.kind === "boss" ? 2.9 : bot.kind === "brute" ? 2.15 : bot.kind === "crawler" ? 1.35 : 1.85;
    if (distance > meleeRange && toPlayer.lengthSq() > 0.01) {
      const chargeMultiplier = (bot.kind === "runner" || bot.kind === "crawler") && distance > 8 ? 1.16 : 1;
      const enrageMultiplier = now < bot.enragedUntil ? 1.32 : 1;
      this.moveBot(bot, toPlayer.normalize().multiplyScalar(bot.speed * chargeMultiplier * enrageMultiplier * delta));
    }
    if (distance <= meleeRange && bot.shootCooldown <= 0) {
      bot.shootCooldown = bot.kind === "boss" ? 1.25 : bot.kind === "brute" ? 1.05 : bot.kind === "crawler" ? 0.58 : THREE.MathUtils.randFloat(0.7, 1.05);
      this.botMelee(bot, now);
    }
  }

  private updateBossPhase(bot: Bot, now: number) {
    const ratio = bot.maxHealth > 0 ? bot.health / bot.maxHealth : 0;
    const nextPhase = ratio <= 0.33 ? 3 : ratio <= 0.68 ? 2 : 1;
    if (nextPhase !== this.bossPhase) {
      this.bossPhase = nextPhase;
      if (nextPhase === 2) {
        bot.speed = 2.25;
        this.message = "BOSS PHASE 2 · armor ruptured, swarm incoming";
        this.summonBossMinions(4, now);
        this.bossSummonAt = now + 9000;
      } else if (nextPhase === 3) {
        bot.speed = 2.72;
        bot.enragedUntil = Number.POSITIVE_INFINITY;
        this.message = "BOSS PHASE 3 · COLOSSUS ENRAGED";
        this.summonBossMinions(6, now);
        this.bossSummonAt = now + 6500;
      }
      this.playTone(nextPhase === 3 ? 44 : 58, 0.14, 0.24);
    }
    if (this.bossPhase >= 2 && now >= this.bossSummonAt) {
      this.summonBossMinions(this.bossPhase === 3 ? 3 : 2, now);
      this.bossSummonAt = now + (this.bossPhase === 3 ? 7600 : 10500);
    }
  }

  private summonBossMinions(count: number, now: number) {
    if (!this.boss?.alive) return;
    const candidates = this.bots.filter((bot) => bot !== this.boss && (!bot.enabled || !bot.alive)).slice(0, count);
    candidates.forEach((bot, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, candidates.length) + now * 0.0004;
      const position = this.boss!.group.position.clone().add(new THREE.Vector3(Math.cos(angle) * 5.5, 0, Math.sin(angle) * 5.5));
      const kind: BotKind = index % 4 === 3 ? "screamer" : index % 2 === 0 ? "crawler" : "runner";
      this.activateZombie(bot, kind, 1.16 + this.bossPhase * 0.08, position);
    });
    if (candidates.length > 0) this.message = `Colossus summoned ${candidates.length} infected reinforcements`;
  }

  private botScream(bot: Bot, distance: number, now: number) {
    const ringGeometry = new THREE.RingGeometry(0.7, 0.95, 42);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xb365ff, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(bot.group.position).setY(0.18);
    this.scene.add(ring);
    const started = performance.now();
    const animate = () => {
      const progress = Math.min(1, (performance.now() - started) / 620);
      ring.scale.setScalar(1 + progress * 9);
      ringMaterial.opacity = 0.82 * (1 - progress);
      if (progress < 1) requestAnimationFrame(animate);
      else {
        this.scene.remove(ring);
        ringGeometry.dispose();
        ringMaterial.dispose();
      }
    };
    animate();
    this.bots.forEach((ally) => {
      if (ally.enabled && ally.alive && ally !== bot && ally.group.position.distanceTo(bot.group.position) < 13) ally.enragedUntil = now + 6500;
    });
    if (distance < 10.5) this.damagePlayer(THREE.MathUtils.randInt(9, 15), "Screamer pulse disrupted your armor", now, 0.12);
    this.message = "SCREAMER PULSE · nearby infected enraged";
    this.playTone(155, 0.08, 0.14);
  }

  private bossVolley(bot: Bot, distance: number, now: number) {
    const accuracy = THREE.MathUtils.clamp(0.92 - distance / 42, 0.48, 0.76);
    this.createEnemyTracer(bot, this.bossPhase >= 3 ? 0xff2f22 : 0xff8a22);
    if (Math.random() <= accuracy) this.damagePlayer(THREE.MathUtils.randInt(this.bossPhase >= 3 ? 18 : 13, this.bossPhase >= 3 ? 27 : 21), "Colossus launched a bio-plasma volley", now, 0.15);
    this.message = "BOSS VOLLEY · strafe behind solid cover";
  }

  private updateSoldierBot(bot: Bot, delta: number, now: number) {
    const toPlayer = this.playerPosition.clone().sub(bot.group.position);
    const distance = toPlayer.length();
    const seesPlayer = this.playerHealth > 0 && distance < 34 && this.hasLineOfSight(bot);
    const rushingObjective = this.mode === "bomb-defusal" && this.bombState === "planted";
    const objectiveDirection = this.objectivePosition.clone().sub(bot.group.position).setY(0);
    if (seesPlayer) {
      const flat = toPlayer.clone().setY(0);
      if (flat.lengthSq() > 0.01) {
        const targetYaw = Math.atan2(flat.x, flat.z);
        bot.group.rotation.y = THREE.MathUtils.lerp(bot.group.rotation.y, targetYaw, Math.min(1, delta * 6));
      }
      if (rushingObjective && objectiveDirection.length() > 2.2) this.moveBot(bot, objectiveDirection.normalize().multiplyScalar(bot.speed * delta * 1.08));
      else if (distance > 9) this.moveBot(bot, flat.normalize().multiplyScalar(bot.speed * delta));
      else if (distance < 5.5) this.moveBot(bot, flat.normalize().multiplyScalar(-bot.speed * delta * 0.55));
      bot.shootCooldown -= delta;
      if (bot.shootCooldown <= 0 && distance < 28) {
        bot.shootCooldown = THREE.MathUtils.randFloat(0.8, 1.55);
        this.botShoot(bot, distance, now);
      }
    } else if (rushingObjective) {
      if (objectiveDirection.lengthSq() > 0.01 && objectiveDirection.length() > 1.7) {
        objectiveDirection.normalize();
        bot.group.rotation.y = THREE.MathUtils.lerp(bot.group.rotation.y, Math.atan2(objectiveDirection.x, objectiveDirection.z), Math.min(1, delta * 5));
        this.moveBot(bot, objectiveDirection.multiplyScalar(bot.speed * delta));
      }
    } else {
      if (now >= bot.nextDecision || bot.group.position.distanceTo(bot.wanderTarget) < 1.4) this.pickBotTarget(bot);
      const direction = bot.wanderTarget.clone().sub(bot.group.position).setY(0);
      if (direction.lengthSq() > 0.01) {
        direction.normalize();
        bot.group.rotation.y = THREE.MathUtils.lerp(bot.group.rotation.y, Math.atan2(direction.x, direction.z), Math.min(1, delta * 3));
        this.moveBot(bot, direction.multiplyScalar(bot.speed * delta * 0.65));
      }
    }
  }

  private botMelee(bot: Bot, now: number) {
    const base = bot.kind === "boss" ? 28 : bot.kind === "brute" ? 20 : bot.kind === "runner" ? 13 : bot.kind === "crawler" ? 8 : bot.kind === "screamer" ? 10 : 11;
    const variance = bot.kind === "boss" ? 10 : 6;
    this.damagePlayer(THREE.MathUtils.randInt(base, base + variance + this.wave), `${this.zombieName(bot)} struck you`, now, 0.3);
  }

  private botSpit(bot: Bot, distance: number, now: number) {
    const accuracy = THREE.MathUtils.clamp(0.86 - distance / 38, 0.48, 0.78);
    this.createEnemyTracer(bot, 0x54ff9a);
    if (Math.random() <= accuracy) this.damagePlayer(THREE.MathUtils.randInt(11, 18), "Toxic spitter hit you", now, 0.2);
  }

  private bossSlam(bot: Bot, distance: number, now: number) {
    const ringGeometry = new THREE.RingGeometry(0.7, 1.1, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xff4f1f, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(bot.group.position).setY(0.08);
    this.scene.add(ring);
    const started = performance.now();
    const animate = () => {
      const progress = Math.min(1, (performance.now() - started) / 520);
      ring.scale.setScalar(1 + progress * 11);
      ringMaterial.opacity = 0.8 * (1 - progress);
      if (progress < 1) requestAnimationFrame(animate);
      else {
        this.scene.remove(ring);
        ringGeometry.dispose();
        ringMaterial.dispose();
      }
    };
    animate();
    const slamRadius = this.bossPhase >= 3 ? 13 : this.bossPhase === 2 ? 11.5 : 10.5;
    if (distance < slamRadius) this.damagePlayer(THREE.MathUtils.randInt(this.bossPhase >= 3 ? 25 : 18, this.bossPhase >= 3 ? 36 : 28), "The Colossus released a shockwave", now, 0.18);
    this.message = "BOSS ATTACK — move away from the shockwave";
    this.playTone(52, 0.12, 0.16);
  }

  private zombieName(bot: Bot) {
    switch (bot.kind) {
      case "runner": return "Runner";
      case "crawler": return "Crawler";
      case "brute": return "Brute";
      case "spitter": return "Spitter";
      case "screamer": return "Screamer";
      case "boss": return "Outbreak Colossus";
      default: return "Infected";
    }
  }

  private damagePlayer(rawDamage: number, message: string, now: number, armorRatio = 0.4) {
    if (this.playerHealth <= 0 || this.phase !== "playing") return;
    let remainingDamage = rawDamage;
    if (this.playerArmor > 0) {
      const absorbed = Math.min(this.playerArmor, Math.ceil(rawDamage * armorRatio));
      this.playerArmor -= absorbed;
      remainingDamage -= absorbed;
    }
    this.playerHealth = Math.max(0, this.playerHealth - remainingDamage);
    this.damageFlashUntil = now + 165;
    this.message = message;
    this.playTone(82, 0.08, 0.06);
    if (this.playerHealth <= 0) {
      this.deaths += 1;
      this.mousePrimary = false;
      if (this.mode === "bomb-defusal") this.finishMatch("defeat", this.bombState === "planted" ? "Defenders eliminated the carrier" : "Bomb carrier eliminated");
      else if (this.mode === "zombie-adventure" && this.reviveTokens > 0) {
        this.reviveTokens -= 1;
        this.respawnAt = now + 2200;
        this.message = `DOWNED · checkpoint revive in 2 seconds · ${this.reviveTokens} revive remaining`;
      } else if (this.isZombieMode()) this.finishMatch("defeat", this.mode === "zombie-adventure" ? `Mission failed during chapter ${this.adventureStage}` : `Overrun during wave ${this.wave}`);
      else {
        this.enemiesScore += 1;
        this.respawnAt = now + 2200;
        this.message = "Eliminated — respawning";
      }
    }
  }

  private moveBot(bot: Bot, movement: THREE.Vector3) {
    const candidate = bot.group.position.clone().add(movement);
    candidate.x = THREE.MathUtils.clamp(candidate.x, -39.5, 39.5);
    candidate.z = THREE.MathUtils.clamp(candidate.z, -39.5, 39.5);
    const radius = bot.kind === "boss" ? 1.05 : bot.kind === "brute" ? 0.72 : bot.kind === "crawler" ? 0.4 : 0.52;
    const blocked = this.botPositionBlocked(candidate, radius);
    if (!blocked) {
      bot.group.position.copy(candidate);
      return;
    }
    const side = new THREE.Vector3(-movement.z, 0, movement.x).normalize().multiplyScalar(movement.length() * (bot.id % 2 ? 1 : -1));
    const alternate = bot.group.position.clone().add(side);
    if (!this.botPositionBlocked(alternate, radius)) bot.group.position.copy(alternate);
    else this.pickBotTarget(bot);
  }

  private botPositionBlocked(candidate: THREE.Vector3, radius: number) {
    return this.obstacles.some(({ box, active }) => {
      if (!active) return false;
      if (box.max.y < 0.1 || box.min.y > 4.8) return false;
      return candidate.x + radius > box.min.x && candidate.x - radius < box.max.x && candidate.z + radius > box.min.z && candidate.z - radius < box.max.z;
    });
  }

  private hasLineOfSight(bot: Bot) {
    const origin = bot.group.position.clone().add(new THREE.Vector3(0, bot.kind === "boss" ? 3.2 : 1.65, 0));
    const target = this.playerPosition.clone();
    const direction = target.sub(origin);
    const distance = direction.length();
    direction.normalize();
    this.raycaster.set(origin, direction);
    this.raycaster.far = distance;
    return this.raycaster.intersectObjects(this.obstacles.filter((item) => item.active).map((item) => item.mesh), false).length === 0;
  }

  private botShoot(bot: Bot, distance: number, now: number) {
    const accuracy = THREE.MathUtils.clamp(0.79 - distance / 58, 0.25, 0.7);
    this.createEnemyTracer(bot, 0xff4d32);
    if (Math.random() > accuracy) return;
    this.damagePlayer(THREE.MathUtils.randInt(7, 14), `Enemy ${bot.id} hit you`, now, 0.45);
  }

  private createEnemyTracer(bot: Bot, color: number) {
    const start = bot.group.position.clone().add(new THREE.Vector3(0, bot.kind === "boss" ? 3 : 1.55, 0));
    const end = this.playerPosition.clone();
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    window.setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 90);
  }

  private updateMatch(delta: number, now: number) {
    if (this.combo > 0 && now >= this.comboExpiresAt) this.combo = 0;
    if (this.mode === "bomb-defusal") this.updateBombMode(delta);
    else if (this.mode === "zombie") this.updateZombieSurvival(delta, now);
    else if (this.mode === "zombie-adventure") this.updateZombieAdventure(delta, now);
    else this.updateStandardModes(delta, now);
    if (now < this.hitMarkerUntil || now < this.damageFlashUntil) this.emitHud(true, now);
  }

  private updateBombMode(delta: number) {
    const distance = this.playerPosition.distanceTo(this.objectivePosition.clone().setY(PLAYER_HEIGHT));
    if (this.bombState === "idle" || this.bombState === "planting") {
      this.timerSeconds = Math.max(0, this.timerSeconds - delta);
      const planting = this.keys.has("KeyE") && distance <= 4.5 && this.playerHealth > 0;
      if (planting) {
        this.bombState = "planting";
        this.bombProgress = Math.min(100, this.bombProgress + (delta / 3.2) * 100);
        this.message = `Planting charge ${Math.floor(this.bombProgress)}%`;
        if (this.bombProgress >= 100) {
          this.bombState = "planted";
          this.bombTimer = 35;
          this.bombDefuseProgress = 0;
          this.alliesScore = 1;
          this.message = "Bomb planted — defend Point A";
          this.playTone(540, 0.09, 0.12);
        }
      } else if (this.bombState === "planting") {
        this.bombProgress = Math.max(0, this.bombProgress - delta * 22);
        if (this.bombProgress <= 0) this.bombState = "idle";
        this.message = distance <= 4.5 ? "Hold E to plant the bomb" : "Reach Point A and plant the bomb";
      } else this.message = distance <= 4.5 ? "Hold E to plant the bomb" : "Reach Point A and plant the bomb";
      if (this.timerSeconds <= 0) this.finishMatch("defeat", "Round timer expired before the bomb was planted");
      return;
    }

    if (this.bombState === "planted") {
      this.bombTimer = Math.max(0, this.bombTimer - delta);
      this.timerSeconds = this.bombTimer;
      const defusers = this.bots.filter((bot) => bot.enabled && bot.alive && bot.group.position.distanceTo(this.objectivePosition) < 2.5).length;
      if (defusers > 0) {
        this.bombDefuseProgress = Math.min(100, this.bombDefuseProgress + delta * 15 * Math.min(1.7, defusers));
        this.bombProgress = this.bombDefuseProgress;
        this.message = `Enemy defusing ${Math.floor(this.bombDefuseProgress)}%`;
        if (this.bombDefuseProgress >= 100) {
          this.bombState = "defused";
          this.enemiesScore = 1;
          this.finishMatch("defeat", "Bomb defused by the defenders");
        }
      } else {
        this.bombDefuseProgress = Math.max(0, this.bombDefuseProgress - delta * 8);
        this.bombProgress = 100 - (this.bombTimer / 35) * 100;
        this.message = `Bomb armed — ${Math.ceil(this.bombTimer)}s to detonation`;
      }
      if (this.bombTimer <= 0 && this.bombState === "planted") {
        this.bombState = "exploded";
        this.alliesScore = 1;
        this.finishMatch("victory", "Target destroyed — bomb detonated");
      }
    }
  }

  private updateZombieSurvival(delta: number, now: number) {
    this.timerSeconds = Math.max(0, this.timerSeconds - delta);
    this.alliesScore = this.kills;
    this.enemiesScore = this.wave;
    const remaining = this.bots.filter((bot) => bot.enabled && bot.alive).length;
    const bossAlive = this.boss?.alive;
    this.message = bossAlive ? `Boss wave ${this.wave} · defeat the ${this.zombieName(this.boss!)}` : remaining > 0 ? `Wave ${this.wave} · ${remaining} infected remaining` : `Wave ${this.wave} cleared`;

    if (remaining === 0 && this.wavePendingAt === 0) {
      if (this.wave >= SURVIVAL_WAVES) this.finishMatch("victory", "Outbreak contained — final boss eliminated");
      else {
        this.wavePendingAt = now + 2800;
        this.message = `Wave ${this.wave} cleared — resupply incoming`;
      }
    }
    if (this.wavePendingAt > 0 && now >= this.wavePendingAt && this.phase === "playing") {
      this.wave += 1;
      this.wavePendingAt = 0;
      this.playerHealth = Math.min(100, this.playerHealth + 30);
      this.playerArmor = Math.min(125, this.playerArmor + 24);
      this.reserveAmmo = Math.min(360, this.reserveAmmo + 60);
      this.deploySurvivalWave(this.wave);
      this.message = this.wave === SURVIVAL_WAVES ? "FINAL WAVE — the Outbreak Colossus has arrived" : `Wave ${this.wave} incoming`;
      this.playTone(330 + this.wave * 38, 0.08, 0.12);
    }
    if (this.timerSeconds <= 0 && this.phase === "playing") this.finishMatch("victory", "Extraction window reached — you survived the outbreak");
  }

  private updateZombieAdventure(delta: number, now: number) {
    this.timerSeconds = Math.max(0, this.timerSeconds - delta);
    this.alliesScore = this.kills;
    this.enemiesScore = this.adventureStage;
    const remaining = this.bots.filter((bot) => bot.enabled && bot.alive).length;
    const distance = this.playerPosition.distanceTo(this.objectivePosition.clone().setY(PLAYER_HEIGHT));

    if (this.adventureStage === 1) {
      this.adventureObjective = "Secure the arrival yard";
      this.message = remaining > 0 ? `Arrival Yard · ${remaining} infected remaining` : "Arrival Yard secured";
      if (remaining === 0) this.beginAdventureStage(2);
    } else if (this.adventureStage === 2) {
      this.adventureObjective = "Recover the quarantine access key";
      this.updateAdventureInteraction(delta, distance, "Hold E to open the emergency supply cache", "Supply cache", () => {
        this.reviveTokens = Math.min(2, this.reviveTokens + 1);
        this.playerHealth = 100;
        this.playerArmor = Math.min(150, this.playerArmor + 45);
        this.reserveAmmo = Math.min(420, this.reserveAmmo + 120);
        this.beginAdventureStage(3);
      });
    } else if (this.adventureStage === 3) {
      this.adventureObjective = "Override the quarantine gate";
      this.updateAdventureInteraction(delta, distance, "Hold E to override the quarantine gate", "Gate override", () => this.beginAdventureStage(4));
    } else if (this.adventureStage === 4) {
      this.adventureObjective = "Clear the quarantine corridor";
      this.message = remaining > 0 ? `Quarantine Corridor · ${remaining} mutations remaining` : "Quarantine corridor secure";
      if (remaining === 0) this.beginAdventureStage(5);
    } else if (this.adventureStage === 5) {
      this.adventureObjective = this.adventureSubObjective === 0 ? "Restart generator Alpha" : "Restart generator Bravo";
      const generatorName = this.adventureSubObjective === 0 ? "Generator Alpha" : "Generator Bravo";
      this.updateAdventureInteraction(delta, distance, `Hold E to restart ${generatorName}`, generatorName, () => {
        if (this.adventureSubObjective === 0) {
          this.adventureSubObjective = 1;
          this.adventureProgress = 0;
          this.setObjective(GENERATOR_B, 0x59b8ff);
          this.message = "Generator Alpha online · proceed to Generator Bravo";
          this.playTone(690, 0.05, 0.12);
        } else this.beginAdventureStage(6);
      });
    } else if (this.adventureStage === 6) {
      if (this.adventureSubObjective === 0) {
        this.adventureObjective = "Eliminate the reactor guardians";
        this.message = remaining > 0 ? `Reactor guardians · ${remaining} remaining` : "Reactor guardians eliminated";
        if (remaining === 0) {
          this.adventureSubObjective = 1;
          this.setObjective(REACTOR_OBJECTIVE, 0x49ffb0);
          this.message = "Reactor access clear · begin purge sequence";
        }
      } else {
        this.adventureObjective = "Activate the reactor purge";
        this.updateAdventureInteraction(delta, distance, "Hold E to start the reactor purge", "Reactor purge", () => this.beginAdventureStage(7));
      }
    } else if (this.adventureSubObjective === 0) {
      this.adventureObjective = "Defeat the Outbreak Colossus";
      const bossAlive = this.boss?.alive;
      this.message = bossAlive ? `BOSS PHASE ${Math.max(1, this.bossPhase)} · ${Math.ceil(this.boss!.health)} HP` : remaining > 0 ? `Colossus eliminated · clear ${remaining} remaining mutations` : "Containment core stabilized";
      if (remaining === 0) {
        this.adventureSubObjective = 1;
        this.adventureProgress = 0;
        this.setObjective(EXTRACTION_OBJECTIVE, 0xffd34a);
        this.adventureObjective = "Reach the extraction beacon";
        this.message = "BOSS DEFEATED · reach extraction";
        this.playTone(920, 0.05, 0.18);
      }
    } else {
      this.adventureObjective = "Extract from the reactor district";
      this.updateAdventureInteraction(delta, distance, "Hold E to call the extraction shuttle", "Extraction uplink", () => this.finishMatch("victory", "Adventure complete — reactor district reclaimed"));
    }

    if (this.timerSeconds <= 0 && this.phase === "playing") this.finishMatch("defeat", "Mission timer expired before containment was restored");
    if (now < this.damageFlashUntil) this.emitHud(true, now);
  }

  private updateAdventureInteraction(delta: number, distance: number, prompt: string, label: string, onComplete: () => void) {
    const interacting = this.keys.has("KeyE") && distance <= 3.8 && this.playerHealth > 0;
    if (interacting) {
      this.adventureProgress = Math.min(100, this.adventureProgress + (delta / 4.1) * 100);
      this.message = `${label} ${Math.floor(this.adventureProgress)}%`;
      if (this.adventureProgress >= 100) onComplete();
    } else {
      this.adventureProgress = Math.max(0, this.adventureProgress - delta * 11);
      this.message = distance <= 3.8 ? prompt : `${prompt} · ${Math.ceil(distance)}m`;
    }
  }

  private updateStandardModes(delta: number, now: number) {
    this.timerSeconds = Math.max(0, this.timerSeconds - delta);
    if (this.mode === "free-for-all" && now >= this.rivalTickAt && this.phase === "playing") {
      this.rivalTickAt = now + THREE.MathUtils.randFloat(4200, 7200);
      if (Math.random() > 0.24) this.enemiesScore += 1;
      if (this.enemiesScore >= this.targetScore) this.finishMatch("defeat", "A rival reached the elimination target first");
    }
    if (this.alliesScore >= this.targetScore) this.finishMatch("victory", this.mode === "free-for-all" ? "You reached the elimination target" : "Enemy score limit reached");
    else if (this.timerSeconds <= 0) {
      const victory = this.alliesScore >= this.enemiesScore;
      this.finishMatch(victory ? "victory" : "defeat", victory ? "Time expired — score advantage secured" : "Time expired — enemy score advantage");
    }
  }

  private deploySurvivalWave(wave: number) {
    this.disableAllBots();
    const count = Math.min(MAX_BOTS, 6 + wave * 2);
    this.activeBotCount = count;
    this.boss = null;
    this.bossPhase = 0;
    this.bossSummonAt = 0;
    for (let index = 0; index < count; index += 1) {
      const bot = this.bots[index];
      let kind: BotKind = "walker";
      if (wave === SURVIVAL_WAVES && index === 0) kind = "boss";
      else if (wave >= 5 && index % 9 === 0) kind = "screamer";
      else if (wave >= 4 && index === 0 && wave % 4 === 0) kind = "brute";
      else if (wave >= 3 && index % 7 === 0) kind = "spitter";
      else if (wave >= 2 && index % 4 === 2) kind = "crawler";
      else if (index % 3 === 1) kind = "runner";
      else if (wave >= 5 && index % 5 === 0) kind = "brute";
      this.activateZombie(bot, kind, 1 + wave * 0.095, this.randomBotSpawn(index));
      if (kind === "boss") this.boss = bot;
    }
  }

  private beginAdventureStage(stage: number) {
    this.adventureStage = stage;
    this.adventureProgress = 0;
    this.adventureSubObjective = 0;
    this.disableAllBots();
    this.boss = null;
    this.bossPhase = 0;
    this.bossSummonAt = 0;

    if (stage === 1) {
      this.adventureGateOpen = false;
      this.checkpointSpawn.set(0, PLAYER_HEIGHT, 34);
      this.setObjective(new THREE.Vector3(0, 0, 20), 0xffbf00);
      this.deployAdventureEnemies(1, 9);
      this.adventureObjective = "Secure the arrival yard";
      this.message = "CHAPTER 1 · secure the arrival yard";
    } else if (stage === 2) {
      this.checkpointSpawn.set(-10, PLAYER_HEIGHT, 29);
      this.setObjective(SUPPLY_OBJECTIVE, 0xffd34a);
      this.adventureObjective = "Recover the quarantine access key";
      this.message = "CHAPTER 2 · locate the emergency supply cache";
    } else if (stage === 3) {
      this.checkpointSpawn.set(0, PLAYER_HEIGHT, 14);
      this.setObjective(GATE_OBJECTIVE, 0xffbf00);
      this.adventureObjective = "Override the quarantine gate";
      this.message = "CHAPTER 3 · use the access key at the gate terminal";
    } else if (stage === 4) {
      this.adventureGateOpen = true;
      this.checkpointSpawn.set(0, PLAYER_HEIGHT, 5);
      this.setObjective(new THREE.Vector3(0, 0, -9), 0x49ffb0);
      this.deployAdventureEnemies(4, 14);
      this.adventureObjective = "Clear the quarantine corridor";
      this.message = "CHAPTER 4 · crawler and screamer mutations detected";
      this.playerHealth = Math.min(100, this.playerHealth + 30);
      this.playerArmor = Math.min(150, this.playerArmor + 30);
      this.reserveAmmo = Math.min(420, this.reserveAmmo + 90);
    } else if (stage === 5) {
      this.checkpointSpawn.set(0, PLAYER_HEIGHT, -8);
      this.setObjective(GENERATOR_A, 0x59b8ff);
      this.adventureObjective = "Restart generator Alpha";
      this.message = "CHAPTER 5 · restore power to both generator nodes";
    } else if (stage === 6) {
      this.checkpointSpawn.set(4, PLAYER_HEIGHT, -16);
      this.setObjective(REACTOR_OBJECTIVE, 0x49ffb0);
      this.deployAdventureEnemies(6, 10);
      this.adventureObjective = "Eliminate the reactor guardians";
      this.message = "CHAPTER 6 · purge chamber guarded by elite mutations";
      this.playerHealth = Math.min(100, this.playerHealth + 25);
      this.playerArmor = Math.min(150, this.playerArmor + 25);
      this.reserveAmmo = Math.min(420, this.reserveAmmo + 75);
    } else {
      this.checkpointSpawn.set(5, PLAYER_HEIGHT, -17);
      this.setObjective(REACTOR_OBJECTIVE, 0xff4b20);
      this.deployAdventureEnemies(7, 12);
      this.adventureObjective = "Defeat the Outbreak Colossus";
      this.message = "FINAL CHAPTER · multi-phase boss mutation detected";
      this.playerHealth = 100;
      this.playerArmor = Math.min(150, this.playerArmor + 55);
      this.reserveAmmo = Math.min(420, this.reserveAmmo + 135);
      this.damageBoostUntil = performance.now() + 10000;
      this.playTone(48, 0.14, 0.22);
    }
    this.emitHud(true);
  }

  private deployAdventureEnemies(stage: number, count: number) {
    this.activeBotCount = Math.min(count, MAX_BOTS);
    for (let index = 0; index < this.activeBotCount; index += 1) {
      const bot = this.bots[index];
      let kind: BotKind = "walker";
      if (stage === 7 && index === 0) kind = "boss";
      else if (stage >= 6 && index % 8 === 0) kind = "screamer";
      else if (stage >= 4 && index % 6 === 0) kind = "brute";
      else if (stage >= 4 && index % 5 === 0) kind = "spitter";
      else if (stage >= 4 && index % 4 === 2) kind = "crawler";
      else if (index % 3 === 1) kind = "runner";
      this.activateZombie(bot, kind, stage === 7 ? 1.24 : 1 + stage * 0.075, this.adventureSpawn(index, stage));
      if (kind === "boss") this.boss = bot;
    }
  }

  private activateZombie(bot: Bot, kind: BotKind, strength: number, position: THREE.Vector3) {
    bot.enabled = true;
    bot.alive = true;
    bot.group.visible = true;
    bot.group.position.copy(position);
    bot.respawnAt = Number.POSITIVE_INFINITY;
    this.setBotKind(bot, kind, strength);
    this.pickBotTarget(bot);
  }

  private disableAllBots() {
    for (const bot of this.bots) {
      bot.enabled = false;
      bot.alive = false;
      bot.group.visible = false;
      bot.respawnAt = Number.POSITIVE_INFINITY;
    }
  }

  private updateWeapon(delta: number, now: number) {
    const moving = this.phase === "playing" && [...this.keys].some((key) => ["KeyW", "KeyA", "KeyS", "KeyD"].includes(key));
    const time = performance.now() * 0.012;
    const bob = moving ? Math.sin(time) * 0.012 : 0;
    const sway = moving ? Math.cos(time * 0.5) * 0.014 : 0;
    const aimingOffset = this.mouseSecondary ? new THREE.Vector3(-0.34, 0.18, 0.13) : new THREE.Vector3();
    const target = this.gunBasePosition.clone().add(aimingOffset).add(new THREE.Vector3(sway, bob, 0));
    this.weapon.position.lerp(target, Math.min(1, delta * 12));
    this.weapon.rotation.z = THREE.MathUtils.lerp(this.weapon.rotation.z, moving ? sway * 0.7 : 0, Math.min(1, delta * 9));
    const flashVisible = now - this.lastShotAt < 45;
    this.muzzleFlash.intensity = flashVisible ? 18 : 0;
    (this.muzzleMesh.material as THREE.MeshBasicMaterial).opacity = flashVisible ? 0.9 : 0;
  }

  private fire(now: number) {
    if (this.phase !== "playing" || this.playerHealth <= 0 || this.reloading) return;
    const interval = this.mouseSecondary ? 125 : 105;
    if (now - this.lastShotAt < interval) return;
    if (this.ammo <= 0) {
      this.message = this.reserveAmmo > 0 ? "Press R to reload" : "Out of ammunition";
      this.playTone(70, 0.04, 0.02);
      return;
    }

    this.lastShotAt = now;
    this.ammo -= 1;
    this.pitch = THREE.MathUtils.clamp(this.pitch + THREE.MathUtils.randFloat(0.0025, 0.007), -1.48, 1.48);
    this.yaw += THREE.MathUtils.randFloatSpread(this.mouseSecondary ? 0.002 : 0.0045);
    this.playTone(72, 0.035, 0.055);
    const spread = this.mouseSecondary ? 0.0025 : 0.007;
    const direction = new THREE.Vector3(THREE.MathUtils.randFloatSpread(spread), THREE.MathUtils.randFloatSpread(spread), -1).normalize().applyQuaternion(this.camera.quaternion);
    this.raycaster.set(this.camera.position, direction);
    this.raycaster.far = 120;

    const botHitboxes: THREE.Object3D[] = [];
    for (const bot of this.bots) if (bot.alive) botHitboxes.push(bot.body, bot.head);
    const targets = [...botHitboxes, ...this.obstacles.filter((item) => item.active).map((item) => item.mesh)];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (hit) {
      this.createTracer(hit.point);
      const barrel = hit.object.userData.barrel as ExplosiveBarrel | undefined;
      if (barrel) {
        this.hitMarkerUntil = now + 85;
        this.damageBarrel(barrel, now < this.damageBoostUntil ? 52 : 38, now);
      }
      const bot = hit.object.userData.bot as Bot | undefined;
      if (bot && bot.alive) {
        const headshot = hit.object.userData.hitZone === "head";
        const baseDamage = this.isZombieMode() ? (headshot ? 92 : THREE.MathUtils.randInt(30, 42)) : (headshot ? 62 : THREE.MathUtils.randInt(24, 34));
        const bossReduction = bot.kind === "boss" ? 0.72 : 1;
        const overdrive = now < this.damageBoostUntil ? 1.4 : 1;
        const damage = Math.round(baseDamage * bossReduction * overdrive);
        bot.health -= damage;
        this.hitMarkerUntil = now + 115;
        this.message = headshot ? `HEADSHOT · ${damage}` : `${this.isZombieMode() ? this.zombieName(bot) : `Enemy ${bot.id}`} hit · ${damage}`;
        this.playTone(headshot ? 760 : 520, 0.025, 0.05);
        if (bot.health <= 0) this.eliminateBot(bot, now, headshot);
      }
    } else this.createTracer(this.camera.position.clone().add(direction.multiplyScalar(90)));
    if (this.ammo === 0 && this.reserveAmmo > 0) this.message = "Magazine empty — press R";
  }

  private createTracer(point: THREE.Vector3) {
    const start = new THREE.Vector3();
    this.muzzleMesh.getWorldPosition(start);
    const geometry = new THREE.BufferGeometry().setFromPoints([start, point]);
    const material = new THREE.LineBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.78 });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    window.setTimeout(() => {
      this.scene.remove(line);
      geometry.dispose();
      material.dispose();
    }, 45);
  }

  private eliminateBot(bot: Bot, now: number, headshot: boolean) {
    bot.alive = false;
    bot.group.visible = false;
    bot.respawnAt = (this.mode === "team-deathmatch" || this.mode === "free-for-all") ? now + THREE.MathUtils.randFloat(2600, 4200) : Number.POSITIVE_INFINITY;
    this.kills += 1;
    this.combo = now <= this.comboExpiresAt ? this.combo + 1 : 1;
    this.comboExpiresAt = now + 4300;
    if (this.mode === "team-deathmatch" || this.mode === "free-for-all" || this.isZombieMode()) this.alliesScore += 1;
    const enemyName = this.isZombieMode() ? this.zombieName(bot) : "Enemy";
    const comboText = this.combo >= 3 ? ` · ${this.combo}x COMBO` : "";
    this.message = bot.kind === "boss" ? "BOSS ELIMINATED — clear the remaining hostiles" : headshot ? `${enemyName} eliminated — headshot${comboText}` : `${enemyName} eliminated${comboText}`;
    this.playTone(bot.kind === "boss" ? 1040 : this.isZombieMode() ? 610 : 920, 0.05, bot.kind === "boss" ? 0.18 : 0.08);
  }

  private respawnBot(bot: Bot) {
    if (!bot.enabled) return;
    bot.group.position.copy(this.randomBotSpawn(Math.floor(Math.random() * 12)));
    bot.group.visible = true;
    bot.alive = true;
    this.setBotKind(bot, "soldier", 1);
    bot.shootCooldown = THREE.MathUtils.randFloat(0.9, 1.8);
    this.pickBotTarget(bot);
  }

  private respawnPlayer() {
    this.playerHealth = 100;
    this.playerArmor = 50;
    this.playerPosition.copy(this.playerSpawn);
    this.camera.position.copy(this.playerPosition);
    this.velocityY = 0;
    this.message = "Back in action";
  }

  private respawnAdventureCheckpoint() {
    this.playerHealth = 78;
    this.playerArmor = Math.max(45, Math.min(110, this.playerArmor + 30));
    this.ammo = 30;
    this.reserveAmmo = Math.max(90, this.reserveAmmo);
    this.playerPosition.copy(this.checkpointSpawn);
    this.camera.position.copy(this.playerPosition);
    this.velocityY = 0;
    this.respawnAt = 0;
    this.combo = 0;
    this.message = `Checkpoint restored · chapter ${this.adventureStage}`;
    this.playTone(520, 0.06, 0.14);
  }

  private reload() {
    if (this.reloading || this.ammo >= 30 || this.reserveAmmo <= 0 || this.playerHealth <= 0) return;
    this.reloading = true;
    this.reloadFinishAt = performance.now() + 1250;
    this.message = "Reloading...";
    this.playTone(210, 0.04, 0.04);
  }

  private resetMatch() {
    const settings = this.getModeSettings();
    this.scene.rotation.y = 0;
    this.playerPosition.copy(this.playerSpawn);
    this.playerHealth = 100;
    this.playerArmor = settings.armor;
    this.ammo = 30;
    this.reserveAmmo = settings.reserve;
    this.kills = 0;
    this.deaths = 0;
    this.alliesScore = 0;
    this.enemiesScore = 0;
    this.matchDuration = settings.duration;
    this.timerSeconds = settings.duration;
    this.targetScore = settings.target;
    this.activeBotCount = settings.bots;
    this.outcome = null;
    this.wave = 1;
    this.round = 1;
    this.wavePendingAt = 0;
    this.rivalTickAt = performance.now() + THREE.MathUtils.randFloat(4200, 6500);
    this.bombState = "idle";
    this.bombProgress = 0;
    this.bombTimer = 35;
    this.bombDefuseProgress = 0;
    this.reloading = false;
    this.respawnAt = 0;
    this.adventureStage = 1;
    this.adventureProgress = 0;
    this.adventureSubObjective = 0;
    this.adventureGateOpen = false;
    this.checkpointSpawn.copy(this.playerSpawn);
    this.reviveTokens = this.mode === "zombie-adventure" ? 1 : 0;
    this.boss = null;
    this.bossPhase = 0;
    this.bossSummonAt = 0;
    this.combo = 0;
    this.comboExpiresAt = 0;
    this.damageBoostUntil = 0;
    this.lastHazardDamageAt = 0;
    for (const barrel of this.explosiveBarrels) {
      barrel.health = 70;
      barrel.exploded = false;
      barrel.group.visible = true;
      barrel.obstacle.active = true;
      const material = barrel.body.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.35;
    }
    for (const pickup of this.pickups) {
      pickup.active = true;
      pickup.respawnAt = 0;
      pickup.group.visible = this.isZombieMode();
    }
    this.yaw = 0;
    this.pitch = 0;
    this.weapon.visible = true;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.applyModeVisuals();

    if (this.mode === "zombie") {
      this.setObjective(new THREE.Vector3(0, 0, -4), 0x54ff9a);
      this.deploySurvivalWave(1);
      this.message = "Wave 1 incoming — walkers, runners, and crawlers detected";
    } else if (this.mode === "zombie-adventure") {
      this.beginAdventureStage(1);
    } else {
      this.setObjective(DEFAULT_OBJECTIVE, 0xffbf00);
      for (const [index, bot] of this.bots.entries()) {
        bot.enabled = index < this.activeBotCount;
        bot.group.position.copy(this.randomBotSpawn(index));
        bot.group.visible = bot.enabled;
        bot.alive = bot.enabled;
        bot.respawnAt = 0;
        this.setBotKind(bot, "soldier", 1);
        bot.shootCooldown = THREE.MathUtils.randFloat(0.8, 1.7);
        this.pickBotTarget(bot);
      }
      this.message = this.mode === "bomb-defusal" ? "Reach Point A and plant the bomb" : this.mode === "free-for-all" ? "First to 15 eliminations wins" : "Eliminate the enemy squad";
    }
    this.emitHud(true);
  }

  private onKeyDown(event: KeyboardEvent) {
    if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE"].includes(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.code === "Space" && this.phase === "playing" && this.grounded && this.playerHealth > 0) {
      this.velocityY = 8.1;
      this.grounded = false;
    }
    if (event.code === "KeyR") this.reload();
    if (event.code === "Escape" && this.phase === "playing") this.pause();
    if (event.code === "KeyF" && this.phase === "playing") void this.toggleFullscreen();
  }

  private onKeyUp(event: KeyboardEvent) {
    this.keys.delete(event.code);
  }

  private onMouseMove(event: MouseEvent) {
    if (document.pointerLockElement !== this.renderer.domElement || this.phase !== "playing") return;
    this.yaw -= event.movementX * this.sensitivity;
    this.pitch -= event.movementY * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.48, 1.48);
  }

  private onMouseDown(event: MouseEvent) {
    if (document.pointerLockElement !== this.renderer.domElement || this.phase !== "playing") return;
    if (event.button === 0) this.mousePrimary = true;
    if (event.button === 2) this.mouseSecondary = true;
  }

  private onMouseUp(event: MouseEvent) {
    if (event.button === 0) this.mousePrimary = false;
    if (event.button === 2) this.mouseSecondary = false;
  }

  private onPointerLockChange() {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && this.phase === "playing") {
      this.phase = "paused";
      this.mousePrimary = false;
      this.mouseSecondary = false;
      this.callbacks.onPhase("paused");
    }
  }

  private requestPointerLock() {
    try {
      this.renderer.domElement.requestPointerLock();
      this.renderer.domElement.focus();
    } catch {
      this.callbacks.onError?.("The browser did not allow pointer lock. Click the game area and try again.");
    }
  }

  private async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await this.container.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      this.callbacks.onError?.("Fullscreen is unavailable in this browser.");
    }
  }

  private onResize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.applyQuality();
  }

  private applyQuality() {
    const pixelRatio = this.quality === "high" ? 1.5 : this.quality === "medium" ? 1.15 : 0.82;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
    this.renderer.shadowMap.enabled = this.quality !== "low";
    this.decorGroup.visible = this.quality !== "low";
    const adventure = this.mode === "zombie-adventure";
    const zombie = this.mode === "zombie";
    const bomb = this.mode === "bomb-defusal";
    const fogColor = adventure ? 0x061019 : zombie ? 0x06120e : bomb ? 0x100c06 : 0x070a10;
    const baseDensity = adventure ? 0.021 : zombie ? 0.026 : bomb ? 0.019 : 0.016;
    this.scene.fog = new THREE.FogExp2(fogColor, this.quality === "low" ? baseDensity * 1.28 : baseDensity);
  }

  private drawMinimap() {
    const context = this.minimapContext;
    if (!context) return;
    const size = this.minimap.width;
    context.clearRect(0, 0, size, size);
    context.fillStyle = "rgba(4, 7, 12, .92)";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "rgba(247, 181, 0, .45)";
    context.lineWidth = 2;
    context.strokeRect(2, 2, size - 4, size - 4);
    context.strokeStyle = "rgba(255,255,255,.12)";
    context.lineWidth = 1;
    for (let index = 1; index < 4; index += 1) {
      const position = (size / 4) * index;
      context.beginPath(); context.moveTo(position, 0); context.lineTo(position, size); context.stroke();
      context.beginPath(); context.moveTo(0, position); context.lineTo(size, position); context.stroke();
    }
    const mapPoint = (position: THREE.Vector3) => ({ x: ((position.x + ARENA_LIMIT) / (ARENA_LIMIT * 2)) * size, y: ((position.z + ARENA_LIMIT) / (ARENA_LIMIT * 2)) * size });
    const player = mapPoint(this.playerPosition);
    context.save();
    context.translate(player.x, player.y);
    context.rotate(-this.yaw);
    context.fillStyle = "#f7b500";
    context.beginPath(); context.moveTo(0, -8); context.lineTo(5, 6); context.lineTo(-5, 6); context.closePath(); context.fill();
    context.restore();
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const point = mapPoint(bot.group.position);
      context.fillStyle = bot.kind === "boss" ? "#ff3b18" : bot.kind === "spitter" ? "#55ff9c" : bot.kind === "screamer" ? "#b365ff" : bot.kind === "crawler" ? "#ff9b32" : "#ff5a42";
      context.beginPath(); context.arc(point.x, point.y, bot.kind === "boss" ? 6 : 3.4, 0, Math.PI * 2); context.fill();
    }
    const objective = mapPoint(this.objectivePosition);
    context.strokeStyle = this.mode === "zombie-adventure" ? "#57ffaf" : "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(objective.x - 5, objective.y - 5, 10, 10);
  }

  private emitHud(force = false, now = performance.now()) {
    if (!force && now - this.lastHudEmit < 80) return;
    this.lastHudEmit = now;
    const boss = this.boss?.alive ? this.boss : null;
    this.callbacks.onHud({
      health: Math.round(this.playerHealth),
      armor: Math.round(this.playerArmor),
      ammo: this.ammo,
      reserveAmmo: this.reserveAmmo,
      kills: this.kills,
      deaths: this.deaths,
      alliesScore: this.alliesScore,
      enemiesScore: this.enemiesScore,
      timerSeconds: Math.ceil(this.timerSeconds),
      message: this.message,
      objectiveDistance: Math.round(this.playerPosition.distanceTo(this.objectivePosition.clone().setY(PLAYER_HEIGHT))),
      objectiveProgress: Math.round(this.mode === "bomb-defusal" ? this.bombProgress : this.mode === "zombie-adventure" ? this.adventureProgress : 0),
      wave: this.wave,
      round: this.round,
      outcome: this.outcome,
      reloading: this.reloading,
      hitMarker: now < this.hitMarkerUntil,
      damageFlash: now < this.damageFlashUntil,
      bossName: boss ? this.zombieName(boss) : "",
      bossHealth: boss ? Math.max(0, Math.round(boss.health)) : 0,
      bossMaxHealth: boss ? boss.maxHealth : 0,
      adventureStage: this.adventureStage,
      adventureStageMax: ADVENTURE_STAGES,
      adventureObjective: this.adventureObjective,
      reviveTokens: this.reviveTokens,
      combo: this.combo,
      overdriveSeconds: Math.max(0, Math.ceil((this.damageBoostUntil - now) / 1000)),
      bossPhase: this.bossPhase,
    });
  }

  private ensureAudio() {
    if (this.audioContext) return;
    try {
      this.audioContext = new AudioContext();
    } catch {
      this.audioContext = null;
    }
  }

  private playTone(frequency: number, attack: number, duration: number) {
    if (!this.audioContext) return;
    const context = this.audioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.008, attack), context.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.01);
  }
}
