import { icon } from './ui-icons.js';
import { mountLandingDemo } from './landing-demo.js';

document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
mountLandingDemo(document.querySelector('.landing-showcase'));
