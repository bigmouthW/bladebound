import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const browser = await chromium.launch({ headless: true, ...(process.env.BLADEBOUND_BROWSER ? { executablePath: process.env.BLADEBOUND_BROWSER } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await fs.mkdir('test-results', { recursive: true });
try {
  await page.goto(`${process.env.BLADEBOUND_URL ?? 'http://127.0.0.1:4173'}/?qa=1`);
  await page.waitForFunction(() => window.__BLADEBOUND_READY__);
  await page.getByRole('button', { name: 'Relaxed', exact: true }).click();
  await page.getByRole('button', { name: 'Start Trial', exact: true }).click();
  const reports = [];
  for (let stage = 0; stage < 3; stage++) {
    const drive = untilX => page.evaluate(untilX => {
      const qa = window.__BLADEBOUND__;
      const geometry = qa.geometry();
      const stage = qa.snapshot().stage;
      if (window.__BLADEBOUND_ROUTE__?.stage !== stage) window.__BLADEBOUND_ROUTE__ = { stage, lastJumpX: -1000, jumps: 0, checkpoints: [], frames: 0 };
      const controller = window.__BLADEBOUND_ROUTE__;
      const report = () => ({ ...qa.snapshot(), jumps: controller.jumps, checkpoints: controller.checkpoints, frames: controller.frames });
      while (controller.frames < 14000) {
        const snapshot = qa.snapshot();
        if (snapshot.mode !== 'playing' || snapshot.x >= untilX) return report();
        const nextSpike = geometry.spikes.find(spike => spike.x + spike.width > snapshot.x && spike.x - snapshot.x < 80 && spike.y === 492);
        const nextPit = geometry.pits.find(pit => pit[1] > snapshot.x && pit[0] - snapshot.x < 60);
        const incomingArrow = qa.projectiles().find(arrow => arrow.x > snapshot.x && arrow.x - snapshot.x < 110 && Math.abs(arrow.y - snapshot.y) < 90);
        const shouldJump = (nextSpike || nextPit || incomingArrow) && snapshot.y > 417 && snapshot.x - controller.lastJumpX > 90;
        if (shouldJump) {
          document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
          document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
          controller.lastJumpX = snapshot.x;controller.jumps++;
        }
        qa.advance(1 / 120);
        const after = qa.snapshot();
        if (after.shields < snapshot.shields) controller.checkpoints.push({ event: 'damage', before: snapshot, after });
        if (controller.frames % 1200 === 0) controller.checkpoints.push(after);
        controller.frames++;
      }
      return { ...report(), timedOut: true };
    }, untilX);
    await drive(6000);
    await page.screenshot({ path: `test-results/playthrough-stage-${stage + 1}-playing.png`, fullPage: true });
    const result = await drive(10000);
    reports.push(result);
    await page.screenshot({ path: `test-results/playthrough-stage-${stage + 1}.png`, fullPage: true });
    if (result.mode !== 'upgrade') break;
    const preferred = page.locator('[data-upgrade="shield"], [data-upgrade="leech"], [data-upgrade="energy"]');
    if (await preferred.count()) await preferred.first().click();
    else await page.locator('[data-upgrade]').first().click();
  }
  await fs.writeFile('test-results/playthrough-report.json', JSON.stringify({ reports, method: 'No warps, no direct damage or currency edits. Scripted keyboard jumps based on authored hazards; manual deterministic simulation clock.' }, null, 2));
  console.log(JSON.stringify(reports.map(({ stage, mode, score, shields, cuts, kills, x, jumps, timedOut }) => ({ stage, mode, score, shields, cuts, kills, x, jumps, timedOut })), null, 2));
  assert.equal(reports.length, 3, 'The scripted route must reach all three stages');
  assert.equal(reports.at(-1).mode, 'complete', 'The scripted route must reach the final settlement');
} finally {
  await browser.close();
}
