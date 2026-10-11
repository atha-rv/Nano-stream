import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, '../../outputs');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const evidence = [];
for (const [name, settings] of [
  ['desktop', { viewport: { width: 1440, height: 1000 } }],
  ['phone', devices['iPhone 13']],
]) {
  const context = await browser.newContext(settings);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('http://localhost:3000/preview');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: resolve(output, `${name}-workspace.png`),
    fullPage: true,
  });
  const result = {
    name,
    errors,
    projects: await page.locator('[data-test="project-card"]').count(),
    body: (await page.locator('main').innerText()).slice(0, 1000),
    overflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  };
  evidence.push(result);
  await page.goto('http://localhost:3000/preview/billing');
  await page.screenshot({
    path: resolve(output, `${name}-billing.png`),
    fullPage: true,
  });
  await context.close();
}
await browser.close();
await writeFile(
  resolve(output, 'inspection.json'),
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
