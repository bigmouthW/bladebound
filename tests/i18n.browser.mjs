import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.BLADEBOUND_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, ...(process.env.BLADEBOUND_BROWSER ? { executablePath: process.env.BLADEBOUND_BROWSER } : {}) });
const errors = [];
const checks = [];
await fs.mkdir('test-results', { recursive: true });

async function frame(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function fits(page) {
  const result = await page.evaluate(() => {
    const overflowing = [...document.querySelectorAll('button, .brand, .run-title, .energy-heading, .wallet, .panel h2, .dialog h2')]
      .filter(node => node.getBoundingClientRect().width > 0 && node.scrollWidth > node.clientWidth + 2)
      .filter(node => node.tagName !== 'BUTTON' || node.textContent.trim())
      .map(node => ({ id: node.id, text: node.textContent.trim(), width: node.clientWidth, content: node.scrollWidth }));
    const outside = [...document.querySelectorAll('.dialog, .panel, .ready-content')].filter(node => {
      const bounds = node.getBoundingClientRect();
      return bounds.width > 0 && (bounds.left < -1 || bounds.right > innerWidth + 1 || bounds.top < -1 || bounds.bottom > innerHeight + 1);
    }).map(node => node.className);
    return { overflowing, outside, horizontal: document.documentElement.scrollWidth > innerWidth + 1, vertical: document.documentElement.scrollHeight > innerHeight + 1 };
  });
  assert.deepEqual(result, { overflowing: [], outside: [], horizontal: false, vertical: false });
}

async function englishOnly(page) {
  const leaks = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const leaks = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('[lang="zh-CN"], option, script, style')) continue;
      if (/\p{Script=Han}/u.test(node.textContent)) leaks.push(node.textContent);
    }
    for (const node of document.querySelectorAll('[aria-label], [data-tooltip], [title], [alt]')) {
      for (const attribute of ['aria-label', 'data-tooltip', 'title', 'alt']) if (/\p{Script=Han}/u.test(node.getAttribute(attribute) ?? '')) leaks.push(node.getAttribute(attribute));
    }
    return leaks;
  });
  assert.deepEqual(leaks, []);
}

async function settingsLanguage(page, language) {
  await page.locator('#settings-button').click();
  await page.locator('#language-setting').focus();
  await page.locator('#language-setting').selectOption(language);
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  assert.equal(await page.locator('#language-setting').evaluate(node => document.activeElement === node), true);
  await fits(page);
  try {
    await page.locator('#close-dialog').click({ timeout: 3000 });
  } catch (error) {
    await page.screenshot({ path: 'test-results/i18n-switch-failure.png', fullPage: true });
    console.error(await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scrollX, scrollY,
      visual: { width: visualViewport.width, height: visualViewport.height, left: visualViewport.offsetLeft, top: visualViewport.offsetTop, scale: visualViewport.scale },
      dialog: document.querySelector('.dialog').getBoundingClientRect().toJSON(),
      close: document.querySelector('#close-dialog').getBoundingClientRect().toJSON(),
      select: document.querySelector('#language-setting').getBoundingClientRect().toJSON(),
    })));
    throw error;
  }
}

try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport, locale: 'zh-CN', isMobile: viewport.width < 800 || viewport.height < 500, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__paintedText = new Set();
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        window.__paintedText.add(String(text));
        return fillText.call(this, text, ...args);
      };
    });
    await page.goto(`${base}/?qa=1`);
    await page.waitForFunction(() => window.__BLADEBOUND_READY__);
    await frame(page);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.getByRole('button', { name: 'Start Trial', exact: true }).count(), 1);
    await fits(page);await englishOnly(page);
    await page.locator('.ready-content').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    await page.screenshot({ path: `test-results/i18n-en-${viewport.width}x${viewport.height}-ready.png`, fullPage: true });
    await page.getByRole('button', { name: '中文', exact: true }).tap();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await fits(page);
    await page.reload();
    await page.waitForFunction(() => window.__BLADEBOUND_READY__);
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    assert.equal(await page.getByRole('button', { name: '开始试炼', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'English', exact: true }).tap();
    await page.locator('[data-difficulty="relaxed"]').click();
    await page.locator('[data-action="start"]').click();
    await page.evaluate(() => window.__BLADEBOUND__.advance(0.2));
    const before = await page.evaluate(() => window.__BLADEBOUND__.snapshot());
    await settingsLanguage(page, 'zh-CN');
    assert.equal(await page.locator('#stage-label').textContent(), '竹影初行');
    await settingsLanguage(page, 'en');
    assert.deepEqual(await page.evaluate(() => window.__BLADEBOUND__.snapshot()), before);
    assert.equal(await page.locator('#stage-label').textContent(), 'Bamboo Grove');
    await englishOnly(page);
    for (const id of ['collection', 'record']) {
      await page.locator(`#${id}-button`).click();
      await fits(page);await englishOnly(page);
      await page.locator('#close-dialog').click();
    }
    await page.evaluate(() => { window.__paintedText.clear();window.__BLADEBOUND__.place(3400, 350, 100);window.__BLADEBOUND__.advance(0.6); });
    await frame(page);
    assert.ok(await page.evaluate(() => window.__paintedText.has('High Path +150')));
    await page.evaluate(() => { window.__BLADEBOUND__.place(5100, 300, 0);window.__BLADEBOUND__.arrowAt(5100, 300);window.__BLADEBOUND__.advance(0.025); });
    await frame(page);
    assert.ok(await page.evaluate(() => window.__paintedText.has('Parry')));
    assert.ok(await page.evaluate(() => window.__paintedText.has('Checkpoint lit')));
    for (let stage = 0; stage < 2; stage++) {
      await page.evaluate(() => { window.__BLADEBOUND__.finish();window.__BLADEBOUND__.advance(0.025); });
      assert.equal(await page.getByRole('heading', { name: 'Choose Your Edge', exact: true }).count(), 1);
      await fits(page);await englishOnly(page);
      if (stage === 0) {
        await page.screenshot({ path: `test-results/i18n-en-${viewport.width}x${viewport.height}-upgrade.png`, fullPage: true });
        await settingsLanguage(page, 'zh-CN');
        assert.equal(await page.getByRole('heading', { name: '择一刃意，再赴山野', exact: true }).count(), 1);
        await fits(page);
        await settingsLanguage(page, 'en');
        await page.evaluate(() => window.__paintedText.clear());
      }
      const shield = page.locator('[data-upgrade="shield"]');
      await (await shield.count() ? shield : page.locator('[data-upgrade]').first()).click();
    }
    await fits(page);
    await page.evaluate(() => { const boss = window.__BLADEBOUND__.enemies().find(enemy => enemy.type === 'boss');window.__BLADEBOUND__.place(boss.x - 25, boss.y - 65, 100);window.__BLADEBOUND__.advance(0.025); });
    await frame(page);
    const canvasLeaks = await page.evaluate(() => [...window.__paintedText].filter(text => /\p{Script=Han}/u.test(text)));
    assert.deepEqual(canvasLeaks, []);
    await page.evaluate(() => { window.__BLADEBOUND__.finish();window.__BLADEBOUND__.advance(0.025); });
    assert.equal(await page.getByRole('heading', { name: 'Home from the Wilds', exact: true }).count(), 1);
    await fits(page);await englishOnly(page);
    const cleared = await page.evaluate(() => window.__BLADEBOUND__.profile());
    await settingsLanguage(page, 'zh-CN');
    assert.equal(await page.getByRole('heading', { name: '山野有归人', exact: true }).count(), 1);
    await fits(page);
    await page.reload();
    await page.waitForFunction(() => window.__BLADEBOUND_READY__);
    const saved = await page.evaluate(() => window.__BLADEBOUND__.profile());
    assert.equal(saved.language, 'zh-CN');
    assert.equal(saved.coins, cleared.coins);
    assert.equal(saved.clears, cleared.clears);
    await page.locator('[data-action="start"]').click();
    await page.evaluate(() => { for (let i = 0; i < 4; i++) window.__BLADEBOUND__.hurt(); });
    assert.equal(await page.getByRole('heading', { name: '此行未尽', exact: true }).count(), 1);
    await settingsLanguage(page, 'en');
    assert.equal(await page.getByRole('heading', { name: 'Try Another Path', exact: true }).count(), 1);
    await fits(page);await englishOnly(page);
    checks.push({ viewport, englishDefaultOnChineseDevice: true, readySelector: true, persisted: true, switchPreservesRun: true, bothLanguages: true, canvasLocalized: true, upgradesAndResults: true, noOverflow: true });
    await page.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile('test-results/i18n-report.json', JSON.stringify({ checks, errors, headless: true, timestamp: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ viewports: checks.length, errors, checks }, null, 2));
} finally {
  await browser.close();
}
