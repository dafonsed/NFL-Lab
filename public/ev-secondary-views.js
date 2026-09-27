import {SECONDARY_TOOLS, MORE_TOOL_GROUPS} from './ev-tool-catalog.js';
import {icon} from './ui-icons.js';
export const toolEsc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const purposes = {
  middles:'Two lines. One winning window. Compare the upside and the cost outside it.',
  holds:'Find the tightest two-sided markets across your recorded sportsbook prices.',
  promo:'Turn a promotion into a clear stake plan. See the result on either side.',
  parlay:'Build your ticket one leg at a time, with fair probabilities beside every price.',
  optimizer:'Compare two-pick combinations using your estimated hit rates and saved payout rules.',
  slip:'Choose your picks, set the payout rules, and see the math behind your entry.',
  'fantasy-alerts':'Keep your player-prop watchlist in one place. Review matches as you add new lines.',
  prediction:'A workspace for contract prices, market depth, and your recorded positions.',
  trends:'Read the recent form in your saved results, then compare related player props.',
  'line-alerts':'Set your price targets and follow the moves in your recorded markets.'
};
export function secondaryShell(key, content, {actions='',sport='',search='',dataLabel=''} = {}) {
  const tool = SECONDARY_TOOLS.find(item=>item.key===key);
  if (!tool) return content;
  const related = MORE_TOOL_GROUPS.find(group=>group.label===tool.group).tools.filter(item=>!['ev-live','arb-live'].includes(item.key));
  return `<div class="tool-workspace" data-tool-workspace="${key}"><header class="tool-heading"><div><div class="tool-title-row"><h1>${toolEsc(tool.label)}</h1>${dataLabel?`<span class="tool-data-label">${toolEsc(dataLabel)}</span>`:''}</div><p>${purposes[key]}</p></div><div class="tool-heading-actions">${actions}</div></header>
    <div class="tool-context"><nav class="tool-related" aria-label="Related tools">${related.map(item=>`<button type="button" data-tool="${item.key}" ${key===item.key?'aria-current="page"':''}>${icon(item.icon)}${item.label}</button>`).join('')}</nav><div class="tool-filters"><label><span class="tool-sr">Tool sport</span><select aria-label="Tool sport" data-tool-sport><option value="">All sports</option>${['NFL','MLB','NBA','WNBA','NHL','Soccer'].map(name=>`<option ${sport===name?'selected':''}>${name}</option>`).join('')}</select></label><label class="tool-search">${icon('search')}<input type="search" data-tool-search aria-label="Search this tool" placeholder="Search records" value="${toolEsc(search)}"></label></div></div>
    <div class="tool-content">${content}</div></div>`;
}
export function toolPanel(title, subtitle, body, {actions='',className=''}={}) {
  return `<section class="tool-panel ${className}"><header class="tool-panel-heading"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${actions?`<div class="tool-panel-actions">${actions}</div>`:''}</header><div class="tool-panel-body">${body}</div></section>`;
}
export function toolEmpty(title, description, action='', symbol='research') {
  return `<div class="tool-empty"><span class="tool-empty-icon">${icon(symbol)}</span><h3>${title}</h3><p>${description}</p>${action?`<div class="tool-empty-action">${action}</div>`:''}</div>`;
}
export function toolStats(items) {
  return `<dl class="tool-stats">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
export function toolNote(text) { return `<p class="tool-note">${icon('info')}<span>${text}</span></p>`; }
export function toolReceipt(title, value, rows, note='') {
  return `<aside class="tool-receipt"><span class="tool-receipt-label">${title}</span><strong class="tool-receipt-value">${value}</strong><dl>${rows.map(([label,amount])=>`<div><dt>${label}</dt><dd>${amount}</dd></div>`).join('')}</dl>${note?`<p>${note}</p>`:''}</aside>`;
}
