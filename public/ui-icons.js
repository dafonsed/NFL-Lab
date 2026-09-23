// One stroke, size and view box for navigation and controls across the app.
const paths = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.01"/>',
  research: '<path d="M4 19V9m5 10V4m6 15v-7m5 7V7"/>',
  trends: '<path d="m3 16 6-6 4 4 8-10M15 4h6v6"/>',
  live: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  simulation: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="3"/>',
  performance: '<path d="M12 3a9 9 0 1 0 9 9h-9Z"/><path d="M16 3.9A9 9 0 0 1 20.1 8H16Z"/>',
  paper: '<path d="M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7m-7 4h5"/>',
  picks: '<path d="M8 4H5v17l7-4 7 4V4h-3M9 3h6v4H9Z"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6h1.5A3.5 3.5 0 0 0 21 11.5 8.5 8.5 0 0 0 12 3Z"/><circle cx="7" cy="10" r=".8" fill="currentColor"/><circle cx="10" cy="6.8" r=".8" fill="currentColor"/><circle cx="14.5" cy="7" r=".8" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".8" fill="currentColor"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8l-5-5m13 5 5-5M8 16l-5 5m13-5 5 5"/>',
  filter: '<path d="M5 3v18M12 3v18M19 3v18"/><path d="M2 8h6m1 8h6m1-10h6" stroke-width="3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  code: '<path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-13-2 20"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  moon: '<path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z"/>',
  football: '<path d="M4 20C1 8 8 1 20 4c3 12-4 19-16 16Zm4-4 8-8m-7 3 4 4m-1-7 4 4"/>',
  basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5 6a8 8 0 0 1 0 12M19 6a8 8 0 0 0 0 12"/>',
  baseball: '<circle cx="12" cy="12" r="9"/><path d="M5 6c5 3 5 9 0 12M19 6c-5 3-5 9 0 12"/>',
  hockey: '<path d="m16 3-6 14H4v4h8L20 3M15 20h6"/>',
  soccer: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 5H9l-2-5Zm0-4v4M3.5 9l3.5 2m-1 8 3-3m9 3-3-3m5.5-7L17 11"/>'
};
export function icon(name, className = '') {
  return `<svg class="ui-icon${className ? ' ' + className : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.research}</svg>`;
}
