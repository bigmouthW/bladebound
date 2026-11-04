import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.BLADEBOUND_URL ?? 'http://127.0.0.1:3392';
const errors = [];
const results = [];
const assets = [];
const browser = await chromium.launch({ headless: true, ...(process.env.BLADEBOUND_BROWSER ? { executablePath: process.env.BLADEBOUND_BROWSER } : {}) });
await fs.mkdir('test-results', { recursive: true });

try {
  const cases = [{ width: 1440, height: 960 }, { width: 390, height: 844 }, { width: 360, height: 740 }, { width: 844, height: 390 }].flatMap(viewport => ['en', 'zh-CN'].map(language => ({ viewport, language })));
  for (const { viewport, language } of cases) {
    const mobile = viewport.width < 800 || viewport.height < 500;
    const page = await browser.newPage({ viewport, locale: 'zh-CN', isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      if (response.url().startsWith(`${base}/assets/`)) assets.push({ url: response.url(), status: response.status(), type: response.headers()['content-type'] });
    });
    const response = await page.goto(`${base}/?qa=1`, { waitUntil: 'networkidle', timeout: 30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => window.__BLADEBOUND_READY__ === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => typeof window.__BLADEBOUND__), 'undefined');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    if (language === 'zh-CN') {
      await page.locator('[data-language="zh-CN"]').click();
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__BLADEBOUND_READY__ === true);
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    }
    const scene = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 80) colors.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
      return { colors: colors.size, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, verticalOverflow: document.documentElement.scrollHeight > innerHeight + 1 };
    });
    assert.ok(scene.colors > 30);
    assert.equal(scene.horizontalOverflow, false);
    assert.equal(scene.verticalOverflow, false);
    const input = mobile ? 'tap' : 'click';
    await page.getByRole('button', { name: language === 'en' ? 'Relaxed' : '轻松', exact: true })[input]();
    await page.getByRole('button', { name: language === 'en' ? 'Start Trial' : '开始试炼', exact: true })[input]();
    await page.waitForFunction(() => parseFloat(document.querySelector('#progress-fill').style.width) > 0.3);
    const jump = page.getByRole('button', { name: language === 'en' ? 'Flip' : '翻跃', exact: true });
    const bounds = await jump.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1);
    const before = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
    if (mobile) await jump.tap();
    else await page.keyboard.press('Space');
    await page.waitForTimeout(180);
    const after = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
    assert.notEqual(after, before);
    await page.screenshot({ path: `test-results/deployed-${language}-${viewport.width}x${viewport.height}-playing.png`, fullPage: true });
    await page.getByRole('button', { name: language === 'en' ? 'Pause' : '暂停', exact: true })[input]();
    await page.getByRole('button', { name: language === 'en' ? 'Continue Trial' : '继续试炼', exact: true }).waitFor();
    const pausedProgress = await page.locator('#progress-fill').evaluate(el => el.style.width);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#progress-fill').evaluate(el => el.style.width), pausedProgress);
    results.push({ viewport, language, httpStatus: response.status(), sceneColors: scene.colors, noOverflow: true, controlsVisible: true, input: mobile ? 'touch' : 'keyboard', animated: true, pause: true, productionQAAbsent: true });
    await page.close();
  }
  const document = await fetch(base);
  assert.equal(document.status, 200);
  const html = await document.text();
  const scriptPath = html.match(/src="([^\"]+\.js)"/)[1];
  const script = await fetch(new URL(scriptPath, base), { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal(script.headers.get('content-encoding'), 'gzip');
  assert.match(script.headers.get('cache-control'), /immutable/);
  assert.match(document.headers.get('cache-control'), /no-cache/);
  assert.deepEqual(errors, []);
  const report = { url: base, timestamp: new Date().toISOString(), headless: true, results, assets: [...new Map(assets.map(asset => [asset.url, asset])).values()], errors, gzip: true, cacheHeaders: true, note: 'Public production deployment checked with desktop and simulated mobile Chromium. This does not replace testing on a physical phone.' };
  await fs.writeFile('test-results/deployment-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
