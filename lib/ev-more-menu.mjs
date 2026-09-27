import {MORE_TOOL_GROUPS,evToolUrl} from '../public/ev-tool-catalog.js';
import {icon} from '../public/ui-icons.js';
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function evMoreMenu(sport, primary = []) {
  return `<details class="ev-more" data-ev-more><summary aria-label="More tools" aria-controls="ev-more-panel" aria-expanded="false"><span>More</span>${icon('chevron')}</summary>
    <div class="ev-more-panel" id="ev-more-panel"><div class="ev-more-heading"><strong>Explore your tools</strong><span>Find, build, and follow your next play.</span></div>
      <nav class="ev-more-primary" aria-label="Main market tools">${primary.map(([label,href])=>`<a href="${esc(href)}">${esc(label)}</a>`).join('')}</nav>
      <div class="ev-more-groups">${MORE_TOOL_GROUPS.map(group=>`<section><h2>${esc(group.label)}</h2><nav aria-label="${esc(group.label)} tools">${group.tools.map(tool=>`<a href="${evToolUrl(tool.key,sport)}" data-more-tool="${tool.key}"><span class="ev-more-icon">${icon(tool.icon)}</span><span><strong>${esc(tool.label)}</strong><small>${esc(tool.description)}</small></span></a>`).join('')}</nav></section>`).join('')}</div>
      <div class="ev-more-footer"><span>${icon('info')} All tools share your saved workspace.</span><span>Esc to close</span></div>
    </div></details>`;
}
