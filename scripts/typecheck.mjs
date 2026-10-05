// Type-checks the odds contract boundary: lib/odds/contract.d.ts and the modules that implement it
// (tsconfig.odds.json), strict, with the TypeScript compiler API. TypeScript isn't a dependency of the
// site: it is used from node_modules when installed, else from TYPESCRIPT_PATH (a typescript.js, e.g. the
// copy bundled with VS Code).
//
//   node scripts/typecheck.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadTypeScript() {
  try { return require('typescript'); } catch { /* not installed */ }
  if (process.env.TYPESCRIPT_PATH) return require(process.env.TYPESCRIPT_PATH);
  console.error('TypeScript was not found. Install it (npm i -D typescript) or set TYPESCRIPT_PATH to a typescript.js.');
  process.exit(2);
}
const ts = loadTypeScript();
const configPath = fileURLToPath(new URL('../tsconfig.odds.json', import.meta.url));
const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
if (error) { console.error(ts.flattenDiagnosticMessageText(error.messageText, '\n')); process.exit(2); }
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, fileURLToPath(new URL('..', import.meta.url)));
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const diagnostics = ts.getPreEmitDiagnostics(program);
const host = { getCanonicalFileName: name => name, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n' };
if (diagnostics.length) {
  console.error(ts.formatDiagnostics(diagnostics, host));
  console.error(`${diagnostics.length} type error${diagnostics.length === 1 ? '' : 's'} (TypeScript ${ts.version}).`);
  process.exit(1);
}
console.log(`Odds contract types check (${parsed.fileNames.length} files, TypeScript ${ts.version}, strict).`);
