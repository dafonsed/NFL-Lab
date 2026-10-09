/**
 * VisualOdds odds & analytics contract, version 1 (docs/odds-architecture.md).
 *
 *   PROVIDERS → ODDS API → NORMALIZATION → DEVIG / FAIR ODDS → +EV / ARB / ANALYTICS → WEBSITE API → FRONTEND
 *
 * The website API (GET /api/odds/*, lib/odds/http.mjs) answers in these shapes whichever provider produced
 * them (lib/odds/providers.mjs):
 *   - 'odds-api'            the odds/analytics API computes every value (the long-term source);
 *   - 'website-transition'  until then, the website's server normalizes the raw quote feed and computes the
 *                           values itself (lib/odds/engine.mjs) — never the browser.
 *
 * Rules every producer follows:
 *   - Every betting value (implied probability, devig, fair probability and odds, edge, EV, Kelly fraction,
 *     arbitrage stakes and margins, holds, middles, consensus averages, sharp signals, DFS fair
 *     probabilities) is computed by the producer. The frontend displays them; it never derives them from odds.
 *   - A value the producer can't supply is `null` (or the record is left out), never a made-up number.
 *   - Odds are time-sensitive: every price carries `ts` (observed), `expiresAt` and `status`, and every
 *     response carries `meta.staleAfter`. Past those times the frontend shows the value as stale, not current.
 *   - Probabilities, EV, edge, hold and margins are fractions (0.075 = 7.5%), not percentages.
 *   - American odds are numbers (-110; +125 as 125); decimal odds ("multiplier") are numbers > 1.
 *
 * Runtime validation of these shapes is public/odds-contract.js (decodeSnapshot and friends): the server
 * uses it on odds API answers, the browser on website API answers. Records that fail validation are
 * dropped and counted, never repaired with invented values.
 */

export type ContractId = 'visualodds.odds/1';
export type ProviderId = 'odds-api' | 'website-transition';

/**
 * How a displayed value should be read (public/odds-contract.js valueState):
 *   authoritative  computed by the odds API;
 *   calculated     computed by the website's transition engine from the raw feed;
 *   unavailable    the producer has no value (null) — shown as "—", never a substitute;
 *   stale          the price or response is past its expiry, or served from a held-over snapshot;
 *   pending        requested and not answered yet.
 */
export type ValueState = 'authoritative' | 'calculated' | 'unavailable' | 'stale' | 'pending';

// ---- Pricing preferences ----

/** Devig methods (public/betting-math.js DEVIG_METHODS). An odds API may report others. */
export type DevigMethod = 'multiplicative' | 'additive' | 'power' | 'probit' | 'shin' | (string & {});

/** A member's reference-book rule (Pricing & filters → Sharp-book rules). */
export interface BookRule {
  book: string;
  weight: number;
  sport?: string;
  league?: string;
  market?: string;
  required?: true;
  enabled?: false;
}

/**
 * Pricing preferences a request carries (`prefs`: JSON of the keys that differ from the defaults). They
 * change how fair values are computed; display filters (league, minimum EV, odds range) stay in the page.
 */
export interface PricingPreferences {
  devigMethod: DevigMethod;
  /** Reference books (price families) a fair price needs. 1–20. */
  minSharpBooks: number;
  /** A reference market with more margin than this (percent) is ignored. null: no limit. */
  maxVigPercent: number | null;
  bookRules: BookRule[];
  /** Weight exchange references by their depth ($1,000 units). */
  liquidityWeighting: boolean;
  /** Interpolate an Over/Under fair probability between a book's neighbouring lines when none exists at the line. */
  allowProjection: boolean;
  liveMaxAgeSeconds: number;
  pregameMaxAgeSeconds: number;
  /** Exchange prices with less known depth are not current. */
  minLiquidity: number;
  /** A saved maximum EV % replaces the feed-error caps (25%, 10% with one reference book). */
  maxEvPercent: number | null;
  /** The largest arbitrage-like return shown, percent (default 15%). */
  maxArbPercent: number | null;
}

/** The pricing actually applied to a response (meta.pricing). */
export interface PricingApplied {
  devigMethod: DevigMethod | null;
  /** Version of the devig/fair-value implementation, so results can be compared over time. */
  devigVersion: string | null;
  minSharpBooks?: number;
  maxVigPercent?: number | null;
  liveMaxAgeSeconds?: number;
  pregameMaxAgeSeconds?: number;
  /** EV above this fraction is flagged as a likely feed error (not `plausible`). */
  evCap?: number | null;
  /** EV cap when only one reference book sets the fair price. */
  evCapSingleBook?: number | null;
  arbCap?: number;
}

// ---- Response metadata ----

/** Where a response came from and when it was computed. */
export interface Provenance {
  provider: ProviderId | 'unknown';
  /** The calculating engine, e.g. 'visualodds-web-engine' or the odds API's engine name. */
  engine: string;
  engineVersion: string;
  /** ISO time the analytics were computed. */
  generatedAt: string | null;
}

export interface SnapshotMeta {
  provenance: Provenance;
  pricing: PricingApplied;
  /** When the source prices were fetched. */
  snapshotAt: string | null;
  /** After this time the response itself is outdated and is shown as stale until refreshed. */
  staleAfter: string | null;
  /** The source served a held-over snapshot (a refresh failed or it is refilling). */
  stale: boolean;
  warmingUp: boolean;
  /** Some data is missing; `warnings` says what. */
  partial: boolean;
  warnings: string[];
  scope: { sport?: string | null };
  /** Market distribution controls (blocked books/events) were applied. */
  controlsApplied?: boolean;
  counts: {
    records?: number;
    quotes?: number;
    /** Feed records the normalizer left out, by reason (invalid, mislabeled, duplicate, stale, started, inconsistent). */
    skipped?: Record<string, number>;
    dropped?: number;
  };
}

// ---- Domain ----

export type Sport = string;

export interface League {
  id: string;
  name: string;
  sport: Sport;
}

export interface Book {
  /** Canonical book name (public/platform-catalog.js). */
  name: string;
  /** Books that copy one platform's prices share a family and count once in consensus. */
  priceFamily: string;
  exchange: boolean;
}

/** GET /api/odds/events */
export interface Event {
  id: string;
  sport: Sport;
  league: string;
  /** The feed's name for the game. */
  name: string;
  /** One name for the game across books, "Away @ Home". */
  displayName: string;
  startTime: string | null;
  live: boolean;
  quoteCount: number;
}

export type MarketType = 'moneyline' | 'spread' | 'total' | 'three-way' | 'prop' | 'alternate' | 'future' | 'dfs';

/**
 * A market's identity. Quotes carry these fields inline; `marketKey` (a stable hash of event, market,
 * period, settlement and line) groups every book's price in one exact market.
 */
export interface Market {
  marketKey: string;
  eventId: string;
  marketId: string;
  type: MarketType | (string & {});
  market: string;
  displayMarket: string;
  period: string;
  player: string;
  playerId: string;
  line: number | '';
  outcomes: number | '';
}

export interface Selection {
  side: string;
  /** The display name of the side ("Over", "Saints", "5+"). */
  selection: string;
  /** The feed named this side itself; false when it was inferred. */
  sideVerified: boolean;
}

/**
 * 'open' — offered now; 'suspended'; 'closed' (settled, cancelled, or a pregame price whose game started);
 * 'unavailable' (withdrawn); 'stale' (older than its price age, or no usable observation time).
 */
export type QuoteStatus = 'open' | 'suspended' | 'closed' | 'unavailable' | 'stale';

/** One book's price for one selection (the website's "quote"). */
export interface Odds extends Market, Selection {
  id: string;
  /** Follows one book's line as it moves (line history). Defaults to `id`. */
  seriesId: string;
  sport: Sport;
  league: string;
  event: string;
  displayEvent?: string;
  team?: string;
  book: string;
  priceFamily?: string;
  exchange: boolean;
  /** Exchange depth at this price. */
  liquidity?: number;
  maxStake?: number;
  /** American odds; null when the record has no usable price. */
  odds: number | null;
  live: boolean;
  alt?: boolean;
  suspended?: boolean;
  startTime: string;
  /** ISO time the price was observed. */
  ts: string;
  source: string;
  betUrl?: string;
  eventUrl?: string;
  prefillUrl?: string;
  links?: Record<string, { prefillUrl?: string; eventUrl?: string }>;

  // ---- producer-computed ----
  /** 1 / decimal odds, vig included. */
  impliedProbability: number | null;
  /** This book's own no-vig probability for this side; null when the book doesn't price every side. */
  bookFairProbability: number | null;
  /** This book's market margin (0.045 = 4.5%); null when the book doesn't price every side. */
  bookHold: number | null;
  /** The book prices both sides of this two-way market at a real margin (100–125% implied). */
  consistent: boolean;
  /** Left out of best and average prices: an unverified one-sided price, or far off the other books. */
  outlier: boolean;
  /** ISO time after which this price is no longer current. */
  expiresAt: string | null;
  status: QuoteStatus;
}
export type Quote = Odds;

/** One reference book in a consensus fair price (only sent with positive-EV rows). */
export interface ReferenceBook {
  /** "A / B" when mirrors of one platform were averaged into one reference. */
  book: string;
  probability: number | null;
  weight: number | null;
  vigPercent: number | null;
  exchange?: true;
  mirrors?: string[];
}

/** A selection's no-vig fair probability. */
export interface FairProbability {
  fairProbability: number;
  devigMethod: DevigMethod | null;
  devigVersion: string | null;
  /** Reference books (price families) that set it. */
  bookCount: number;
}
/** The same fair value as American odds (+100 at exactly 50%); null when it can't be expressed. */
export interface FairOdds {
  fairOdds: number | null;
}

/** Expected value of one offered price (a pricing row: the +EV board). */
export interface EV extends FairProbability, FairOdds {
  /** Row reference: the quote this prices. Encoded as a row number of the response's quote table. */
  quoteId: string;
  references: ReferenceBook[];
  /** fair probability − implied probability. */
  edge: number | null;
  /** Return per unit staked: (1 − push) × (fair × effective decimal − 1). */
  ev: number;
  /** Full-Kelly fraction of bankroll (0 without an edge). The page multiplies by the member's bankroll and Kelly multiplier. */
  kellyFraction: number | null;
  /** Within the EV caps and, for a game line, its book prices every side. Only plausible rows are shown as +EV. */
  plausible: boolean;
  /** Interpolated between neighbouring lines (allowProjection). */
  estimated: boolean;
  /** Whole-number threshold priced without a push contract: EV is conditional on no push. */
  conditionalOnNoPush: boolean;
}
export type QuotePricing = EV;

/** One side of a market across books: the comparison grid's numbers. */
export interface MarketSide {
  side: string;
  /** The market's own no-vig consensus (every complete book, offering books included). */
  fairProbability: number | null;
  fairOdds: number | null;
  fairBookCount: number;
  /** Mean implied probability of current, non-outlier prices (one per book). */
  averageImpliedProbability: number | null;
  averageOdds: number | null;
  priceCount: number;
}

/** A market across books at one moment. */
export interface MarketSnapshot {
  /** Matches Odds.marketKey. */
  key: string;
  live: boolean;
  twoWay: boolean;
  sides: MarketSide[];
}

export interface ArbitrageLeg {
  quoteId: string;
  book: string;
  side: string;
  odds: number;
  /** Effective decimal odds after commission and boosts. */
  multiplier: number;
  impliedProbability: number;
  /** Share of the total stake on this leg (equal payout on every outcome). */
  stakeFraction: number;
  maxStake: number | null;
  liquidity: number | null;
}

export interface ArbitrageOpportunity {
  id: string;
  marketKey: string;
  live: boolean;
  legs: ArbitrageLeg[];
  /** Sum of 1 / multiplier over the legs (< 1). */
  impliedSum: number;
  /** Guaranteed return on the total stake: 1 / impliedSum − 1. */
  margin: number;
  payoutPerUnit: number;
  /** The lowest result per unit of total stake (0 when a shared whole-number line can push both legs). */
  lowestPerUnit: number;
  pushPossible: boolean;
  /** Largest total stake the known limits and exchange depth allow; null when no leg has a limit. */
  capacity: number | null;
  /** Smallest total meeting every leg's minimum stake. */
  minimumTotal: number | null;
  limitsKnown: boolean;
  /** The oldest leg's observation time. */
  observedAt: string | null;
  /** The earliest leg expiry: after it the opportunity is stale. */
  expiresAt: string | null;
}

export interface MiddleLadderPoint {
  score: number;
  first: 'win' | 'loss' | 'push';
  second: 'win' | 'loss' | 'push';
  /** Net result per unit of total stake. */
  netPerUnit: number;
}

export interface MiddleOpportunity {
  id: string;
  kind: 'total' | 'spread';
  live: boolean;
  marketKey: string;
  firstQuoteId: string;
  secondQuoteId: string;
  window: { low: number; high: number; label: string };
  width: number;
  /** 1 − 1 / (sum of implied probabilities): what the pair costs when it doesn't middle. */
  cost: number;
  stakeFractions: number[];
  capacity: number | null;
  limitsKnown: boolean;
  /** Net per unit of total stake: both win (inside), the worse miss (outside), and on a whole-number line. */
  perUnit: { inside: number; outside: number; atLower: number | null; atUpper: number | null };
  ladder: MiddleLadderPoint[];
  observedAt: string | null;
  expiresAt: string | null;
}

export interface HoldMarket {
  id: string;
  marketKey: string;
  live: boolean;
  /** The best price on each side (among the requested `books`). */
  quoteIds: string[];
  /** Combined margin of the two best prices (negative = arbitrage before fees). */
  hold: number;
  impliedProbabilities: (number | null)[];
  fairProbabilities: (number | null)[];
  fairOdds: (number | null)[];
  bookCount: number;
  observedAt: string | null;
}

/** Exchange liquidity beside the best sportsbook price on the other side. */
export interface SharpMoney {
  id: string;
  exchangeQuoteId: string;
  oppositeExchangeQuoteId: string | null;
  sportsbookQuoteId: string;
  liquidity: number;
  /** How much more the sportsbook price pays than the opposite exchange price (fraction); null without one. */
  improvement: number | null;
  observedAt: string | null;
}

/** A promotion price and its best hedges at other price families (the promo converter). */
export interface HedgePair {
  /** Row reference into the quote table. */
  promoQuoteId: string;
  hedges: { quoteId: string; impliedSum: number }[];
}

// ---- History, DFS, prediction contracts ----

export interface LineMovementPoint {
  at: string;
  odds: number;
  impliedProbability: number;
}

/** One book's recorded prices for one side (GET /api/odds/history). */
export interface LineMovement {
  quoteId: string;
  seriesId: string;
  book: string;
  side: string;
  selection: string;
  line: number | '';
  points: LineMovementPoint[];
}

export interface LineMovementResponse {
  contract: ContractId;
  meta: SnapshotMeta;
  quoteId: string;
  hours: number;
  series: LineMovement[];
}

/** A pick'em (DFS) line priced against two-sided sportsbook markets at the same player, stat and line. */
export interface DfsPick {
  id: string;
  app: string;
  sport: Sport;
  league?: string;
  event: string;
  eventId: string;
  player: string;
  team?: string;
  market: string;
  line: number;
  side: 'Over' | 'Under';
  oddsType?: 'standard' | 'goblin' | 'demon' | (string & {});
  payoutMultiplier?: number;
  period?: 'part';
  /** Fair probability of this side; null without enough books. */
  probability: number | null;
  fairOdds: number | null;
  probabilityMethod: DevigMethod;
  probabilityBooks: string[];
  probabilitySources?: { book: string; over?: number; under?: number; exchange?: boolean; liquidity?: number }[];
  /** The listed books' average price on each side (mean implied probability as American odds). */
  bookAverage?: { over: number | null; under: number | null };
  bookLines?: { book: string; over?: number; under?: number; exchange?: true }[];
  ts: string;
  startTime: string;
  live: boolean;
  source: string;
  /** When the line stops being current (the member's price ages), and whether it is offered now. */
  expiresAt?: string | null;
  status?: QuoteStatus;
}

/** GET /api/odds/dfs. Payout tables are power play only: { app: { picks: [return by hits] } }. */
export interface DfsResponse {
  contract: ContractId;
  meta: SnapshotMeta;
  picks: DfsPick[];
  payouts: Record<string, Record<string, number[]>>;
}

/** GET /api/odds/dfs/price: the same pricing for lines a member entered, in request order. */
export interface DfsLinePriceResponse {
  contract: ContractId;
  meta: SnapshotMeta;
  lines: Pick<DfsPick, 'probability' | 'probabilityMethod' | 'probabilityBooks' | 'bookLines' | 'period'>[];
}

/** A prediction-market contract (cents). */
export interface PredictionContract {
  id: string;
  platform: string;
  event: string;
  sport: Sport;
  bid: number;
  ask: number;
  last?: number;
  volume: number;
  ts: string;
  source: string;
}

export interface ContractsResponse {
  contract: ContractId;
  meta: SnapshotMeta;
  contracts: PredictionContract[];
}

/** Closing line value of a tracked bet (computed from the member's own records: public/betting-math.js). */
export interface CLV {
  /** booked decimal / closing decimal − 1 (vig included). */
  price: number | null;
  /** booked decimal × closing fair probability − 1. */
  noVig: number | null;
  closingFairProbability: number | null;
  method: DevigMethod | null;
}
export type ClosingLineValue = CLV;

// ---- Snapshot ----

export type SnapshotSection = 'pricing' | 'markets' | 'arbitrage' | 'middles' | 'holds' | 'sharp' | 'hedges';

/**
 * Transport for long lists (public/odds-contract.js encodeTable): rows of values in column order. A
 * dictionary column's values index into `dictionaries[column]`; a `refs` column holds row numbers of
 * another table in the response (pricing.quoteId and hedges.promoQuoteId → 'quotes'). null = no value.
 * Producers may send plain arrays instead.
 */
export interface Table<T> {
  table: 1;
  columns: (keyof T & string)[];
  dictionaries: Partial<Record<keyof T & string, unknown[]>>;
  refs?: Partial<Record<keyof T & string, 'quotes'>>;
  rows: unknown[][];
}
export type Wire<T> = T[] | Table<T>;

/** The decoded snapshot (what odds-client.js hands a page). */
export interface OddsSnapshot {
  contract: ContractId;
  meta: SnapshotMeta;
  quotes: Odds[];
  events?: Event[];
  pricing?: EV[];
  markets?: MarketSnapshot[];
  arbitrage?: ArbitrageOpportunity[];
  middles?: MiddleOpportunity[];
  holds?: HoldMarket[];
  sharp?: SharpMoney[];
  hedges?: HedgePair[];
}

/**
 * GET /api/odds/snapshot?include=&sport=&books=&prefs= and the section views (/api/odds/ev, /arbitrage,
 * /middles, /holds, /sharp, /hedges, /markets): the same body, a section view carrying one section and
 * only the quotes it names.
 */
export interface OddsSnapshotBody {
  contract: ContractId;
  meta: SnapshotMeta;
  quotes: Wire<Odds>;
  events?: Event[];
  pricing?: Wire<EV>;
  markets?: Wire<MarketSnapshot>;
  arbitrage?: Wire<ArbitrageOpportunity>;
  middles?: Wire<MiddleOpportunity>;
  holds?: Wire<HoldMarket>;
  sharp?: Wire<SharpMoney>;
  hedges?: Wire<HedgePair>;
}

// ---- Errors ----

export type ApiErrorCode =
  | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'TIMEOUT' | 'MALFORMED' | 'PARTIAL' | 'RATE_LIMITED'
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'UNSUPPORTED_MARKET' | 'UNSUPPORTED_BOOK'
  | 'CONTROLS_UNAVAILABLE';

/** Every non-2xx answer. Retry-After accompanies retryable errors when the producer knows the wait. */
export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; retryable: boolean; retryAfterSeconds?: number };
}
