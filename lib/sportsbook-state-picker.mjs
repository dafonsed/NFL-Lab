import { US_STATES } from '../public/sportsbook-availability.js';
import { icon } from '../public/ui-icons.js';

export function sportsbookStatePicker() {
  return `<details class="ev-state-picker" data-state-picker>
    <summary aria-label="Choose your state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span data-state-label>State</span><span class="ev-state-chevron" aria-hidden="true">⌄</span></summary>
    <div class="ev-state-panel" aria-label="Sportsbook availability">
      <div class="ev-state-heading"><div><strong>Your state</strong><p>Find sportsbooks where you play.</p></div><button type="button" class="ev-state-close" data-state-close aria-label="Close state selector">${icon('close')}</button></div>
      <div class="ev-state-field">
        <label for="sportsbook-state">State</label>
        <select id="sportsbook-state" data-state-select size="1" aria-describedby="sportsbook-state-help"><option value="">All sportsbooks</option>${Object.entries(US_STATES).map(([code,name]) => `<option value="${code}">${name}</option>`).join('')}</select>
        <p id="sportsbook-state-help">Filters sportsbook offers across your EV tools.</p>
      </div>
      <div class="ev-state-results">
        <div class="ev-state-status" data-state-status role="status" aria-live="polite"></div>
        <p class="ev-state-save-error" data-state-save-error role="alert" hidden></p>
        <div data-state-books></div>
      </div>
      <footer class="ev-state-footer">
        <p class="ev-state-note">Online sportsbooks only. Local restrictions and account eligibility apply.</p>
        <details class="ev-state-sources"><summary><span>Coverage &amp; sources</span>${icon('chevron')}</summary><div data-state-sources></div></details>
      </footer>
    </div>
  </details>`;
}
