// Isolated contexts: never reads or changes a player's save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE, headless: true }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
try {
  for (const width of [1280, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const key='towerdefense.v1', saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved&&!saved.profile){saved.profile={name:'Test Warden',flag:{base:12,layers:[{pattern:'cross',color:3}]}};localStorage.setItem(key,JSON.stringify(saved));}
  });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
    if(await page.locator('#profile-editor[open]').count()) {
    await page.locator('#profile-editor input').fill('Test Warden');
    await page.locator('#profile-editor [data-action="stamp"]').click();
    await page.locator('#profile-editor button[type="submit"]').click();
  }
  const button = page.locator('nav [data-tab="defend"]');
    await button.waitFor();
    for (const [mode, next] of [['defend', 'Ambush'], ['ambush', 'Siege'], ['siege', 'Defend']]) {
      const name = mode[0].toUpperCase() + mode.slice(1);
      assert.equal(await button.innerText(), `${name} --> ${next}`);
      assert.equal(await page.locator('section.page.active').getAttribute('id'), mode);
      await page.locator('nav [data-tab="tiles"]').click();
      assert.equal(await button.innerText(), name);
      await button.click(); // Return without cycling.
      assert.equal(await page.locator('section.page.active').getAttribute('id'), mode);
      await button.click();
      assert.equal(await button.locator('.combat-icon-layer').count(), 2);
      await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
    }
    assert.equal(await button.innerText(), 'Defend --> Ambush');
    // Rapid activations leave one icon and the correct page.
    await button.evaluate(b => { b.click(); b.click(); b.click(); b.click(); });
    assert.equal(await button.innerText(), 'Ambush --> Siege');
    await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button.click();
    assert.equal(await button.innerText(), 'Siege --> Defend');
    assert.equal(await button.locator('.combat-icon-layer').count(), 1);
    assert.equal(await button.locator('svg').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // The existing save decoder still loads the city after a mode switch.
    await page.reload();
    await button.waitFor();
    assert.equal(await button.innerText(), 'Defend --> Ambush');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Combat tab cycling, return navigation, rapid clicks, reduced motion and reload pass at desktop/phone widths.');
} finally { await browser.close(); }
