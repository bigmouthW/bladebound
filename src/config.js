export const CONFIG = Object.freeze({
  version: '0.2.1',
  fixedStep: 1000 / 120,
  gravity: 1.35,
  floorY: 492,
  jumpSpeed: 610,
  minimumPressInterval: 0.09,
  bladeLength: 78,
  bladeWidth: 12,
  fullEnergy: 100,
  energyPerSlice: 16,
  baseDamage: 1,
  chargedDamage: 4,
  comboWindow: 1.6,
  invulnerabilitySeconds: 1.35,
  enemyContactCooldown: 0.22,
  stageLength: 9600,
  difficulty: {
    standard: { speed: 220, shields: 2, arrowSpeed: 310 },
    relaxed: { speed: 188, shields: 4, arrowSpeed: 255 },
  },
});

export const UPGRADES = [
  { id: 'energy', icon: 'zap', max: 2 },
  { id: 'chain', icon: 'waves', max: 2 },
  { id: 'shield', icon: 'shield-plus', max: 2 },
  { id: 'leech', icon: 'heart-pulse', max: 2 },
  { id: 'combo', icon: 'sparkles', max: 2 },
  { id: 'parry', icon: 'wind', max: 2 },
];

export const SKINS = [
  { id: 'dawn', color: '#e87155', trail: '#f4b087', cost: 0 },
  { id: 'jade', color: '#3c9b7c', trail: '#8acbab', cost: 100 },
  { id: 'gold', color: '#d8aa42', trail: '#f5db83', cost: 160 },
  { id: 'frost', color: '#6f9caf', trail: '#c2e7e7', cost: 220 },
  { id: 'rose', color: '#cd7c92', trail: '#edb3c6', cost: 300 },
  { id: 'ink', color: '#4e6862', trail: '#8fa99f', cost: 400 },
];

export const STAGES = [
  { id: 'bamboo', sky: '#d9eee7', far: '#bad8cd', mountain: '#93bdb0', near: '#64a18d', ground: '#2d7762', modules: ['grove', 'orchard', 'scout', 'guardian'] },
  { id: 'bridge', sky: '#e6eeeb', far: '#ceddd1', mountain: '#a4bbb0', near: '#6e9a89', ground: '#406f60', modules: ['teeth', 'windpath', 'shieldline', 'crossfire'] },
  { id: 'temple', sky: '#dceaf0', far: '#bfced4', mountain: '#95b3b7', near: '#719b91', ground: '#3c7067', modules: ['redgate', 'cloudpath', 'approach', 'courtyard'] },
];
