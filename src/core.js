import { CONFIG, SKINS, UPGRADES } from './config.js';
import { normalizeLanguage } from './i18n.js';

export const PROFILE_KEY = 'bladebound.profile.v1';

export function freshProfile() {
  return { version: 1, coins: 0, bestScore: 0, runs: 0, clears: 0, totalCuts: 0, totalKills: 0, owned: ['dawn'], selected: 'dawn', sound: true, reducedMotion: false, language: 'en', difficulty: 'standard', settled: [] };
}

export function sanitizeProfile(value) {
  const base = freshProfile();
  if (!value || typeof value !== 'object' || value.version !== 1) return base;
  for (const key of ['coins', 'bestScore', 'runs', 'clears', 'totalCuts', 'totalKills']) {
    base[key] = Number.isFinite(value[key]) ? Math.max(0, Math.floor(value[key])) : 0;
  }
  base.owned = [...new Set(['dawn', ...(Array.isArray(value.owned) ? value.owned.filter(id => SKINS.some(s => s.id === id)) : [])])];
  base.selected = base.owned.includes(value.selected) ? value.selected : 'dawn';
  base.sound = typeof value.sound === 'boolean' ? value.sound : true;
  base.reducedMotion = typeof value.reducedMotion === 'boolean' ? value.reducedMotion : false;
  base.language = normalizeLanguage(value.language);
  base.difficulty = Object.hasOwn(CONFIG.difficulty, value.difficulty) ? value.difficulty : 'standard';
  base.settled = Array.isArray(value.settled) ? value.settled.filter(id => typeof id === 'string').slice(-120) : [];
  return base;
}

export function loadProfile(storage) {
  try { return sanitizeProfile(JSON.parse(storage.getItem(PROFILE_KEY))); }
  catch { return freshProfile(); }
}

export function saveProfile(storage, profile) {
  try { storage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
}

export function buySkin(profile, id) {
  const item = SKINS.find(s => s.id === id);
  if (!item) return { ok: false, reason: 'skinMissing' };
  if (profile.owned.includes(id)) { profile.selected = id; return { ok: true, bought: false }; }
  if (profile.coins < item.cost) return { ok: false, reason: 'insufficientCoins' };
  profile.coins -= item.cost;
  profile.owned.push(id);
  profile.selected = id;
  return { ok: true, bought: true };
}

export function settleStage(profile, id, { score, cuts, kills, routeBonus = 0 }) {
  if (profile.settled.includes(id)) return 0;
  const coins = Math.max(0, Math.floor(score / 10)) + Math.max(0, Math.floor(routeBonus));
  profile.coins += coins;
  profile.totalCuts += Math.max(0, Math.floor(cuts));
  profile.totalKills += Math.max(0, Math.floor(kills));
  profile.settled.push(id);
  profile.settled = profile.settled.slice(-120);
  return coins;
}

export function createRun(difficulty = 'standard', id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {
  const selectedDifficulty = Object.hasOwn(CONFIG.difficulty, difficulty) ? difficulty : 'standard';
  const mode = CONFIG.difficulty[selectedDifficulty];
  return { id, stage: 0, score: 0, stageStartScore: 0, cuts: 0, kills: 0, stageStartCuts: 0, stageStartKills: 0, coins: 0, energy: 0, combo: 0, lastSliceTime: -10, shields: mode.shields, maxShields: mode.shields, difficulty: selectedDifficulty, upgrades: {}, routes: [], elapsed: 0, recoveries: 0 };
}

export function sliceReward(combo, bonusLevel = 0) {
  const multiplier = 1 + Math.min(Math.max(combo - 1, 0), 4) * 0.25;
  return Math.round(10 * multiplier * (1 + 0.5 * bonusLevel));
}

export function applyUpgrade(run, id) {
  const upgrade = UPGRADES.find(item => item.id === id);
  if (!upgrade || (run.upgrades[id] ?? 0) >= upgrade.max) return false;
  run.upgrades[id] = (run.upgrades[id] ?? 0) + 1;
  if (id === 'shield') { run.maxShields += 1; run.shields = Math.min(run.maxShields, run.shields + 1); }
  return true;
}

export function upgradeOptions(run) {
  const eligible = UPGRADES.filter(u => (run.upgrades[u.id] ?? 0) < u.max);
  const rotation = (run.stage * 2 + (run.cuts % 3)) % eligible.length;
  return [...eligible.slice(rotation), ...eligible.slice(0, rotation)].slice(0, 3);
}

export function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

export function captureCheckpoint(run, x, consumed, defeated, routes) {
  return { x, score: run.score, cuts: run.cuts, kills: run.kills, energy: run.energy, consumed: [...consumed], defeated: [...defeated], routes: [...routes], runRoutes: [...run.routes] };
}

export function restoreCheckpoint(run, checkpoint) {
  Object.assign(run, { score: checkpoint.score, cuts: checkpoint.cuts, kills: checkpoint.kills, energy: checkpoint.energy, combo: 0, lastSliceTime: -10, routes: [...checkpoint.runRoutes] });
  run.recoveries++;
  return { consumed: new Set(checkpoint.consumed), defeated: new Set(checkpoint.defeated), routes: new Set(checkpoint.routes) };
}
