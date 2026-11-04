import Matter from 'matter-js';
import { CONFIG, STAGES, SKINS } from './config.js';
import { buildLevel } from './levels.js';
import { createRun, sliceReward, applyUpgrade, captureCheckpoint, restoreCheckpoint, pointSegmentDistance, settleStage } from './core.js';
import { Renderer } from './renderer.js';

const { Engine, Bodies, Body, Composite, Constraint } = Matter;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class World {
  constructor(canvas, assets, profile, callbacks) {
    this.canvas = canvas;
    this.assets = assets;
    this.profile = profile;
    this.callbacks = callbacks;
    this.renderer = new Renderer(canvas, assets);
    this.mode = 'ready';
    this.suspended = false;
    this.run = createRun(profile.difficulty);
    this.clock = 0;
    this.uiClock = 0;
    this.cameraX = 0;
    this.shake = 0;
    this.flash = 0;
    this.lastPress = -10;
    this.trail = [];
    this.manual = import.meta.env.DEV && new URLSearchParams(location.search).has('qa');
    this.loadStage();
    this.accumulator = 0;
    this.lastFrame = 0;
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  get difficulty() { return CONFIG.difficulty[this.run.difficulty]; }

  loadStage(checkpoint = null) {
    if (this.engine) Engine.clear(this.engine);
    this.engine = Engine.create({ gravity: { x: 0, y: CONFIG.gravity }, positionIterations: 8, velocityIterations: 8 });
    this.level = buildLevel(this.run.stage);
    this.consumed = checkpoint ? new Set(checkpoint.consumed) : new Set();
    this.defeated = checkpoint ? new Set(checkpoint.defeated) : new Set();
    this.routeIds = checkpoint ? new Set(checkpoint.routes) : new Set();
    this.arrows = [];
    this.fragments = [];
    this.ragdolls = [];
    this.particles = [];
    this.floaters = [];
    this.trail = [];
    this.effects = [];
    this.lastPress = -10;
    this.invulnerableUntil = checkpoint ? this.clock + 1.4 : this.clock + 0.8;
    this.flipTime = 0;
    this.angle = 0.3;
    const floors = this.level.floorSegments.map(segment => Bodies.rectangle((segment.left + segment.right) / 2, CONFIG.floorY + 70, segment.right - segment.left, 140, { isStatic: true, friction: 0, label: 'floor', collisionFilter: { category: 1, mask: 0xffff } }));
    const platforms = this.level.platforms.map(platform => Bodies.rectangle(platform.x, platform.y + platform.height / 2, platform.width, platform.height, { isStatic: true, friction: 0, label: 'platform', collisionFilter: { category: 1, mask: 0xffff } }));
    const x = checkpoint?.x ?? 200;
    this.player = Bodies.rectangle(x, 450, CONFIG.bladeLength, CONFIG.bladeWidth, { friction: 0, frictionAir: 0, restitution: 0.03, inertia: Infinity, chamfer: { radius: 4 }, collisionFilter: { category: 4, mask: 1 }, label: 'blade' });
    Composite.add(this.engine.world, [...floors, ...platforms, this.player]);
    this.level.enemies.forEach(enemy => { if (this.defeated.has(enemy.id)) enemy.alive = false; });
    this.checkpoint = checkpoint ?? captureCheckpoint(this.run, x, this.consumed, this.defeated, this.routeIds);
    this.previousPosition = { ...this.player.position };
    this.previousAngle = this.angle;
    this.cameraX = Math.max(0, x - this.renderer.playerScreenX);
    this.moduleIndex = -1;
    this.callbacks.hud?.(this);
  }

  start() {
    this.run = createRun(this.profile.difficulty);
    this.profile.runs++;
    this.clock = 0;
    this.loadStage();
    this.setMode('playing');
    this.callbacks.save?.();
    this.callbacks.sound?.('start');
  }

  setMode(mode) {
    this.mode = mode;
    this.accumulator = 0;
    this.callbacks.state?.(this);
    this.callbacks.hud?.(this);
  }

  pause() {
    if (this.mode === 'playing') this.setMode('paused');
    else if (this.mode === 'paused') this.setMode('playing');
  }

  jump() {
    if (this.mode !== 'playing' || this.suspended || this.clock - this.lastPress < CONFIG.minimumPressInterval) return false;
    this.lastPress = this.clock;
    Body.setVelocity(this.player, { x: this.player.velocity.x, y: -CONFIG.jumpSpeed / 60 });
    this.flipTime = 0.9;
    this.puff(this.player.position.x, this.player.position.y + 10, '#f3fbef', 5);
    this.callbacks.sound?.('jump');
    return true;
  }

  selectUpgrade(id) {
    if (this.mode !== 'upgrade' || !this.offeredUpgrades?.includes(id) || !applyUpgrade(this.run, id)) return false;
    this.run.stage++;
    this.run.stageStartScore = this.run.score;
    this.run.stageStartCuts = this.run.cuts;
    this.run.stageStartKills = this.run.kills;
    this.run.shields = Math.min(this.run.maxShields, this.run.shields + 1);
    this.run.combo = 0;
    this.loadStage();
    this.setMode('playing');
    this.callbacks.sound?.('upgrade');
    return true;
  }

  retry() {
    if (!['failed', 'paused'].includes(this.mode)) return;
    this.run.score = this.run.stageStartScore;
    this.run.cuts = this.run.stageStartCuts;
    this.run.kills = this.run.stageStartKills;
    this.run.energy = 0;
    this.run.combo = 0;
    this.run.shields = this.run.maxShields;
    const currentModules = this.level.stage.modules;
    this.run.routes = this.run.routes.filter(id => !currentModules.some(module => id.startsWith(`${module}-`)));
    this.loadStage();
    this.setMode('playing');
  }

  home() {
    this.run = createRun(this.profile.difficulty);
    this.loadStage();
    this.setMode('ready');
  }

  tick(time) {
    const elapsed = this.lastFrame ? Math.min(time - this.lastFrame, 60) : 0;
    this.lastFrame = time;
    if (this.mode === 'playing' && !this.suspended && !this.manual) {
      this.accumulator += elapsed;
      while (this.accumulator >= CONFIG.fixedStep && this.mode === 'playing') {
        this.step(CONFIG.fixedStep / 1000);
        this.accumulator -= CONFIG.fixedStep;
      }
    }
    this.renderer.draw(this, time / 1000);
    requestAnimationFrame(this.tick);
  }

  step(dt) {
    if (this.mode !== 'playing') return;
    this.clock += dt;
    this.run.elapsed += dt;
    this.flipTime = Math.max(0, this.flipTime - dt);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 18);
    this.previousPosition = { ...this.player.position };
    this.previousAngle = this.angle;
    this.angle += (this.flipTime > 0 ? 10.5 : 1.65) * dt;
    Body.setAngle(this.player, this.angle);
    Body.setAngularVelocity(this.player, 0);
    let speed = this.difficulty.speed;
    const boss = this.level.enemies.find(enemy => enemy.type === 'boss' && enemy.alive);
    if (boss && this.player.position.x > boss.x - 100 && this.player.position.x < boss.x + 50) {
      speed = 65;
      if (this.player.position.x > boss.x - 18) speed = 0;
    }
    Body.setVelocity(this.player, { x: speed / 60, y: this.player.velocity.y });
    if (this.player.position.y < 90) { Body.setPosition(this.player, { x: this.player.position.x, y: 90 }); Body.setVelocity(this.player, { x: this.player.velocity.x, y: Math.max(0, this.player.velocity.y) }); }
    for (const arrow of this.arrows) {
      if (!arrow.dead) arrow.body.force.y -= arrow.body.mass * CONFIG.gravity * this.engine.gravity.scale * 0.94;
    }
    Engine.update(this.engine, dt * 1000);
    if (this.player.position.y > 720) { this.hurt('fall', true); return; }
    this.checkTargets();
    this.updateEnemies(dt);
    this.checkHazards();
    if (this.mode !== 'playing') return;
    this.updateRoutes();
    this.updateEffects(dt);
    this.updateCheckpoints();
    if (this.run.combo && this.clock - this.run.lastSliceTime > CONFIG.comboWindow) this.run.combo = 0;
    const targetCamera = Math.max(0, this.player.position.x - this.renderer.playerScreenX);
    this.cameraX += (targetCamera - this.cameraX) * Math.min(1, dt * 10);
    this.trail.push({ x: this.player.position.x, y: this.player.position.y, age: 0 });
    this.trail.forEach(point => point.age += dt);
    this.trail = this.trail.filter(point => point.age < 0.3);
    if (this.player.position.x >= this.level.finishX) {
      if (boss?.alive) this.hurt('boss', true);
      else this.finishStage();
    }
    this.uiClock += dt;
    if (this.uiClock > 0.08) { this.uiClock = 0; this.callbacks.hud?.(this); }
  }

  bladeHits(point, radius) {
    const length = CONFIG.bladeLength / 2;
    for (let sample = 0; sample <= 2; sample++) {
      const t = sample / 2;
      const angle = this.previousAngle + (this.angle - this.previousAngle) * t;
      const x = this.previousPosition.x + (this.player.position.x - this.previousPosition.x) * t;
      const y = this.previousPosition.y + (this.player.position.y - this.previousPosition.y) * t;
      const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
      if (pointSegmentDistance(point, { x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }) < radius + 8) return true;
    }
    return false;
  }

  checkTargets() {
    for (const target of this.level.targets) {
      if (this.consumed.has(target.id) || Math.abs(target.x - this.player.position.x) > 100) continue;
      if (!this.bladeHits(target, target.radius)) continue;
      this.consumed.add(target.id);
      this.run.combo = this.clock - this.run.lastSliceTime < CONFIG.comboWindow ? this.run.combo + 1 : 1;
      this.run.lastSliceTime = this.clock;
      const reward = sliceReward(this.run.combo, this.run.upgrades.combo ?? 0);
      this.run.score += reward;
      this.run.cuts++;
      const wasFull = this.run.energy >= CONFIG.fullEnergy;
      this.run.energy = Math.min(CONFIG.fullEnergy, this.run.energy + CONFIG.energyPerSlice + 8 * (this.run.upgrades.energy ?? 0));
      this.floatText(target.x, target.y - 25, 'event.points', '#287c64', { points: reward });
      this.cutFragments(target);
      this.callbacks.sound?.('slice');
      if (!wasFull && this.run.energy === CONFIG.fullEnergy) this.callbacks.toast?.('toast.charged');
    }
  }

  updateEnemies(dt) {
    const player = this.player.position;
    for (const enemy of this.level.enemies) {
      enemy.damageFlash = Math.max(0, enemy.damageFlash - dt * 4);
      if (!enemy.alive) continue;
      const dx = enemy.x - player.x;
      const radius = enemy.type === 'boss' ? 44 : 26;
      const center = { x: enemy.x, y: enemy.y - (enemy.type === 'boss' ? 66 : 44) };
      if (Math.abs(dx) < 130 && this.clock - enemy.lastHit > CONFIG.enemyContactCooldown && this.bladeHits(center, radius)) this.hitEnemy(enemy);
      if (!enemy.alive) continue;
      if (dx > -70 && dx < 840) {
        if (!enemy.nextShot) enemy.nextShot = this.clock + (enemy.type === 'boss' ? 0.8 : 1.55);
        if (this.clock > enemy.nextShot) {
          this.spawnArrow(enemy);
          enemy.nextShot = this.clock + (enemy.type === 'boss' ? 1.1 : enemy.type === 'heavy' ? 3 : 2.3);
        }
      }
    }
    for (const arrow of this.arrows) {
      if (arrow.dead) continue;
      const position = arrow.body.position;
      if (position.x < this.cameraX - 120 || position.y > 740 || this.clock - arrow.created > 6) { this.removeArrow(arrow); continue; }
      if (this.bladeHits(position, 3)) {
        this.removeArrow(arrow);
        this.run.score += 15;
        this.run.energy = Math.min(100, this.run.energy + (this.run.upgrades.parry ? 20 + 5 * (this.run.upgrades.parry - 1) : 4));
        this.puff(position.x, position.y, '#e9c365', 7);
        this.floatText(position.x, position.y - 20, 'event.parry', '#b18b35');
        this.callbacks.sound?.('parry');
      } else if (Math.hypot(position.x - player.x, position.y - player.y) < 21) {
        this.removeArrow(arrow);
        this.hurt('arrow');
      }
    }
    this.arrows = this.arrows.filter(arrow => !arrow.dead);
  }

  spawnArrow(enemy) {
    const x = enemy.x - 26, y = enemy.y - (enemy.type === 'boss' ? 91 : 54);
    const speed = this.difficulty.arrowSpeed * (enemy.type === 'boss' ? 1.1 : 1);
    const direction = this.player.position.x > x ? 1 : -1;
    const time = Math.max(0.18, Math.abs(x - this.player.position.x) / (speed + this.difficulty.speed));
    const vy = (this.player.position.y - y - 0.5 * 81 * time * time) / time;
    const body = Bodies.rectangle(x, y, 32, 4, { isSensor: true, frictionAir: 0, collisionFilter: { category: 8, mask: 0 }, label: 'arrow' });
    Body.setVelocity(body, { x: direction * speed / 60, y: clamp(vy, -280, 280) / 60 });
    Composite.add(this.engine.world, body);
    this.arrows.push({ body, created: this.clock, dead: false });
    this.callbacks.sound?.('arrow');
  }

  removeArrow(arrow) { arrow.dead = true; Composite.remove(this.engine.world, arrow.body); }

  hitEnemy(enemy, chainDamage = null) {
    enemy.lastHit = this.clock;
    enemy.damageFlash = 1;
    const charged = chainDamage === null && this.run.energy >= 100;
    let damage = chainDamage ?? (charged ? CONFIG.chargedDamage : CONFIG.baseDamage);
    if (charged) {
      this.run.energy = 0;
      this.shake = this.profile.reducedMotion ? 0 : 5;
      this.effects.push({ x: enemy.x, y: enemy.y - 45, age: 0, kind: 'slash' });
      this.floatText(enemy.x, enemy.y - 115, 'event.charged', '#c18d31');
      this.callbacks.sound?.('charged');
    } else this.callbacks.sound?.('hit');
    if (enemy.shield) {
      enemy.shield = 0;
      damage = Math.max(0, damage - 1);
      this.puff(enemy.x - 22, enemy.y - 42, '#a3d9c5', 12);
      this.floatText(enemy.x, enemy.y - 85, 'event.shieldBreak', '#399275');
    }
    enemy.hp -= damage;
    this.puff(enemy.x, enemy.y - 40, '#e6c07f', 5);
    if (enemy.hp <= 0) this.killEnemy(enemy);
    if (charged && this.run.upgrades.chain) {
      const range = 230 + 90 * (this.run.upgrades.chain - 1);
      for (const other of this.level.enemies) if (other.alive && other !== enemy && Math.abs(other.x - enemy.x) < range) this.hitEnemy(other, 2);
      this.effects.push({ x: enemy.x, y: enemy.y - 40, age: 0, kind: 'ring', radius: range });
    }
  }

  killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.defeated.add(enemy.id);
    this.run.kills++;
    const reward = { archer: 100, shield: 150, heavy: 180, boss: 600 }[enemy.type];
    this.run.score += reward;
    this.floatText(enemy.x, enemy.y - 96, 'event.points', '#287c64', { points: reward });
    this.spawnRagdoll(enemy);
    if (this.run.upgrades.leech && this.run.kills % (this.run.upgrades.leech > 1 ? 2 : 3) === 0) {
      this.run.shields = Math.min(this.run.maxShields, this.run.shields + 1);
      this.callbacks.toast?.('toast.renewal');
    }
    if (enemy.type === 'boss') this.callbacks.toast?.('toast.boss');
  }

  checkHazards() {
    const position = this.player.position;
    for (const spike of this.level.spikes) {
      if (position.x > spike.x - 12 && position.x < spike.x + spike.width + 12 && position.y > spike.y - spike.height - 12 && position.y < spike.y + 12) this.hurt('thorns');
    }
  }

  hurt(reason, recover = false) {
    if (this.mode !== 'playing') return;
    if (this.clock < this.invulnerableUntil && !recover) return;
    this.run.shields--;
    this.run.combo = 0;
    this.flash = 0.55;
    this.shake = this.profile.reducedMotion ? 0 : 6;
    this.invulnerableUntil = this.clock + CONFIG.invulnerabilitySeconds;
    this.callbacks.sound?.('hurt');
    if (this.run.shields <= 0) {
      this.run.shields = 0;
      this.profile.bestScore = Math.max(this.profile.bestScore, this.run.score);
      this.callbacks.save?.();
      this.failureReason = reason;
      this.setMode('failed');
    } else if (recover) {
      restoreCheckpoint(this.run, this.checkpoint);
      this.loadStage(this.checkpoint);
      this.callbacks.toast?.('toast.recovery');
    } else this.callbacks.toast?.(`toast.damage.${reason}`);
    this.callbacks.hud?.(this);
  }

  updateRoutes() {
    for (const fork of this.level.forks) {
      if (this.routeIds.has(fork.id) || this.player.position.x < fork.judgeX) continue;
      this.routeIds.add(fork.id);
      if (this.player.position.y < fork.thresholdY) {
        this.run.score += 150;
        this.run.routes.push(fork.id);
        this.floatText(this.player.position.x, this.player.position.y - 65, 'event.route', '#b39437');
        this.callbacks.toast?.('toast.route');
        this.callbacks.sound?.('reward');
      }
    }
  }

  updateCheckpoints() {
    for (const x of this.level.checkpoints) {
      if (this.player.position.x >= x && this.checkpoint.x < x) {
        this.checkpoint = captureCheckpoint(this.run, x, this.consumed, this.defeated, this.routeIds);
        this.floatText(x, 365, 'event.checkpoint', '#428d69');
        this.callbacks.toast?.('event.checkpoint');
      }
    }
    const index = this.level.modules.findIndex(module => this.player.position.x < module.end);
    if (index !== -1 && index !== this.moduleIndex) { this.moduleIndex = index; this.callbacks.module?.(this.level.modules[index].label); }
  }

  finishStage() {
    const moduleNames = this.level.stage.modules;
    const routeBonus = this.run.routes.filter(id => moduleNames.some(module => id.startsWith(`${module}-`))).length * 15;
    const coins = settleStage(this.profile, `${this.run.id}:${this.run.stage}`, { score: this.run.score - this.run.stageStartScore, cuts: this.run.cuts - this.run.stageStartCuts, kills: this.run.kills - this.run.stageStartKills, routeBonus });
    this.run.coins += coins;
    this.lastStageCoins = coins;
    this.profile.bestScore = Math.max(this.profile.bestScore, this.run.score);
    if (this.run.stage === STAGES.length - 1) { this.profile.clears++; this.setMode('complete'); }
    else this.setMode('upgrade');
    this.callbacks.save?.();
    this.callbacks.sound?.('reward');
  }

  updateEffects(dt) {
    this.particles.forEach(particle => { particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 180 * dt; });
    this.floaters.forEach(floater => floater.age += dt);
    this.effects.forEach(effect => effect.age += dt);
    this.particles = this.particles.filter(particle => particle.age < particle.life);
    this.floaters = this.floaters.filter(floater => floater.age < 1.05);
    this.effects = this.effects.filter(effect => effect.age < 0.5);
    this.fragments = this.fragments.filter(fragment => {
      if (this.clock - fragment.created < 2.8 && fragment.body.position.x > this.cameraX - 140) return true;
      Composite.remove(this.engine.world, fragment.body);
      return false;
    });
    this.ragdolls = this.ragdolls.filter(ragdoll => {
      if (this.clock - ragdoll.created < 4 && ragdoll.x > this.cameraX - 250) return true;
      Composite.remove(this.engine.world, ragdoll.composite, true);
      return false;
    });
    while (this.fragments.length > 48) Composite.remove(this.engine.world, this.fragments.shift().body);
    if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
  }

  floatText(x, y, key, color, values = {}) { this.floaters.push({ x, y, key, values, color, age: 0 }); }

  puff(x, y, color, count) {
    const actual = this.profile.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < actual; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 140, size: 2 + Math.random() * 4, color, age: 0, life: 0.4 + Math.random() * 0.3 });
  }

  cutFragments(target) {
    for (const side of [-1, 1]) {
      const body = Bodies.rectangle(target.x + side * 8, target.y, 18, 31, { friction: 0.3, restitution: 0.3, density: 0.001, collisionFilter: { category: 2, mask: 1 } });
      Body.setVelocity(body, { x: side * 1.7 + 1, y: -2.5 - Math.random() });
      Body.setAngularVelocity(body, side * 0.13);
      Composite.add(this.engine.world, body);
      this.fragments.push({ body, created: this.clock, kind: target.kind, side });
    }
    this.puff(target.x, target.y, target.kind === 'pear' ? '#d3df75' : '#f3a079', 7);
  }

  spawnRagdoll(enemy) {
    const scale = enemy.type === 'boss' ? 1.55 : 1;
    const x = enemy.x, y = enemy.y;
    const group = Body.nextGroup(true);
    const options = { friction: 0.4, restitution: 0.1, collisionFilter: { group, category: 2, mask: 1 }, density: 0.001 };
    const head = Bodies.circle(x, y - 78 * scale, 13 * scale, options);
    const torso = Bodies.rectangle(x, y - 48 * scale, 17 * scale, 36 * scale, options);
    const leftArm = Bodies.rectangle(x - 22 * scale, y - 49 * scale, 31 * scale, 8 * scale, options);
    const rightArm = Bodies.rectangle(x + 19 * scale, y - 43 * scale, 29 * scale, 8 * scale, options);
    const leftLeg = Bodies.rectangle(x - 9 * scale, y - 17 * scale, 9 * scale, 33 * scale, options);
    const rightLeg = Bodies.rectangle(x + 11 * scale, y - 17 * scale, 9 * scale, 33 * scale, options);
    const bodies = [head, torso, leftArm, rightArm, leftLeg, rightLeg];
    const joints = [
      Constraint.create({ bodyA: head, pointA: { x: 0, y: 12 * scale }, bodyB: torso, pointB: { x: 0, y: -17 * scale }, stiffness: 0.65, length: 1 }),
      Constraint.create({ bodyA: torso, pointA: { x: 0, y: -10 * scale }, bodyB: leftArm, pointB: { x: 14 * scale, y: 0 }, stiffness: 0.6, length: 1 }),
      Constraint.create({ bodyA: torso, pointA: { x: 0, y: -10 * scale }, bodyB: rightArm, pointB: { x: -14 * scale, y: 0 }, stiffness: 0.6, length: 1 }),
      Constraint.create({ bodyA: torso, pointA: { x: -5 * scale, y: 16 * scale }, bodyB: leftLeg, pointB: { x: 0, y: -15 * scale }, stiffness: 0.7, length: 1 }),
      Constraint.create({ bodyA: torso, pointA: { x: 5 * scale, y: 16 * scale }, bodyB: rightLeg, pointB: { x: 0, y: -15 * scale }, stiffness: 0.7, length: 1 }),
    ];
    const composite = Composite.create();
    Composite.add(composite, [...bodies, ...joints]);
    Composite.add(this.engine.world, composite);
    bodies.forEach(body => { Body.setVelocity(body, { x: 3 + Math.random() * 2, y: -2.5 - Math.random() * 2 }); Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2); });
    this.ragdolls.push({ composite, bodies, created: this.clock, x, type: enemy.type });
  }

  snapshot() {
    return { mode: this.mode, stage: this.run.stage, x: this.player.position.x, y: this.player.position.y, score: this.run.score, energy: this.run.energy, shields: this.run.shields, cuts: this.run.cuts, kills: this.run.kills, coins: this.profile.coins, checkpointX: this.checkpoint.x, upgrades: { ...this.run.upgrades }, routes: [...this.run.routes], bodyCount: Composite.allBodies(this.engine.world).length, suspended: this.suspended };
  }

  installQA() {
    if (!this.manual) return;
    window.__BLADEBOUND__ = {
      snapshot: () => this.snapshot(),
      advance: (seconds) => { for (let t = 0; t < seconds && this.mode === 'playing'; t += 1 / 120) this.step(1 / 120); this.callbacks.hud?.(this); },
      place: (x, y, energy = this.run.energy) => { Body.setPosition(this.player, { x, y }); Body.setVelocity(this.player, { x: 0, y: 0 }); this.previousPosition = { x, y }; this.run.energy = energy; },
      targets: () => this.level.targets.map(target => ({ ...target })),
      enemies: () => this.level.enemies.map(enemy => ({ ...enemy })),
      projectiles: () => this.arrows.filter(arrow => !arrow.dead).map(arrow => ({ x: arrow.body.position.x, y: arrow.body.position.y, vx: arrow.body.velocity.x * 60, vy: arrow.body.velocity.y * 60 })),
      geometry: () => ({ spikes: this.level.spikes.map(item => ({ ...item })), pits: this.level.pits.map(item => [...item]) }),
      finish: () => { this.level.enemies.filter(enemy => enemy.type === 'boss').forEach(enemy => this.killEnemy(enemy)); Body.setPosition(this.player, { x: this.level.finishX + 1, y: 400 }); },
      hurt: (recover = false) => { this.invulnerableUntil = -1; this.hurt('test', recover); },
      arrowAt: (x, y) => { const body = Bodies.rectangle(x, y, 32, 4, { isSensor: true, collisionFilter: { mask: 0 } }); Composite.add(this.engine.world, body); this.arrows.push({ body, created: this.clock, dead: false }); },
      profile: () => JSON.parse(JSON.stringify(this.profile)),
    };
  }
}
