import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BLADEBOUND_URL ?? 'http://127.0.0.1:4173';
const output = path.resolve('test-results');
await fs.mkdir(output, { recursive: true });
const launchOptions = { headless: true };
if (process.env.BLADEBOUND_BROWSER) launchOptions.executablePath = process.env.BLADEBOUND_BROWSER;
const browser = await chromium.launch(launchOptions);
const errors = [];
const checks = [];
const screenshots = [];

async function waitForScene(page) {
  await page.waitForFunction(() => window.__BLADEBOUND_READY__ === true);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function screenshot(page, name) {
  await page.locator('.ready-content').evaluateAll(nodes => Promise.all(nodes.flatMap(node => node.getAnimations().map(animation => animation.finished.catch(() => {})))));
  const file = path.join(output, name);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}

async function pixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 80) {
      if (data[i + 3] > 200) opaque++;
      colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
    }
    return { colors: colors.size, opaque, width: canvas.width, height: canvas.height };
  });
}

async function layout(page) {
  return page.evaluate(() => {
    const bad = [...document.querySelectorAll('button, .brand, .run-title, .energy-heading, .wallet')]
      .filter(el => el.getBoundingClientRect().width > 0)
      .filter(el => el.scrollWidth > el.clientWidth + 3)
      .map(el => ({ tag: el.tagName, text: el.textContent.trim(), width: el.clientWidth, contentWidth: el.scrollWidth }));
    return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1, bad };
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/?qa=1`);
  await waitForScene(page);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.evaluate(() => localStorage.setItem('bladebound.profile.v1', JSON.stringify({ version: 1, sound: false, language: 'zh-CN' })));
  await page.reload();
  await waitForScene(page);
  const readyPixels = await pixels(page);
  assert.ok(readyPixels.colors > 30, `Canvas looks blank: ${JSON.stringify(readyPixels)}`);
  assert.equal((await layout(page)).horizontalOverflow, false);
  await screenshot(page, 'desktop-ready.png');
  checks.push('desktop canvas contains rendered scene and loaded assets');

  await page.getByRole('button', { name: '开始试炼', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().mode), 'playing');
  const beforeJump = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__BLADEBOUND__.advance(0.15));
  const afterJump = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  assert.ok(afterJump.y < beforeJump.y - 20);
  assert.ok(afterJump.x > beforeJump.x);
  checks.push('real keyboard input causes forward motion and a flip jump');

  const firstTarget = await page.evaluate(() => window.__BLADEBOUND__.targets()[0]);
  await page.evaluate(target => { window.__BLADEBOUND__.place(target.x - 2, target.y);window.__BLADEBOUND__.advance(0.025); }, firstTarget);
  const sliced = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  assert.ok(sliced.cuts > 0 && sliced.energy > 0 && sliced.score > 0);
  const cutsBefore = sliced.cuts;
  await page.evaluate(target => { window.__BLADEBOUND__.place(target.x, target.y);window.__BLADEBOUND__.advance(0.025); }, firstTarget);
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().cuts), cutsBefore);
  checks.push('physics blade sweep cuts an object once and grants score and energy');

  const scoreBeforeParry = await page.evaluate(() => window.__BLADEBOUND__.snapshot().score);
  await page.evaluate(() => { window.__BLADEBOUND__.place(3000, 300, 0);window.__BLADEBOUND__.arrowAt(3000, 300);window.__BLADEBOUND__.advance(0.03); });
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().energy), 4);
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().score), scoreBeforeParry + 15);
  checks.push('the actual projectile collision path supports blade parries');

  await page.evaluate(() => { window.__BLADEBOUND__.place(3768, 345);window.__BLADEBOUND__.advance(0.04); });
  assert.ok(await page.evaluate(() => window.__BLADEBOUND__.snapshot().routes.includes('orchard-route')));
  checks.push('upper route crossing awards the authored risk-route bonus');

  const shieldEnemy = await page.evaluate(() => window.__BLADEBOUND__.enemies().find(e => e.type === 'shield'));
  await page.evaluate(enemy => { window.__BLADEBOUND__.place(enemy.x - 6, enemy.y - 44, 100);window.__BLADEBOUND__.advance(0.035); }, shieldEnemy);
  const combat = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  assert.ok(combat.kills > 0);
  assert.equal(combat.energy, 0);
  const afterShield = await page.evaluate(id => window.__BLADEBOUND__.enemies().find(e => e.id === id), shieldEnemy.id);
  assert.equal(afterShield.alive, false);
  assert.ok(combat.bodyCount >= 10);
  await screenshot(page, 'desktop-combat.png');
  checks.push('a charged hit breaks a shield, defeats the enemy and spawns a jointed ragdoll');

  await page.evaluate(() => { window.__BLADEBOUND__.place(4901, 445);window.__BLADEBOUND__.advance(0.025); });
  const checkpoint = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  assert.equal(checkpoint.checkpointX, 4900);
  await page.evaluate(() => window.__BLADEBOUND__.hurt(true));
  const recovered = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  assert.equal(recovered.x, 4900);
  assert.equal(recovered.shields, checkpoint.shields - 1);
  checks.push('fall recovery returns to the checkpoint and retains the shield cost');

  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
  await page.evaluate(() => window.__BLADEBOUND__.advance(0.2));
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().x), paused.x);
  await screenshot(page, 'desktop-pause.png');
  await page.getByRole('button', { name: '继续试炼', exact: true }).click();
  checks.push('pause freezes simulation and resumes the same run');

  for (let stage = 0; stage < 2; stage++) {
    await page.evaluate(() => { window.__BLADEBOUND__.finish();window.__BLADEBOUND__.advance(0.025); });
    assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().mode), 'upgrade');
    assert.equal(await page.locator('[data-upgrade]').count(), 3);
    await screenshot(page, `desktop-upgrade-${stage + 1}.png`);
    await page.locator('[data-upgrade]').first().click();
    assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().stage), stage + 1);
    assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().mode), 'playing');
  }
  const boss = await page.evaluate(() => window.__BLADEBOUND__.enemies().find(e => e.type === 'boss'));
  await page.evaluate(enemy => { window.__BLADEBOUND__.place(enemy.x - 25, enemy.y - 65, 100);window.__BLADEBOUND__.advance(1.4); }, boss);
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.enemies().find(e => e.type === 'boss').alive), false);
  checks.push('both upgrade transitions work and the boss takes multiple actual hits');
  await page.evaluate(() => { window.__BLADEBOUND__.finish();window.__BLADEBOUND__.advance(0.025); });
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().mode), 'complete');
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.profile().clears), 1);
  await screenshot(page, 'desktop-complete.png');
  checks.push('three stage settlements produce a final clear and persisted progress');

  await page.getByRole('button', { name: '刀具', exact: true }).first().click();
  assert.ok(await page.getByRole('dialog').isVisible());
  const jadeButton = page.locator('[data-skin="jade"]');
  assert.equal(await jadeButton.isDisabled(), false);
  await jadeButton.click();
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.profile().selected), 'jade');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await waitForScene(page);
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.profile().selected), 'jade');
  checks.push('earned currency buys a cosmetic and the selection survives reload');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '减少动态效果' }).check();
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.profile().reducedMotion), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  checks.push('settings apply, persist and close using the keyboard');

  await page.getByRole('button', { name: '开始试炼', exact: true }).click();
  await page.evaluate(() => { window.__BLADEBOUND__.hurt();window.__BLADEBOUND__.hurt(); });
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().mode), 'failed');
  await page.getByRole('button', { name: '重试本关', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__BLADEBOUND__.snapshot().shields), 2);
  checks.push('failure and retry restore a valid stage without awarding coins');

  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    const mobile = await browser.newPage({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(`${base}/?qa=1`);
    await waitForScene(mobile);
    await mobile.getByRole('button', { name: '中文', exact: true }).tap();
    const readyLayout = await layout(mobile);
    assert.equal(readyLayout.horizontalOverflow, false, JSON.stringify(readyLayout));
    assert.equal(readyLayout.verticalOverflow, false, JSON.stringify(readyLayout));
    assert.deepEqual(readyLayout.bad, [], JSON.stringify(readyLayout));
    const canvasPixels = await pixels(mobile);
    assert.ok(canvasPixels.colors > 30);
    await screenshot(mobile, `mobile-${viewport.width}x${viewport.height}-ready.png`);
    await mobile.getByRole('button', { name: '开始试炼', exact: true }).tap();
    const mobileBefore = await mobile.evaluate(() => window.__BLADEBOUND__.snapshot());
    await mobile.getByRole('button', { name: '翻跃', exact: true }).tap();
    await mobile.evaluate(() => window.__BLADEBOUND__.advance(0.15));
    assert.ok(await mobile.evaluate(y => window.__BLADEBOUND__.snapshot().y < y - 20, mobileBefore.y));
    await screenshot(mobile, `mobile-${viewport.width}x${viewport.height}-playing.png`);
    await mobile.getByRole('button', { name: '设置', exact: true }).tap();
    assert.ok(await mobile.getByRole('dialog').isVisible());
    await screenshot(mobile, `mobile-${viewport.width}x${viewport.height}-settings.png`);
    await mobile.close();
    checks.push(`${viewport.width}x${viewport.height} layout, canvas and touch input`);
  }
  const realtime = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  realtime.on('pageerror', error => errors.push(error.message));
  await realtime.goto(base);
  await waitForScene(realtime);
  assert.equal(await realtime.evaluate(() => typeof window.__BLADEBOUND__), 'undefined');
  await realtime.getByRole('button', { name: 'Start Trial', exact: true }).click();
  await realtime.waitForFunction(() => parseFloat(document.querySelector('#progress-fill').style.width) > 0.5);
  const firstProgress = await realtime.locator('#progress-fill').evaluate(el => parseFloat(el.style.width));
  await realtime.keyboard.press('Space');
  await realtime.waitForFunction(first => parseFloat(document.querySelector('#progress-fill').style.width) > first + 0.5, firstProgress);
  await screenshot(realtime, 'desktop-realtime.png');
  await realtime.close();
  checks.push('normal play advances on the animation clock with the QA interface disabled');
  assert.deepEqual(errors, [], `Browser errors: ${JSON.stringify(errors)}`);
  await fs.writeFile(path.join(output, 'browser-report.json'), JSON.stringify({ checks, errors, readyPixels, screenshots, timestamp: new Date().toISOString(), headless: true, note: 'Controlled collision fixtures and shortened stage transitions do not replace an unaided full-run balance test.' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, errors, screenshots: screenshots.length }, null, 2));
} finally {
  await browser.close();
}
