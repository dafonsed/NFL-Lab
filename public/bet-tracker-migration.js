import { BET_STORAGE_KEY, SPORTS, readBets, validateBet } from './bet-utils.js?v=3';

export const LEGACY_EV_STORAGE_KEY = 'sportslab-ev-workbench-v1';

// Keep the original workspace intact. Tickets and migration receipts are written
// together so a failed write is retryable, and deleted tickets stay deleted.
export function migrateLegacyTracker(storage) {
  const bets = readBets(storage);
  const raw = storage.getItem(LEGACY_EV_STORAGE_KEY);
  if (!raw) return { migrated: 0, skipped: 0 };
  const legacy = JSON.parse(raw);
  if (legacy?.version !== 1 || !Array.isArray(legacy.bets)) throw Error('Unrecognized older tracker data.');
  const saved = JSON.parse(storage.getItem(BET_STORAGE_KEY) || '{"version":1,"bets":[]}');
  const receipts = saved.migrations?.evTrackerV1 ?? [];
  if (!Array.isArray(receipts) || receipts.some(id => typeof id !== 'string')) throw Error('Unreadable tracker migration receipts.');
  const seen = new Set(receipts);
  let migrated = 0, skipped = 0;
  for (const record of legacy.bets) {
    if (record?.source === 'example') continue;
    const key = typeof record?.id === 'string' && record.id ? 'id:' + record.id : 'record:' + JSON.stringify(record);
    if (seen.has(key)) continue;
    try {
      const sport = SPORTS.find(value => value.toLowerCase() === String(record.sport).toLowerCase());
      const bet = validateBet({
        ...record, sport: sport || 'Other', type: 'single', oddsFormat: 'american',
        status: ({ win: 'won', loss: 'lost' })[record.result] || record.result,
        closingOdds: record.closeOdds, tool: 'EV Tools',
        notes: [record.notes, !sport && record.sport ? 'Original sport: ' + record.sport : ''].filter(Boolean).join('\n'),
      });
      bets.push({ ...bet, id: crypto.randomUUID(), updatedAt: new Date().toISOString() });
      seen.add(key);
      migrated++;
    } catch { skipped++; }
  }
  if (migrated) storage.setItem(BET_STORAGE_KEY, JSON.stringify({
    ...saved, version: 1, bets,
    migrations: { ...saved.migrations, evTrackerV1: [...seen] },
  }));
  return { migrated, skipped };
}
