// Builds the two files that are submitted to the game, following the format of approved scripts in the game's script
// database (a small loader in userscript/, the actual script in userscript_main/):
//   dist/twforge.js       the main script: src/ bundled, readable, MIT banner
//   dist/twforge.user.js  the loader players install: userscript header (from the "userscript" field of package.json),
//                         a config block players may edit, and where the main script is loaded
//
// The released loader contains no URL and loads nothing: a comment marks where the main script is loaded from the URL
// the game hosts it under.
//
// `--dev` watches src/, serves dist/ on http://127.0.0.1:8799 (loopback only; a trustworthy origin, so the https game
// page may load it) and writes a loader that loads the main script from there: install dist/twforge.user.js once to
// develop in the game.
//
// Environment overrides: TWFORGE_BASE (TW Forge base URL in the loader config, e.g. http://localhost:4200) and, with
// `--dev` only, TWFORGE_MAIN_URL (main script URL in the dev loader, e.g. a tunnel to the dev server).

import * as esbuild from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
// Node runs this file and the client directly (erasable TypeScript only): the loader's base URL is normalised the same
// way the script does at runtime.
import { twforgeBaseUrl } from '../src/api/client.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = `${root}src/`;
const distDir = `${root}dist`;

const dev = process.argv.includes('--dev');
const base = twforgeBaseUrl(process.env.TWFORGE_BASE);
const devHost = '127.0.0.1';
const devPort = 8799;
const devMainScriptUrl = process.env.TWFORGE_MAIN_URL || `http://${devHost}:${devPort}/twforge.js`;

// Tribal Wars script rules: approved scripts must stay readable and carry their license, so the bundle is never
// minified or obfuscated. They also forbid third-party code in the bundle: only our own src/ may be bundled.
// `import type` from packages (e.g. the API contract) is fine; it is erased before bundling.

/**
 * Fails the build on any import of a package, and on any file from outside src/ (e.g. a relative import that reaches
 * into node_modules).
 */
const ownCodeOnly: esbuild.Plugin = {
  name: 'own-code-only',
  setup(build) {
    const error = (what: string) => ({
      errors: [
        {
          text: `${what} would bundle third-party code, which the game's script rules forbid. Only import own code from src/; use \`import type\` for types.`,
        },
      ],
    });
    build.onResolve({ filter: /^[^./]/ }, (args) => error(`"${args.path}"`));
    build.onLoad({ filter: /.*/ }, (args) =>
      args.path.startsWith(srcDir) ? undefined : error(`"${args.path}" (outside src/)`),
    );
  },
};

const options: esbuild.BuildOptions = {
  absWorkingDir: root,
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  minify: false,
  legalComments: 'inline',
  plugins: [ownCodeOnly],
  outfile: 'dist/twforge.js',
  define: {
    __TWFORGE_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: `/*!
 * ${pkg.userscript.name} ${pkg.version} — generated from src/, do not edit.
 * Released under the ${pkg.license} License.
 */`,
  },
};

if (dev) {
  await writeLoader();
  const ctx = await esbuild.context(options);
  await ctx.watch();
  await ctx.serve({ servedir: distDir, host: devHost, port: devPort });
  console.log(
    `[twforge] dev server: http://${devHost}:${devPort}/twforge.js (watching src/); loader loads ${devMainScriptUrl} (dist/twforge.user.js)`,
  );
} else {
  // From scratch, so no file of an earlier build (e.g. a dev loader) is left next to the released ones.
  await rm(distDir, { recursive: true, force: true });
  await esbuild.build(options);
  await writeLoader();
  console.log('[twforge] built dist/twforge.js and dist/twforge.user.js');
}

async function writeLoader() {
  const loadMainScript = dev
    ? `win.$.ajax({
  url: ${JSON.stringify(devMainScriptUrl)},
  dataType: 'script',
  cache: false,
  error: (xhr, status, error) => console.error('[twforge] could not load the main script:', status, error),
});`
    : '// Load the main script (twforge.js) here, from the URL the game hosts it under.';
  const script = `${userscriptHeader()}

const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

// Configuration
win.TWForgeConfig = {
  // Where TW Forge runs; the script uses its Developer API.
  baseUrl: ${JSON.stringify(base)},
};

// The script itself (${pkg.repository.url.replace(/^git\+|\.git$/g, '')}).
${loadMainScript}
`;
  await mkdir(distDir, { recursive: true });
  await writeFile(`${distDir}/twforge.user.js`, script);
}

function userscriptHeader() {
  const { match, ...meta } = pkg.userscript;
  const entries: [string, string][] = [
    ['name', meta.name],
    ['namespace', meta.namespace],
    ['version', pkg.version],
    ['description', meta.description],
    ['author', meta.author],
    ['license', pkg.license],
    ...match.map((pattern): [string, string] => ['match', pattern]),
    ['grant', meta.grant],
    ['run-at', meta['run-at']],
  ];
  const width = Math.max(...entries.map(([key]) => key.length)) + 2;
  return [
    '// ==UserScript==',
    ...entries.map(([key, value]) => `// @${key.padEnd(width)}${value}`),
    '// ==/UserScript==',
  ].join('\n');
}
