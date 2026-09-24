// Illustration only. These tickets never enter My Picks or browser storage.
const tickets = [
  [1, 50, 110, 'won'], [2, 40, -120, 'won'], [3, 35, 105, 'lost'],
  [4, 60, 105, 'won'], [5, 25, -110, 'won'], [6, 45, 120, 'won'],
  [7, 30, -115, 'lost'], [8, 50, -130, 'won'], [9, 40, 150, 'won'],
  [10, 25, 115, 'lost'], [11, 55, -105, 'won'], [12, 45, 100, 'won'],
  [13, 50, -115, 'won'], [14, 60, 110, 'lost'], [15, 35, 140, 'won'],
  [16, 50, -110, 'won'], [17, 30, 120, 'lost'], [18, 45, 110, 'won'],
  [19, 40, 115, 'won'], [20, 50, -105, 'lost'], [21, 30, 100, 'won'],
  [22, 45, -120, 'won'], [23, 50, 105, 'won'], [24, 40, 130, 'won'],
];

export function demoRecord(now = new Date()) {
  const month = new Date(now.getFullYear(), now.getMonth() - (now.getDate() < 24 ? 1 : 0), 1);
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const books = ['FanDuel', 'DraftKings', 'BetMGM', 'bet365'];
  const sports = ['NFL', 'NBA', 'MLB', 'WNBA'];
  return {
    month,
    bets: tickets.map(([day, stake, odds, status], index) => ({
      id: `demo-${index + 1}`,
      updatedAt: `${prefix}-${String(day).padStart(2, '0')}T12:00:00.000Z`,
      date: `${prefix}-${String(day).padStart(2, '0')}`,
      selection: `Illustrative ticket ${index + 1}`,
      book: books[index % books.length], sport: sports[index % sports.length],
      type: 'single', oddsFormat: 'american', odds, stake, status,
      cashout: null, returnOverride: null, notes: '', legs: [], settlement: 'manual',
    })),
  };
}
