import { icon } from './ui-icons.js';
import { mountLandingResearch } from './landing-live.js?v=2';
import { mountHeroTracker } from './landing-header.js?v=5';

document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });

mountHeroTracker();
mountLandingResearch();
