// Quote boards kept between refreshes in a compact form. A board is re-priced only when a new one arrives
// (every 30-60 s), but it stayed in memory as hundreds of thousands of objects the whole time, beside the
// priced copy the pages actually read. Here each field is a column of small numbers (typed arrays, outside
// the JavaScript heap) pointing into one list of the distinct values, and the line objects are rebuilt only
// while something re-prices them; they are dropped again once nothing holds them.
//
// A snapshot backed by a table has the usual fields plus `quotes` (built on demand) and `count`. Copy one
// with restamp(), not `{ ...snapshot }`: a spread copy has no `quotes`.

const ABSENT = 0;

/** Builds a RecordTable one record at a time, so a list read from a stream never exists as objects. */
export class TableBuilder {
  constructor(capacity = 1024) {
    this.keys = new Map(); this.columns = []; this.values = [ABSENT]; this.index = new Map();
    this.length = 0; this.capacity = Math.max(1, capacity);
  }

  add(record) {
    if (this.length === this.capacity) {
      this.capacity *= 2;
      this.columns = this.columns.map(column => { const grown = new Int32Array(this.capacity); grown.set(column); return grown; });
    }
    const row = this.length++, { keys, columns, values, index } = this;
    for (const key of Object.keys(record)) {
      let column = keys.get(key);
      if (column === undefined) { column = columns.length; keys.set(key, column); columns.push(new Int32Array(this.capacity)); }
      const value = record[key];
      let id = index.get(value);
      if (id === undefined) { id = values.length; values.push(value); index.set(value, id); }
      columns[column][row] = id;
    }
  }

  build() {
    const table = Object.create(RecordTable.prototype);
    table.length = this.length;
    table.keys = [...this.keys.keys()];
    table.columns = this.columns.map(column => column.length === this.length ? column : column.slice(0, this.length));
    table.values = this.values;
    table.cached = null;
    return table;
  }
}

/** A fixed list of flat records in columns. */
export class RecordTable {
  constructor(records) {
    const builder = new TableBuilder(records.length);
    for (const record of records) builder.add(record);
    Object.assign(this, builder.build());
    // The records it was made from serve until they are dropped (nothing changes a board's records).
    this.cached = new WeakRef(records);
  }

  /** One field of every row, read without building the rows: row => value (undefined where absent). */
  field(key) {
    const column = this.columns[this.keys.indexOf(key)], values = this.values;
    return column ? row => (column[row] === ABSENT ? undefined : values[column[row]]) : () => undefined;
  }

  /** The records as objects: the same array while anything still holds it, else rebuilt. */
  rows() {
    const live = this.cached?.deref();
    if (live) return live;
    const { length, keys, columns, values } = this, rows = new Array(length);
    for (let row = 0; row < length; row += 1) {
      const record = {};
      for (let column = 0; column < keys.length; column += 1) {
        const id = columns[column][row];
        if (id !== ABSENT) record[keys[column]] = values[id];
      }
      rows[row] = record;
    }
    this.cached = new WeakRef(rows);
    return rows;
  }
}

/** Several tables read as one, each optionally narrowed to the rows its mask (a Uint8Array) marks. */
export class RecordView {
  constructor(parts) {
    this.parts = parts.filter(part => part.table.length);
    this.length = this.parts.reduce((sum, { table, keep }) => sum + (keep ? keep.reduce((count, flag) => count + flag, 0) : table.length), 0);
    this.cached = null;
  }

  rows() {
    const live = this.cached?.deref();
    if (live) return live;
    const rows = [];
    for (const { table, keep } of this.parts) {
      const list = table.rows();
      if (!keep) { for (const record of list) rows.push(record); continue; }
      for (let index = 0; index < list.length; index += 1) if (keep[index]) rows.push(list[index]);
    }
    this.cached = new WeakRef(rows);
    return rows;
  }
}

/** A snapshot ({ base, at, stale, … }) whose quotes live in `table` (a RecordTable or RecordView). */
export function tableSnapshot(fields, table) {
  const snapshot = { ...fields, count: table.length };
  delete snapshot.quotes;
  Object.defineProperty(snapshot, 'table', { value: table });
  Object.defineProperty(snapshot, 'quotes', { get: () => table.rows() });
  return snapshot;
}

/** A copy of a snapshot with some fields changed, sharing its quotes. */
export function restamp(snapshot, changes) {
  return snapshot?.table ? tableSnapshot({ ...snapshot, ...changes }, snapshot.table) : { ...snapshot, ...changes };
}
