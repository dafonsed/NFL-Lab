import { icon } from './ui-icons.js';
import { mountLandingDemo } from './landing-demo.js';
import { DEMO_PLAYERS, DEMO_SPORTS, demoGames, demoSummary } from './demo-data.js';

document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
const workspace = document.querySelector('.landing-showcase');
const demo = mountLandingDemo(workspace);
// These product examples share the demo fixtures; they are never actual picks.
document.querySelector('#landing-sample-players').innerHTML = ['jordan-ellis','maya-brooks','leo-martinez'].map(id => {
  const p = DEMO_PLAYERS.find(player => player.id === id), sport = DEMO_SPORTS[p.sport];
  const [market, label, line, max] = sport.markets[0], games = demoGames(p), summary = demoSummary(games, market, line);
  return `<button type="button" class="landing-sample-player" data-demo-launch="research" data-sample-player="${id}" aria-label="Explore ${p.name} in the demo"><span class="demo-avatar-small">${p.initials}</span><span><strong>${p.name}</strong><small>${sport.label} · ${label} · ${line}</small></span><span>${summary.hits}/${summary.n} above<svg class="landing-sample-bars" viewBox="0 0 84 29" aria-hidden="true">${games.map((g,i) => {const h=g.stats[market]/max*28;return `<rect x="${i*8.4}" y="${29-h}" width="6" height="${Math.max(1,h)}" rx="1" fill="${g.stats[market]>line?'#419eff':'#d77d69'}"/>`;}).join('')}</svg></span></button>`;
}).join('');
document.querySelectorAll('[data-demo-launch]').forEach(control => control.addEventListener('click', event => {
  event.preventDefault();
  demo.open({view:control.dataset.demoLaunch, playerId:control.dataset.samplePlayer});
  workspace.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}));

// A second visual group creates a seamless loop. Only the original six links
// enter the accessibility tree; keyboard and reduced-motion users get a scrollable list.
const carousel = document.querySelector('.league-carousel');
const track = carousel.querySelector('.league-track');
const leagueGroup = carousel.querySelector('.league-group');
const motionButton = document.querySelector('.league-motion-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const duplicate = leagueGroup.cloneNode(true);
duplicate.classList.remove('landing-sport-links');
duplicate.classList.add('league-duplicate');
duplicate.removeAttribute('aria-label');
duplicate.setAttribute('aria-hidden','true');
duplicate.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
track.append(duplicate);
carousel.classList.add('is-ready');
let motionPaused = false;
function updateMotion() {
  carousel.classList.toggle('is-paused',motionPaused);
  motionButton.hidden = reducedMotion.matches;
  motionButton.setAttribute('aria-pressed',String(motionPaused));
  motionButton.setAttribute('aria-label',motionPaused?'Resume league animation':'Pause league animation');
  motionButton.querySelector('span').textContent=motionPaused?'Play':'Pause';
  motionButton.querySelector('path').setAttribute('d',motionPaused?'m9 5 10 7-10 7Z':'M9 6v12M15 6v12');
  carousel.scrollLeft=0;
}
motionButton.addEventListener('click',()=>{motionPaused=!motionPaused;updateMotion();});
reducedMotion.addEventListener('change',updateMotion);
carousel.addEventListener('focusin',event=>{
  if(!event.target.closest('a')||!event.target.matches(':focus-visible'))return;
  carousel.classList.add('is-keyboard');
  event.target.scrollIntoView({block:'nearest',inline:'nearest'});
});
carousel.addEventListener('focusout',()=>{
  queueMicrotask(()=>{if(!carousel.contains(document.activeElement)){carousel.classList.remove('is-keyboard');carousel.scrollLeft=0;}});
});
carousel.querySelectorAll('img').forEach(img=>{img.addEventListener('error',()=>{img.hidden=true;});if(img.complete&&!img.naturalWidth)img.hidden=true;});
updateMotion();
