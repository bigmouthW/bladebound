import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, t, setLanguage, normalizeLanguage } from '../src/i18n.js';
import { freshProfile, sanitizeProfile, loadProfile, saveProfile } from '../src/core.js';
import { STAGES, UPGRADES, SKINS } from '../src/config.js';
import { MODULES } from '../src/levels.js';

test('new and legacy profiles use English without losing existing progress', () => {
  assert.equal(freshProfile().language, 'en');
  const profile = sanitizeProfile({ version: 1, coins: 321, owned: ['jade'], selected: 'jade', clears: 2 });
  assert.equal(profile.language, 'en');
  assert.equal(profile.coins, 321);
  assert.equal(profile.selected, 'jade');
  assert.equal(profile.clears, 2);
  for (const value of [null, {}, 'zh', 'fr', '__proto__', 'constructor']) assert.equal(normalizeLanguage(value), 'en');
});

test('explicit language preferences survive a storage round trip', () => {
  let data;
  const storage = { getItem: () => data, setItem: (_, value) => { data = value; } };
  const profile = freshProfile();
  profile.language = 'zh-CN';profile.coins = 123;
  assert.equal(saveProfile(storage, profile), true);
  assert.equal(loadProfile(storage).language, 'zh-CN');
  assert.equal(loadProfile(storage).coins, 123);
});

test('both catalogs cover identical messages and interpolation parameters', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages['zh-CN']).sort());
  const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [key, text] of Object.entries(messages.en)) {
    assert.ok(text.trim(), key);
    assert.ok(!/\p{Script=Han}/u.test(text), `Chinese text in English message ${key}`);
    assert.deepEqual(parameters(text), parameters(messages['zh-CN'][key]), key);
  }
});

test('all authored stages, modules, skins and upgrade levels have translations', () => {
  const keys = [
    ...STAGES.map(stage => `stage.${stage.id}`),
    ...Object.keys(MODULES).map(id => `module.${id}`),
    ...SKINS.map(skin => `skin.${skin.id}`),
    ...UPGRADES.flatMap(upgrade => [`upgrade.${upgrade.id}.name`, ...Array.from({ length: upgrade.max }, (_, index) => `upgrade.${upgrade.id}.${index + 1}`)]),
    ...['fall', 'boss', 'arrow', 'thorns', 'test'].flatMap(id => [`reason.${id}`, `toast.damage.${id}`]),
  ];
  for (const locale of Object.keys(messages)) for (const key of keys) assert.equal(typeof messages[locale][key], 'string', `${locale}: ${key}`);
  setLanguage('en');
  assert.equal(t('scene.combo', { count: 5 }), '5 Combo');
  setLanguage('zh-CN');
  assert.equal(t('scene.combo', { count: 5 }), '5 连斩');
  setLanguage('en');
});
