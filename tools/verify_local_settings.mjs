import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './tmp/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    // Serve under a repository prefix, as on GitHub Pages.
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname.replace(/^\/demo\//, '') || 'index.html';
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) throw new Error('Invalid path');
    const data = await fs.readFile(target);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const external = [];
  page.on('request', request => {
    if (/bilibili|hdslb/.test(request.url())) external.push(request.url());
  });
  const url = `http://127.0.0.1:${server.address().port}/demo/`;
  await page.goto(url);
  await page.locator('#overlay').click();
  await page.locator('#settings-button').click();
  for (const id of ['dagou', 'dingdong', 'hajimi']) {
    await page.locator(`[data-sfx="${id}"]`).click();
    assert.equal(await page.locator(`[data-sfx="${id}"]`).getAttribute('aria-checked'), 'true');
  }
  await page.locator('[data-skin="emperor"]').click();
  await page.waitForFunction(() => document.querySelector('#dog-inner').classList.contains('is-hajimi-animation'));
  assert.equal(await page.locator('[data-skin="emperor"]').getAttribute('aria-checked'), 'true');
  for (const name of ['pianoMode', 'octaveSwitching', 'showGrid']) {
    await page.locator(`[data-setting="${name}"]`).click();
  }
  await page.locator('#settings-close').click();
  await page.locator('#octave-up').click();
  await page.reload();
  await page.locator('#overlay').click();
  await page.locator('#settings-button').click();
  for (const name of ['pianoMode', 'octaveSwitching', 'showGrid']) {
    assert.equal(await page.locator(`[data-setting="${name}"]`).getAttribute('aria-checked'), 'true');
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('dagou_piano_octave_start_v1')), '5');
  assert.equal(await page.locator('.is-locked, #video-card, #unlock-confirm-overlay, #author-home-button').count(), 0);
  assert.match(await page.locator('.author-id').textContent(), /马克杯MarkCup/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#settings-overlay')).opacity === '1');
  await page.screenshot({ path: path.join(root, 'tools/tmp/pages-mobile.png') });

  const blocked = await browser.newPage();
  blocked.on('pageerror', error => errors.push(error.message));
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
  });
  await blocked.goto(url);
  await blocked.locator('#settings-button').click();
  await blocked.locator('[data-sfx="dingdong"]').click();
  assert.equal(await blocked.locator('[data-sfx="dingdong"]').getAttribute('aria-checked'), 'true');
  await blocked.locator('[data-setting="pianoMode"]').click();
  assert.equal(await blocked.locator('[data-setting="pianoMode"]').getAttribute('aria-checked'), 'true');
  assert.match(await blocked.locator('#performance-settings-status').textContent(), /本地存储不可用/);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('Pages verification passed: all sounds and emperor animation, local persistence, storage fallback, repository subpath, no Bilibili requests or runtime errors.');
} finally {
  await browser?.close();
  server.close();
}
