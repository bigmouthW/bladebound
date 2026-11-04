import './styles.css';
import { createIcons, Coins, Swords, Trophy, Settings2, Sparkles, Crosshair, Zap, Volume2, VolumeX, Pause, MoveUpRight, Play, ArrowRight, RotateCcw, House, Shield, ShieldPlus, HeartPulse, Wind, Waves, X, Check, Lock, Medal, Flag, Leaf, Flower2 } from 'lucide';
import { CONFIG, STAGES, SKINS, UPGRADES } from './config.js';
import { loadProfile, saveProfile, buySkin, upgradeOptions } from './core.js';
import { World } from './world.js';
import { t, setLanguage, getLanguage, normalizeLanguage } from './i18n.js';

const icons = { Coins, Swords, Trophy, Settings2, Sparkles, Crosshair, Zap, Volume2, VolumeX, Pause, MoveUpRight, Play, ArrowRight, RotateCcw, House, Shield, ShieldPlus, HeartPulse, Wind, Waves, X, Check, Lock, Medal, Flag, Leaf, Flower2 };
const $ = selector => document.querySelector(selector);
const icon = name => `<i data-lucide="${name}"></i>`;
// Resolve art against Vite's base so the build also works from a sub-path
// (for example a hosting portal that serves the game from /<slug>/).
const assetUrl = name => `${import.meta.env.BASE_URL}assets/${name}.svg`;
const format = value => Math.floor(value).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
const storage = (() => {
  try { return window.localStorage; }
  catch { return { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; }
})();
const profile = loadProfile(storage);
setLanguage(profile.language);
let game;
let toastTimeout;
let dialogOpen = false;
let dialogKind;
let dialogReturnFocus;
let lastShields = '';
let lastPauseMode = '';
let audio;
let lastSliceSound = 0;
let storageWarning = false;
let currentToast;

function refreshIcons() { createIcons({ icons, attrs: { 'aria-hidden': 'true' } }); }

function toast(key, values = {}) {
  currentToast = { key, values };
  $('#scene-toast').textContent = t(key, values);
  $('#scene-toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#scene-toast').classList.remove('visible'), 2200);
}

function save() {
  if (!saveProfile(storage, profile) && !storageWarning) { storageWarning = true; toast('error.storage'); }
  $('#wallet-count').textContent = format(profile.coins);
  $('#best-footer').textContent = t('label.best', { score: format(profile.bestScore) });
}

function localizeDocument() {
  document.documentElement.lang = getLanguage();
  document.title = t('game.title');
  $('meta[name="description"]').content = t('game.description');
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-tooltip]').forEach(node => { node.dataset.tooltip = t(node.dataset.i18nTooltip); });
  $('.version-label').textContent = t('label.version', { version: CONFIG.version });
}

function changeLanguage(value) {
  const focusedId = document.activeElement?.id;
  const fromReady = Boolean(document.activeElement?.dataset.language);
  profile.language = normalizeLanguage(value);
  setLanguage(profile.language);
  localizeDocument();
  lastPauseMode = '';
  lastShields = '';
  updateSoundIcon();
  save();
  if (game) { hud(game);renderState(game); }
  if (currentToast) $('#scene-toast').textContent = t(currentToast.key, currentToast.values);
  if (dialogOpen) {
    if (dialogKind !== 'settings') {
      ({ collection: collectionDialog, records: recordsDialog })[dialogKind]?.();
      if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    }
  } else if (fromReady) document.querySelector(`[data-language="${profile.language}"]`)?.focus({ preventScroll: true });
}

function updateModule(world) {
  const module = world.level.modules[Math.max(0, world.moduleIndex)];
  $('#module-label').textContent = t('module.label', { act: world.run.stage + 1, module: t(`module.${module.id}`) });
}

function sound(kind) {
  if (!profile.sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const now = audio.currentTime;
    if (kind === 'slice' && now - lastSliceSound < 0.04) return;
    if (kind === 'slice') lastSliceSound = now;
    const settings = {
      slice: [700, 1050, 0.06, 0.045, 'triangle'], jump: [230, 400, 0.11, 0.022, 'sine'],
      hit: [180, 95, 0.11, 0.05, 'triangle'], charged: [140, 680, 0.25, 0.065, 'triangle'],
      hurt: [190, 65, 0.23, 0.045, 'sawtooth'], arrow: [450, 180, 0.08, 0.015, 'sine'],
      parry: [850, 1400, 0.12, 0.04, 'sine'], reward: [460, 920, 0.35, 0.04, 'sine'],
      start: [330, 660, 0.2, 0.035, 'sine'], upgrade: [520, 1040, 0.26, 0.04, 'triangle'],
    }[kind] ?? [440, 540, 0.08, 0.02, 'sine'];
    const [from, to, duration, volume, waveform] = settings;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);gain.connect(audio.destination);
    oscillator.start(now);oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect();gain.disconnect(); };
  } catch { /* Audio is optional when the browser disallows it. */ }
}

// iOS suspends or interrupts the AudioContext when the page is backgrounded;
// only a fresh user gesture can bring it back, so resume on every touch/click.
function resumeAudio() {
  if (!audio) return;
  if (audio.state === 'suspended' || audio.state === 'interrupted') audio.resume().catch(() => {});
}
document.addEventListener('touchend', resumeAudio, { passive: true });
document.addEventListener('click', resumeAudio, { passive: true });

function updateSoundIcon() {
  $('#sound-button').innerHTML = icon(profile.sound ? 'volume-2' : 'volume-x');
  $('#sound-button').setAttribute('aria-label', t(profile.sound ? 'action.mute' : 'action.unmute'));
  $('#sound-button').dataset.tooltip = t(profile.sound ? 'action.mute' : 'action.unmute');
  refreshIcons();
}

function hud(world) {
  const run = world.run;
  $('#score').textContent = format(run.score);
  $('#kills').textContent = format(run.kills);
  $('#energy-value').textContent = `${Math.floor(run.energy)} / 100`;
  $('#energy-fill').style.width = `${run.energy}%`;
  $('.energy-group').classList.toggle('charged', run.energy >= 100);
  $('#stage-label').textContent = t(`stage.${STAGES[run.stage].id}`);
  $('#difficulty-label').textContent = t(`difficulty.${run.difficulty}`);
  updateModule(world);
  $('#progress-fill').style.width = `${Math.max(0, Math.min(100, (world.player.position.x - 200) / (world.level.finishX - 200) * 100))}%`;
  document.querySelectorAll('.chapter-step').forEach((node, i) => { node.classList.toggle('current', i === run.stage);node.classList.toggle('done', i < run.stage); });
  const shieldKey = `${run.shields}/${run.maxShields}`;
  if (lastShields !== shieldKey) {
    lastShields = shieldKey;
    $('#shields').innerHTML = Array.from({ length: run.maxShields }, (_, i) => `<i data-lucide="shield" class="${i < run.shields ? '' : 'empty'}"></i>`).join('');
    $('#shields').setAttribute('aria-label', t('label.shieldCount', { current: run.shields, max: run.maxShields }));
    refreshIcons();
  }
  $('#jump-button').disabled = world.mode !== 'playing';
  $('#pause-button').disabled = !['playing', 'paused'].includes(world.mode);
  if (lastPauseMode !== world.mode) {
    lastPauseMode = world.mode;
    $('#pause-button').innerHTML = icon(world.mode === 'paused' ? 'play' : 'pause');
    $('#pause-button').setAttribute('aria-label', t(world.mode === 'paused' ? 'action.continue' : 'action.pause'));
    $('#pause-button').dataset.tooltip = t(world.mode === 'paused' ? 'action.continue' : 'action.pause');
    refreshIcons();
  }
}

function panelButtons() {
  return `<div class="panel-buttons"><button class="secondary-button" data-action="home" aria-label="${t('action.home')}">${icon('house')}</button><button class="primary-button" data-action="retry">${icon('rotate-ccw')}${t('action.retry')}</button></div>`;
}

function renderState(world) {
  const overlay = $('#overlay');
  overlay.classList.toggle('active', world.mode !== 'playing');
  overlay.classList.toggle('is-ready', world.mode === 'ready');
  if (world.mode === 'playing') { overlay.innerHTML = '';return; }
  const run = world.run;
  if (world.mode === 'ready') {
    overlay.innerHTML = `<div class="ready-content"><div class="ready-seal">${icon('leaf')}${t('game.seal')}</div><h1>${t('game.title')}</h1><p class="english-title">${t('game.subtitle')}</p><div class="language-control" role="group" aria-label="${t('language')}"><button lang="en" data-language="en" class="${profile.language === 'en' ? 'selected' : ''}" aria-pressed="${profile.language === 'en'}">English</button><button lang="zh-CN" data-language="zh-CN" class="${profile.language === 'zh-CN' ? 'selected' : ''}" aria-pressed="${profile.language === 'zh-CN'}">中文</button></div><div class="difficulty-control" role="group" aria-label="${t('difficulty')}"><button data-difficulty="standard" class="${profile.difficulty === 'standard' ? 'selected' : ''}" aria-pressed="${profile.difficulty === 'standard'}">${t('difficulty.standard')}</button><button data-difficulty="relaxed" class="${profile.difficulty === 'relaxed' ? 'selected' : ''}" aria-pressed="${profile.difficulty === 'relaxed'}">${t('difficulty.relaxed')}</button></div><button class="primary-button" data-action="start">${icon('play')}${t('action.start')}</button><div class="ready-art"><span></span>${icon('flower-2')}<span></span></div></div>`;
  } else if (world.mode === 'paused') {
    overlay.innerHTML = `<div class="panel"><div class="eyebrow">${t('pause.eyebrow')}</div><h2>${t('pause.title')}</h2><p class="panel-meta">${t('pause.meta', { stage: t(`stage.${STAGES[run.stage].id}`), score: format(run.score) })}</p><button class="primary-button" data-action="resume" style="margin:auto">${icon('play')}${t('action.resume')}</button>${panelButtons()}</div>`;
  } else if (world.mode === 'failed') {
    overlay.innerHTML = `<div class="panel">${icon('wind')}<div class="eyebrow">${t(`reason.${world.failureReason}`)}</div><h2>${t('failure.title')}</h2><div class="results-grid"><div><b>${format(run.score)}</b><span>${t('label.score')}</span></div><div><b>${run.cuts}</b><span>${t('label.cuts')}</span></div><div><b>${run.kills}</b><span>${t('label.kills')}</span></div></div>${panelButtons()}</div>`;
  } else if (world.mode === 'upgrade') {
    const choices = upgradeOptions(run);
    world.offeredUpgrades = choices.map(item => item.id);
    overlay.innerHTML = `<div class="panel upgrade-panel">${icon('leaf')}<div class="eyebrow">${t('upgrade.cleared', { stage: t(`stage.${STAGES[run.stage].id}`) })}</div><h2>${t('upgrade.title')}</h2><p class="panel-meta">${t('upgrade.meta', { coins: world.lastStageCoins, stage: t(`stage.${STAGES[run.stage + 1].id}`) })}</p><div class="upgrade-options">${choices.map(item => `<button class="upgrade-option" data-upgrade="${item.id}">${icon(item.icon)}<strong>${t(`upgrade.${item.id}.name`)}</strong><small>${t(`upgrade.${item.id}.${(run.upgrades[item.id] ?? 0) + 1}`)}</small><small class="level-note">${run.upgrades[item.id] ? t('upgrade.level', { level: run.upgrades[item.id] + 1 }) : t('upgrade.new')}</small></button>`).join('')}</div></div>`;
  } else if (world.mode === 'complete') {
    overlay.innerHTML = `<div class="panel">${icon('medal')}<div class="eyebrow">${t('complete.eyebrow')}</div><h2>${t('complete.title')}</h2><div class="results-grid"><div><b>${format(run.score)}</b><span>${t('label.score')}</span></div><div><b>${run.coins}</b><span>${t('label.earnedCoins')}</span></div><div><b>${run.kills}</b><span>${t('label.kills')}</span></div></div><p class="panel-meta">${t('complete.meta', { minutes: Math.floor(run.elapsed / 60), seconds: Math.floor(run.elapsed % 60), cuts: run.cuts })}</p><div class="panel-buttons"><button class="secondary-button" data-action="collection">${t('label.blades')}</button><button class="primary-button" data-action="start">${icon('rotate-ccw')}${t('action.again')}</button></div></div>`;
  }
  overlay.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'start') { world.start();$('#game').focus({ preventScroll: true }); }
    if (action === 'resume') world.pause();
    if (action === 'retry') world.retry();
    if (action === 'home') world.home();
    if (action === 'collection') collectionDialog();
  }));
  overlay.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    profile.difficulty = button.dataset.difficulty;
    world.home();save();
  }));
  overlay.querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => world.selectUpgrade(button.dataset.upgrade)));
  overlay.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => changeLanguage(button.dataset.language)));
  refreshIcons();
}

function closeDialog() {
  dialogOpen = false;
  dialogKind = undefined;
  $('#dialog-root').innerHTML = '';
  $('main').inert = false;
  $('.topbar').inert = false;
  game.suspended = false;
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus({ preventScroll: true });
}

function showDialog(titleKey, content, wide = false, kind) {
  if (!dialogOpen) dialogReturnFocus = document.activeElement;
  dialogOpen = true;
  dialogKind = kind;
  game.suspended = true;
  $('#dialog-root').innerHTML = `<div class="dialog-backdrop"><section class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-header"><h2 id="dialog-title" data-i18n="${titleKey}">${t(titleKey)}</h2><button class="icon-button" id="close-dialog" aria-label="${t('action.close')}" data-i18n-aria="action.close">${icon('x')}</button></div>${content}</section></div>`;
  $('main').inert = true;
  $('.topbar').inert = true;
  $('#close-dialog').addEventListener('click', closeDialog);
  $('.dialog-backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeDialog(); });
  refreshIcons();
  $('#close-dialog').focus({ preventScroll: true });
}

function settingsDialog() {
  showDialog('label.settings', `<label class="settings-row"><span data-i18n="language">${t('language')}</span><select id="language-setting" aria-label="${t('language')}" data-i18n-aria="language"><option value="en" lang="en" ${profile.language === 'en' ? 'selected' : ''}>English</option><option value="zh-CN" lang="zh-CN" ${profile.language === 'zh-CN' ? 'selected' : ''}>中文</option></select></label><label class="settings-row"><span data-i18n="settings.sound">${t('settings.sound')}</span><span class="switch"><input id="sound-setting" type="checkbox" ${profile.sound ? 'checked' : ''} aria-label="${t('settings.sound')}" data-i18n-aria="settings.sound"><span></span></span></label><label class="settings-row"><span data-i18n="settings.motion">${t('settings.motion')}</span><span class="switch"><input id="motion-setting" type="checkbox" ${profile.reducedMotion ? 'checked' : ''} aria-label="${t('settings.motion')}" data-i18n-aria="settings.motion"><span></span></span></label>`, false, 'settings');
  $('#language-setting').addEventListener('change', event => changeLanguage(event.target.value));
  $('#sound-setting').addEventListener('change', event => { profile.sound = event.target.checked;updateSoundIcon();save(); });
  $('#motion-setting').addEventListener('change', event => { profile.reducedMotion = event.target.checked;save(); });
}

function collectionDialog() {
  showDialog('collection.title', `<div class="collection-grid">${SKINS.map(skin => {
    const owned = profile.owned.includes(skin.id), selected = profile.selected === skin.id;
    const affordable = profile.coins >= skin.cost;
    return `<article class="blade-item ${selected ? 'selected' : ''}"><div class="blade-preview" style="--swatch:${skin.color}"><img src="${assetUrl('blade')}" alt="${t(`skin.${skin.id}`)}" style="filter:${skin.id === 'jade' ? 'hue-rotate(100deg)' : skin.id === 'frost' ? 'hue-rotate(170deg)' : skin.id === 'rose' ? 'hue-rotate(310deg)' : 'none'}"></div><strong>${t(`skin.${skin.id}`)}</strong><button data-skin="${skin.id}" ${selected || (!owned && !affordable) ? 'disabled' : ''} ${!owned && !affordable ? `title="${t('error.insufficientCoins')}"` : ''}>${icon(selected ? 'check' : owned ? 'swords' : 'coins')}${selected ? t('action.equipped') : owned ? t('action.equip') : skin.cost}</button></article>`;
  }).join('')}</div><div id="collection-notice" class="modal-notice" role="status"></div>`, true, 'collection');
  document.querySelectorAll('[data-skin]').forEach(button => button.addEventListener('click', () => {
    const result = buySkin(profile, button.dataset.skin);
    if (!result.ok) $('#collection-notice').textContent = t(`error.${result.reason}`);
    else { save();sound('upgrade');collectionDialog(); }
  }));
}

function recordsDialog() {
  showDialog('records.title', `<dl class="record-list"><div><dt>${t('records.best')}</dt><dd>${format(profile.bestScore)}</dd></div><div><dt>${t('records.runs')}</dt><dd>${profile.runs}</dd></div><div><dt>${t('records.clears')}</dt><dd>${profile.clears}</dd></div><div><dt>${t('records.cuts')}</dt><dd>${profile.totalCuts}</dd></div><div><dt>${t('records.kills')}</dt><dd>${profile.totalKills}</dd></div></dl>`, false, 'records');
}

async function loadAssets() {
  const names = ['blade', 'fruit', 'pear', 'crate', 'archer', 'gate'];
  const entries = await Promise.all(names.map(async name => {
    const image = new Image();
    image.src = assetUrl(name);
    await image.decode();
    return [name, image];
  }));
  return Object.fromEntries(entries);
}

async function initialize() {
  localizeDocument();refreshIcons();save();updateSoundIcon();
  const assets = await loadAssets();
  game = new World($('#game'), assets, profile, { hud, state: renderState, toast, save, sound, module: () => updateModule(game) });
  renderState(game);
  game.installQA();
  $('#game').addEventListener('pointerdown', event => { event.preventDefault();game.jump(); });
  $('#jump-button').addEventListener('pointerdown', event => { event.preventDefault();game.jump(); });
  $('#jump-button').addEventListener('click', event => { if (event.detail === 0) game.jump(); });
  $('#pause-button').addEventListener('click', () => game.pause());
  $('#sound-button').addEventListener('click', () => { profile.sound = !profile.sound;updateSoundIcon();save(); });
  $('#settings-button').addEventListener('click', settingsDialog);
  $('#collection-button').addEventListener('click', collectionDialog);
  $('#record-button').addEventListener('click', recordsDialog);
  $('.brand').addEventListener('click', event => { event.preventDefault();game.home(); });
  document.addEventListener('keydown', event => {
    if (dialogOpen) {
      if (event.code === 'Escape') { event.preventDefault();closeDialog(); }
      if (event.code === 'Tab') {
        const nodes = [...$('.dialog').querySelectorAll('button:not([disabled]), input, select, [tabindex="0"]')];
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault();nodes.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault();nodes[0]?.focus(); }
      }
      return;
    }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space' && game.mode === 'playing') { event.preventDefault();if (!event.repeat) game.jump(); }
    if (['KeyP', 'Escape'].includes(event.code) && ['playing', 'paused'].includes(game.mode)) { event.preventDefault();if (!event.repeat) game.pause(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'playing') game.setMode('paused'); });
  window.addEventListener('blur', () => { if (!game.manual && game.mode === 'playing') game.setMode('paused'); });
  window.__BLADEBOUND_READY__ = true;
}

initialize().catch(error => {
  console.error(error);
  $('#overlay').classList.add('active');
  $('#overlay').innerHTML = `<div class="panel"><h2>${t('error.load')}</h2><button class="primary-button" id="reload-scene" style="margin:auto">${t('action.reload')}</button></div>`;
  $('#reload-scene').addEventListener('click', () => location.reload());
});
