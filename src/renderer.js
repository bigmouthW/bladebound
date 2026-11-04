import { CONFIG, SKINS } from './config.js';
import { t } from './i18n.js';

const TAU = Math.PI * 2;
const noise = value => {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.width = 1280;
    this.height = 640;
    this.scale = 1;
    this.offsetY = 0;
    this.playerScreenX = 210;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
    this.scale = Math.min(this.width / 760, this.height / 640);
    this.offsetY = Math.max(0, (this.height - 640 * this.scale) * 0.6);
    this.worldWidth = this.width / this.scale;
    this.playerScreenX = Math.min(250, this.worldWidth * 0.2);
  }

  draw(world, time) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background(world, time);
    c.save();
    let shakeX = 0, shakeY = 0;
    if (world.shake && !world.profile.reducedMotion) { shakeX = Math.sin(time * 90) * world.shake; shakeY = Math.cos(time * 70) * world.shake * 0.5; }
    c.translate(shakeX, this.offsetY + shakeY);
    c.scale(this.scale, this.scale);
    c.translate(-world.cameraX, 0);
    const left = world.cameraX - 180, right = world.cameraX + this.worldWidth + 180;
    this.landscape(world, left, right, time);
    this.terrain(world, left, right);
    for (const fork of world.level.forks) if (fork.end > left && fork.start < right) this.fork(fork);
    for (const x of world.level.checkpoints) if (x > left && x < right) this.checkpoint(x, world.checkpoint.x >= x, time);
    if (world.level.finishX > left && world.level.finishX < right) this.finish(world.level.finishX, time);
    for (const target of world.level.targets) if (target.x > left && target.x < right && !world.consumed.has(target.id)) this.target(target, time);
    for (const spike of world.level.spikes) if (spike.x + spike.width > left && spike.x < right) this.spike(spike);
    for (const enemy of world.level.enemies) if (enemy.alive && enemy.x > left && enemy.x < right) this.enemy(enemy, world, time);
    for (const ragdoll of world.ragdolls) this.ragdoll(ragdoll, world.clock);
    for (const fragment of world.fragments) this.fragment(fragment, world.clock);
    for (const arrow of world.arrows) if (!arrow.dead) this.arrow(arrow);
    this.blade(world, time);
    this.effects(world);
    c.restore();
    if (world.flash) { c.fillStyle = `rgba(235,107,80,${world.flash * 0.2})`; c.fillRect(0, 0, this.width, this.height); }
  }

  background(world, time) {
    const c = this.ctx, w = this.width, h = this.height;
    const theme = world.level.stage;
    c.fillStyle = theme.sky;
    c.fillRect(0, 0, w, h);
    const horizon = this.offsetY + this.scale * 450;
    const camera = world.cameraX * this.scale;
    c.fillStyle = '#f9fffa';
    c.globalAlpha = 0.65;
    for (let i = -1; i < 6; i++) {
      const x = i * 410 - (camera * 0.07) % 410 + noise(i + 5) * 90;
      const y = 60 + noise(i + 20) * 95;
      c.beginPath();
      c.moveTo(x - 75, y + 12);
      c.bezierCurveTo(x - 55, y - 2, x - 30, y - 7, x - 9, y + 2);
      c.bezierCurveTo(x + 5, y - 16, x + 31, y - 12, x + 42, y + 1);
      c.bezierCurveTo(x + 65, y - 2, x + 78, y + 5, x + 90, y + 12);
      c.closePath();c.fill();
    }
    c.globalAlpha = 1;
    for (const layer of [0, 1, 2]) {
      const spacing = [380, 430, 340][layer];
      const offset = -(camera * [0.10, 0.19, 0.31][layer]) % spacing;
      const baseY = horizon + layer * 15;
      c.fillStyle = [theme.far, theme.mountain, theme.near][layer];
      c.beginPath();c.moveTo(-spacing, h);
      for (let i = -1; i < w / spacing + 2; i++) {
        const x = i * spacing + offset;
        const peak = baseY - (90 + noise(i + 18 + layer * 7) * 100) * (layer === 2 ? 0.6 : 1);
        c.lineTo(x - spacing * 0.5, baseY + 15);
        c.bezierCurveTo(x - spacing * 0.25, baseY - 25, x - spacing * 0.25, peak + 40, x - spacing * 0.08, peak + 12);
        c.bezierCurveTo(x, peak - 2, x + 25, peak + 6, x + spacing * 0.12, peak + 30);
        c.bezierCurveTo(x + spacing * 0.25, baseY - 70, x + spacing * 0.3, baseY - 10, x + spacing * 0.5, baseY + 15);
      }
      c.lineTo(w + spacing, h);c.closePath();c.fill();
      if (layer === 1) {
        c.strokeStyle = '#ebf4e640';c.lineWidth = 2;
        for (let i = -1; i < w / spacing + 2; i++) {
          const x = i * spacing + offset;
          c.beginPath();c.moveTo(x - 16, baseY - 110);c.quadraticCurveTo(x - 48, baseY - 70, x - 35, baseY - 25);c.stroke();
        }
      }
    }
    c.fillStyle = '#eff7ef55';c.fillRect(0, horizon - 5, w, 25);
    if (world.mode === 'ready') {
      c.fillStyle = '#e4f0e765';c.fillRect(0, 0, w, h);
    }
  }

  landscape(world, left, right, time) {
    const c = this.ctx;
    const scroll = world.cameraX * 0.68;
    for (let i = Math.floor((left - scroll) / 430) - 1; i < (right - scroll) / 430 + 1; i++) {
      const x = i * 430 + scroll + noise(i + 4) * 60;
      this.bamboo(x, 488, 100 + noise(i + 8) * 95, 0.25, time);
    }
    for (let i = Math.floor(left / 570); i < right / 570 + 1; i++) {
      const x = i * 570 + 90;
      c.fillStyle = '#4a8b6a';
      for (let j = 0; j < 5; j++) {
        c.beginPath();c.moveTo(x + j * 9, 490);c.quadraticCurveTo(x + j * 9 - 8, 464 - noise(i + j) * 15, x + j * 9 - 14, 477);c.quadraticCurveTo(x + j * 9 + 3, 478, x + j * 9, 490);c.fill();
      }
      if (i % 3 === 1) {
        c.fillStyle = '#e69e78';
        for (let j = 0; j < 3; j++) { c.beginPath();c.arc(x + j * 12 + 4, 477 - j * 2, 3, 0, TAU);c.fill(); }
      }
    }
    const gateX = Math.floor(world.cameraX / 3600) * 3600 + 1450;
    if (gateX > left - 200 && gateX < right + 200) {
      c.globalAlpha = 0.32;
      c.drawImage(this.assets.gate, gateX - 105, 242, 210, 228);
      c.globalAlpha = 1;
    }
  }

  bamboo(x, y, height, opacity, time) {
    const c = this.ctx;
    c.save();c.globalAlpha = opacity;c.translate(x, y);
    c.strokeStyle = '#367d66';c.lineWidth = 6;c.lineCap = 'round';
    for (let stem = 0; stem < 3; stem++) {
      const dx = stem * 13;
      c.beginPath();c.moveTo(dx, 0);c.lineTo(dx - 6 + Math.sin(time * 0.4) * 1.3, -height + stem * 20);c.stroke();
      for (let j = 1; j < height / 32; j++) {
        const sy = -j * 30;
        c.strokeStyle = '#abd0a9';c.lineWidth = 2;c.beginPath();c.moveTo(dx - 4, sy);c.lineTo(dx + 3, sy);c.stroke();
        c.strokeStyle = '#367d66';c.lineWidth = 6;
        if (j % 2) {
          c.fillStyle = '#378265';c.beginPath();c.moveTo(dx, sy);c.quadraticCurveTo(dx - 38, sy - 28, dx - 46, sy - 17);c.quadraticCurveTo(dx - 21, sy - 12, dx, sy);c.fill();
          c.beginPath();c.moveTo(dx, sy);c.quadraticCurveTo(dx + 28, sy - 30, dx + 39, sy - 24);c.quadraticCurveTo(dx + 20, sy - 8, dx, sy);c.fill();
        }
      }
    }
    c.restore();
  }

  terrain(world, left, right) {
    const c = this.ctx, floorY = CONFIG.floorY;
    const depth = Math.max(180, (this.height - this.offsetY) / this.scale - floorY + 30);
    for (const segment of world.level.floorSegments) {
      if (segment.right < left || segment.left > right) continue;
      const x = Math.max(segment.left, left), end = Math.min(segment.right, right);
      c.fillStyle = '#dfe6e0';c.fillRect(x, floorY, end - x, depth);
      c.fillStyle = '#eff5e9';c.fillRect(x, floorY, end - x, 15);
      c.fillStyle = world.level.stage.ground;c.fillRect(x, floorY - 4, end - x, 6);
      c.fillStyle = '#c0d2bc';c.fillRect(x, floorY + 15, end - x, 4);
      c.strokeStyle = '#a8c0a546';c.lineWidth = 1.5;
      for (let joint = Math.floor(x / 140) * 140; joint < end; joint += 140) {
        c.beginPath();c.moveTo(joint, floorY + 20);c.lineTo(joint - 7, floorY + 76);c.lineTo(joint + 8, floorY + 118);c.stroke();
        c.beginPath();c.moveTo(joint + 13, floorY + 58);c.lineTo(joint + 84, floorY + 58);c.stroke();
      }
      c.fillStyle = '#a6baab40';c.fillRect(x, floorY + 109, end - x, Math.max(0, depth - 109));
      if (world.run.stage === 1) {
        c.strokeStyle = '#bd7254';c.lineWidth = 6;
        c.beginPath();c.moveTo(x, floorY - 36);c.lineTo(end, floorY - 36);c.stroke();
        for (let post = Math.floor(x / 130) * 130; post < end; post += 130) { c.fillStyle = '#cc8d6a';c.fillRect(post, floorY - 49, 9, 45);c.fillStyle = '#e9bc88';c.fillRect(post - 2, floorY - 54, 13, 6); }
      }
    }
    for (const platform of world.level.platforms) {
      if (platform.x + platform.width / 2 < left || platform.x - platform.width / 2 > right) continue;
      const x = platform.x - platform.width / 2;
      c.fillStyle = '#eaf1de';c.fillRect(x, platform.y, platform.width, platform.height);
      c.fillStyle = '#408f6c';c.fillRect(x, platform.y - 4, platform.width, 6);
      c.fillStyle = '#a7c6a0';c.fillRect(x, platform.y + platform.height - 5, platform.width, 5);
      c.fillStyle = '#a8bc9d';
      for (let p = x + 90; p < x + platform.width; p += 235) c.fillRect(p, platform.y + platform.height, 16, floorY - platform.y - platform.height);
    }
  }

  fork(fork) {
    const c = this.ctx;
    c.fillStyle = '#c7aa58';c.fillRect(fork.start + 18, 305, 4, 76);
    c.fillStyle = '#f5e4a7';
    c.beginPath();c.moveTo(fork.start - 5, 307);c.lineTo(fork.start + 98, 307);c.lineTo(fork.start + 111, 322);c.lineTo(fork.start + 98, 337);c.lineTo(fork.start - 5, 337);c.closePath();c.fill();
    c.fillStyle = '#8c783c';c.font = 'bold 12px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t('scene.highPath'), fork.start + 50, 327, 104);
    c.fillStyle = '#5d8a70';c.font = '11px Arial,"Microsoft YaHei",sans-serif';c.fillText(t('scene.safePath'), fork.start + 47, 471);
  }

  checkpoint(x, active, time) {
    const c = this.ctx;
    c.fillStyle = '#779981';c.fillRect(x - 3, 384, 6, 105);
    c.fillStyle = '#89a78c';c.fillRect(x - 19, 487, 38, 5);
    c.strokeStyle = '#76977e';c.lineWidth = 3;c.beginPath();c.moveTo(x, 385);c.lineTo(x + 26, 385);c.lineTo(x + 26, 401);c.stroke();
    c.fillStyle = active ? '#f0ca6b' : '#d9dfc6';
    c.beginPath();c.ellipse(x + 26, 418, 14, 19, 0, 0, TAU);c.fill();
    c.strokeStyle = active ? '#d3a74a' : '#aec3a3';c.lineWidth = 2;c.stroke();
    c.beginPath();c.moveTo(x + 14, 417);c.lineTo(x + 38, 417);c.stroke();
    if (active) { c.strokeStyle = '#f8e7ad';c.lineWidth = 2;c.beginPath();c.moveTo(x + 26, 409);c.lineTo(x + 26, 426);c.stroke(); }
    c.fillStyle = '#5b8a6c';c.font = '10px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t('scene.checkpoint'), x + 24, 454);
  }

  finish(x, time) {
    const c = this.ctx;
    c.drawImage(this.assets.gate, x - 112, 233, 224, 260);
    c.fillStyle = '#f6e4a8';c.fillRect(x - 48, 344, 96, 29);
    c.fillStyle = '#5f815e';c.font = 'bold 12px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t('scene.next'), x, 364, 88);
  }

  target(target, time) {
    const c = this.ctx;
    const size = target.kind === 'crate' ? 44 : 42;
    c.save();c.translate(target.x, target.y + Math.sin(time * 2 + target.x) * 2);
    c.fillStyle = '#4f78551a';c.beginPath();c.ellipse(0, 30, 17, 3, 0, 0, TAU);c.fill();
    c.drawImage(this.assets[target.kind], -size / 2, -size / 2, size, size);
    c.restore();
  }

  spike(spike) {
    const c = this.ctx, count = Math.max(2, Math.round(spike.width / 18));
    c.fillStyle = '#c46057';c.fillRect(spike.x - 3, spike.y - 6, spike.width + 6, 8);
    for (let i = 0; i < count; i++) {
      const x = spike.x + i * spike.width / count;
      c.fillStyle = i % 2 ? '#e77f73' : '#ea9a88';
      c.beginPath();c.moveTo(x, spike.y - 6);c.lineTo(x + spike.width / count / 2, spike.y - spike.height);c.lineTo(x + spike.width / count, spike.y - 6);c.closePath();c.fill();
      c.strokeStyle = '#c4675a';c.lineWidth = 1.3;c.stroke();
    }
  }

  enemy(enemy, world, time) {
    const c = this.ctx, size = enemy.type === 'boss' ? 1.6 : enemy.type === 'heavy' ? 1.13 : 1;
    c.save();c.translate(enemy.x, enemy.y);
    if (enemy.damageFlash) c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(time * 36));
    c.drawImage(this.assets.archer, -45 * size, -110 * size, 92 * size, 110 * size);
    if (enemy.type === 'heavy' || enemy.type === 'boss') {
      c.fillStyle = enemy.type === 'boss' ? '#b85c48' : '#c7a35c';
      c.beginPath();c.moveTo(-10 * size, -67 * size);c.lineTo(11 * size, -67 * size);c.lineTo(14 * size, -37 * size);c.lineTo(-12 * size, -37 * size);c.closePath();c.fill();
      c.strokeStyle = '#eed6a0';c.lineWidth = 2;c.beginPath();c.moveTo(0, -64 * size);c.lineTo(0, -40 * size);c.stroke();
    }
    if (enemy.shield) {
      c.fillStyle = '#41917a';c.strokeStyle = '#acd9be';c.lineWidth = 3;
      c.beginPath();c.moveTo(-33, -74);c.lineTo(-12, -68);c.lineTo(-14, -32);c.lineTo(-33, -19);c.lineTo(-47, -33);c.lineTo(-47, -68);c.closePath();c.fill();c.stroke();
      c.strokeStyle = '#d4e8cb';c.lineWidth = 2;c.beginPath();c.moveTo(-31, -65);c.lineTo(-31, -32);c.moveTo(-40, -48);c.lineTo(-21, -48);c.stroke();
    }
    c.globalAlpha = 1;
    if (enemy.type === 'boss') {
      c.fillStyle = '#b15e4e';c.font = 'bold 11px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t('scene.boss'), 0, -193);
      c.fillStyle = '#c7d7c7';c.fillRect(-48, -184, 96, 5);c.fillStyle = '#d98162';c.fillRect(-48, -184, 96 * Math.max(0, enemy.hp / 6), 5);
    }
    if (enemy.nextShot && enemy.nextShot - world.clock < 0.5 && enemy.nextShot - world.clock > 0) {
      c.strokeStyle = '#da785b';c.lineWidth = 2;c.setLineDash([5, 5]);c.globalAlpha = 0.6;
      c.beginPath();c.moveTo(-28 * size, -54 * size);c.lineTo(-160 * size, -54 * size);c.stroke();c.setLineDash([]);c.globalAlpha = 1;
      c.fillStyle = '#db7656';c.font = 'bold 16px Arial';c.fillText('!', -5, -122 * size);
    }
    c.restore();
  }

  ragdoll(ragdoll, clock) {
    const c = this.ctx;c.save();c.globalAlpha = Math.max(0, Math.min(1, 4 - (clock - ragdoll.created)));
    ragdoll.bodies.forEach((body, i) => {
      c.fillStyle = i === 0 ? '#f3ddbc' : i === 1 ? '#c58263' : '#4a7a65';
      c.strokeStyle = '#4a705c';c.lineWidth = 1.5;
      if (i === 0) { c.beginPath();c.arc(body.position.x, body.position.y, body.circleRadius, 0, TAU);c.fill();c.stroke(); }
      else { c.beginPath();body.vertices.forEach((v, index) => index ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y));c.closePath();c.fill();c.stroke(); }
    });c.restore();
  }

  fragment(fragment, clock) {
    const c = this.ctx, body = fragment.body;
    c.save();c.translate(body.position.x, body.position.y);c.rotate(body.angle);c.globalAlpha = Math.min(1, 2.8 - (clock - fragment.created));
    c.beginPath();c.rect(fragment.side < 0 ? -23 : 0, -23, 23, 46);c.clip();
    c.drawImage(this.assets[fragment.kind], -23, -23, 46, 46);c.restore();
  }

  arrow(arrow) {
    const c = this.ctx, body = arrow.body;
    c.save();c.translate(body.position.x, body.position.y);c.rotate(Math.atan2(body.velocity.y, body.velocity.x));
    c.strokeStyle = '#a45b49';c.lineWidth = 2;c.beginPath();c.moveTo(-18, 0);c.lineTo(18, 0);c.stroke();
    c.fillStyle = '#dd795e';c.beginPath();c.moveTo(19, 0);c.lineTo(10, -4);c.lineTo(10, 4);c.closePath();c.fill();
    c.strokeStyle = '#e5c183';c.beginPath();c.moveTo(-13, -4);c.lineTo(-8, 0);c.lineTo(-13, 4);c.stroke();c.restore();
  }

  blade(world, time) {
    const c = this.ctx, position = world.player.position;
    const skin = SKINS.find(s => s.id === world.profile.selected) ?? SKINS[0];
    if (world.trail.length > 2) {
      c.strokeStyle = world.run.energy >= 100 ? '#e7bc59' : skin.trail;
      c.lineWidth = world.run.energy >= 100 ? 6 : 4;c.lineCap = 'round';c.globalAlpha = 0.65;
      c.beginPath();world.trail.forEach((point, i) => i ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y));c.stroke();c.globalAlpha = 1;
    }
    c.save();c.translate(position.x, position.y);
    if (world.clock < world.invulnerableUntil && world.mode === 'playing') c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 15));
    c.fillStyle = '#2d625b20';c.beginPath();c.ellipse(0, Math.max(12, CONFIG.floorY - position.y - 2), 24, 4, 0, 0, TAU);c.fill();
    c.rotate(world.angle);
    c.drawImage(this.assets.blade, -49, -16, 98, 33);
    c.fillStyle = skin.color;c.fillRect(-40, -6, 20, 12);
    c.strokeStyle = '#ffffff66';c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { c.beginPath();c.moveTo(-36 + i * 6, -5);c.lineTo(-36 + i * 6, 5);c.stroke(); }
    if (world.run.energy >= 100) { c.strokeStyle = '#fff0a0';c.lineWidth = 2;c.beginPath();c.moveTo(-9, -12);c.lineTo(37, -12);c.lineTo(49, 0);c.lineTo(37, 12);c.stroke(); }
    c.restore();
    if (world.run.combo > 1) {
      c.fillStyle = '#458d6d';c.font = 'bold 14px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t('scene.combo', { count: world.run.combo }), position.x, position.y - 65);
    }
  }

  effects(world) {
    const c = this.ctx;
    for (const particle of world.particles) { c.globalAlpha = Math.max(0, 1 - particle.age / particle.life);c.fillStyle = particle.color;c.fillRect(particle.x, particle.y, particle.size, particle.size); }
    c.globalAlpha = 1;
    for (const floater of world.floaters) { c.globalAlpha = Math.min(1, (1.05 - floater.age) * 2);c.fillStyle = floater.color;c.font = 'bold 13px Arial,"Microsoft YaHei",sans-serif';c.textAlign = 'center';c.fillText(t(floater.key, floater.values), floater.x, floater.y - floater.age * 36); }
    c.globalAlpha = 1;
    for (const effect of world.effects) {
      c.save();c.translate(effect.x, effect.y);c.globalAlpha = Math.max(0, 1 - effect.age * 2);
      if (effect.kind === 'slash') {
        c.rotate(-0.7);c.strokeStyle = '#fcf7c9';c.lineWidth = 12 - effect.age * 16;c.beginPath();c.ellipse(0, 0, 90 + effect.age * 120, 30 + effect.age * 20, 0, -2.2, 0.9);c.stroke();
        c.strokeStyle = '#e7bb4f';c.lineWidth = 3;c.stroke();
      } else { c.strokeStyle = '#edd176';c.lineWidth = 3;c.beginPath();c.arc(0, 0, effect.radius * Math.min(1, effect.age * 4), 0, TAU);c.stroke(); }
      c.restore();
    }
  }
}
