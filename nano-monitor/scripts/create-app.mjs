import {
  cp,
  mkdir,
  readFile,
  writeFile,
  access,
  constants,
} from 'node:fs/promises';
import { resolve, relative, basename, sep } from 'node:path';

const options = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (pairs, item, index, all) =>
        item.startsWith('--')
          ? [...pairs, [item.slice(2), all[index + 1]]]
          : pairs,
      [],
    ),
);
const name = options.name;
if (
  !name ||
  name.length > 64 ||
  /[\r\n"`$]/.test(name) ||
  !options.out ||
  options.out.startsWith('--')
)
  throw new Error(
    'Usage: pnpm create:app --name "My app" --out ../my-app (name: 1–64 characters, no quotes or newlines)',
  );
const source = resolve(import.meta.dirname, '..');
const destination = resolve(options.out);
const rel = relative(source, destination);
if (!rel || (!rel.startsWith('..' + sep) && rel !== '..'))
  throw new Error('Choose a destination outside the template.');
try {
  await access(destination, constants.F_OK);
  throw new Error(
    'Destination already exists. Choose a new folder; nothing has been overwritten.',
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const excluded = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'playwright-report',
  'test-results',
  'coverage',
  '.supabase',
  '.temp',
  '.branches',
  '.vercel',
  'outputs',
]);
await cp(source, destination, {
  recursive: true,
  filter: (path) =>
    !excluded.has(basename(path)) &&
    !/^\.env.*\.local$/.test(basename(path)) &&
    !/\.tsbuildinfo$/.test(path),
});
const envPath = resolve(destination, 'apps/web/.env');
const defaults = await readFile(envPath, 'utf8');
await writeFile(
  envPath,
  defaults
    .replace(
      /^NEXT_PUBLIC_PRODUCT_NAME=.*$/m,
      `NEXT_PUBLIC_PRODUCT_NAME="${name}"`,
    )
    .replace(
      /^NEXT_PUBLIC_SITE_TITLE=.*$/m,
      `NEXT_PUBLIC_SITE_TITLE="${name}"`,
    ),
);
const sample = await readFile(
  resolve(destination, 'apps/web/.env.example'),
  'utf8',
);
await writeFile(
  resolve(destination, 'apps/web/.env.local'),
  sample
    .replace(
      /^NEXT_PUBLIC_PRODUCT_NAME=.*$/m,
      `NEXT_PUBLIC_PRODUCT_NAME="${name}"`,
    )
    .replace(
      /^NEXT_PUBLIC_SITE_TITLE=.*$/m,
      `NEXT_PUBLIC_SITE_TITLE="${name}"`,
    ),
);
const slug =
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'new-app';
const manifest = JSON.parse(
  await readFile(resolve(destination, 'package.json'), 'utf8'),
);
manifest.name = slug;
await writeFile(
  resolve(destination, 'package.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
const supabasePath = resolve(destination, 'apps/web/supabase/config.toml');
await writeFile(
  supabasePath,
  (await readFile(supabasePath, 'utf8')).replace(
    /^project_id = .*$/m,
    `project_id = "${slug}"`,
  ),
);
await mkdir(resolve(destination, 'product'), { recursive: true });
await writeFile(
  resolve(destination, 'product/brief.json'),
  JSON.stringify(
    {
      name,
      user: null,
      situation: null,
      promised_outcome: null,
      agreed_capabilities: [],
      excluded_capabilities: [],
      libraries_to_evaluate: [],
      infrastructure:
        'Supabase and Dodo credentials must be unique to this application.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Created ${destination}. No credentials or installed dependencies were copied.\nNext: pnpm install --frozen-lockfile, then pnpm preview. Read SETUP.md before connecting live services.`,
);
