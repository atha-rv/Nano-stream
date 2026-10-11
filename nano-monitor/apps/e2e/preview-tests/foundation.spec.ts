import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const runtimeErrors = new WeakMap<object, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('create, refresh, inspect and delete a project without overflow', async ({
  page,
}) => {
  await page.goto('/preview');
  await expect(
    page.getByRole('heading', { name: 'Your projects' }),
  ).toBeVisible();
  await expect(page.getByText('Product notes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('A project that persists');
  await page
    .getByLabel('Description')
    .fill('A real local-preview create and delete journey.');
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Project saved.' }),
  ).toBeVisible();
  await page.reload();
  await page.getByText('A project that persists', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'A real local-preview create and delete journey.',
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Keep project' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('button', { name: 'Delete project', exact: true })
    .click();
  await expect(
    page.getByText('A project that persists', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Project deleted.' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('validation preserves the dialog and keyboard dismissal returns focus', async ({
  page,
}) => {
  await page.goto('/preview');
  const trigger = page.getByRole('button', {
    name: 'New project',
    exact: true,
  });
  await trigger.click();
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByText('Give your project a name.')).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(
    await page.getByLabel('Project name').evaluate((element) => {
      const references =
        element.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
      return (
        references.length > 0 &&
        references.every((id) => !!document.getElementById(id))
      );
    }),
  ).toBe(true);
  await page.getByLabel('Project name').fill('Unsubmitted draft');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByLabel('Project name')).toHaveValue(
    'Unsubmitted draft',
  );
});

test('billing is honestly disabled and account links lead to real authentication', async ({
  page,
}) => {
  await page.goto('/preview/billing');
  await expect(
    page.getByRole('button', { name: 'Continue to checkout' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Example pricing for this preview.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your account' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toHaveAttribute('href', '/auth/sign-in');
  await page.goto('/home');
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test('critical preview surfaces have no detected WCAG A/AA axe violations', async ({
  page,
}) => {
  for (const path of ['/preview', '/preview/billing', '/preview/account']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (path === '/preview') {
      const createButton = page.getByRole('button', {
        name: 'New project',
        exact: true,
      });
      await expect(createButton).toBeEnabled();
      await expect(createButton).toHaveCSS('opacity', '1');
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
  await page.goto('/preview');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});

test('empty projects and storage failure remain usable', async ({ page }) => {
  await page.goto('/preview');
  await page.evaluate(() =>
    localStorage.setItem('foundation:preview:projects:v1', '[]'),
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Start with one project' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create a project', exact: true })
    .click();
  await page.getByLabel('Project name').fill('Do not lose this');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage unavailable');
    };
  });
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('have not been saved');
  await expect(page.getByLabel('Project name')).toHaveValue('Do not lose this');
});

test('authentication forms have associated labels and no detected axe violations', async ({
  page,
}) => {
  for (const path of [
    '/auth/sign-in',
    '/auth/sign-up',
    '/auth/password-reset',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('main, form')
          .first()
          .evaluate(() =>
            [...document.querySelectorAll('input[aria-describedby]')].every(
              (element) =>
                element
                  .getAttribute('aria-describedby')
                  ?.split(/\s+/)
                  .every((id) => !!document.getElementById(id)),
            ),
          ),
      )
      .toBe(true);
    for (const password of await page.locator('input[type="password"]').all()) {
      expect(
        await password.evaluate(
          (element) => (element as HTMLInputElement).labels?.length ?? 0,
        ),
      ).toBeGreaterThan(0);
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});

test('200 percent text reflows without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of [
    '/preview',
    '/preview/billing',
    '/preview/account',
    '/auth/sign-in',
    '/auth/sign-up',
    '/auth/password-reset',
  ]) {
    await page.goto(path);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    if (path.startsWith('/auth/')) {
      await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    } else {
      const headings: Record<string, string> = {
        '/preview': 'Your projects',
        '/preview/billing': 'Your plan',
        '/preview/account': 'Your account',
      };
      await expect(
        page.getByRole('heading', { name: headings[path], exact: true }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      path,
    ).toBe(false);
  }
  await page.goto('/preview');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.getByLabel('Project name').fill('Enlarged form');
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'New project', exact: true }),
  ).toBeFocused();
});

test('short phone viewport keeps the form and completion action reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 360 });
  await page.goto('/preview');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('A small viewport');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  const box = await dialog.boundingBox();
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText('A small viewport', { exact: true }),
  ).toBeVisible();
});

test('missing pages offer a working recovery link and reflow at enlarged text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/this-page-does-not-exist');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole('link', { name: 'Return to workspace', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your projects', exact: true }),
  ).toBeVisible();
});

test('narrow screens and dark mode handle long content without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/preview');
  await page.evaluate(() =>
    localStorage.setItem(
      'foundation:preview:projects:v1',
      JSON.stringify([
        {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: 'preview',
          name: 'X'.repeat(80),
          description: 'Y'.repeat(400),
          created_at: '2026-10-01T12:00:00Z',
        },
      ]),
    ),
  );
  await page.reload();
  await expect(page.locator('[data-test="project-card"]')).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.locator('[data-test="project-card"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.goto('/preview/billing');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});
