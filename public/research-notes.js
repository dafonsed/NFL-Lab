import { accountStorage as localStorage, accountReady } from './account-sync.js';
await accountReady;
import { icon } from './ui-icons.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}) : 'Unavailable';

const noteKey=profile=>profile.sport==='nfl'?'nfl-notes':profile.sport==='mlb'?'mlb-lab-notes':'sports-lab-notes-'+profile.sport;
export function readResearchNote(profile,storage) {
  try { const notes=JSON.parse((storage??localStorage).getItem(noteKey(profile))||'{}');return typeof notes?.[profile.playerId]==='string'?notes[profile.playerId]:''; } catch { return ''; }
}
export function writeResearchNote(profile,note,storage) {
  try {
    const target=storage??localStorage;let value;
    try {value=JSON.parse(target.getItem(noteKey(profile))||'{}');}catch{value={};}
    const notes=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    notes[profile.playerId]=String(note);target.setItem(noteKey(profile),JSON.stringify(notes));return true;
  } catch { return false; }
}

export function availabilityReceiptHtml(a) {
  const title=a.stale?'Injury report could not refresh':a.applied?'Injury report checked':'Availability not applied';
  const summary=a.applied?`${Number.isFinite(a.excluded)?a.excluded:'—'} unavailable players excluded from this board`:'These games are outside the current report’s coverage';
  return `<section class="availability-receipt source-receipt ${a.stale?'is-stale':''}" aria-label="Injury report status"><span class="source-receipt-icon">${icon(a.stale||!a.applied?'info':'check')}</span><div class="source-receipt-main"><div class="source-receipt-title"><strong>${title}</strong><span>${esc(summary)}</span></div><p>${a.stale?'The latest check failed. Availability may have changed.':a.applied?'An unlisted player is not confirmed active.':'Reports cover games within the next seven days or tonight’s game window; they do not establish past availability.'}</p><div class="source-receipt-actions"><details class="source-receipt-details"${a.stale?' open':''}><summary>Source & timing</summary><dl><div><dt>Provider</dt><dd>ESPN</dd></div><div><dt>Checked</dt><dd>${esc(time(a.checkedAt))}</dd></div><div><dt>Source updated</dt><dd>${esc(time(a.sourceUpdatedAt))}</dd></div>${a.stale?`<div><dt>Last successful fetch</dt><dd>${esc(time(a.fetchedAt))}</dd></div>`:''}</dl>${a.stale&&a.error?`<p>${esc(a.error)}</p>`:""}</details>${/^https:\/\//.test(a.sourceUrl||'')?`<a class="source-receipt-link" href="${esc(a.sourceUrl)}" target="_blank" rel="noreferrer">View report ${icon('arrow')}</a>`:''}</div></div></section>`;
}
