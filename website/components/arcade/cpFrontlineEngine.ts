import type { Graphics } from "pixi.js";
import {
  FRONTLINE_UNIT_DEFINITIONS,
  type FrontlineBattleResult,
  type FrontlineMission,
  type FrontlineProgress,
  type FrontlineUnitKind,
} from "@/lib/cpFrontline";

export const FRONTLINE_WORLD_WIDTH = 1600;
export const FRONTLINE_WORLD_HEIGHT = 900;

type Faction = "alliance" | "dominion";
type StructureKind = "hq" | "turret" | "relay" | "refinery";

type UnitState = {
  id: string;
  kind: FrontlineUnitKind;
  faction: Faction;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  angle: number;
  targetId: string | null;
  rallyX: number | null;
  rallyY: number | null;
  veterancy: number;
};

type StructureState = {
  id: string;
  kind: StructureKind;
  faction: Faction;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  cooldown: number;
};

type ProjectileState = {
  id: string;
  faction: Faction;
  x: number;
  y: number;
  targetId: string;
  damage: number;
  speed: number;
  radius: number;
  color: number;
  trail: Array<{ x: number; y: number }>;
};

type ParticleState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: number;
};

type TerrainProp = {
  x: number;
  y: number;
  radius: number;
  variant: number;
};

export type FrontlineAbility = "airstrike" | "repair" | "overdrive";

export type FrontlineBattleSnapshot = {
  energy: number;
  maxEnergy: number;
  score: number;
  kills: number;
  unitsDeployed: number;
  wave: number;
  timeRemaining: number;
  playerHqPercent: number;
  enemyHqPercent: number;
  alliedUnits: number;
  enemyUnits: number;
  overdriveSeconds: number;
  cooldowns: Record<FrontlineAbility, number>;
  status: "running" | "victory" | "defeat";
};

type EngineOptions = {
  mission: FrontlineMission;
  progress: FrontlineProgress;
  opponentPower?: number;
  onEvent?: (message: string, tone: "info" | "good" | "danger") => void;
  onComplete?: (result: FrontlineBattleResult) => void;
};

const PLAYER_SPAWN = { x: 285, y: 560 };
const ENEMY_SPAWN = { x: 1325, y: 320 };

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function enemyOf(faction: Faction): Faction {
  return faction === "alliance" ? "dominion" : "alliance";
}

function formatUnitEvent(kind: FrontlineUnitKind) {
  return FRONTLINE_UNIT_DEFINITIONS[kind].name;
}

export class FrontlineEngine {
  readonly mission: FrontlineMission;
  readonly progress: FrontlineProgress;

  private readonly random: () => number;
  private readonly onEvent?: EngineOptions["onEvent"];
  private readonly onComplete?: EngineOptions["onComplete"];
  private readonly units: UnitState[] = [];
  private readonly structures: StructureState[] = [];
  private readonly projectiles: ProjectileState[] = [];
  private readonly particles: ParticleState[] = [];
  private readonly terrainProps: TerrainProp[] = [];
  private readonly cooldowns: Record<FrontlineAbility, number> = {
    airstrike: 0,
    repair: 0,
    overdrive: 0,
  };

  private energy: number;
  private readonly maxEnergy: number;
  private elapsed = 0;
  private score = 0;
  private kills = 0;
  private unitsDeployed = 0;
  private wave = 1;
  private waveClock = 4;
  private overdriveSeconds = 0;
  private completed = false;
  private status: FrontlineBattleSnapshot["status"] = "running";
  private idCounter = 0;

  constructor(options: EngineOptions) {
    this.mission = options.mission;
    this.progress = options.progress;
    this.onEvent = options.onEvent;
    this.onComplete = options.onComplete;
    this.random = mulberry32(
      hashString(`${options.mission.code}:${options.opponentPower || 0}`),
    );
    this.maxEnergy = 100 + options.progress.tech.logistics * 8;
    this.energy = Math.round(this.maxEnergy * 0.72);
    this.createTerrain();
    this.createBases(options.opponentPower || 0);
    this.spawnOpeningForces();
  }

  private nextId(prefix: string) {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private createTerrain() {
    for (let index = 0; index < 72; index += 1) {
      const x = 70 + this.random() * (FRONTLINE_WORLD_WIDTH - 140);
      const y = 75 + this.random() * (FRONTLINE_WORLD_HEIGHT - 150);
      if (x > 520 && x < 1080 && y > 250 && y < 690) continue;
      this.terrainProps.push({
        x,
        y,
        radius: 7 + this.random() * 16,
        variant: Math.floor(this.random() * 3),
      });
    }
  }

  private createBases(opponentPower: number) {
    const armorBoost = 1 + this.progress.tech.armor * 0.075;
    const enemyBoost = this.mission.enemyPower + Math.min(0.7, opponentPower / 18_000);
    const addStructure = (
      faction: Faction,
      kind: StructureKind,
      x: number,
      y: number,
      width: number,
      height: number,
      hp: number,
    ) => {
      const boost = faction === "alliance" ? armorBoost : enemyBoost;
      this.structures.push({
        id: this.nextId(kind),
        faction,
        kind,
        x,
        y,
        width,
        height,
        hp: Math.round(hp * boost),
        maxHp: Math.round(hp * boost),
        cooldown: this.random(),
      });
    };

    addStructure("alliance", "hq", 150, 540, 150, 148, 1800);
    addStructure("alliance", "turret", 330, 430, 58, 58, 480);
    addStructure("alliance", "turret", 335, 690, 58, 58, 480);
    addStructure("alliance", "relay", 150, 340, 90, 84, 720);
    addStructure("alliance", "refinery", 150, 730, 98, 82, 680);

    addStructure("dominion", "hq", 1450, 310, 150, 148, 1850);
    addStructure("dominion", "turret", 1268, 210, 58, 58, 500);
    addStructure("dominion", "turret", 1260, 472, 58, 58, 500);
    addStructure("dominion", "relay", 1450, 535, 90, 84, 760);
    addStructure("dominion", "refinery", 1450, 125, 98, 82, 720);
  }

  private spawnOpeningForces() {
    this.spawnUnit("alliance", "rifle", PLAYER_SPAWN.x - 5, PLAYER_SPAWN.y - 42);
    this.spawnUnit("alliance", "tank", PLAYER_SPAWN.x + 20, PLAYER_SPAWN.y + 48);
    this.spawnEnemyWave(true);
    this.onEvent?.("Frontline link established. Alliance forces are standing by.", "info");
  }

  private spawnUnit(
    faction: Faction,
    kind: FrontlineUnitKind,
    x: number,
    y: number,
  ) {
    const definition = FRONTLINE_UNIT_DEFINITIONS[kind];
    const techHp = faction === "alliance" ? 1 + this.progress.tech.armor * 0.055 : this.mission.enemyPower;
    const hp = Math.round(definition.hp * techHp);
    const unit: UnitState = {
      id: this.nextId(kind),
      kind,
      faction,
      x,
      y,
      hp,
      maxHp: hp,
      cooldown: this.random() * definition.fireRate,
      angle: faction === "alliance" ? 0 : Math.PI,
      targetId: null,
      rallyX: null,
      rallyY: null,
      veterancy: 0,
    };
    this.units.push(unit);
    return unit;
  }

  private spawnEnemyWave(opening = false) {
    const intensity = Math.min(7, 2 + Math.floor(this.wave / 2));
    const pool: FrontlineUnitKind[] = ["rifle", "tank", "rocket"];
    if (this.wave >= 2) pool.push("drone");
    if (this.wave >= 4) pool.push("titan");
    const count = opening ? 3 : intensity;
    for (let index = 0; index < count; index += 1) {
      const bias = this.random();
      const kind =
        opening && index === 0
          ? "tank"
          : pool[Math.min(pool.length - 1, Math.floor(bias * pool.length))];
      this.spawnUnit(
        "dominion",
        kind,
        ENEMY_SPAWN.x + this.random() * 90 - 45,
        ENEMY_SPAWN.y + (index - count / 2) * 42 + this.random() * 25,
      );
    }
    if (!opening) {
      this.onEvent?.(`Dominion wave ${this.wave} entering the combat zone.`, "danger");
    }
  }

  deploy(kind: FrontlineUnitKind) {
    if (this.status !== "running") return false;
    if (!this.progress.unlockedUnits.includes(kind)) return false;
    const definition = FRONTLINE_UNIT_DEFINITIONS[kind];
    if (this.energy < definition.cost) return false;
    this.energy -= definition.cost;
    this.unitsDeployed += 1;
    const offset = this.unitsDeployed % 5;
    this.spawnUnit(
      "alliance",
      kind,
      PLAYER_SPAWN.x + offset * 18,
      PLAYER_SPAWN.y - 70 + offset * 34,
    );
    this.onEvent?.(`${formatUnitEvent(kind)} deployed.`, "good");
    return true;
  }

  issueMove(x: number, y: number) {
    if (this.status !== "running") return;
    const safeX = clamp(x, 80, FRONTLINE_WORLD_WIDTH - 80);
    const safeY = clamp(y, 80, FRONTLINE_WORLD_HEIGHT - 80);
    let index = 0;
    for (const unit of this.units) {
      if (unit.faction !== "alliance" || unit.hp <= 0) continue;
      unit.rallyX = safeX + ((index % 3) - 1) * 28;
      unit.rallyY = safeY + (Math.floor(index / 3) % 3 - 1) * 28;
      unit.targetId = null;
      index += 1;
    }
    this.onEvent?.("Rally point updated for all active units.", "info");
  }

  useAbility(ability: FrontlineAbility, targetX = 1260, targetY = 340) {
    if (this.status !== "running" || this.cooldowns[ability] > 0) return false;
    if (ability === "airstrike") {
      this.cooldowns.airstrike = Math.max(18, 34 - this.progress.tech.airSupport * 1.4);
      for (const entity of [...this.units, ...this.structures]) {
        if (entity.faction !== "dominion" || entity.hp <= 0) continue;
        const range = distance(entity, { x: targetX, y: targetY });
        if (range <= 250) {
          const damage = Math.round((180 + this.progress.tech.airSupport * 28) * (1 - range / 550));
          this.damageEntity(entity, damage);
        }
      }
      for (let index = 0; index < 42; index += 1) {
        this.spawnParticle(
          targetX + (this.random() - 0.5) * 280,
          targetY + (this.random() - 0.5) * 220,
          index % 3 === 0 ? 0xffd04d : 0xff5e38,
          1.2,
        );
      }
      this.onEvent?.("Alexia air wing completed a precision strike.", "good");
    } else if (ability === "repair") {
      this.cooldowns.repair = Math.max(22, 42 - this.progress.tech.logistics * 1.5);
      for (const entity of [...this.units, ...this.structures]) {
        if (entity.faction !== "alliance" || entity.hp <= 0) continue;
        entity.hp = Math.min(entity.maxHp, entity.hp + entity.maxHp * 0.32);
        this.spawnParticle(entity.x, entity.y, 0x55f5a3, 0.8);
      }
      this.onEvent?.("Field repair network restored allied armor.", "good");
    } else {
      this.cooldowns.overdrive = Math.max(28, 50 - this.progress.tech.weapons * 1.4);
      this.overdriveSeconds = 10 + this.progress.tech.weapons * 0.7;
      this.onEvent?.("Alliance weapons are running in overdrive.", "good");
    }
    return true;
  }

  update(deltaSeconds: number) {
    if (this.status !== "running") return;
    const dt = clamp(deltaSeconds, 0, 0.05);
    this.elapsed += dt;
    this.energy = Math.min(
      this.maxEnergy,
      this.energy + dt * (3.2 + this.progress.tech.logistics * 0.32),
    );
    this.overdriveSeconds = Math.max(0, this.overdriveSeconds - dt);
    for (const ability of Object.keys(this.cooldowns) as FrontlineAbility[]) {
      this.cooldowns[ability] = Math.max(0, this.cooldowns[ability] - dt);
    }

    this.waveClock -= dt;
    const waveInterval = Math.max(16, 30 - this.mission.enemyPower * 4.5);
    if (this.waveClock <= 0) {
      this.wave += 1;
      this.spawnEnemyWave();
      this.waveClock = waveInterval;
    }

    this.updateUnits(dt);
    this.updateStructures(dt);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.removeDestroyed();
    this.checkBattleEnd();
  }

  private updateUnits(dt: number) {
    for (const unit of this.units) {
      if (unit.hp <= 0) continue;
      const definition = FRONTLINE_UNIT_DEFINITIONS[unit.kind];
      unit.cooldown = Math.max(0, unit.cooldown - dt);

      if (unit.kind === "medic" && unit.faction === "alliance") {
        const ally = this.units
          .filter((candidate) => candidate.faction === unit.faction && candidate.hp > 0 && candidate.hp < candidate.maxHp)
          .sort((left, right) => distance(unit, left) - distance(unit, right))[0];
        if (ally && distance(unit, ally) <= 130 && unit.cooldown <= 0) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 22 + this.progress.tech.logistics * 4);
          unit.cooldown = 0.85;
          this.spawnParticle(ally.x, ally.y, 0x55f5a3, 0.45);
          continue;
        }
      }

      let target = this.findEntity(unit.targetId);
      if (!target || target.hp <= 0 || target.faction === unit.faction) {
        target = this.findNearestEnemy(unit);
        unit.targetId = target?.id || null;
      }

      if (unit.rallyX !== null && unit.rallyY !== null) {
        const rallyDistance = distance(unit, { x: unit.rallyX, y: unit.rallyY });
        if (rallyDistance > 22 && (!target || distance(unit, target) > definition.range * 0.82)) {
          this.moveUnit(unit, unit.rallyX, unit.rallyY, definition.speed, dt);
          continue;
        }
        unit.rallyX = null;
        unit.rallyY = null;
      }

      if (!target) continue;
      const targetDistance = distance(unit, target);
      if (targetDistance > definition.range) {
        this.moveUnit(unit, target.x, target.y, definition.speed, dt);
      } else if (unit.cooldown <= 0) {
        const damageBoost =
          unit.faction === "alliance"
            ? 1 + this.progress.tech.weapons * 0.065 + (this.overdriveSeconds > 0 ? 0.45 : 0)
            : this.mission.enemyPower;
        this.fireProjectile(
          unit,
          target,
          definition.damage * damageBoost * (1 + unit.veterancy * 0.08),
          unit.kind === "rocket" ? 430 : unit.kind === "drone" ? 620 : 520,
          unit.kind === "rocket" ? 8 : 4,
          definition.color,
        );
        unit.cooldown = definition.fireRate * (this.overdriveSeconds > 0 && unit.faction === "alliance" ? 0.72 : 1);
      }
    }
  }

  private updateStructures(dt: number) {
    for (const structure of this.structures) {
      if (structure.hp <= 0 || structure.kind !== "turret") continue;
      structure.cooldown = Math.max(0, structure.cooldown - dt);
      const target = this.units
        .filter((unit) => unit.faction === enemyOf(structure.faction) && unit.hp > 0)
        .sort((left, right) => distance(structure, left) - distance(structure, right))[0];
      if (!target || distance(structure, target) > 255 || structure.cooldown > 0) continue;
      const power = structure.faction === "alliance" ? 1 + this.progress.tech.weapons * 0.05 : this.mission.enemyPower;
      this.fireProjectile(structure, target, 34 * power, 560, 5, structure.faction === "alliance" ? 0x4de5ff : 0xff4d72);
      structure.cooldown = 0.9;
    }
  }

  private updateProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const target = this.findEntity(projectile.targetId);
      if (!target || target.hp <= 0) {
        this.projectiles.splice(index, 1);
        continue;
      }
      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const length = Math.hypot(dx, dy) || 1;
      projectile.trail.push({ x: projectile.x, y: projectile.y });
      if (projectile.trail.length > 7) projectile.trail.shift();
      projectile.x += (dx / length) * projectile.speed * dt;
      projectile.y += (dy / length) * projectile.speed * dt;
      if (length <= Math.max(12, projectile.speed * dt * 1.25)) {
        this.damageEntity(target, projectile.damage);
        for (let spark = 0; spark < (projectile.radius > 6 ? 12 : 5); spark += 1) {
          this.spawnParticle(target.x, target.y, projectile.color, projectile.radius > 6 ? 0.8 : 0.36);
        }
        this.projectiles.splice(index, 1);
      }
    }
  }

  private updateParticles(dt: number) {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 18 * dt;
      if (particle.life <= 0) this.particles.splice(index, 1);
    }
  }

  private moveUnit(unit: UnitState, targetX: number, targetY: number, speed: number, dt: number) {
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const length = Math.hypot(dx, dy) || 1;
    unit.angle = Math.atan2(dy, dx);
    unit.x += (dx / length) * speed * dt;
    unit.y += (dy / length) * speed * dt;
    unit.x = clamp(unit.x, 45, FRONTLINE_WORLD_WIDTH - 45);
    unit.y = clamp(unit.y, 55, FRONTLINE_WORLD_HEIGHT - 55);
  }

  private findNearestEnemy(source: UnitState) {
    const enemies = [...this.units, ...this.structures].filter(
      (entity) => entity.faction === enemyOf(source.faction) && entity.hp > 0,
    );
    return enemies.sort((left, right) => distance(source, left) - distance(source, right))[0] || null;
  }

  private findEntity(id: string | null) {
    if (!id) return null;
    return (
      this.units.find((entity) => entity.id === id) ||
      this.structures.find((entity) => entity.id === id) ||
      null
    );
  }

  private fireProjectile(
    source: UnitState | StructureState,
    target: UnitState | StructureState,
    damage: number,
    speed: number,
    radius: number,
    color: number,
  ) {
    this.projectiles.push({
      id: this.nextId("shot"),
      faction: source.faction,
      x: source.x,
      y: source.y,
      targetId: target.id,
      damage,
      speed,
      radius,
      color,
      trail: [],
    });
  }

  private damageEntity(entity: UnitState | StructureState, damage: number) {
    if (entity.hp <= 0) return;
    const before = entity.hp;
    entity.hp = Math.max(0, entity.hp - Math.max(1, damage));
    if (before > 0 && entity.hp <= 0) {
      const isEnemy = entity.faction === "dominion";
      if (isEnemy) {
        this.kills += 1;
        this.score += entity.kind === "hq" ? 5000 : entity.kind === "turret" ? 650 : 190;
      }
      for (let index = 0; index < 24; index += 1) {
        this.spawnParticle(entity.x, entity.y, isEnemy ? 0xff5e38 : 0x4de5ff, 1.1);
      }
      if ("veterancy" in entity && entity.targetId) {
        const attacker = this.units.find((unit) => unit.targetId === entity.id && unit.faction !== entity.faction);
        if (attacker) attacker.veterancy = Math.min(4, attacker.veterancy + 1);
      }
    }
  }

  private spawnParticle(x: number, y: number, color: number, scale: number) {
    if (this.particles.length >= 180) this.particles.shift();
    const life = 0.32 + this.random() * 0.75 * scale;
    const angle = this.random() * Math.PI * 2;
    const speed = (35 + this.random() * 130) * scale;
    this.particles.push({
      x: x + (this.random() - 0.5) * 18,
      y: y + (this.random() - 0.5) * 18,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 28,
      life,
      maxLife: life,
      radius: 2 + this.random() * 6 * scale,
      color,
    });
  }

  private removeDestroyed() {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      if (this.units[index].hp <= 0) this.units.splice(index, 1);
    }
  }

  private checkBattleEnd() {
    const playerHq = this.structures.find((structure) => structure.faction === "alliance" && structure.kind === "hq");
    const enemyHq = this.structures.find((structure) => structure.faction === "dominion" && structure.kind === "hq");
    const timedOut = this.elapsed >= this.mission.durationSeconds;
    if (enemyHq && enemyHq.hp <= 0) this.finish("victory");
    else if (playerHq && playerHq.hp <= 0) this.finish("defeat");
    else if (timedOut) {
      const playerRatio = playerHq ? playerHq.hp / playerHq.maxHp : 0;
      const enemyRatio = enemyHq ? enemyHq.hp / enemyHq.maxHp : 1;
      this.finish(enemyRatio < playerRatio * 0.72 ? "victory" : "defeat");
    }
  }

  private finish(result: "victory" | "defeat") {
    if (this.completed) return;
    this.completed = true;
    this.status = result;
    const snapshot = this.getSnapshot();
    const stars =
      result === "defeat"
        ? 0
        : snapshot.playerHqPercent >= 72
          ? 3
          : snapshot.playerHqPercent >= 38
            ? 2
            : 1;
    const finalScore = Math.round(
      this.score +
        Math.max(0, snapshot.timeRemaining) * 14 +
        snapshot.playerHqPercent * 32 +
        stars * 900,
    );
    this.onEvent?.(
      result === "victory"
        ? "Dominion command core neutralized. Sector secured."
        : "Alliance command core lost. Regroup for another assault.",
      result === "victory" ? "good" : "danger",
    );
    this.onComplete?.({
      result,
      score: finalScore,
      stars,
      kills: this.kills,
      unitsDeployed: this.unitsDeployed,
      missionCode: this.mission.code,
      durationSeconds: Math.round(this.elapsed),
    });
  }

  getSnapshot(): FrontlineBattleSnapshot {
    const playerHq = this.structures.find((structure) => structure.faction === "alliance" && structure.kind === "hq");
    const enemyHq = this.structures.find((structure) => structure.faction === "dominion" && structure.kind === "hq");
    return {
      energy: Math.round(this.energy),
      maxEnergy: this.maxEnergy,
      score: this.score,
      kills: this.kills,
      unitsDeployed: this.unitsDeployed,
      wave: this.wave,
      timeRemaining: Math.max(0, Math.ceil(this.mission.durationSeconds - this.elapsed)),
      playerHqPercent: playerHq ? Math.round((playerHq.hp / playerHq.maxHp) * 100) : 0,
      enemyHqPercent: enemyHq ? Math.round((enemyHq.hp / enemyHq.maxHp) * 100) : 0,
      alliedUnits: this.units.filter((unit) => unit.faction === "alliance").length,
      enemyUnits: this.units.filter((unit) => unit.faction === "dominion").length,
      overdriveSeconds: this.overdriveSeconds,
      cooldowns: { ...this.cooldowns },
      status: this.status,
    };
  }

  drawStatic(graphics: Graphics) {
    graphics.clear();
    graphics.rect(0, 0, FRONTLINE_WORLD_WIDTH, FRONTLINE_WORLD_HEIGHT).fill({ color: 0x071912 });
    for (let band = 0; band < 12; band += 1) {
      graphics
        .rect(0, band * 75, FRONTLINE_WORLD_WIDTH, 75)
        .fill({ color: band % 2 === 0 ? 0x0a2118 : 0x0c281c, alpha: 0.55 });
    }
    graphics
      .moveTo(0, 260)
      .bezierCurveTo(390, 185, 555, 420, 810, 385)
      .bezierCurveTo(1080, 350, 1270, 130, FRONTLINE_WORLD_WIDTH, 205)
      .lineTo(FRONTLINE_WORLD_WIDTH, 305)
      .bezierCurveTo(1280, 240, 1090, 470, 815, 485)
      .bezierCurveTo(540, 500, 385, 275, 0, 360)
      .closePath()
      .fill({ color: 0x083d57, alpha: 0.95 });
    graphics
      .moveTo(0, 300)
      .bezierCurveTo(420, 225, 555, 455, 810, 430)
      .bezierCurveTo(1090, 400, 1290, 190, FRONTLINE_WORLD_WIDTH, 260)
      .stroke({ color: 0x36b8d8, width: 3, alpha: 0.32 });
    graphics
      .poly([180, 610, 410, 555, 675, 530, 930, 430, 1170, 360, 1410, 330])
      .stroke({ color: 0x27372f, width: 82, alpha: 0.95 });
    graphics
      .poly([180, 610, 410, 555, 675, 530, 930, 430, 1170, 360, 1410, 330])
      .stroke({ color: 0x71806f, width: 3, alpha: 0.5 });
    for (let index = 0; index < 22; index += 1) {
      const x = 240 + index * 55;
      const y = 594 - index * 12.8;
      graphics.rect(x, y, 23, 4).fill({ color: 0xe6c85e, alpha: 0.42 });
    }
    for (const prop of this.terrainProps) {
      if (prop.variant === 0) {
        graphics.circle(prop.x, prop.y, prop.radius).fill({ color: 0x183e24, alpha: 0.88 });
        graphics.circle(prop.x - 4, prop.y - 4, prop.radius * 0.58).fill({ color: 0x2d5d32, alpha: 0.72 });
      } else if (prop.variant === 1) {
        graphics.circle(prop.x, prop.y, prop.radius * 0.65).fill({ color: 0x37463b, alpha: 0.75 });
        graphics.circle(prop.x - 3, prop.y - 3, prop.radius * 0.28).fill({ color: 0x687269, alpha: 0.5 });
      } else {
        graphics.rect(prop.x - 2, prop.y - prop.radius, 4, prop.radius * 1.7).fill({ color: 0x1c3122 });
        graphics.circle(prop.x, prop.y - prop.radius, prop.radius * 0.52).fill({ color: 0x275936, alpha: 0.86 });
      }
    }
    for (let x = 0; x <= FRONTLINE_WORLD_WIDTH; x += 100) {
      graphics.moveTo(x, 0).lineTo(x, FRONTLINE_WORLD_HEIGHT).stroke({ color: 0x4de5ff, width: 1, alpha: 0.035 });
    }
    for (let y = 0; y <= FRONTLINE_WORLD_HEIGHT; y += 100) {
      graphics.moveTo(0, y).lineTo(FRONTLINE_WORLD_WIDTH, y).stroke({ color: 0x4de5ff, width: 1, alpha: 0.035 });
    }
  }

  drawDynamic(graphics: Graphics) {
    graphics.clear();
    for (const structure of this.structures) {
      if (structure.hp <= 0) continue;
      this.drawStructure(graphics, structure);
    }
    for (const unit of this.units) this.drawUnit(graphics, unit);
    for (const projectile of this.projectiles) {
      if (projectile.trail.length > 1) {
        graphics
          .poly(projectile.trail.flatMap((point) => [point.x, point.y]))
          .stroke({ color: projectile.color, width: Math.max(2, projectile.radius * 0.55), alpha: 0.4 });
      }
      graphics.circle(projectile.x, projectile.y, projectile.radius).fill({ color: projectile.color, alpha: 0.95 });
      graphics.circle(projectile.x, projectile.y, projectile.radius * 2.2).fill({ color: projectile.color, alpha: 0.12 });
    }
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      graphics.circle(particle.x, particle.y, particle.radius * alpha).fill({ color: particle.color, alpha: alpha * 0.82 });
    }
  }

  private drawStructure(graphics: Graphics, structure: StructureState) {
    const alliance = structure.faction === "alliance";
    const primary = alliance ? 0x4de5ff : 0xff4d72;
    const body = alliance ? 0x172c38 : 0x3b1722;
    const x = structure.x - structure.width / 2;
    const y = structure.y - structure.height / 2;
    graphics.roundRect(x - 7, y - 4, structure.width + 14, structure.height + 12, 12).fill({ color: 0x000000, alpha: 0.32 });
    graphics.roundRect(x, y, structure.width, structure.height, 10).fill({ color: body, alpha: 0.98 }).stroke({ color: primary, width: 2, alpha: 0.62 });
    if (structure.kind === "hq") {
      graphics.roundRect(x + 25, y - 32, structure.width - 50, 55, 8).fill({ color: alliance ? 0x203e4e : 0x552332 }).stroke({ color: primary, width: 2, alpha: 0.7 });
      graphics.rect(structure.x - 7, y - 62, 14, 36).fill({ color: primary, alpha: 0.82 });
      graphics.circle(structure.x, y - 66, 18).fill({ color: primary, alpha: 0.16 }).stroke({ color: primary, width: 3, alpha: 0.85 });
    } else if (structure.kind === "turret") {
      graphics.circle(structure.x, structure.y, 21).fill({ color: alliance ? 0x254d5c : 0x65283a }).stroke({ color: primary, width: 2 });
      graphics.rect(structure.x - 4, structure.y - 31, 8, 30).fill({ color: primary, alpha: 0.82 });
    } else if (structure.kind === "relay") {
      graphics.circle(structure.x, structure.y - 12, 27).stroke({ color: primary, width: 3, alpha: 0.72 });
      graphics.circle(structure.x, structure.y - 12, 10).fill({ color: primary, alpha: 0.32 });
    } else {
      graphics.rect(x + 16, y + 15, structure.width - 32, structure.height - 30).fill({ color: 0xdda43d, alpha: 0.25 });
      for (let line = 0; line < 3; line += 1) {
        graphics.rect(x + 20, y + 18 + line * 15, structure.width - 40, 5).fill({ color: primary, alpha: 0.35 });
      }
    }
    this.drawHealthBar(graphics, structure, structure.width);
  }

  private drawUnit(graphics: Graphics, unit: UnitState) {
    const definition = FRONTLINE_UNIT_DEFINITIONS[unit.kind];
    const alliance = unit.faction === "alliance";
    const color = alliance ? definition.color : 0xff4d72;
    const scale = unit.kind === "titan" ? 1.55 : unit.kind === "tank" || unit.kind === "rocket" ? 1.2 : 1;
    const cos = Math.cos(unit.angle);
    const sin = Math.sin(unit.angle);
    graphics.circle(unit.x, unit.y + 8 * scale, 20 * scale).fill({ color: 0x000000, alpha: 0.26 });
    if (unit.kind === "rifle" || unit.kind === "medic") {
      graphics.circle(unit.x, unit.y - 8, 7 * scale).fill({ color, alpha: 0.95 });
      graphics.roundRect(unit.x - 8 * scale, unit.y - 1, 16 * scale, 21 * scale, 4).fill({ color: alliance ? 0x173a49 : 0x4c1724 }).stroke({ color, width: 2, alpha: 0.85 });
      graphics.moveTo(unit.x, unit.y + 3).lineTo(unit.x + cos * 22, unit.y + 3 + sin * 22).stroke({ color, width: 4, alpha: 0.9 });
      if (unit.kind === "medic") {
        graphics.rect(unit.x - 2, unit.y + 3, 4, 12).fill({ color: 0xffffff, alpha: 0.9 });
        graphics.rect(unit.x - 6, unit.y + 7, 12, 4).fill({ color: 0xffffff, alpha: 0.9 });
      }
    } else if (unit.kind === "drone") {
      graphics.poly([unit.x + cos * 19, unit.y + sin * 19, unit.x - sin * 16 - cos * 9, unit.y + cos * 16 - sin * 9, unit.x + sin * 16 - cos * 9, unit.y - cos * 16 - sin * 9]).fill({ color: alliance ? 0x25354c : 0x4d1b29 }).stroke({ color, width: 2 });
      graphics.circle(unit.x, unit.y, 5).fill({ color, alpha: 0.95 });
    } else {
      const width = unit.kind === "titan" ? 46 : 37;
      const height = unit.kind === "titan" ? 38 : 27;
      graphics.roundRect(unit.x - width / 2, unit.y - height / 2, width, height, 6).fill({ color: alliance ? 0x263b43 : 0x4b202a }).stroke({ color, width: 2, alpha: 0.9 });
      graphics.circle(unit.x, unit.y, unit.kind === "titan" ? 13 : 9).fill({ color: alliance ? 0x385968 : 0x6d2b3b }).stroke({ color, width: 2 });
      const barrelLength = unit.kind === "rocket" ? 31 : unit.kind === "titan" ? 36 : 27;
      graphics.moveTo(unit.x, unit.y).lineTo(unit.x + cos * barrelLength, unit.y + sin * barrelLength).stroke({ color, width: unit.kind === "titan" ? 7 : 5 });
      if (unit.kind === "rocket") {
        graphics.rect(unit.x - 14, unit.y - 17, 28, 7).fill({ color: 0xffa94d, alpha: 0.72 });
      }
    }
    if (unit.veterancy > 0) {
      for (let star = 0; star < unit.veterancy; star += 1) {
        graphics.circle(unit.x - 9 + star * 6, unit.y - 28 * scale, 2.3).fill({ color: 0xffdf63 });
      }
    }
    this.drawHealthBar(graphics, unit, 38 * scale);
  }

  private drawHealthBar(
    graphics: Graphics,
    entity: { x: number; y: number; hp: number; maxHp: number; faction: Faction },
    width: number,
  ) {
    const ratio = clamp(entity.hp / entity.maxHp, 0, 1);
    const y = entity.y - 49;
    graphics.roundRect(entity.x - width / 2, y, width, 6, 3).fill({ color: 0x02070b, alpha: 0.78 });
    graphics.roundRect(entity.x - width / 2 + 1, y + 1, Math.max(0, (width - 2) * ratio), 4, 2).fill({ color: entity.faction === "alliance" ? 0x55f5a3 : 0xff4d72, alpha: 0.95 });
  }
}
