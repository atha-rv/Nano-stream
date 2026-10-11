import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(import.meta.dirname, '../../outputs');
const label = process.env.AUDIT_LABEL === 'after' ? 'after' : 'before';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const [name, settings, enlarge] of [
  ['desktop', { viewport: { width: 1440, height: 1000 } }, false],
  ['phone', devices['iPhone 13'], false],
  ['tablet', { viewport: { width: 768, height: 1024 } }, false],
  ['enlarged', { viewport: { width: 320, height: 720 } }, true],
  ['short-viewport', { viewport: { width: 390, height: 360 } }, false],
]) {
  const context = await browser.newContext(settings);
  const page = await context.newPage();
  await page.goto('http://localhost:3000/preview');
  await page.locator('[data-test="new-project"]:enabled').waitFor();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('[data-test="new-project"]'))
        .opacity === '1',
  );
  if (enlarge)
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-test="project-card"]')];
    const first = cards[0].getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      firstProjectTop: Math.round(first.top),
      firstProjectHeight: Math.round(first.height),
      lastProjectBottom: Math.round(
        cards.at(-1).getBoundingClientRect().bottom,
      ),
      primaryControls: [
        ...document.querySelectorAll('header a, [data-test="new-project"]'),
      ].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute('aria-label') ?? element.textContent.trim(),
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      }),
    };
  });
  await page.screenshot({
    path: resolve(output, `${label}-${name}-workspace.png`),
    fullPage: true,
  });
  await page.locator('[data-test="new-project"]').click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(150);
  const form = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog.getBoundingClientRect();
    const close = dialog
      .querySelector('[data-slot="dialog-close"]')
      .getBoundingClientRect();
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      height: Math.round(box.height),
      viewportHeight: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      inputFontSize: getComputedStyle(
        document.querySelector('[data-test="project-name"]'),
      ).fontSize,
      closeTarget: {
        width: Math.round(close.width),
        height: Math.round(close.height),
      },
      descriptionReferencesExist: [
        ...dialog.querySelectorAll('[aria-describedby]'),
      ].every((element) =>
        element
          .getAttribute('aria-describedby')
          .split(/\s+/)
          .every((id) => !!document.getElementById(id)),
      ),
    };
  });
  await page.screenshot({
    path: resolve(output, `${label}-${name}-form.png`),
    fullPage: false,
  });
  results.push({ name, layout, form });
  await context.close();
}
await browser.close();
await writeFile(
  resolve(output, `quality-audit-${label}.json`),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
