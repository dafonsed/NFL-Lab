// Static check that every named import between the site's own modules (public/, lib/, server.mjs) names
// something the imported module exports. Browser modules can't all be loaded in Node (they touch the DOM
// at startup), so a renamed or removed export would otherwise only fail in a browser.
//   node scripts/check-imports.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = dir => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) { if (!['vendor', 'artifacts', 'node_modules'].includes(name)) walk(path); } else if (/\.(m?js)$/.test(name)) files.push(path); } };
walk(join(root, 'public')); walk(join(root, 'lib')); files.push(join(root, 'server.mjs'));

// Names declared by a const/let/var statement starting at `start`: each depth-0 declarator, or a
// destructuring pattern's names.
function declaredNames(source, start) {
  if (source[start] === '{') {
    const end = source.indexOf('}', start);
    return source.slice(start + 1, end).split(',').map(part => part.trim().split(/\s*:\s*/).pop().split('=')[0].trim()).filter(Boolean);
  }
  const names = [], quotes = new Set(["'", '"', '`']);
  let depth = 0, expectName = true;
  for (let i = start; i < source.length && i < start + 20_000; i++) {
    const char = source[i];
    if (quotes.has(char)) { for (i++; i < source.length && source[i] !== char; i++) if (source[i] === '\\') i++; continue; }
    if (source.startsWith('//', i)) { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (source.startsWith('/*', i)) { i = source.indexOf('*/', i) + 1; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) { depth--; if (depth < 0) break; }
    else if (depth === 0 && char === ';') break;
    else if (depth === 0 && char === ',') expectName = true;
    else if (expectName && /[A-Za-z_$]/.test(char)) { const name = /^[A-Za-z_$][\w$]*/.exec(source.slice(i))[0]; names.push(name); i += name.length - 1; expectName = false; }
    else if (expectName && !/\s/.test(char)) expectName = false;
  }
  return names;
}

const exportsCache = new Map();
function exportsOf(path) {
  if (exportsCache.has(path)) return exportsCache.get(path);
  const source = readFileSync(path, 'utf8'), names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+/g)) for (const name of declaredNames(source, match.index + match[0].length)) names.add(name);
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of match[1].split(',')) { const name = part.trim().split(/\s+as\s+/).pop().trim(); if (name) names.add(name); }
  if (/export\s+default\b/.test(source)) names.add('default');
  const star = [...source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  exportsCache.set(path, { names, star });
  return exportsCache.get(path);
}

const problems = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), match[2].split('?')[0]);
    if (!existsSync(target)) { problems.push(`${relative(root, file)}: ${match[2]} does not exist`); continue; }
    const { names, star } = exportsOf(target);
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !names.has(name) && !star.length) problems.push(`${relative(root, file)}: ${name} is not exported by ${match[2]}`);
    }
  }
  // Dynamic imports in code (not JSDoc types such as {import('../lib/odds/contract').Quote}).
  for (const match of source.matchAll(/(?<!\{)import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const line = source.slice(source.lastIndexOf('\n', match.index) + 1, source.indexOf('\n', match.index));
    if (/@(type|typedef|param|returns?)\b/.test(line)) continue;
    const target = resolve(dirname(file), match[1].split('?')[0]);
    if (!existsSync(target)) problems.push(`${relative(root, file)}: ${match[1]} does not exist`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`${files.length} modules: every named import resolves.`);
