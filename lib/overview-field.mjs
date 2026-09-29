// Decorative, top-down field drawings for the Trends and Models overview.
// The paths inherit one color from the surrounding card.
const frame = drawing => `<svg class="studio-field" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;

const nfl = () => {
  const yardLines = Array.from({ length: 9 }, (_, index) => {
    const x = (83 + (index + 1) * 43.4).toFixed(1);
    return `<line x1="${x}" y1="72" x2="${x}" y2="328"/>`;
  }).join('');
  const hashes = Array.from({ length: 19 }, (_, index) => {
    const x = (83 + (index + 1) * 21.7).toFixed(1);
    return `<path d="M${x} 169v8 M${x} 223v8"/>`;
  }).join('');
  return frame(`
    <rect x="37" y="70" width="526" height="260" rx="6"/>
    <path d="M83 70v260 M517 70v260" stroke-width="2.5"/>
    <g opacity=".72">${yardLines}</g>
    <g opacity=".62" stroke-width="1.6">${hashes}</g>
    <path d="M37 115h46 M37 285h46 M517 115h46 M517 285h46" opacity=".36"/>
  `);
};

const mlb = () => frame(`
  <path d="M300 345 90 126 C175 17 425 17 510 126L300 345Z" stroke-width="2.4"/>
  <path d="M111 151c81-94 297-94 378 0" opacity=".42"/>
  <path d="M300 340 382 258 300 176 218 258Z"/>
  <path d="M300 340 382 258 M300 340 218 258" opacity=".7"/>
  <path d="M290 337h20l-3 8h-14Z" stroke-width="1.7"/>
  <rect x="376" y="252" width="12" height="12" transform="rotate(45 382 258)" stroke-width="1.7"/>
  <rect x="294" y="170" width="12" height="12" transform="rotate(45 300 176)" stroke-width="1.7"/>
  <rect x="212" y="252" width="12" height="12" transform="rotate(45 218 258)" stroke-width="1.7"/>
  <circle cx="300" cy="260" r="10" opacity=".72"/>
  <path d="M294 260h12 M275 327v23 M325 327v23" stroke-width="1.5" opacity=".65"/>
  <circle cx="90" cy="126" r="2"/><circle cx="510" cy="126" r="2"/>
`);

const basketball = () => frame(`
  <rect x="38" y="49" width="524" height="302" rx="3" stroke-width="2.4"/>
  <path d="M300 49v302"/>
  <circle cx="300" cy="200" r="48"/>
  <path d="M38 135h140v130H38 M562 135H422v130h140"/>
  <circle cx="178" cy="200" r="52" opacity=".65"/>
  <circle cx="422" cy="200" r="52" opacity=".65"/>
  <path d="M88 185v30 M512 185v30" stroke-width="2.5"/>
  <circle cx="100" cy="200" r="10"/><circle cx="500" cy="200" r="10"/>
  <path d="M78 78v32 A144 144 0 0 1 78 290v32 M522 78v32 A144 144 0 0 0 522 290v32" opacity=".75"/>
  <path d="M38 88h40 M38 312h40 M522 88h40 M522 312h40" opacity=".6"/>
`);

const hockey = () => frame(`
  <rect x="38" y="51" width="524" height="298" rx="78" stroke-width="2.4"/>
  <path d="M300 51v298 M207 51v298 M393 51v298 M85 91v218 M515 91v218"/>
  <circle cx="300" cy="200" r="44"/><circle cx="300" cy="200" r="2.5"/>
  <circle cx="138" cy="126" r="36"/><circle cx="138" cy="274" r="36"/>
  <circle cx="462" cy="126" r="36"/><circle cx="462" cy="274" r="36"/>
  <path d="M72 185a15 15 0 0 1 0 30 M528 185a15 15 0 0 0 0 30"/>
  <path d="M61 178v44 M539 178v44" stroke-width="2.5"/>
  <circle cx="138" cy="126" r="2"/><circle cx="138" cy="274" r="2"/>
  <circle cx="462" cy="126" r="2"/><circle cx="462" cy="274" r="2"/>
  <circle cx="138" cy="200" r="2"/><circle cx="462" cy="200" r="2"/>
`);

const soccer = () => frame(`
  <rect x="38" y="51" width="524" height="298" rx="2" stroke-width="2.4"/>
  <path d="M300 51v298"/>
  <circle cx="300" cy="200" r="43"/><circle cx="300" cy="200" r="2.5"/>
  <path d="M38 121h102v158H38 M562 121H460v158h102"/>
  <path d="M38 164h40v72H38 M562 164h-40v72h40"/>
  <path d="M28 176h10v48H28 M572 176h-10v48h10" opacity=".7"/>
  <circle cx="107" cy="200" r="2.5"/><circle cx="493" cy="200" r="2.5"/>
  <path d="M140 164a43 43 0 0 1 0 72 M460 164a43 43 0 0 0 0 72" opacity=".7"/>
  <path d="M38 60a9 9 0 0 0 9-9 M553 51a9 9 0 0 0 9 9 M38 340a9 9 0 0 0 9 9 M553 349a9 9 0 0 0 9-9" opacity=".55"/>
`);

export function overviewField(sport) {
  switch (sport) {
    case 'nfl': return nfl();
    case 'mlb': return mlb();
    case 'nba':
    case 'wnba': return basketball();
    case 'nhl': return hockey();
    case 'soccer': return soccer();
    default: return '';
  }
}
