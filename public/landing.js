import { icon } from './ui-icons.js';
import { mountLandingResearch } from './landing-live.js';

document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });

mountLandingResearch();
