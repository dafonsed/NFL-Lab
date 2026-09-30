// Request snippets and syntax highlighting for the API reference. Shared by the server renderer
// (first paint) and odds-api.js (live updates as parameters change).
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const LANGUAGES = [
  { id: 'shell', label: 'cURL', file: 'cURL request' },
  { id: 'node', label: 'Node', file: 'Node.js (fetch)' },
  { id: 'python', label: 'Python', file: 'Python (requests)' },
  { id: 'browser', label: 'Browser', file: 'Browser (fetch)' },
];

/** Request URL for an endpoint with the given parameter values (empty values are left out). */
export function requestUrl(page, values = {}, origin = '') {
  let path = page.path;
  const query = new URLSearchParams();
  for (const param of page.params || []) {
    const value = String(values[param.name] ?? '').trim();
    if (param.in === 'path') path = path.replace(`{${param.name}}`, value ? encodeURIComponent(value) : `{${param.name}}`);
    else if (value) query.set(param.name, value);
  }
  const search = query.toString();
  return `${origin}${path}${search ? `?${search}` : ''}`;
}

export function snippet(language, page, values = {}, origin = '') {
  const url = requestUrl(page, values, origin);
  const method = page.method || 'GET';
  const body = page.body ? JSON.stringify(page.body, null, 2) : '';
  if (language === 'node') {
    const options = [`method: '${method}'`, `headers: { accept: 'application/json'${body ? ", 'content-type': 'application/json'" : ''} }`];
    if (body) options.push(`body: JSON.stringify(${body.replace(/\n/g, '\n  ')})`);
    return `const response = await fetch('${url}', {\n  ${options.join(',\n  ')}\n});\nconst data = await response.json();\nconsole.log(data);`;
  }
  if (language === 'python') {
    const args = [`"${url}"`, 'headers={"accept": "application/json"}'];
    if (body) args.push(`json=${body.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None').replace(/\n/g, '\n    ')}`);
    return `import requests\n\nresponse = requests.${method.toLowerCase()}(\n    ${args.join(',\n    ')}\n)\nprint(response.json())`;
  }
  if (language === 'browser') {
    const options = [`method: '${method}'`, "credentials: 'include'"];
    if (body) options.push("headers: { 'content-type': 'application/json' }", `body: JSON.stringify(${body.replace(/\n/g, '\n  ')})`);
    return `fetch('${url}', {\n  ${options.join(',\n  ')}\n})\n  .then(response => response.json())\n  .then(data => console.log(data));`;
  }
  const lines = [`curl --request ${method}`, `--url '${url}'`, "--header 'accept: application/json'"];
  if (body) lines.push("--header 'content-type: application/json'", `--data '${JSON.stringify(page.body)}'`);
  return lines.join(' \\\n     ');
}

/** Highlight a code block as HTML (escaped). `language`: json | shell | node | browser | python. */
export function highlight(language, code) {
  const text = String(code ?? '');
  if (language === 'json') {
    return esc(text).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi, (match, string, colon, literal, number) => {
      if (string) return colon ? `<span class="tk-key">${string}</span>${colon}` : `<span class="tk-str">${string}</span>`;
      if (literal) return `<span class="tk-lit">${literal}</span>`;
      return `<span class="tk-num">${number}</span>`;
    });
  }
  const keywords = language === 'python' ? /\b(import|from|print|True|False|None)\b/g : /\b(const|await|return|new|then)\b/g;
  return esc(text)
    .replace(/(&#39;[^\n]*?&#39;|&quot;[^\n]*?&quot;)/g, '<span class="tk-str">$1</span>')
    .replace(/(^|\s)(--?[a-z][a-z-]*)/g, (match, space, flag) => language === 'shell' ? `${space}<span class="tk-flag">${flag}</span>` : match)
    .replace(/^(curl)\b/, '<span class="tk-cmd">$1</span>')
    .replace(keywords, match => `<span class="tk-kw">${match}</span>`);
}
