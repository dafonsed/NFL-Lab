// Editorial illustrations, rendered as SVG on request (/art/<key>.svg). Every content record gets
// its own picture: calculators and tools have bespoke scenes, states and sportsbooks get their own
// cards, and guides get a topic scene whose numbers and shapes are seeded from the guide itself,
// so no two pages share an image. Palette: dark neutrals + lime, red only for losses.
import { readFileSync } from 'node:fs';
import { BEGINNER_GUIDE_LESSONS } from './beginner-guide.mjs';
import { findPlatform, SPORTSBOOK_PLATFORMS } from '../public/platform-catalog.js';
import { implied, decimal } from '../public/betting-math.js';

export const ART_VERSION = 2;
export const artKey = (type, slug) => `${type}--${slug}`;
export const artUrl = (type, slug) => `/art/${artKey(type, slug)}.svg?v=${ART_VERSION}`;
/** Inline style for an element that shows a piece of art as its background. */
export const artStyle = (type, slug) => `background-image:url('${artUrl(type, slug)}')`;

const LIME = '#a3f06b', LIME2 = '#7fc24f', LIME3 = '#4f7a33', LIMEDK = '#243a1c', LIMEHI = '#d9f7c2';
const INK = '#0b0e11', P1 = '#141a1f', P2 = '#1b2329', P3 = '#26303a', P4 = '#36424c';
const TXT = '#edf2ee', MUT = '#b9c3be', FAINT = '#7e8a86', RED = '#ff6b6b', AMBER = '#f2c14e';
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
const SANS = "Inter,'Segoe UI',Helvetica,Arial,sans-serif";
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r1 = n => Math.round(n * 10) / 10;

/** Deterministic random numbers from a string seed (mulberry32). */
export function seeded(text) {
  let a = [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = list => list[Math.floor(next() * list.length)];
  next.shuffle = list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  return next;
}
const fmtOdds = n => (n > 0 ? `+${n}` : `${n}`);
const text = (x, y, value, { size = 22, fill = TXT, weight = 700, anchor = 'start', font = MONO, extra = '' } = {}) => `<text x="${x}" y="${y}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${extra}>${esc(value)}</text>`;
const pill = (x, y, w, label, { fill = LIMEDK, stroke = LIME, color = LIME, size = 22, h = 46 } = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-opacity=".6" stroke-width="2"/>${text(x + w / 2, y + h / 2 + size * .36, label, { size, fill: color, anchor: 'middle' })}`;
const card = (x, y, w, h, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"${extra}/>`;
const shadowed = inner => `<g filter="url(#sh)">${inner}</g>`;
const check = (x, y, s = 1, color = LIME) => `<path d="M${x - 13 * s} ${y} l${9 * s} ${9 * s} ${17 * s} -${19 * s}" stroke="${color}" stroke-width="${6 * s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

function frame(body, extraDefs = '', { glow = [50, 42] } = {}) {
  let grid = '';
  for (let x = 0; x <= 1200; x += 60) grid += `<path d="M${x} 0V700"/>`;
  for (let y = 0; y <= 700; y += 60) grid += `<path d="M0 ${y}H1200"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" width="1200" height="700">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1418"/><stop offset="1" stop-color="${INK}"/></linearGradient>
<radialGradient id="glow" cx="${glow[0]}%" cy="${glow[1]}%" r="55%"><stop offset="0" stop-color="${LIME}" stop-opacity=".13"/><stop offset=".55" stop-color="${LIME}" stop-opacity=".03"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></radialGradient>
<radialGradient id="vign" cx="50%" cy="50%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
<filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".5"/></filter>
<filter id="lg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P2}"/><stop offset="1" stop-color="${P1}"/></linearGradient>
<linearGradient id="limeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIME}" stop-opacity=".38"/><stop offset="1" stop-color="${LIME}" stop-opacity="0"/></linearGradient>
${extraDefs}
</defs>
<rect width="1200" height="700" fill="url(#bg)"/>
<g stroke="#fff" stroke-opacity=".035" stroke-width="1">${grid}</g>
<rect width="1200" height="700" fill="url(#glow)"/>
${body}
<rect width="1200" height="700" fill="url(#vign)"/>
</svg>`;
}
const hills = (r = () => .5) => `<path d="M0 ${580 + r() * 20} C150 ${530 + r() * 20} 260 560 380 585 S640 610 800 580 1060 ${530 + r() * 20} 1200 575 V700H0Z" fill="${P1}"/><path d="M0 630 C200 600 330 615 520 640 S900 660 1200 620 V700H0Z" fill="#101519"/>`;
function tower(x, y, s = 1) {
  let lights = '';
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) lights += `<circle cx="${r1(x - 18 * s + col * 12 * s)}" cy="${r1(y + row * 12 * s)}" r="${r1(4.2 * s)}" fill="${(row + col) % 2 ? '#d7f5bf' : LIME}" fill-opacity=".85"/>`;
  return `<rect x="${r1(x - 24 * s)}" y="${r1(y - 8 * s)}" width="${r1(48 * s)}" height="${r1(42 * s)}" rx="${r1(5 * s)}" fill="${P3}"/>${lights}<rect x="${r1(x - 3 * s)}" y="${r1(y + 34 * s)}" width="${r1(6 * s)}" height="${r1(170 * s)}" fill="${P3}"/>`;
}
const SHAPES = {
  circle: (cx, cy, fill, s = 1) => `<circle cx="${cx}" cy="${cy}" r="${21 * s}" fill="${fill}"/>`,
  square: (cx, cy, fill, s = 1) => `<rect x="${cx - 19 * s}" y="${cy - 19 * s}" width="${38 * s}" height="${38 * s}" rx="4" fill="${fill}"/>`,
  triangle: (cx, cy, fill, s = 1) => `<path d="M${cx} ${cy - 21 * s} L${cx + 23 * s} ${cy + 18 * s} H${cx - 23 * s}Z" fill="${fill}"/>`,
  diamond: (cx, cy, fill, s = 1) => `<path d="M${cx} ${cy - 23 * s} L${cx + 23 * s} ${cy} L${cx} ${cy + 23 * s} L${cx - 23 * s} ${cy}Z" fill="${fill}"/>`,
  down: (cx, cy, fill, s = 1) => `<path d="M${cx - 23 * s} ${cy - 18 * s} H${cx + 23 * s} L${cx} ${cy + 21 * s}Z" fill="${fill}"/>`,
  shield: (cx, cy, fill) => `<path d="M${cx - 18} ${cy - 20} H${cx + 18} V${cy} C${cx + 18} ${cy + 14} ${cx + 8} ${cy + 20} ${cx} ${cy + 24} C${cx - 8} ${cy + 20} ${cx - 18} ${cy + 14} ${cx - 18} ${cy}Z" fill="${fill}"/>`,
  star: (cx, cy, fill) => `<path d="M${cx} ${cy - 23} L${cx + 6.5} ${cy - 8} L${cx + 22} ${cy - 7} L${cx + 10} ${cy + 4} L${cx + 14} ${cy + 20} L${cx} ${cy + 11} L${cx - 14} ${cy + 20} L${cx - 10} ${cy + 4} L${cx - 22} ${cy - 7} L${cx - 6.5} ${cy - 8}Z" fill="${fill}"/>`,
};

// ---------------------------------------------------------------- real brand logos
const logoCache = new Map();
/** The brand's app icon as a data URI, or '' when there is no real logo for that name. */
function logoData(name) {
  const platform = findPlatform(cleanBookName(name));
  if (!platform) return '';
  if (!logoCache.has(platform.asset)) {
    try { logoCache.set(platform.asset, `data:image/png;base64,${readFileSync(new URL(`../public${platform.asset}`, import.meta.url)).toString('base64')}`); }
    catch { logoCache.set(platform.asset, ''); }
  }
  return logoCache.get(platform.asset);
}
// "Emerald Queen / BetMGM", "BetMGM (casino premises only)", "BetMGM Nevada" -> the brand part.
function cleanBookName(name) {
  const parts = String(name).replace(/\([^)]*\)/g, '').split('/').map(part => part.trim()).filter(Boolean);
  for (const part of parts) {
    const trimmed = part.replace(/\s+(Nevada|Sportsbook)$/i, '').trim();
    if (findPlatform(part)) return part;
    if (findPlatform(trimmed)) return trimmed;
  }
  return parts[0] || '';
}
let clipCount = 0;
/** A rounded app-icon logo at (x, y); `size` in px. */
function logo(x, y, size, name) {
  const data = logoData(name);
  if (!data) return '';
  const id = `lc${++clipCount}`;
  const radius = Math.round(size * .24);
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath><rect x="${x - 2}" y="${y - 2}" width="${size + 4}" height="${size + 4}" rx="${radius + 2}" fill="#fff" fill-opacity=".1"/><image href="${data}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
}
const brandName = name => findPlatform(cleanBookName(name))?.name || cleanBookName(name);
/** Path of the real app icon for a free-text book name ("Emerald Queen / BetMGM"), or ''. */
export const brandAsset = name => findPlatform(cleanBookName(name))?.asset || '';

// ---------------------------------------------------------------- topic scenes (seeded)
const SCENES = {
  odds(r) {
    const left = r.shuffle(['circle', 'square', 'star', 'shield', 'diamond']).slice(0, 4);
    const right = r.shuffle(['triangle', 'diamond', 'circle', 'down', 'square']).slice(0, 4);
    const winners = r.int(2, 4);
    let rows = '';
    for (let i = 0; i < 4; i++) {
      const cy = 222 + i * 84;
      const plusLeft = i < winners;
      rows += SHAPES[left[i]](372, cy, MUT);
      rows += plusLeft ? `<path d="M462 ${cy}h44M484 ${cy - 22}v44" stroke="${LIME}" stroke-width="13" stroke-linecap="round"/>` : `<path d="M458 ${cy}h52" stroke="${RED}" stroke-width="13" stroke-linecap="round"/>`;
      rows += `<rect x="530" y="${cy - 6}" width="${r.int(28, 60)}" height="12" rx="6" fill="${P4}"/>`;
      rows += SHAPES[right[i]](668, cy, FAINT);
      rows += plusLeft ? `<path d="M758 ${cy}h52" stroke="${RED}" stroke-width="13" stroke-linecap="round"/>` : `<path d="M762 ${cy}h44M784 ${cy - 22}v44" stroke="${LIME}" stroke-width="13" stroke-linecap="round"/>`;
      rows += `<rect x="832" y="${cy - 6}" width="${r.int(24, 56)}" height="12" rx="6" fill="${P4}"/>`;
      if (i < 3) rows += `<path d="M318 ${cy + 42}H594M622 ${cy + 42}H890" stroke="#fff" stroke-opacity=".07" stroke-width="2"/>`;
    }
    const tx = r.int(130, 170), s = 1 + r() * .2;
    return frame(`${hills(r)}${tower(tx, 250, s)}${tower(1200 - tx, 250, s)}
<path d="M400 128 L330 470 H530 L470 128Z" fill="${LIME}" opacity=".05"/><path d="M730 128 L670 470 H870 L800 128Z" fill="${LIME}" opacity=".05"/>
${shadowed(`<rect x="372" y="590" width="26" height="80" fill="${P3}"/><rect x="802" y="590" width="26" height="80" fill="${P3}"/><rect x="270" y="150" width="660" height="450" rx="22" fill="${P3}"/><rect x="290" y="170" width="620" height="410" rx="12" fill="url(#panel)"/>`)}
<path d="M600 176V574" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>${rows}
<path d="M404 104h60l12 28h-84z" fill="${P4}"/><ellipse cx="434" cy="134" rx="40" ry="7" fill="${LIME}" opacity=".9"/><ellipse cx="434" cy="138" rx="60" ry="16" fill="${LIME}" opacity=".35" filter="url(#lg)"/>
<path d="M736 104h60l12 28h-84z" fill="${P4}"/><ellipse cx="766" cy="134" rx="40" ry="7" fill="${LIME}" opacity=".9"/><ellipse cx="766" cy="138" rx="60" ry="16" fill="${LIME}" opacity=".35" filter="url(#lg)"/>
<rect x="430" y="80" width="8" height="26" fill="${P4}"/><rect x="762" y="80" width="8" height="26" fill="${P4}"/>`);
  },
  probability(r) {
    const base = 470, mid = r.int(540, 660), sd = r.int(96, 138), h = r.int(290, 340);
    const y = x => base - h * Math.exp(-((x - mid) ** 2) / (2 * sd * sd));
    const seg = (a, b) => { let d = `M${a} ${base}`; for (let x = a; x <= b; x += 4) d += ` L${x} ${r1(y(x))}`; return `${d} L${b} ${base}Z`; };
    let curve = ''; for (let x = 170; x <= 1030; x += 4) curve += `${curve ? ' L' : 'M'}${x} ${r1(y(x))}`;
    const cuts = [170, mid - sd * 2, mid - sd, mid, mid + sd, mid + sd * 2, 1030].map(v => Math.round(Math.max(170, Math.min(1030, v))));
    const colors = r() > .5 ? [P3, P4, LIME3, LIME2, LIME, LIMEHI] : [LIMEHI, LIME, LIME2, LIME3, P4, P3];
    const fills = cuts.slice(0, -1).map((a, i) => cuts[i + 1] > a ? `<path d="${seg(a, cuts[i + 1])}" fill="${colors[i]}"/>` : '').join('');
    const dots = [190, 300, 420, mid, 720, 880, 1010].map((x, i) => `<circle cx="${x}" cy="566" r="${i === 3 ? 14 : 11}" fill="${[P4, P4, MUT, TXT, LIME2, LIME, LIME][i]}"/>`).join('');
    const tag = `${r() > .25 ? '+EV' : 'EDGE'} ${(1 + r() * 7).toFixed(1)}%`;
    return frame(`<path d="M0 520 C120 470 200 470 270 505 S360 520 380 520 H0Z" fill="${P1}" opacity=".8"/><path d="M1200 500 C1080 430 980 450 940 500 S900 520 880 520 H1200Z" fill="${P1}" opacity=".8"/>
${shadowed(`${fills}<path d="${curve}" fill="none" stroke="${TXT}" stroke-opacity=".85" stroke-width="5" stroke-linejoin="round"/>`)}
<path d="M${mid} 104V600" stroke="${TXT}" stroke-opacity=".6" stroke-width="3" stroke-dasharray="12 10"/>
<path d="M140 ${base}H1060" stroke="${MUT}" stroke-width="7" stroke-linecap="round"/>
<path d="M190 566H1010" stroke="url(#tl)" stroke-width="5" stroke-linecap="round"/>${dots}
${pill(mid + 40, 128, 150, tag)}`, `<linearGradient id="tl" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="1010" y2="0"><stop offset="0" stop-color="${P4}"/><stop offset=".5" stop-color="${MUT}"/><stop offset="1" stop-color="${LIME}"/></linearGradient>`, { glow: [Math.round(mid / 12), 40] });
  },
  comparison(r) {
    const kinds = r.shuffle(['circle', 'triangle', 'square', 'diamond']);
    const cols = r.shuffle([MUT, RED, LIME, LIME2]);
    let rows = '', lens = '';
    const cx = r.int(780, 860), cy = r.int(280, 320);
    for (let i = 0; i < 4; i++) {
      const y = 180 + i * 118, end = r.int(440, 620);
      rows += SHAPES[kinds[i]](150, y, cols[i], 1.2) + `<rect x="220" y="${y - 16}" width="620" height="32" rx="6" fill="${P2}"/><path d="M240 ${y}H${end}" stroke="${cols[i]}" stroke-width="7" stroke-linecap="round" opacity=".75"/><circle cx="${end}" cy="${y}" r="14" fill="${cols[i]}"/>`;
      const ly = cy - 150 + i * 88, le = r.int(cx + 20, cx + 170);
      lens += `<rect x="${cx - 180}" y="${ly - 12}" width="420" height="24" rx="6" fill="${P3}"/><path d="M${cx - 160} ${ly}H${le}" stroke="${cols[i]}" stroke-width="9" stroke-linecap="round"/><circle cx="${le}" cy="${ly}" r="19" fill="${cols[i]}"/>`;
    }
    const grid = [380, 540, 700].map(x => `<path d="M${x} 120V640" stroke="${MUT}" stroke-opacity=".18" stroke-width="2" stroke-dasharray="8 10"/>`).join('');
    return frame(`${grid}${rows}
<ellipse cx="${cx + 30}" cy="${cy + 220}" rx="220" ry="36" fill="#000" opacity=".35" filter="url(#lg)"/>
<path d="M${cx + 120} ${cy + 140} L${cx + 250} ${cy + 310}" stroke="${P4}" stroke-width="54" stroke-linecap="round"/><path d="M${cx + 130} ${cy + 152} L${cx + 242} ${cy + 298}" stroke="${P3}" stroke-width="30" stroke-linecap="round"/>
<circle cx="${cx}" cy="${cy}" r="196" fill="${P3}" filter="url(#sh)"/>
<g clip-path="url(#lens)"><rect x="${cx - 220}" y="${cy - 200}" width="440" height="420" fill="#10161a"/>${lens}<circle cx="${cx - 60}" cy="${cy - 70}" r="170" fill="#fff" opacity=".04"/></g>
<circle cx="${cx}" cy="${cy}" r="178" fill="none" stroke="${LIME}" stroke-opacity=".55" stroke-width="4"/>
<path d="M${cx - 120} ${cy - 110} A150 150 0 0 1 ${cx - 20} ${cy - 150}" stroke="#fff" stroke-opacity=".35" stroke-width="8" stroke-linecap="round" fill="none"/>`, `<clipPath id="lens"><circle cx="${cx}" cy="${cy}" r="178"/></clipPath>`);
  },
  calculator(r) {
    let lines = ''; for (let y = 210; y < 560; y += 34) lines += `<path d="M250 ${y}H640" stroke="#fff" stroke-opacity=".06" stroke-width="2"/>`;
    let keys = ''; const lit = [r.int(0, 3), r.int(0, 3)];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) keys += `<rect x="${848 + col * 62}" y="${318 + row * 58}" width="48" height="42" rx="9" fill="${row === lit[0] && col === lit[1] ? LIME : P4}"/>`;
    const a1 = r.int(70, 150) * Math.PI / 180, a2 = a1 + r.int(60, 120) * Math.PI / 180;
    const pt = a => `${r1(68 * Math.sin(a))} ${r1(-68 * Math.cos(a))}`;
    const bars = [r.int(40, 80), r.int(60, 100), r.int(90, 130), r.int(120, 160)];
    const display = fmtOdds(r() > .5 ? r.int(101, 350) : -r.int(105, 300));
    return frame(`<rect width="1200" height="700" fill="#0d1215"/>
<g transform="rotate(${-4 - r.int(0, 6)} 470 380)" filter="url(#sh)"><rect x="220" y="140" width="470" height="470" rx="14" fill="${P1}"/><rect x="206" y="120" width="470" height="470" rx="14" fill="url(#panel)" stroke="#fff" stroke-opacity=".06"/>${lines}
<rect x="250" y="190" width="84" height="40" rx="6" fill="none" stroke="${MUT}" stroke-width="3"/><rect x="380" y="190" width="84" height="40" rx="6" fill="none" stroke="${MUT}" stroke-width="3"/><rect x="250" y="270" width="84" height="40" rx="6" fill="none" stroke="${LIME}" stroke-width="3"/>
<path d="M334 210H372M292 230V270" stroke="${MUT}" stroke-width="3"/><path d="M364 204l8 6-8 6" fill="none" stroke="${MUT}" stroke-width="3"/>
<g transform="translate(560 250)"><circle r="68" fill="${P4}"/><path d="M0 0V-68A68 68 0 0 1 ${pt(a1)}Z" fill="${LIME}"/><path d="M0 0L${pt(a1)}A68 68 0 0 1 ${pt(a2)}Z" fill="${MUT}"/></g>
<path d="M400 520V420M400 520H640" stroke="${MUT}" stroke-opacity=".6" stroke-width="3"/>
${bars.map((h, i) => `<rect x="${424 + i * 46}" y="${520 - h}" width="30" height="${h}" rx="3" fill="${[P4, LIME3, LIME2, LIME][i]}"/>`).join('')}</g>
<g transform="translate(-10 120) rotate(-24 420 470)"><rect x="170" y="452" width="380" height="36" rx="6" fill="${LIME}"/><rect x="170" y="452" width="380" height="12" rx="6" fill="#c8f7a3"/><rect x="134" y="452" width="44" height="36" rx="6" fill="${RED}" opacity=".85"/><rect x="170" y="452" width="22" height="36" fill="${MUT}"/><path d="M550 452 L604 470 L550 488Z" fill="#e8d9b8"/><path d="M586 464 L604 470 L586 476Z" fill="${INK}"/></g>
<g transform="rotate(${4 + r.int(0, 6)} 930 400)" filter="url(#sh)"><rect x="818" y="160" width="300" height="420" rx="34" fill="${P3}"/><rect x="828" y="170" width="280" height="400" rx="28" fill="${P2}"/><rect x="852" y="200" width="232" height="84" rx="12" fill="#1a2a17"/>${text(1068, 258, display, { size: 38, fill: LIME, anchor: 'end' })}${keys}</g>`);
  },
  arbitrage(r) {
    const a = r.int(102, 140), b = -r.int(100, 118);
    const pa = implied(a), pb = implied(b);
    const edge = ((1 / (pa + pb)) - 1) * 100;
    const [bookA, bookB] = r.shuffle(SPORTSBOOK_PLATFORMS);
    const book = (x, name, odds) => shadowed(`<rect x="${x}" y="238" width="190" height="110" rx="16" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/>`) + `${logo(x + 18, 254, 40, name)}${text(x + 70, 280, findPlatform(name)?.label.replace(/ Sportsbook$/, '') || name, { size: 16, fill: MUT, weight: 650, font: SANS })}${text(x + 22, 330, fmtOdds(odds), { size: 28 })}`;
    const tilt = edge > 0 ? 0 : 6;
    return frame(`${hills(r)}<rect x="585" y="210" width="30" height="370" rx="8" fill="${P4}"/><path d="M520 600h160l-24-36h-112z" fill="${P3}"/>
<g transform="rotate(${tilt} 600 220)"><path d="M270 220H930" stroke="${MUT}" stroke-width="12" stroke-linecap="round"/>
<path d="M300 222 L240 360M300 222 L380 360M900 222 L820 360M900 222 L980 360" stroke="${FAINT}" stroke-width="3"/>
<path d="M205 360H415a8 8 0 0 1-8 10C380 400 240 400 213 370a8 8 0 0 1-8-10z" fill="${P4}"/><path d="M785 360H1015a8 8 0 0 1-8 10C980 400 820 400 793 370a8 8 0 0 1-8-10z" fill="${P4}"/>
${book(215, bookA, a)}${book(805, bookB, b)}</g>
<circle cx="600" cy="218" r="30" fill="${P3}" stroke="${LIME}" stroke-width="5"/>${check(600, 219, .9)}
${pill(476, 92, 248, `ARB ${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%`, { size: 24, h: 52 })}`);
  },
  trends(r) {
    const n = 10, line = r.int(40, 70);
    const vals = Array.from({ length: n }, () => r.int(24, 108));
    const hits = vals.filter(v => v > line).length;
    const lineY = Math.round(560 - line * 3.1);
    const bars = vals.map((v, i) => `<rect x="${260 + i * 68}" y="${Math.round(560 - v * 3.1)}" width="44" height="${Math.round(v * 3.1)}" rx="8" fill="${v > line ? LIME : P4}"/>`).join('');
    const widths = [110, 96, 126, 86]; const on = r.int(0, 3);
    let chipX = 260; const chips = widths.map((w, i) => { const x = chipX; chipX += w + 14; return `<rect x="${x}" y="120" width="${w}" height="42" rx="21" fill="${i === on ? LIME : P2}" stroke="#fff" stroke-opacity="${i === on ? 0 : .1}"/><rect x="${x + 22}" y="137" width="${w - 44}" height="9" rx="4.5" fill="${i === on ? INK : P4}" fill-opacity="${i === on ? .55 : 1}"/>`; }).join('');
    return frame(`${shadowed(card(200, 90, 800, 530))}${chips}
<rect x="822" y="120" width="140" height="42" rx="12" fill="${LIMEDK}"/>${text(892, 149, `${hits}/${n} HIT`, { size: 21, fill: LIME, anchor: 'middle' })}
${[250, 330, 410, 490].map(y => `<path d="M240 ${y}H960" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>`).join('')}${bars}
<path d="M240 ${lineY}H960" stroke="${TXT}" stroke-opacity=".7" stroke-width="3" stroke-dasharray="12 9"/>
<rect x="236" y="${lineY - 54}" width="76" height="36" rx="8" fill="${P3}"/>${text(274, lineY - 29, `${line}.5`, { size: 18, anchor: 'middle' })}
<path d="M240 562H960" stroke="${MUT}" stroke-opacity=".5" stroke-width="3"/>`);
  },
  ticket(r) {
    const odds = r() > .4 ? -r.int(105, 250) : r.int(100, 320);
    const stake = r.pick([10, 20, 25, 40, 50, 75, 100]);
    const win = stake * (decimal(odds) - 1);
    let perf = 'M400 110 H800 V600'; for (let x = 775; x >= 400; x -= 25) perf += ` L${x} ${(800 - x) / 25 % 2 ? 582 : 600}`;
    const stamp = r.pick(['LOGGED', 'SAVED', 'TRACKED']);
    const rot = -r.int(2, 7);
    return frame(`<g transform="rotate(${rot} 600 360)">${shadowed(`<path d="${perf}Z" fill="url(#panel)"/>`)}
<rect x="436" y="148" width="54" height="54" rx="14" fill="${LIME}"/>${check(463, 176, .9, INK)}
<rect x="508" y="154" width="${r.int(140, 200)}" height="16" rx="8" fill="${TXT}" fill-opacity=".85"/><rect x="508" y="180" width="${r.int(80, 130)}" height="12" rx="6" fill="${P4}"/>
<rect x="436" y="236" width="328" height="70" rx="12" fill="${P3}"/><rect x="456" y="256" width="${r.int(110, 170)}" height="12" rx="6" fill="${MUT}"/><rect x="456" y="278" width="96" height="10" rx="5" fill="${P4}"/>
<rect x="656" y="252" width="92" height="38" rx="10" fill="${LIMEDK}"/>${text(702, 279, fmtOdds(odds), { size: 21, fill: LIME, anchor: 'middle' })}
<rect x="436" y="324" width="150" height="56" rx="10" fill="${P2}" stroke="#fff" stroke-opacity=".08"/><rect x="614" y="324" width="150" height="56" rx="10" fill="${P2}" stroke="#fff" stroke-opacity=".08"/>
${text(456, 360, `$${stake.toFixed(2)}`)}${text(634, 360, `$${(stake + win).toFixed(2)}`, { fill: LIME })}
<path d="M420 446H780" stroke="#fff" stroke-opacity=".12" stroke-width="3" stroke-dasharray="10 10"/>
<rect x="436" y="486" width="328" height="14" rx="7" fill="${P4}"/><rect x="436" y="514" width="${r.int(160, 260)}" height="14" rx="7" fill="${P3}"/></g>
<g transform="rotate(${r.int(6, 16)} 890 250)"><circle cx="890" cy="250" r="86" fill="none" stroke="${LIME}" stroke-width="7" stroke-opacity=".8"/><circle cx="890" cy="250" r="72" fill="none" stroke="${LIME}" stroke-width="2" stroke-opacity=".5"/>${text(890, 262, stamp, { size: 30, fill: LIME, weight: 800, anchor: 'middle' })}</g>`);
  },
  tracker(r) {
    let yv = r.int(440, 490); const pts = [];
    for (let i = 0; i <= 10; i++) { pts.push([250 + i * 70, yv]); yv = Math.max(200, Math.min(500, yv - r.int(-30, 48))); }
    const line = 'M' + pts.map(([x, y]) => `${x} ${y}`).join(' L');
    const units = ((pts[0][1] - pts[10][1]) / 12).toFixed(1);
    const win = (50 + r() * 8).toFixed(1), clv = (r() * 3.5).toFixed(1);
    const stat = (x, w, v, c) => `<rect x="${x}" y="118" width="180" height="84" rx="14" fill="${P2}" stroke="#fff" stroke-opacity=".07"/><rect x="${x + 20}" y="138" width="${w}" height="10" rx="5" fill="${P4}"/>${text(x + 20, 184, v, { size: 26, fill: c })}`;
    const results = Array.from({ length: 10 }, (_, i) => { const good = r() > .38; return `<rect x="${260 + i * 70}" y="560" width="34" height="${r.int(10, 30)}" rx="4" fill="${good ? LIME : RED}" opacity=".7"/>`; }).join('');
    return frame(`${shadowed(card(200, 90, 800, 530))}${stat(230, 70, `${units >= 0 ? '+' : ''}${units}u`, units >= 0 ? LIME : RED)}${stat(430, 90, `${win}%`, TXT)}${stat(630, 60, `+${clv}%`, LIME)}
<rect x="836" y="140" width="130" height="40" rx="20" fill="${P3}"/><rect x="840" y="144" width="62" height="32" rx="16" fill="${LIME}"/>${text(871, 166, '$', { size: 15, fill: INK, weight: 800, anchor: 'middle' })}${text(934, 166, 'U', { size: 15, fill: MUT, weight: 800, anchor: 'middle' })}
${[260, 340, 420, 500].map(y => `<path d="M240 ${y}H960" stroke="#fff" stroke-opacity=".05" stroke-width="2"/>`).join('')}
<path d="${line} L950 540 L250 540Z" fill="url(#limeFill)"/><path d="${line}" fill="none" stroke="${LIME}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
${pts.filter((_, i) => i % 2 === 0).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${INK}" stroke="${LIME}" stroke-width="4"/>`).join('')}
<circle cx="${pts[10][0]}" cy="${pts[10][1]}" r="26" fill="${LIME}" opacity=".18"/><circle cx="${pts[10][0]}" cy="${pts[10][1]}" r="10" fill="${LIME}"/>
<path d="M240 542H960" stroke="${MUT}" stroke-opacity=".5" stroke-width="3"/>${results}`);
  },
};
export const SCENE_NAMES = Object.keys(SCENES);

// ---------------------------------------------------------------- bespoke calculator and tool scenes
const numberLine = (x0, x1, y, from, to, labels = true) => {
  let out = `<path d="M${x0} ${y}H${x1}" stroke="${MUT}" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/>`;
  const step = (x1 - x0) / (to - from);
  for (let v = from; v <= to; v++) out += `<path d="M${r1(x0 + (v - from) * step)} ${y - 10}V${y + 10}" stroke="${MUT}" stroke-opacity=".45" stroke-width="3"/>${labels ? text(r1(x0 + (v - from) * step), y + 44, v, { size: 20, fill: FAINT, weight: 600, anchor: 'middle' }) : ''}`;
  return out;
};
const coin = (cx, cy, s = 1, fill = LIME) => `<ellipse cx="${cx}" cy="${cy + 8 * s}" rx="${46 * s}" ry="${14 * s}" fill="${LIME3}"/><ellipse cx="${cx}" cy="${cy}" rx="${46 * s}" ry="${14 * s}" fill="${fill}"/>`;
const donut = (cx, cy, rad, parts) => {
  let a = -Math.PI / 2, out = '';
  const total = parts.reduce((s, [v]) => s + v, 0);
  for (const [v, color] of parts) {
    const b = a + (v / total) * Math.PI * 2;
    const large = b - a > Math.PI ? 1 : 0;
    out += `<path d="M${r1(cx + rad * Math.cos(a))} ${r1(cy + rad * Math.sin(a))} A${rad} ${rad} 0 ${large} 1 ${r1(cx + rad * Math.cos(b))} ${r1(cy + rad * Math.sin(b))}" stroke="${color}" stroke-width="46" fill="none"/>`;
    a = b;
  }
  return out;
};
const phone = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="${P3}"/><rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" rx="26" fill="url(#panel)"/><rect x="${x + w / 2 - 34}" y="${y + 22}" width="68" height="8" rx="4" fill="${P4}"/>`;

const BESPOKE = {
  // Calculators
  'calculator--arbitrage-hedge-bet': () => frame(`${shadowed(card(170, 150, 360, 150) + card(170, 330, 360, 150))}
${text(200, 205, 'OUTCOME A', { size: 18, fill: FAINT })}${text(200, 262, '+120', { size: 40 })}${text(500, 262, '$48.84', { size: 30, fill: LIME, anchor: 'end' })}
${text(200, 385, 'OUTCOME B', { size: 18, fill: FAINT })}${text(200, 442, '+110', { size: 40 })}${text(500, 442, '$51.16', { size: 30, fill: LIME, anchor: 'end' })}
<path d="M540 225 C640 225 640 320 720 320M540 405 C640 405 640 320 720 320" stroke="${LIME}" stroke-width="5" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>
${shadowed(`<rect x="720" y="220" width="320" height="200" rx="24" fill="${LIMEDK}" stroke="${LIME}" stroke-opacity=".5" stroke-width="2"/>`)}${text(880, 280, 'EITHER WAY', { size: 20, fill: LIME, anchor: 'middle' })}${text(880, 350, '$107.44', { size: 56, anchor: 'middle' })}${text(880, 395, '+7.44% return', { size: 22, fill: LIME, weight: 600, anchor: 'middle' })}
${pill(170, 520, 360, 'BANKROLL  $100', { fill: P2, stroke: '#fff', color: MUT, size: 22 })}`),
  'calculator--expected-value': () => frame(`${shadowed(card(200, 130, 800, 440))}
${text(250, 200, 'WIN 50%', { size: 22, fill: FAINT })}<rect x="250" y="222" width="560" height="56" rx="12" fill="${P3}"/><rect x="250" y="222" width="${560 * .55}" height="56" rx="12" fill="${LIME}"/>${text(830, 262, '+$110', { size: 30, fill: LIME })}
${text(250, 340, 'LOSE 50%', { size: 22, fill: FAINT })}<rect x="250" y="362" width="560" height="56" rx="12" fill="${P3}"/><rect x="250" y="362" width="${560 * .5}" height="56" rx="12" fill="${RED}" opacity=".8"/>${text(830, 402, '−$100', { size: 30, fill: RED })}
<path d="M250 470H950" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>${text(250, 530, 'EXPECTED VALUE', { size: 22, fill: FAINT })}${text(950, 534, '+$5.00', { size: 48, fill: LIME, anchor: 'end' })}`),
  'calculator--free-bet-conversion': () => frame(`<g transform="rotate(-8 330 350)">${shadowed(`<rect x="180" y="220" width="300" height="190" rx="22" fill="${LIMEDK}" stroke="${LIME}" stroke-opacity=".6" stroke-width="3"/>`)}<path d="M330 220V410M180 300H480" stroke="${LIME}" stroke-width="16" opacity=".8"/><path d="M330 218c-40-60-110-40-70 0M330 218c40-60 110-40 70 0" stroke="${LIME}" stroke-width="10" fill="none" stroke-linecap="round"/>${text(330, 470, 'BONUS BET $100', { size: 24, fill: LIME, anchor: 'middle' })}</g>
<path d="M530 330H660" stroke="${MUT}" stroke-width="6" stroke-linecap="round"/><path d="M640 305l30 25-30 25" stroke="${MUT}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
${coin(860, 470, 1.4)}${coin(860, 430, 1.4)}${coin(860, 390, 1.4)}${coin(860, 350, 1.4)}${text(860, 360, '$', { size: 30, fill: INK, weight: 800, anchor: 'middle' })}
${pill(740, 180, 240, '72% KEPT', { size: 26, h: 54 })}`),
  'calculator--half-point': () => frame(`${numberLine(180, 1020, 430, -1, 9)}
${[3, 7].map(v => `<circle cx="${180 + (v + 1) * 84}" cy="430" r="30" fill="${LIMEDK}" stroke="${LIME}" stroke-width="3"/>${text(180 + (v + 1) * 84, 438, v, { size: 24, fill: LIME, anchor: 'middle' })}`).join('')}
<path d="M${180 + 4.5 * 84} 300V400" stroke="${FAINT}" stroke-width="4" stroke-dasharray="8 8"/><path d="M${180 + 4 * 84} 300V400" stroke="${LIME}" stroke-width="6"/>
${shadowed(`<rect x="${180 + 4.5 * 84 - 70}" y="200" width="140" height="70" rx="16" fill="${P2}" stroke="#fff" stroke-opacity=".1"/><rect x="${180 + 4 * 84 - 210}" y="200" width="140" height="70" rx="16" fill="${LIMEDK}" stroke="${LIME}" stroke-opacity=".6" stroke-width="2"/>`)}
${text(180 + 4.5 * 84, 246, '-3.5', { size: 30, fill: MUT, anchor: 'middle' })}${text(180 + 4 * 84 - 140, 246, '-3', { size: 30, fill: LIME, anchor: 'middle' })}
<path d="M${180 + 4.5 * 84 - 80} 236H${180 + 4 * 84 - 60}" stroke="${LIME}" stroke-width="5" stroke-linecap="round"/><path d="M${180 + 4 * 84 - 50} 222l-14 14 14 14" stroke="${LIME}" stroke-width="5" fill="none" stroke-linecap="round"/>
${text(600, 580, 'KEY NUMBERS', { size: 22, fill: FAINT, anchor: 'middle' })}`),
  'calculator--hold': () => frame(`<g filter="url(#sh)">${donut(430, 350, 170, [[47.6, LIME], [47.6, MUT], [4.8, RED]])}</g>${text(430, 345, '104.8%', { size: 44, anchor: 'middle' })}${text(430, 385, 'IMPLIED', { size: 18, fill: FAINT, anchor: 'middle' })}
${shadowed(card(720, 190, 300, 90) + card(720, 300, 300, 90) + `<rect x="720" y="410" width="300" height="90" rx="18" fill="#2a1414" stroke="${RED}" stroke-opacity=".5" stroke-width="2"/>`)}
${text(746, 245, '-110', { size: 30 })}${text(994, 245, '52.4%', { size: 26, fill: LIME, anchor: 'end' })}${text(746, 355, '-110', { size: 30 })}${text(994, 355, '52.4%', { size: 26, fill: MUT, anchor: 'end' })}${text(746, 465, 'HOLD', { size: 26, fill: RED })}${text(994, 465, '4.5%', { size: 30, fill: RED, anchor: 'end' })}`),
  'calculator--implied-probability': () => frame(`${shadowed(`<rect x="170" y="250" width="300" height="200" rx="26" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/>`)}${text(320, 320, 'AMERICAN', { size: 20, fill: FAINT, anchor: 'middle' })}${text(320, 395, '-150', { size: 72, anchor: 'middle' })}
<path d="M510 350H640" stroke="${LIME}" stroke-width="6" stroke-linecap="round"/><path d="M620 322l30 28-30 28" stroke="${LIME}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="850" cy="350" r="150" fill="none" stroke="${P3}" stroke-width="34"/><circle cx="850" cy="350" r="150" fill="none" stroke="${LIME}" stroke-width="34" stroke-dasharray="${r1(2 * Math.PI * 150 * .6)} 1000" transform="rotate(-90 850 350)" stroke-linecap="round"/>
${text(850, 365, '60.0%', { size: 54, anchor: 'middle' })}${text(850, 405, 'BREAK-EVEN', { size: 18, fill: FAINT, anchor: 'middle' })}`),
  'calculator--kelly-criterion': () => frame(`${[0, 1, 2, 3, 4, 5, 6].map(i => coin(330, 520 - i * 34, 1.5, i === 6 ? LIME : i > 3 ? LIME2 : P4)).join('')}
${text(330, 250, 'BANKROLL', { size: 20, fill: FAINT, anchor: 'middle' })}
<path d="M560 520 C680 500 740 420 800 360 S920 220 1020 180" stroke="${LIME}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M560 520 C700 510 800 470 900 460 S980 450 1020 452" stroke="${FAINT}" stroke-width="4" fill="none" stroke-dasharray="10 10"/>
<path d="M560 540H1030M560 540V160" stroke="${MUT}" stroke-opacity=".4" stroke-width="3"/>
${pill(700, 110, 220, '1/4 KELLY', { size: 26, h: 54 })}${text(1020, 150, 'GROWTH', { size: 18, fill: LIME, anchor: 'end' })}`),
  'calculator--no-vig-fair-odds': () => frame(`${[0, 1].map(i => { const x = 300 + i * 360; return `<rect x="${x}" y="${580 - 330}" width="200" height="330" rx="16" fill="${P3}"/><rect x="${x}" y="${580 - 315}" width="200" height="315" rx="16" fill="${i ? MUT : LIME}"/><rect x="${x}" y="${580 - 330}" width="200" height="15" fill="${RED}" opacity=".8"/>${text(x + 100, 220, '52.4%', { size: 26, fill: FAINT, anchor: 'middle', extra: ' text-decoration="line-through"' })}${text(x + 100, 420, '50.0%', { size: 40, fill: INK, anchor: 'middle' })}`; }).join('')}
<path d="M240 ${580 - 330}H920" stroke="${RED}" stroke-width="4" stroke-dasharray="14 10"/>${pill(950, 225, 180, 'NO-VIG', { size: 24, h: 50 })}
<path d="M240 582H920" stroke="${MUT}" stroke-opacity=".5" stroke-width="4"/>`),
  'calculator--odds-converter': () => frame(`${[['AMERICAN', '+150', 170], ['DECIMAL', '2.50', 480], ['FRACTIONAL', '3/2', 790]].map(([label, value, x], i) => shadowed(`<rect x="${x}" y="250" width="240" height="200" rx="24" fill="${i === 1 ? LIMEDK : 'url(#panel)'}" stroke="${i === 1 ? LIME : '#fff'}" stroke-opacity="${i === 1 ? .6 : .08}" stroke-width="2"/>`) + text(x + 120, 310, label, { size: 18, fill: FAINT, anchor: 'middle' }) + text(x + 120, 395, value, { size: 60, fill: i === 1 ? LIME : TXT, anchor: 'middle' })).join('')}
${[410, 720].map(x => `<path d="M${x + 12} 350h46" stroke="${MUT}" stroke-width="5" stroke-linecap="round"/><path d="M${x + 44} 336l14 14-14 14" stroke="${MUT}" stroke-width="5" fill="none" stroke-linecap="round"/>`).join('')}
${pill(470, 520, 260, '40.0% IMPLIED', { fill: P2, stroke: '#fff', color: MUT, size: 22 })}`),
  'calculator--parlay': () => frame(`${[0, 1, 2].map(i => { const y = 150 + i * 130; return shadowed(`<rect x="170" y="${y}" width="420" height="100" rx="18" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/>`) + `<circle cx="222" cy="${y + 50}" r="20" fill="${LIME}"/>${check(222, y + 50, .55, INK)}<rect x="262" y="${y + 32}" width="${[180, 150, 200][i]}" height="14" rx="7" fill="${MUT}"/><rect x="262" y="${y + 58}" width="100" height="10" rx="5" fill="${P4}"/>${text(566, y + 62, ['-110', '+135', '-120'][i], { size: 28, anchor: 'end' })}`; }).join('')}
<path d="M590 200 C680 200 660 330 760 330M590 330H760M590 460 C680 460 660 330 760 330" stroke="${LIME}" stroke-width="5" fill="none" stroke-linecap="round"/>
${shadowed(`<rect x="760" y="240" width="280" height="180" rx="24" fill="${LIMEDK}" stroke="${LIME}" stroke-opacity=".6" stroke-width="2"/>`)}${text(900, 295, '3-LEG PAYOUT', { size: 20, fill: LIME, anchor: 'middle' })}${text(900, 370, '+596', { size: 66, anchor: 'middle' })}`),
  'calculator--point-spread': () => frame(`${shadowed(`<rect x="250" y="130" width="700" height="300" rx="26" fill="${P3}"/><rect x="270" y="150" width="660" height="260" rx="18" fill="url(#panel)"/>`)}
${text(430, 215, 'HOME -3.5', { size: 24, fill: FAINT, anchor: 'middle' })}${text(770, 215, 'AWAY +3.5', { size: 24, fill: FAINT, anchor: 'middle' })}
${text(430, 340, '27', { size: 110, fill: LIME, anchor: 'middle' })}${text(770, 340, '24', { size: 110, anchor: 'middle' })}<path d="M600 190V380" stroke="#fff" stroke-opacity=".1" stroke-width="3"/>
${pill(300, 480, 270, 'MARGIN +3', { fill: P2, stroke: '#fff', color: MUT, size: 24, h: 54 })}${pill(630, 480, 270, 'AWAY COVERS', { size: 24, h: 54 })}`),
  'calculator--poisson': () => frame(`${shadowed(card(200, 110, 800, 480))}
${[0.09, 0.22, 0.27, 0.22, 0.12, 0.05, 0.02].map((p, i) => `<rect x="${270 + i * 100}" y="${520 - p * 1200}" width="64" height="${p * 1200}" rx="10" fill="${i === 2 ? LIME : i < 2 ? P4 : LIME3}"/>${text(302 + i * 100, 560, i, { size: 22, fill: FAINT, anchor: 'middle' })}`).join('')}
<path d="M302 412 C360 260 420 200 502 196 S640 250 702 376 S860 490 902 496" stroke="${TXT}" stroke-opacity=".8" stroke-width="4" fill="none" stroke-dasharray="4 10" stroke-linecap="round"/>
${pill(760, 140, 200, 'λ = 2.4', { size: 26, h: 50 })}${text(250, 175, 'GOALS', { size: 20, fill: FAINT })}`),
  'calculator--round-robin': () => {
    const nodes = [[600, 170], [830, 350], [600, 530], [370, 350]];
    let edges = '';
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) edges += `<path d="M${nodes[i][0]} ${nodes[i][1]}L${nodes[j][0]} ${nodes[j][1]}" stroke="${(i + j) % 2 ? LIME : MUT}" stroke-opacity="${(i + j) % 2 ? .8 : .35}" stroke-width="5"/>`;
    return frame(`${edges}${nodes.map(([x, y], i) => shadowed(`<circle cx="${x}" cy="${y}" r="56" fill="url(#panel)" stroke="${LIME}" stroke-opacity=".5" stroke-width="3"/>`) + text(x, y + 12, String.fromCharCode(65 + i), { size: 36, fill: LIME, anchor: 'middle' })).join('')}
${pill(900, 120, 220, '6 × BY 2s', { size: 26, h: 54 })}${pill(80, 560, 240, '4 LEGS', { fill: P2, stroke: '#fff', color: MUT, size: 24, h: 50 })}`);
  },
  'calculator--vig': () => frame(`<g transform="rotate(-10 430 360)">${shadowed(`<path d="M230 240 L520 240 L620 360 L520 480 L230 480 Q210 480 210 460 V260 Q210 240 230 240Z" fill="url(#panel)" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`)}<circle cx="555" cy="360" r="18" fill="${INK}"/>${text(380, 340, '-110', { size: 64, anchor: 'middle' })}${text(380, 410, '-110', { size: 64, fill: MUT, anchor: 'middle' })}</g>
<path d="M650 220 C760 180 880 200 960 280" stroke="${FAINT}" stroke-width="4" fill="none" stroke-dasharray="10 10"/>
<g filter="url(#sh)">${donut(890, 430, 110, [[95.24, P3], [4.76, RED]])}</g>${text(890, 425, '4.76%', { size: 36, fill: RED, anchor: 'middle' })}${text(890, 460, 'JUICE', { size: 18, fill: FAINT, anchor: 'middle' })}`),
  // Tools
  'tool--arbitrage': () => frame(`${[[210, 'DraftKings', ['+118', '-130'], 0], [690, 'FanDuel', ['-135', '+112'], 1]].map(([x, label, prices, best]) => shadowed(phone(x, 110, 300, 480)) + logo(x + 40, 158, 44, label) + text(x + 98, 190, label, { size: 22, fill: TXT, weight: 700, font: SANS }) + prices.map((p, i) => `<rect x="${x + 36}" y="${230 + i * 120}" width="228" height="96" rx="16" fill="${i === best ? LIMEDK : P3}" stroke="${i === best ? LIME : 'none'}" stroke-width="2"/>${text(x + 150, 292 + i * 120, p, { size: 38, fill: i === best ? LIME : MUT, anchor: 'middle' })}`).join('')).join('')}
<path d="M470 278 C560 278 600 398 690 398" stroke="${LIME}" stroke-width="5" fill="none" stroke-dasharray="2 12" stroke-linecap="round"/>
${pill(450, 470, 300, 'ARB +2.3%', { size: 28, h: 58 })}`),
  'tool--boosts': () => frame(`${shadowed(card(200, 220, 340, 220))}${text(370, 285, 'STANDARD', { size: 20, fill: FAINT, anchor: 'middle' })}${text(370, 380, '+100', { size: 76, fill: MUT, anchor: 'middle' })}
<path d="M580 330 H700" stroke="${LIME}" stroke-width="8" stroke-linecap="round"/><path d="M680 300l34 30-34 30" stroke="${LIME}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
${shadowed(`<rect x="740" y="180" width="300" height="300" rx="30" fill="${LIMEDK}" stroke="${LIME}" stroke-opacity=".6" stroke-width="3"/>`)}${text(890, 250, 'BOOSTED', { size: 22, fill: LIME, anchor: 'middle' })}${text(890, 355, '+150', { size: 90, anchor: 'middle' })}
<path d="M890 400l-40 50h30l-10 40 50-60h-30l10-30z" fill="${LIME}"/>`),
  'tool--free-bet-converter': () => frame(`${[0, 1, 2].map(i => `<g transform="rotate(${-12 + i * 8} ${300 + i * 40} 350)">${shadowed(`<rect x="${190 + i * 40}" y="${250 - i * 10}" width="240" height="150" rx="20" fill="${i === 2 ? LIMEDK : P2}" stroke="${i === 2 ? LIME : '#fff'}" stroke-opacity="${i === 2 ? .6 : .1}" stroke-width="2"/>`)}${text(310 + i * 40, 340 - i * 10, 'FREE', { size: 34, fill: i === 2 ? LIME : FAINT, weight: 800, anchor: 'middle' })}</g>`).join('')}
<path d="M660 470 A190 190 0 0 1 1040 470" stroke="${P3}" stroke-width="34" fill="none" stroke-linecap="round"/><path d="M660 470 A190 190 0 0 1 ${r1(850 + 190 * Math.cos(Math.PI * (1 - .74)))} ${r1(470 - 190 * Math.sin(Math.PI * (1 - .74)))}" stroke="${LIME}" stroke-width="34" fill="none" stroke-linecap="round"/>
<path d="M850 470 L${r1(850 + 150 * Math.cos(Math.PI * (1 - .74)))} ${r1(470 - 150 * Math.sin(Math.PI * (1 - .74)))}" stroke="${TXT}" stroke-width="8" stroke-linecap="round"/><circle cx="850" cy="470" r="16" fill="${TXT}"/>${text(850, 560, '74% CONVERSION', { size: 26, fill: LIME, anchor: 'middle' })}`),
  'tool--low-hold': () => frame(`${shadowed(card(200, 120, 560, 460))}
${['BOOK', 'OVER', 'UNDER'].map((h, i) => text(250 + i * 180, 180, h, { size: 18, fill: FAINT })).join('')}
${[['BetMGM', '-108', '-112'], ['Caesars', '-104', '-116'], ['DraftKings', '-110', '-102'], ['FanDuel', '-112', '-108']].map((row, r) => row.map((cell, c) => { const best = (r === 1 && c === 1) || (r === 2 && c === 2); if (!c) return logo(246, 218 + r * 88, 50, cell); return `${best ? `<rect x="${230 + c * 180}" y="${212 + r * 88}" width="150" height="62" rx="12" fill="${LIMEDK}" stroke="${LIME}" stroke-width="2"/>` : ''}${text(250 + c * 180, 254 + r * 88, cell, { size: 28, fill: best ? LIME : TXT })}`; }).join('')).join('')}
<rect x="820" y="160" width="60" height="380" rx="30" fill="${P3}"/><rect x="820" y="490" width="60" height="50" rx="30" fill="${LIME}"/>${text(850, 140, 'HOLD', { size: 18, fill: FAINT, anchor: 'middle' })}${pill(900, 470, 200, '0.8%', { size: 30, h: 56 })}`),
  'tool--middles': () => frame(`${numberLine(160, 1040, 420, 44, 55)}
<rect x="${160 + 3.5 * 80}" y="360" width="${4 * 80}" height="120" rx="16" fill="${LIME}" opacity=".16"/><rect x="${160 + 3.5 * 80}" y="360" width="${4 * 80}" height="120" rx="16" fill="none" stroke="${LIME}" stroke-width="3" stroke-dasharray="10 8"/>
${shadowed(`<rect x="${160 + 3.5 * 80 - 150}" y="190" width="200" height="80" rx="18" fill="url(#panel)" stroke="#fff" stroke-opacity=".1"/><rect x="${160 + 7.5 * 80 - 50}" y="190" width="220" height="80" rx="18" fill="url(#panel)" stroke="#fff" stroke-opacity=".1"/>`)}
${text(160 + 3.5 * 80 - 50, 242, 'O 47.5', { size: 30, anchor: 'middle' })}${text(160 + 7.5 * 80 + 60, 242, 'U 51.5', { size: 30, anchor: 'middle' })}
<path d="M${160 + 3.5 * 80} 280V360M${160 + 7.5 * 80} 280V360" stroke="${MUT}" stroke-width="4"/>${pill(160 + 5.5 * 80 - 130, 540, 260, 'MIDDLE 48–51', { size: 24, h: 54 })}`),
  'tool--parlay-builder': () => frame(`${[0, 1, 2, 3].map(i => shadowed(`<rect x="${330 + (i % 2) * 40}" y="${470 - i * 96}" width="330" height="84" rx="16" fill="${i === 3 ? LIMEDK : 'url(#panel)'}" stroke="${i === 3 ? LIME : '#fff'}" stroke-opacity="${i === 3 ? .6 : .1}" stroke-width="2"/>`) + `<rect x="${360 + (i % 2) * 40}" y="${500 - i * 96}" width="${[150, 120, 170, 140][i]}" height="14" rx="7" fill="${i === 3 ? LIME : MUT}"/>${text(630 + (i % 2) * 40, 522 - i * 96, ['-110', '+120', '-105', '+140'][i], { size: 26, fill: i === 3 ? LIME : TXT, anchor: 'end' })}`).join('')}
<path d="M760 160 V560" stroke="${MUT}" stroke-opacity=".3" stroke-width="3"/>${shadowed(card(820, 240, 220, 220))}${text(930, 300, 'HIT CHANCE', { size: 18, fill: FAINT, anchor: 'middle' })}${text(930, 380, '9.8%', { size: 56, fill: LIME, anchor: 'middle' })}${text(930, 425, '+1,012', { size: 24, fill: MUT, anchor: 'middle' })}`),
  'tool--positive-ev': () => frame(`${[210, 150, 90].map((rad, i) => `<circle cx="600" cy="360" r="${rad}" fill="none" stroke="${LIME}" stroke-opacity="${.12 + i * .08}" stroke-width="2"/>`).join('')}
<path d="M600 360 L${r1(600 + 210 * Math.cos(-.6))} ${r1(360 + 210 * Math.sin(-.6))} A210 210 0 0 0 ${r1(600 + 210 * Math.cos(-1.3))} ${r1(360 + 210 * Math.sin(-1.3))}Z" fill="${LIME}" opacity=".18"/>
${[[480, 280, P4], [720, 460, P4], [520, 470, P4], [690, 250, LIME], [760, 330, LIME], [430, 380, P4], [640, 190, P4]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="${c === LIME ? 14 : 9}" fill="${c}"/>${c === LIME ? `<circle cx="${x}" cy="${y}" r="28" fill="none" stroke="${LIME}" stroke-width="2" opacity=".6"/>` : ''}`).join('')}<circle cx="600" cy="360" r="8" fill="${TXT}"/>
${pill(820, 150, 220, '+EV 3.1%', { size: 26, h: 54 })}${pill(820, 220, 220, '+EV 1.8%', { fill: P2, stroke: '#fff', color: MUT, size: 24, h: 50 })}`),
};

// ---------------------------------------------------------------- states and sportsbooks
const STATE_CODES = {
  arizona: 'AZ', arkansas: 'AR', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new-hampshire': 'NH', 'new-jersey': 'NJ', 'new-mexico': 'NM', 'new-york': 'NY', 'north-carolina': 'NC', 'north-dakota': 'ND', ohio: 'OH', oregon: 'OR', pennsylvania: 'PA', 'rhode-island': 'RI', 'south-dakota': 'SD', tennessee: 'TN', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west-virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  canada: 'CAN', alberta: 'AB', 'british-columbia': 'BC', manitoba: 'MB', 'new-brunswick': 'NB', 'newfoundland-and-labrador': 'NL', 'northwest-territories': 'NT', 'nova-scotia': 'NS', nunavut: 'NU', ontario: 'ON', 'prince-edward-island': 'PE', quebec: 'QC', saskatchewan: 'SK', yukon: 'YT',
};
const STATUS_LABEL = { statewide: ['ONLINE + RETAIL', LIME], 'online-only': ['ONLINE ONLY', LIME], limited: ['LIMITED', AMBER], retail: ['RETAIL ONLY', MUT], pending: ['PENDING', MUT], provincial: ['PROVINCIAL', MUT], atlantic: ['ATLANTIC LOTTERY', MUT], territorial: ['TERRITORIAL', MUT], 'open-regulated': ['OPEN MARKET', LIME] };
// Two-letter monogram: first letters of two words, or for one word its first letter plus the next
// capital or digit (BetMGM -> BM, bet365 -> B3).
const initials = name => {
  const words = String(name).replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map(word => word[0].toUpperCase()).join('');
  const word = words[0] || '';
  const second = word.slice(1).match(/[A-Z0-9]/);
  return (word[0] || '•').toUpperCase() + (second ? second[0] : '');
};

function stateArt(guide) {
  const r = seeded(`state:${guide.slug}`);
  const code = STATE_CODES[guide.slug] || initials(guide.name);
  const [label, color] = STATUS_LABEL[guide.status] || [String(guide.status || '').toUpperCase(), MUT];
  // Books with a real logo first, then others by name; lottery/directory notes are shortened.
  const rawBooks = (Array.isArray(guide.books) ? guide.books : []).map(book => typeof book === 'string' ? book : book?.name || '').filter(Boolean)
    .map(book => book.replace(/^[^:]{2,40}:\s*/, '').replace(/^Examples in the live directory:\s*/i, ''));
  const books = [...new Set([...rawBooks.filter(book => logoData(book)), ...rawBooks.filter(book => !logoData(book))].map(book => logoData(book) ? brandName(book) : book))].slice(0, 4);
  const size = code.length > 2 ? 230 : 300;
  const gx = r.int(20, 45), gy = r.int(30, 60);
  const tiles = books.map((name, i) => { const mark = logo(780, 168 + i * 104, 48, name); const label = name.length > 22 ? `${name.slice(0, 21)}…` : name; return shadowed(`<rect x="760" y="${150 + i * 104}" width="330" height="84" rx="18" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/>`) + `${mark}${text(mark ? 846 : 784, 200 + i * 104, label, { size: 20, fill: TXT, weight: 650, font: SANS })}`; }).join('');
  const rings = Array.from({ length: 3 }, (_, i) => `<circle cx="${r.int(120, 1080)}" cy="${r.int(100, 600)}" r="${r.int(40, 120)}" fill="none" stroke="${LIME}" stroke-opacity="${.05 + i * .02}" stroke-width="2"/>`).join('');
  const pin = `<path d="M620 ${r.int(150, 200)} c-34 0 -60 26 -60 58 c0 44 60 104 60 104 s60 -60 60 -104 c0 -32 -26 -58 -60 -58z" fill="${LIMEDK}" stroke="${LIME}" stroke-width="3"/>`;
  return frame(`${rings}
${text(150, 400, code, { size, fill: 'url(#codeFill)', weight: 900, font: SANS, extra: ` letter-spacing="-8" stroke="${LIME}" stroke-opacity=".35" stroke-width="2"` })}
${text(156, 470, guide.name.toUpperCase(), { size: 30, fill: TXT, weight: 750, font: SANS, extra: ' letter-spacing="3"' })}
${pill(150, 505, Math.max(220, label.length * 15 + 60), label, { fill: color === LIME ? LIMEDK : P2, stroke: color, color, size: 20, h: 46 })}
${books.length ? tiles : pin}`, `<linearGradient id="codeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIME}" stop-opacity=".9"/><stop offset="1" stop-color="${LIME}" stop-opacity=".15"/></linearGradient>`, { glow: [gx, gy] });
}

function sportsbookArt(guide) {
  const r = seeded(`book:${guide.slug}`);
  const group = /prediction/i.test(guide.group) ? 'prediction' : /dfs|pick/i.test(guide.group) ? 'dfs' : 'book';
  const name = guide.name.replace(/ Sportsbook$/, '');
  // One line for short names; long names wrap at the space nearest the middle.
  const words = name.split(' ');
  let lines = [name];
  if (name.length > 13 && words.length > 1) {
    let best = 1;
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(' ').length - name.length / 2) < Math.abs(words.slice(0, best).join(' ').length - name.length / 2)) best = i;
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const longest = Math.max(...lines.map(line => line.length));
  const size = Math.min(84, Math.floor(520 / (0.64 * longest)));
  let ui = '';
  if (group === 'book') {
    ui = [0, 1, 2].map(i => `<rect x="720" y="${210 + i * 100}" width="340" height="80" rx="16" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/><rect x="742" y="${236 + i * 100}" width="${r.int(80, 130)}" height="12" rx="6" fill="${P4}"/>` + [0, 1].map(j => { const o = fmtOdds(r() > .5 ? r.int(100, 190) : -r.int(105, 200)); const hot = i === r.int(0, 2) && j === 1; return `<rect x="${900 + j * 78}" y="${224 + i * 100}" width="68" height="52" rx="10" fill="${hot ? LIMEDK : P3}"${hot ? ` stroke="${LIME}" stroke-width="2"` : ''}/>${text(934 + j * 78, 257 + i * 100, o, { size: 17, fill: hot ? LIME : TXT, anchor: 'middle' })}`; }).join('')).join('');
  } else if (group === 'dfs') {
    ui = [0, 1].map(i => { const line = `${r.int(12, 40)}.5`; const more = r() > .5; return shadowed(`<rect x="${720 + i * 180}" y="200" width="160" height="300" rx="20" fill="url(#panel)" stroke="#fff" stroke-opacity=".08"/>`) + `<circle cx="${800 + i * 180}" cy="262" r="34" fill="${P3}"/><rect x="${760 + i * 180}" y="316" width="80" height="10" rx="5" fill="${P4}"/>${text(800 + i * 180, 376, line, { size: 34, anchor: 'middle' })}<rect x="${736 + i * 180}" y="410" width="60" height="40" rx="10" fill="${more ? LIME : P3}"/><rect x="${804 + i * 180}" y="410" width="60" height="40" rx="10" fill="${more ? P3 : LIME}"/>${text(766 + i * 180, 437, 'MORE', { size: 13, fill: more ? INK : MUT, anchor: 'middle' })}${text(834 + i * 180, 437, 'LESS', { size: 13, fill: more ? MUT : INK, anchor: 'middle' })}`; }).join('');
  } else {
    const yes = r.int(18, 82);
    ui = shadowed(card(720, 200, 340, 300)) + `<rect x="746" y="230" width="${r.int(160, 260)}" height="14" rx="7" fill="${MUT}"/><rect x="746" y="256" width="${r.int(100, 180)}" height="10" rx="5" fill="${P4}"/>
<rect x="746" y="300" width="288" height="56" rx="12" fill="${P3}"/><rect x="746" y="300" width="${Math.round(288 * yes / 100)}" height="56" rx="12" fill="${LIME}"/>${text(762, 337, `YES ${yes}¢`, { size: 20, fill: INK })}
<rect x="746" y="372" width="288" height="56" rx="12" fill="${P3}"/><rect x="746" y="372" width="${Math.round(288 * (100 - yes) / 100)}" height="56" rx="12" fill="${P4}"/>${text(762, 409, `NO ${100 - yes}¢`, { size: 20, fill: TXT })}
<path d="M746 470 ${Array.from({ length: 8 }, (_, i) => `L${766 + i * 36} ${462 - r.int(0, 26)}`).join(' ')}" stroke="${LIME}" stroke-width="3" fill="none"/>`;
  }
  const chip = group === 'prediction' ? 'PREDICTION MARKET' : group === 'dfs' ? "DFS & PICK'EM" : 'SPORTSBOOK';
  const mark = logo(150, 168, 124, guide.name) || `${shadowed(`<rect x="150" y="170" width="120" height="120" rx="30" fill="${P3}"/>`)}${text(210, 250, initials(name), { size: 46, fill: MUT, weight: 900, anchor: 'middle', font: SANS })}`;
  return frame(`${shadowed(`<rect x="146" y="164" width="132" height="132" rx="32" fill="${P2}"/>`)}${mark}
${lines.map((line, i) => text(150, 318 + size + i * Math.round(size * 1.08), line, { size, fill: TXT, weight: 850, font: SANS, extra: ' letter-spacing="-2"' })).join('')}
${pill(150, 318 + size + (lines.length - 1) * Math.round(size * 1.08) + 30, chip.length * 14 + 60, chip, { size: 19, h: 44 })}${ui}`, '', { glow: [r.int(25, 70), r.int(30, 60)] });
}

// ---------------------------------------------------------------- topic choice for guides and help
const TOPICS = [
  [/arbitrage|\barb\b|hedge|middle/, 'arbitrage'], [/parlay|ticket|slip|same.game|teaser|\blog\b/, 'ticket'],
  [/track|record|result|bankroll|unit|export|clv|closing/, 'tracker'], [/trend|prop|player|\bstat|model|project/, 'trends'],
  [/probab|implied|expected|\bev\b|positive|variance|fair|no.vig|vig|kelly/, 'probability'], [/calculat|payout|convert|odds.format|return/, 'calculator'],
  [/compar|line.shop|screen|price|best.odds|movement/, 'comparison'],
];
export function sceneForText(value, seed = value) {
  const lower = String(value).toLowerCase();
  const topic = TOPICS.find(([pattern]) => pattern.test(lower));
  return topic ? topic[1] : SCENE_NAMES[seeded(seed).int(0, SCENE_NAMES.length - 1)];
}

/** SVG for an art key (`type--slug`), or null when the key is unknown. */
export async function renderArt(key) {
  const match = /^([a-z]+)--([a-z0-9-]+)$/.exec(String(key));
  if (!match) return null;
  const [, type, slug] = match;
  if (BESPOKE[key]) return BESPOKE[key]();
  if (type === 'scene') return SCENES[slug] ? SCENES[slug](seeded(`scene:${slug}`)) : null;
  if (type === 'state') {
    const { marketGuides } = await import('./online-sports-betting.mjs');
    const guide = marketGuides.find(item => item.slug === slug);
    return guide ? stateArt(guide) : null;
  }
  if (type === 'sportsbook') {
    const { sportsbookGuideIndex } = await import('./online-sportsbook-guides.mjs');
    const guide = sportsbookGuideIndex.find(item => item.slug === slug);
    return guide ? sportsbookArt(guide) : null;
  }
  const { contentLibrary } = await import('./content/registry.mjs');
  const item = contentLibrary.find(entry => entry.id === `${type}:${slug}` || entry.id === `${type}:api-${slug}`);
  if (!item) return null;
  // Beginner Guide lessons keep the scene chosen for their step; everything else goes by topic.
  const lesson = type === 'help' && BEGINNER_GUIDE_LESSONS.find(entry => entry.slug === slug);
  const scene = lesson ? lesson.art : sceneForText(`${item.title} ${item.path}`, item.id);
  return SCENES[scene](seeded(item.id));
}
