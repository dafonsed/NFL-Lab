// Reads a large JSON list one record at a time as it downloads. response.json() holds the whole text and
// then every record as an object at once: for the main quote feed (83 MB, 178k records on 10 Oct 2026)
// that was 250-350 MB beside a board being priced, past what the engine thread has in a 2 GB function.
// Here only the record being read is text; each is parsed on its own and handed to `onRecord`.

const QUOTE = 34, BACKSLASH = 92, OPEN_OBJECT = 123, CLOSE_OBJECT = 125, OPEN_ARRAY = 91, CLOSE_ARRAY = 93, COMMA = 44, COLON = 58;
const space = code => code === 32 || code === 10 || code === 13 || code === 9;

/**
 * Calls `onRecord` with each element of the JSON list in `body` (a byte stream or text): the top-level
 * array, or the top-level object's `key` array. Returns { root, found }: the top level with that list
 * emptied, and whether the list was there. Throws SyntaxError for anything that isn't JSON.
 */
export async function readJsonRecords(body, onRecord, { key = 'quotes' } = {}) {
  let depth = 0, inString = false, escaped = false;
  // Everything outside the list's elements, parsed at the end; the list's depth while inside it.
  let skeleton = '', listDepth = 0, found = false;
  // The top level's keys: where the string being read began, the last one read, and the current key.
  let keyStart = -1, lastString = null, currentKey = null;
  // Inside the list: the current text (carried over between chunks only within an element) and where
  // the element being read begins.
  let text = '', elementStart = -1;
  const emit = end => {
    const raw = text.slice(elementStart, end).trim();
    elementStart = -1;
    if (raw) onRecord(JSON.parse(raw));
  };
  const scan = chunk => {
    const carried = elementStart >= 0 ? text.slice(elementStart) : '';
    text = carried + chunk;
    if (elementStart >= 0) elementStart = 0;
    for (let position = carried.length; position < text.length; position += 1) {
      const code = text.charCodeAt(position), inList = listDepth > 0;
      if (!inList) skeleton += text[position];
      if (inString) {
        if (escaped) escaped = false;
        else if (code === BACKSLASH) escaped = true;
        else if (code === QUOTE) {
          inString = false;
          if (keyStart >= 0) { try { lastString = JSON.parse(skeleton.slice(keyStart)); } catch { lastString = null; } keyStart = -1; }
        }
        continue;
      }
      if (space(code)) continue;
      if (inList && depth === listDepth) {
        if (code === COMMA) { if (elementStart >= 0) emit(position); continue; }
        if (code === CLOSE_ARRAY) {
          if (elementStart >= 0) emit(position);
          depth -= 1; listDepth = 0; skeleton += ']';
          continue;
        }
        if (elementStart < 0) elementStart = position;
      }
      if (code === QUOTE) { inString = true; if (!inList && depth === 1) keyStart = skeleton.length - 1; continue; }
      if (!inList && depth === 1 && code === COLON) { currentKey = lastString; continue; }
      if (!inList && depth === 1 && code === COMMA) { currentKey = null; continue; }
      if (code === OPEN_OBJECT || code === OPEN_ARRAY) {
        depth += 1;
        const list = code === OPEN_ARRAY && !inList && !found && (depth === 1 || depth === 2 && skeleton.trimStart().startsWith('{') && currentKey === key);
        if (list) { found = true; listDepth = depth; }
      } else if (code === CLOSE_OBJECT || code === CLOSE_ARRAY) {
        depth -= 1;
        if (depth < 0) throw new SyntaxError('Unexpected closing bracket in JSON.');
      }
    }
    if (elementStart < 0) text = '';
  };
  const decoder = new TextDecoder();
  if (typeof body === 'string') scan(body);
  else if (body) for await (const chunk of body) scan(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
  scan(decoder.decode());
  if (inString || depth !== 0 || listDepth > 0) throw new SyntaxError('Unexpected end of JSON input.');
  return { root: JSON.parse(skeleton), found };
}
