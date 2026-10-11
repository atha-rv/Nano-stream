import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const production = process.argv.includes('--production');
const localPath = resolve(import.meta.dirname, '../apps/web/.env.local');
function readEnv(path) {
  return existsSync(path)
    ? Object.fromEntries(
        readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .filter((line) => /^[A-Z_]+=/.test(line))
          .map((line) => {
            const index = line.indexOf('=');
            return [
              line.slice(0, index),
              line
                .slice(index + 1)
                .trim()
                .replace(/^['"]|['"]$/g, ''),
            ];
          }),
      )
    : {};
}
const env = {
  ...readEnv(resolve(import.meta.dirname, '../apps/web/.env')),
  ...readEnv(localPath),
  ...process.env,
};
const required = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_KEY',
  'DODO_PAYMENTS_BUSINESS_ID',
  'DODO_PAYMENTS_PRODUCT_ID',
];
const missing = required.filter(
  (name) => !env[name] || /YOUR_|REPLACE_|example/i.test(env[name]),
);
console.log('Setup check reports names only; it never prints credentials.');
if (missing.length) console.log(`Not configured: ${missing.join(', ')}`);
if (production) {
  const problems = [...missing];
  if (env.TEMPLATE_PREVIEW_ENABLED === 'true')
    problems.push('Disable TEMPLATE_PREVIEW_ENABLED');
  if (!env.NEXT_PUBLIC_SITE_URL?.startsWith('https://'))
    problems.push('Set an HTTPS NEXT_PUBLIC_SITE_URL');
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('https://'))
    problems.push('Use a hosted HTTPS Supabase URL');
  if (env.DODO_PAYMENTS_ENVIRONMENT !== 'live_mode')
    problems.push('Set DODO_PAYMENTS_ENVIRONMENT=live_mode for launch');
  if (problems.length) {
    console.error(
      `Production setup incomplete: ${[...new Set(problems)].join(', ')}`,
    );
    process.exitCode = 1;
  } else
    console.log(
      'Required production configuration is present. Run sandbox and deployment checks before launch.',
    );
} else
  console.log(
    missing.length
      ? 'Local preview is available. Live services still need configuration.'
      : 'Required configuration is present; service connectivity has not been checked.',
  );
