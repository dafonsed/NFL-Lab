import { artworkForSlug, prepareLongformContent, readingTimeLabel, renderRelatedCard } from './article-presentation.mjs';
import { brandInteractiveForSlug } from './article-interactives.mjs';

const BASE_PATH = '/online-sportsbooks';
const SPORTSBOOK_PATH = '/sportsbooks';
const REVIEW_DATE = '2026-09-24';
const REVIEW_LABEL = 'September 24, 2026';
const CONTENT_UPDATED_DATE = '2026-09-25';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const siteUrl = request => (process.env.PUBLIC_SITE_URL || 'https://visualodds.com').replace(/\/+$/, '');

// Offer language is intentionally conservative: promotions change by state,
// account eligibility, and campaign dates. Each entry links to operator terms.
const guides = [
  {
    slug:'betmgm', name:'BetMGM', group:'Sportsbooks', product:'online sportsbook',
    description:'How BetMGM Sportsbook works, how to claim a BetMGM sign-up bonus, and what Bonus Bets and first-bet offers mean. Offer details reviewed September 2026.',
    overview:'BetMGM Sportsbook is a state-regulated mobile and retail wagering brand connected to MGM Resorts. A customer chooses a sport and market, reviews the posted odds, enters a stake, and confirms the wager while physically located in an eligible jurisdiction. The app may show live betting, same-game parlays, futures, and player props, but menus and limits vary by state.',
    operation:'BetMGM posts odds and accepts wagers through its app or participating retail locations. After a bet is accepted, the ticket shows the selection, odds, stake, and potential return. Cash-out may appear for some tickets, but the quoted amount can move or disappear. Its rewards experience may connect with MGM Rewards, subject to separate program rules and eligible activity.',
    bonus:'BetMGM does not have one dependable nationwide sign-up amount. Its official September 2026 promotions page shows state-specific new-customer campaigns, including examples such as a qualifying $10 wager earning $150 in Bonus Bets if it wins, and first-bet protection with a state-specific cap. The exact offer, qualifying odds, opt-in, and credit type depend on location and campaign; the promotion displayed in the eligible state is the controlling offer.',
    signup:'Create an account in the app or at the official state site, enter accurate identity and payment details, and complete age and location verification. Open Promotions before depositing or wagering, activate any required offer, and read the full market, odds, and deadline conditions. Submit the qualifying wager only after the offer appears in the account.',
    focus:'A Bonus Bet is generally a promotional stake, not cash: the stake itself may not be returned, even when the selection wins. Check whether the offer is insurance, a bet-and-get reward, or a winning-bet reward before you calculate value.',
    sources:[['BetMGM sportsbook promotions','https://sports.betmgm.com/en/blog/latest-sports-betting-promotions-offers-betmgm-2/'],['BetMGM official sportsbook','https://sports.betmgm.com/']]
  },
  {
    slug:'bet365', name:'bet365', group:'Sportsbooks', product:'online sportsbook',
    description:'Learn how the bet365 sportsbook works and how its sign-up bonus is claimed. The advertised $10-to-$365 campaign expired September 22, 2026; check the live state offer.',
    overview:'bet365 is an online sportsbook with pregame and in-play markets across major sports. A bettor opens an event, selects a market such as moneyline, spread, total, or player prop, enters a stake, and confirms the ticket. Live prices can change quickly as play unfolds, and the app may suspend a market before it accepts a bet.',
    operation:'The sportsbook displays odds and potential returns before submission. A bet is not active until the platform accepts it; the accepted ticket is the record to use for settlement. bet365 also offers cash-out on some tickets, subject to availability and a changing quote. Available sports, markets, and account features vary by state.',
    bonus:'The bet365 $10-to-$365 Bonus Bets welcome campaign was closed on September 22, 2026, according to the offer terms reviewed on September 24. Do not treat that expired amount as a current bet365 sign-up bonus. bet365 changes campaigns by state, and the live promotion page or in-app offer should be checked before account creation; a former code or ad may no longer qualify.',
    signup:'Check the official state selector and confirm you are physically present in an eligible location. Register with your legal details, verify identity, and review the current welcome-promotion terms before making a deposit. If a campaign is available, follow its code, opt-in, qualifying odds, first-deposit or first-bet instructions and completion deadline exactly.',
    focus:'The promotional headline is not the same as cash value. Review the number of Bonus Bets, expiration date, minimum odds, excluded markets, and whether the promotional stake is returned. Use the currently displayed state terms rather than an old search result.',
    sources:[['bet365 welcome offer and terms','https://www.bet365.com/promos/en-us/home/open-account-global-offer'],['bet365 state availability','https://www.bet365.com/hub/en-us/states']]
  },
  {
    slug:'betrivers', name:'BetRivers', group:'Sportsbooks', product:'online sportsbook',
    description:'BetRivers sportsbook guide covering how online wagers work, how to find the BetRivers welcome bonus, and the state-specific terms to check.',
    overview:'BetRivers is the sportsbook brand in the Rush Street Interactive portfolio. Customers use its app or website to browse odds, build a single wager or parlay, and track accepted tickets. The product can include live markets, futures, player props, and casino or rewards features in some jurisdictions, though each state has its own catalog and rules.',
    operation:'For a sports wager, choose a listed event and outcome, enter the amount, and review the final odds and potential payout before submitting. BetRivers confirms an accepted bet with a ticket; settlement follows the market rules in the applicable terms. A displayed line is not guaranteed until acceptance, and early cash-out availability is not universal.',
    bonus:'There is no single BetRivers welcome bonus that applies nationwide. New-player promotions and their amounts, codes, minimum odds, and reward format are state-specific. The official New Jersey site is an example of a local landing page, not proof that its advertised terms apply elsewhere. Check the Promotions tab after selecting the correct state.',
    signup:'Use the official BetRivers app or state landing page and confirm local eligibility first. Register, verify your identity and location, then inspect the state-specific offer before depositing. Follow any required promo code, opt-in, qualifying wager, minimum odds, and deadline; save the accepted ticket and promotion terms until the reward settles.',
    focus:'Distinguish Bonus Bets or credits from withdrawable balance, and check whether a qualifying wager must win or can lose. Also review the state’s tax reporting, withdrawal, responsible-play, and self-exclusion information before participating.',
    sources:[['BetRivers New Jersey sportsbook','https://nj.betrivers.com/'],['Rush Street Interactive promotions and product information','https://www.betrivers.com/']]
  },
  {
    slug:'caesars', name:'Caesars Sportsbook', group:'Sportsbooks', product:'online sportsbook',
    description:'How Caesars Sportsbook works, how to check a Caesars Sportsbook sign-up offer, and how Caesars Rewards and Bonus Bets fit together.',
    overview:'Caesars Sportsbook offers mobile wagering in approved jurisdictions and retail betting at participating properties. The app lists sports, events, and markets; customers select an outcome, set the stake, and submit a ticket. The brand is part of Caesars Entertainment, and the broader Caesars Rewards program may connect eligible play with hospitality or loyalty benefits under separate rules.',
    operation:'Sports wagers can include moneylines, spreads, totals, parlays, futures, and live markets where offered. A confirmed ticket records the accepted odds and stake. Caesars may provide promotional tokens, Bonus Bets, or other rewards, but those offers have separate terms and do not make an unaccepted wager valid. Retail and mobile products can differ by state.',
    bonus:'Caesars does not publish one sign-up bonus that can safely be assumed nationwide. Welcome offers and registration promotions depend on the state and the account’s eligibility. The official Arizona promotions page is a local example; use the in-app Promotions area and current state terms to see the offer actually available to a new customer.',
    signup:'Choose your state on the official Caesars site, confirm age and physical-location eligibility, and create an account with accurate personal information. Complete verification, read any registration offer, then follow its opt-in or code and qualifying-wager steps. Review the Caesars Rewards terms separately if you plan to link loyalty activity.',
    focus:'Check whether the award is a Bonus Bet, free bet, odds boost, or Caesars Rewards credit. Such rewards can have different expiry dates, minimum odds, excluded markets, and cash-out restrictions. Compare the ticket’s real potential return after accounting for any non-returned bonus stake.',
    sources:[['Caesars Sportsbook Arizona promotions','https://sportsbook.caesars.com/us/az/bet/promos/registration-welcome'],['Caesars Sportsbook','https://www.caesars.com/sportsbook-and-casino']]
  },
  {
    slug:'draftkings', name:'DraftKings Sportsbook', group:'Sportsbooks', product:'online sportsbook',
    description:'DraftKings Sportsbook review: how to place bets, how the DraftKings welcome bonus works, and why current offers vary by state and date.',
    overview:'DraftKings Sportsbook is the sportsbook product within DraftKings’ broader online gaming and fantasy portfolio. Users select an event and market, enter a stake, and submit a wager through the app or website in an eligible location. The board can include player props, same-game parlays, live odds, and futures, with availability depending on sport and state.',
    operation:'Before placing a bet, the slip shows the selection, odds, stake, and potential payout. Once accepted, the ticket can be followed in the account; a cash-out quote, when offered, can change. DraftKings accounts may connect to other DraftKings products, but sportsbook promotions and DFS promotions have distinct eligibility and rules.',
    bonus:'The DraftKings campaign reviewed for this guide, a qualifying $5 wager for $200 in Bonus Bets, ended September 20, 2026. That offer should not be presented as active on September 24. DraftKings rotates welcome offers and may define a new customer across more than one DraftKings product, so check the current state-specific Sportsbook promotion and account eligibility before signing up.',
    signup:'Confirm DraftKings Sportsbook is available where you are physically located, then register through the official state app or site. Verify identity and payment details. Check the live offer and whether prior use of DraftKings Fantasy or another product affects eligibility; complete only the qualifying steps and odds printed in the active terms.',
    focus:'Read the reward instrument, expiry period, eligible sports, minimum odds, and any new-customer definition. A sportsbook offer is not interchangeable with a DraftKings Fantasy contest ticket or other product credit.',
    sources:[['DraftKings Sportsbook','https://sportsbook.draftkings.com/sportsbook'],['DraftKings Daily Fantasy Sports','https://external.draftkings.com/dfs']]
  },
  {
    slug:'fanatics', name:'Fanatics Sportsbook', group:'Sportsbooks', product:'online sportsbook',
    description:'Fanatics Sportsbook guide to how wagers work, FanCash rewards, and how to find the current Fanatics Sportsbook welcome bonus by state.',
    overview:'Fanatics Sportsbook is the regulated wagering product in the Fanatics sports and merchandise ecosystem. In eligible states, customers browse sportsbook odds, choose a market, enter a stake, and confirm a bet. The app can offer pregame and live markets, parlays, and player props, with the selection of events and features set by local rules.',
    operation:'The sportsbook ticket records an accepted selection and price. Some promotions or eligible activity may award FanCash, a rewards currency whose redemption and value are governed by Fanatics’ separate terms. A FanCash balance is not automatically cash available to withdraw, and product, merchandise, and sportsbook accounts can have different restrictions.',
    bonus:'No single Fanatics Sportsbook sign-up bonus amount was verified as a current nationwide offer on September 24, 2026. Fanatics campaigns and FanCash rewards can vary by state, event, and date. Check the official app or state page for the precise new-customer promotion and the terms describing qualifying wagers, reward type, and expiration.',
    signup:'Use the official Fanatics Sportsbook app or state page, confirm location eligibility, and create an account with matching legal details. Complete identity verification, then review and activate an available first-bet offer if required. Keep the offer page or terms so you can confirm how the qualifying wager and reward should appear.',
    focus:'Before valuing FanCash, confirm where it can be redeemed, any minimum redemption, and whether it expires. For sportsbook credits, check whether the stake is returned and whether odds or market exclusions apply.',
    sources:[['Fanatics Sportsbook','https://sportsbook.fanatics.com/']]
  },
  {
    slug:'fanduel', name:'FanDuel Sportsbook', group:'Sportsbooks', product:'online sportsbook',
    description:'FanDuel Sportsbook sign-up bonus and app guide: learn how odds, accepted wagers, Bonus Bets, and state-specific new-user promotions work.',
    overview:'FanDuel Sportsbook is a mobile and retail sportsbook operated by FanDuel in approved jurisdictions. Customers choose an event and market, add the selection to a bet slip, set a stake, and submit. Depending on location and sport, the board may include live wagering, player props, same-game parlays, futures, and promotional odds.',
    operation:'An accepted ticket shows odds, stake, and potential return; an unsubmitted selection is not a wager. Cash-out is offered only on some tickets and at a changing price. FanDuel also runs fantasy contests as a separate product, so a FanDuel Fantasy promotion should not be assumed to apply to the sportsbook.',
    bonus:'FanDuel’s main site displayed a $250 Bonus Bets schedule at review: $50 after each qualifying daily wager over seven days. This is a campaign display, not a universal welcome offer; separate new-customer offers may close or vary by state. Confirm that the current state page identifies you as eligible and read its required wager, minimum odds, credit schedule, and expiry.',
    signup:'Select the official state sportsbook page, confirm physical presence and minimum age, and register with accurate identity and payment details. Complete verification, read the current promotion before depositing, and follow the stated daily or first-bet requirement. Check that each reward is credited before wagering it.',
    focus:'Bonus Bets generally function differently from cash balance and may not return the promotional stake. Verify the qualifying odds, daily schedule, eligible markets, expiry, and whether the offer is restricted to people who have never held another FanDuel account.',
    sources:[['FanDuel Sportsbook','https://www.fanduel.com/'],['FanDuel Fantasy','https://www.fanduel.com/fantasy']]
  },
  {
    slug:'hardrockbet', name:'Hard Rock Bet', group:'Sportsbooks', product:'online sportsbook',
    description:'Hard Rock Bet sportsbook guide: how its mobile betting app works and the September 2026 Bet $5, Get $100 Bonus Bets promotion terms.',
    overview:'Hard Rock Bet is the sportsbook brand associated with Hard Rock Digital. In states where it is authorized, users select odds and markets in the app or at a participating retail sportsbook, then submit a wager for acceptance. The menu may include major leagues, live markets, parlays, futures, and same-game combinations; local rules control what is offered.',
    operation:'Each completed bet appears as a ticket with its terms and settlement status. Promotions can award Bonus Bets in increments, while other Hard Rock programs may use a different reward currency. Availability and account features vary across eligible states, and geolocation is checked when a customer tries to wager.',
    bonus:'The official Hard Rock Bet promotion page reviewed September 21, 2026 advertised a Bet $5, Get $100 Bonus Bets offer paid as five $20 credits over five weeks. The page describes eligible new and existing customers in participating states, qualifying odds, no promo code, and a seven-day life for each issued credit. Check the linked live terms because eligibility and availability can change.',
    signup:'Confirm your state participates, then create and verify an account through Hard Rock Bet. Review the offer’s eligible-customer definition and odds threshold before wagering $5. Follow the schedule for subsequent credits and use each issued Bonus Bet before its individual expiry.',
    focus:'The $100 headline is issued over time and as Bonus Bets, not a $100 cash deposit. Check each credit’s expiry, non-returned stake treatment, qualifying event exclusions, and the live state-specific terms.',
    sources:[['Hard Rock Bet promotion terms','https://www.hardrock.bet/promo-code/'],['Hard Rock Bet','https://www.hardrock.bet/']]
  },
  {
    slug:'thescore', name:'theScore Bet', group:'Sportsbooks', product:'online sportsbook',
    description:'theScore Bet (formerly ESPN BET) guide: how the sportsbook operates, what changed in the brand transition, and where to find current sign-up bonuses.',
    overview:'theScore Bet is the sportsbook brand that followed ESPN BET in the U.S. market transition announced for December 1, 2025. It combines sports coverage and betting features where the operator is available. Customers choose an event, select odds, enter a stake, and submit a ticket through the state-eligible app or website.',
    operation:'The bet slip records an accepted market and price; live odds and market availability can shift. Customers moving from an ESPN BET account should follow the operator’s official migration instructions rather than create duplicate accounts or assume old rewards carry over. TheScore media content and sportsbook wagering remain different activities with separate terms.',
    bonus:'There is no universal theScore Bet welcome bonus amount verified for every state on September 24, 2026. Offers may depend on state and campaign. Because this is a successor brand to ESPN BET, verify whether existing ESPN BET customers qualify as new, and whether any prior sportsbook account or promotion history affects eligibility.',
    signup:'Open theScore Bet through its official state page, confirm that the app is available at your physical location, and complete account verification. Review the active promotion and any ESPN BET transition notice before depositing. Follow the printed opt-in, qualifying wager, odds, and expiration requirements.',
    focus:'Do not assume an ESPN BET promotion or old account balance automatically transfers to theScore Bet. Check support guidance for account migration, reward treatment, and the current state-specific bonus terms.',
    sources:[['theScore Bet official sportsbook','https://www.thescore.bet/'],['ESPN BET account and brand transition support','https://support.espn.com/hc/en-us/articles/19990992084116-What-is-ESPN-BET']]
  },
  {
    slug:'ballybet', name:'Bally Bet', group:'Sportsbooks', product:'online sportsbook',
    description:'Bally Bet sportsbook review and sign-up bonus guide. Learn how its app works and why the Bet $10, Get $50 offer depends on state.',
    overview:'Bally Bet is a sportsbook app and retail wagering brand associated with Bally’s. In a participating jurisdiction, users choose a listed game and market, set a stake, and submit the selection for acceptance. The sportsbook may feature standard odds, parlays, live markets, and promotional boosts, but the available board is defined by each market’s rules.',
    operation:'Accepted wagers are tracked as tickets in the account. The operator may list cash-out or promotional options, but those are not guaranteed for every wager. Bally Bet’s state pages provide the local product entry point and should be used to check current availability, eligibility, and responsible-gaming rules.',
    bonus:'Official Bally Bet state pages reviewed for this guide advertise new-player examples such as Bet $10, Get $50 in Bonus Bets in Colorado and Ohio. The amount and terms are not necessarily the same in every market. Use the page for your own state and confirm if the offer remains active at the time of sign-up.',
    signup:'Choose your state from Bally Bet’s official site and register only where the app is authorized. Verify identity, read the offer before making a qualifying wager, and check whether a code or opt-in is required. Keep track of the bonus-credit deadline and any minimum odds.',
    focus:'A $50 Bonus Bets headline does not mean $50 cash. Review how credits are issued and whether the promotional stake is returned, along with the required odds, eligible sports, expiry, and state restrictions.',
    sources:[['Bally Bet Colorado sportsbook and promotion','https://www.ballybet.com/co'],['Bally Bet official site','https://www.ballybet.com/']]
  },
  {
    slug:'desertdiamond', name:'Desert Diamond Sports', group:'Sportsbooks', product:'online sportsbook',
    description:'Desert Diamond Sports sportsbook guide for Arizona: how the app works, who can use it, and how to check Welcome Deposit Match and Bet & Get offers.',
    overview:'Desert Diamond Sports is an Arizona sportsbook tied to the Tohono O’odham Gaming Enterprise. Its service is aimed at eligible customers in Arizona and uses location checks; the operator’s help materials specify that users must be in Arizona and not on tribal lands. Always check the current location and age terms because access is narrower than a nationwide sportsbook.',
    operation:'Customers use the app to view available sporting events, select an outcome and wager amount, and submit a ticket. Markets and event rules are governed by the operator’s terms and local restrictions. Its promotions library separates offer descriptions from the sportsbook itself, so the applicable offer should be confirmed in the user’s account.',
    bonus:'Desert Diamond’s official help center lists Welcome Deposit Match and Bet & Get promotion categories, but a single active universal dollar amount was not verified on September 24, 2026. Check the current promotion tile and terms in the app or official site; the bonus amount, qualifying deposit, odds, credit type, and expiry can change.',
    signup:'Confirm the operator’s Arizona location rules, including the restriction against wagering from tribal lands, and review minimum-age requirements. Register with accurate information, complete location and identity checks, then read the current Welcome Deposit Match or Bet & Get conditions before making a deposit or wager.',
    focus:'Confirm the exact allowed geofence before opening an account. A deposit match may be issued as promotional funds with separate playthrough or withdrawal restrictions; the offer terms define whether matching value is cash, bonus balance, or wager credits.',
    sources:[['Desert Diamond Sports official site','https://betdesertdiamond.com/'],['Desert Diamond promotions help center','https://help.playdesertdiamond.com/hc/en-us/sections/11638862635803-Promotions']]
  },
  {
    slug:'draftkings-fantasy', name:'DraftKings Fantasy', group:'DFS and pick’em apps', product:'daily fantasy sports app',
    description:'DraftKings Fantasy guide: how salary-cap and draft contests work, how to claim a DraftKings Fantasy sign-up offer, and how DFS differs from sportsbook betting.',
    overview:'DraftKings Fantasy is a daily fantasy sports platform, separate from DraftKings Sportsbook. In salary-cap contests, players build a roster under a budget and earn points from real-game statistics. Draft-style contests assign athletes among entrants. Entry fees, scoring rules, roster limits, and contest availability vary by sport and jurisdiction.',
    operation:'A user selects a contest, reviews its payout table and rules, creates an eligible lineup, and submits the entry before the contest locks. Results are determined by fantasy scoring, not by whether a selected team wins a sportsbook wager. Some contests may be head-to-head, against a field, or free-to-play; the contest lobby and rules explain the format.',
    bonus:'DraftKings Fantasy promotions are distinct from sportsbook welcome bonuses, and no single current nationwide Fantasy sign-up amount was verified for this review date. Offers may be delivered as tickets, entries, or site credit, and availability can depend on state and account history. Read the Fantasy promotions tab rather than applying a Sportsbook promotion to DFS.',
    signup:'Download the official Fantasy app or visit DraftKings DFS, confirm eligibility in your jurisdiction, and create or sign in to your account. Review contest-specific terms and any current welcome offer before paying an entry fee. Check the entry deadline, scoring, prize allocation, and whether the reward is a free contest ticket.',
    focus:'A fantasy contest entry is not a sports wager, and a DraftKings Sportsbook bonus cannot be presumed usable in Fantasy. Confirm contest eligibility, prize rules, multi-entry limits, and the operator’s responsible-play options.',
    sources:[['DraftKings Daily Fantasy Sports','https://external.draftkings.com/dfs'],['DraftKings Sportsbook','https://sportsbook.draftkings.com/sportsbook']]
  },
  {
    slug:'fanduel-fantasy', name:'FanDuel Fantasy', group:'DFS and pick’em apps', product:'daily fantasy sports app',
    description:'How FanDuel Fantasy works, its salary-cap and head-to-head contests, and how to check FanDuel Fantasy sign-up promotions separately from sportsbook bonuses.',
    overview:'FanDuel Fantasy offers daily fantasy contests where customers assemble rosters of real athletes and score points from their game performances. Depending on sport and jurisdiction, formats can include salary-cap tournaments, head-to-head contests, leagues, and free contests. The fantasy product is separate from FanDuel Sportsbook.',
    operation:'Before entering, review the contest lobby for entry cost, scoring, number of opponents, roster rules, and payout structure. A lineup earns points according to the contest rules; it is not a parlay or sportsbook ticket. The contest locks at its stated time, after which lineup changes may be limited or disallowed.',
    bonus:'No single FanDuel Fantasy welcome bonus was confirmed as universally active on September 24, 2026. FanDuel Sportsbook may show its own promotions, but those do not establish a Fantasy offer. Check the Fantasy app or official Fantasy page for current new-player tickets, credits, or entry offers in your jurisdiction.',
    signup:'Use the official FanDuel Fantasy app or site, verify your age and location, and review the contest rules before entry. If the app displays a welcome promotion, note whether it requires a code, first deposit, paid entry, or completion deadline and whether the reward can only be used in a designated contest format.',
    focus:'Check the fantasy contest’s scoring and payout rules as carefully as the promotional terms. Credits or tickets are not always withdrawable cash, and a sportsbook account or bonus may have separate eligibility.',
    sources:[['FanDuel Fantasy','https://www.fanduel.com/fantasy'],['FanDuel Sportsbook','https://www.fanduel.com/']]
  },
  {
    slug:'prizepicks', name:'PrizePicks', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'PrizePicks guide: how player projections and pick’em lineups work, plus the current PLAYBOOK sign-up promotion and its Bonus Lineup terms.',
    overview:'PrizePicks is a player-projection pick’em app. A user chooses statistical projections for athletes and builds an entry by predicting whether selected players will finish above or below a listed line, subject to the app’s entry rules. Available sports, contest formats, and permitted play depend on the user’s jurisdiction.',
    operation:'The app settles entries from official statistical results and its scoring rules. It may offer different entry styles, including standard and protected formats, with distinct payout tables and selection requirements. Review how ties, postponed games, player participation, and stat corrections are handled before submitting an entry.',
    bonus:'PrizePicks’ official September promotion page lists code PLAYBOOK: play $5 and get $150 in Bonus Lineups if the qualifying entry wins, with a minimum $10 deposit and stated claim/use deadlines. The page indicates the campaign ends December 31, 2026. Bonus Lineups are promotional entries, not cash; confirm state eligibility and full terms before using the code.',
    signup:'Check that PrizePicks supports your location and the entry type offered there. Create and verify an account, make the required deposit, enter PLAYBOOK if needed, and place the qualifying $5 play under the campaign rules. Track the claim and use deadlines and the format in which promotional lineups must be played.',
    focus:'The offer is contingent on the qualifying play winning and awards Bonus Lineups rather than cash. Review eligible projections, entry type, bonus expiry, deposit rules, and whether the campaign remains available in your state.',
    sources:[['PrizePicks September promotion and terms','https://www.prizepicks.com/promos/stacked-september'],['PrizePicks official site','https://www.prizepicks.com/']]
  },
  {
    slug:'underdog-fantasy', name:'Underdog Fantasy', group:'DFS and pick’em apps', product:'fantasy sports and pick’em app',
    description:'Underdog Fantasy guide to drafts, pick’em entries, and how to find current Underdog sign-up bonuses and state-specific offer terms.',
    overview:'Underdog Fantasy offers several fantasy formats, including drafts and player-pick entries. Draft formats let users select athletes for a fantasy roster; pick’em formats ask users to choose outcomes around statistical projections. Which products are available, and whether an entry is classified as fantasy play or another contest type, can depend on the jurisdiction.',
    operation:'Before entering, check the format, scoring method, number of selections, payout chart, and contest lock time. Drafts may fill against other participants or a system-generated field, while pick’em entries settle against player statistics. Account funds, credits, and bonus entries can have different withdrawal and expiration rules.',
    bonus:'Underdog rotates new-user promotions, and a single universal signup amount with current nationwide terms was not verified for September 24, 2026. The welcome screen or official promotion page is the controlling source. Review whether an offer is a deposit match, bonus funds, free entry, or a protected-play token and whether it is restricted by state.',
    signup:'Download the official app, select the available product for your state, and complete identity and location verification. Read the live offer before depositing or entering, then follow its code, qualifying play, minimum amount, and deadline. Save the terms, especially if a bonus balance must be used in a particular contest type.',
    focus:'Underdog product names and permitted formats can differ by state. Confirm that the entry type is offered where you are and understand whether the promotional reward is withdrawable, expires, or requires additional paid entries.',
    sources:[['Underdog Fantasy','https://www.underdogfantasy.com/'],['Underdog official support and promotions','https://support.underdogfantasy.com/']]
  },
  {
    slug:'sleeper-picks', name:'Sleeper Picks', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'Sleeper Picks bonus and app guide: how player-pick entries work and how the first-deposit match up to $100 is applied.',
    overview:'Sleeper Picks is the player-pick product within Sleeper, a sports community and fantasy app. Users select player statistics and build entries according to the available pick’em format. The app also includes fantasy leagues and social features, which are separate from paid Picks entries and their promotion rules.',
    operation:'A Picks entry is evaluated using the posted stat line and Sleeper’s scoring and settlement rules. The app presents the eligible player, projection, and entry options, which may vary by state. Confirm whether the entry is a paid contest, a promotional entry, or another format before submitting.',
    bonus:'Sleeper’s official support terms list a 100% first Player Picks deposit match up to $100 with code PLAY. The matched promotional funds must be used to enter contests and are not simply withdrawable cash. Offer terms can change, so confirm code availability, qualifying deposit, expiration, and eligible state in the app.',
    signup:'Install Sleeper, open Picks where available, and create or verify your account. Read the first-time deposit match terms, enter PLAY if the offer remains active, and make only a qualifying deposit. Check the promotional balance and allowed contest uses before submitting any entry.',
    focus:'A 100% match does not mean a cash bonus: support terms state that matched funds are for contest entry. Check the maximum match, deposit method, expiry, geographic restrictions, and withdrawal policy.',
    sources:[['Sleeper first-time deposit match terms','https://support.sleeper.com/en/articles/6139511-first-time-deposit-match-promotion'],['Sleeper Picks','https://sleeper.com/picks']]
  },
  {
    slug:'betr-picks', name:'Betr Picks', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'Betr Picks guide: how player-projection entries work and what to check in the current Betr Picks new-user No Sweat Tokens offer.',
    overview:'Betr Picks lets customers create entries around athlete statistical projections in supported sports and states. Users choose the projections and entry format offered in the app; results are determined by the applicable player statistics and Betr’s settlement rules. The Picks product is separate from other Betr products and reward programs.',
    operation:'The app shows available projections, selection requirements, entry choices, and payouts. A No Sweat Token or similar protection may refund or replace a qualifying entry under specified conditions; it should not be assumed to refund cash in every situation. State rules can affect which entry formats are visible.',
    bonus:'Betr’s official promotions collection lists a new-player offer involving four No Sweat Tokens after the first deposit. The exact amount, token availability, and qualifying steps vary by state and current campaign. Treat the live offer displayed in the app and its complete terms as authoritative before making a deposit.',
    signup:'Check state availability, register through Betr’s official app, and complete required verification. Read the promotion collection or in-app terms before depositing to confirm token count, qualifying entry requirements, any minimum deposit, and token expiry. Verify the reward arrives before using it.',
    focus:'A No Sweat Token is a conditional protection, not necessarily cash or a guaranteed winning entry. Confirm when a token is consumed, what outcomes qualify for replacement, and whether returned funds are cash or promotional balance.',
    sources:[['Betr official promotions and bonuses','https://help.betr.app/en/collections/9579255-promotions-bonuses']]
  },
  {
    slug:'dabble', name:'Dabble', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'How Dabble works and what its current $5-to-$50 new-user offer and first-deposit promotion require, including the P2026 code.',
    overview:'Dabble is a social fantasy pick’em app where users build entries from player projections and can share picks or follow other users. The product’s entry types and availability depend on location. Dabble also promotes social features, but a shared pick is not automatically an entry; users must submit their own lineup under the applicable contest rules.',
    operation:'Players select athletes and projection outcomes, then submit an entry using the format available in their state. Payouts and settlement follow the entry’s rules. The app may have promotional spins, boosts, or deposit rewards in addition to free-play style entries, so each reward can carry its own limitations.',
    bonus:'Dabble’s U.S. homepage reviewed for September 2026 advertises Play $5, Get $50 using code P2026 and a first-deposit “spin” match. Because campaign terms and state eligibility can change, confirm the offer inside the app, including whether the $50 is promotional credit, how it is released, and the deposit match conditions.',
    signup:'Download Dabble only if its product is available in your location. Register and verify your account, enter P2026 if still required, and read the qualifying-entry and first-deposit terms before paying. Check whether sharing or copied picks qualify, and note any expiry or minimum-odds/entry conditions.',
    focus:'The promotional headline can combine more than one reward. Separate the $5 qualifying play, bonus amount, and deposit-match “spin” into their own terms; check whether any part is withdrawable and when it expires.',
    sources:[['Dabble official U.S. site and promotions','https://www.dabble.com/']]
  },
  {
    slug:'chalkboard', name:'Chalkboard', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'Chalkboard app guide and welcome bonus details: how player picks work and what the 2026 Promo Pack includes.',
    overview:'Chalkboard is a sports pick’em app with player-stat selections and social features. Users build entries around projections available in the app, with the result determined by real player performance and the applicable format. Chalkboard’s promotion system can combine bonus funds, boost cards, and free squares, which are distinct reward types.',
    operation:'An entry starts with eligible player projections and the format selected for the user’s jurisdiction. Review the number of picks, payout or reward rules, stat settlement, and any special protection before submitting. A boost card changes a specified entry condition; it does not remove the underlying contest risk.',
    bonus:'Chalkboard’s official August 2026 help page describes a new-user Promo Pack after verification: two Boost Cards, a 50% deposit or purchase match up to $500 in bonus funds, and a free square. These are promotional benefits, not all cash. Confirm the current pack, required deposit or purchase, release rules, and state availability before joining.',
    signup:'Create a Chalkboard account, complete verification, and open the current Promo Pack terms in the app. Confirm whether the match applies to a deposit or purchase in your state, then follow the activation steps. Check the use-by dates and any restrictions on bonus funds, Boost Cards, and the free square.',
    focus:'A match “up to $500” is a ceiling, not a guaranteed award. Read the percentage, maximum, release or playthrough rules, bonus-fund withdrawal limits, and expiry for each item in the pack.',
    sources:[['Chalkboard Promo Packs help article','https://helps.chalkboard.io/en/articles/11898654-promo-packs-on-chalkboard'],['Chalkboard official site','https://chalkboard.io/']]
  },
  {
    slug:'parlayplay', name:'ParlayPlay', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'ParlayPlay sign-up bonus and app guide: learn how player pick’em entries work and how its free-entry and deposit-match promotions differ.',
    overview:'ParlayPlay is a player-projection fantasy app where users select multiple athlete statistics and submit entries under an available pick’em format. It supports multiple sports, with available players and entry types depending on jurisdiction. Users should read the payout chart and the app’s settlement rules before deciding how many projections to include.',
    operation:'Each entry is scored using the specified player statistics. More selections or alternate entry styles can change the potential payout and conditions. The account may show free-entry rewards, promo funds, or loyalty benefits separately from cash balance; each is governed by its own restrictions.',
    bonus:'ParlayPlay’s official help center lists a $5 free entry on signup and a 100% first-deposit match up to $100 in Promo Funds. Those are separate rewards with terms; Promo Funds are not the same as withdrawable cash. Confirm current availability, minimum deposit, qualifying entry, expiration, and permitted jurisdictions in the live offer.',
    signup:'Register in the official ParlayPlay app, verify your identity and location, and review both the signup-entry and deposit-match terms. Confirm if a code or opt-in is needed. Make a qualifying deposit only after checking how Promo Funds are credited and which entry types can use them.',
    focus:'A free entry and matched Promo Funds have different value and rules. Check the entry’s selections and payout, then the matched balance’s usage, expiry, playthrough, and withdrawal restrictions.',
    sources:[['ParlayPlay promotions and bonuses help','https://intercom.help/parlayplay/en/collections/10956361-promos-bonuses'],['ParlayPlay official site','https://parlayplay.com/']]
  },
  {
    slug:'ownersbox', name:'OwnersBox', group:'DFS and pick’em apps', product:'daily fantasy sports app',
    description:'OwnersBox fantasy app guide: how its contests work and what the five OwnersBucks signup reward can be redeemed for.',
    overview:'OwnersBox is a daily fantasy sports platform offering contests built around player performance. Users choose a contest, make a lineup or picks according to its format, and compete under posted scoring and payout rules. The contest lobby and sport-specific rules explain entry fees, roster requirements, and settlement.',
    operation:'A submitted lineup earns points based on real-game statistics. Contest results are ranked against the relevant field and prizes follow the posted payout structure. OwnersBox uses OwnersBucks as a promotional or platform currency that may be redeemed for entries, subject to account terms.',
    bonus:'OwnersBox support states that new users receive five OwnersBucks at signup. OwnersBucks can be redeemed for tickets but are not withdrawable cash. Check current account and contest rules to confirm the reward remains available, eligible contest uses, and any expiry or minimum account requirements.',
    signup:'Create an account through OwnersBox, complete age and location checks, and review the contest terms. Look for the OwnersBucks balance after registration, then use it only for eligible tickets shown in the app. Review contest entry fees and payout rules before adding any personal funds.',
    focus:'The five OwnersBucks should be valued as entry credit, not cash. Confirm redemption choices and whether winnings from a promotional ticket are withdrawable under the current contest rules.',
    sources:[['OwnersBox OwnersBucks support','https://support.ownersbox.com/hc/en-us/articles/25255328038925-How-do-OwnersBucks-Work'],['OwnersBox official site','https://ownersbox.com/']]
  },
  {
    slug:'boom-fantasy', name:'Boom Fantasy', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'Boom Fantasy app and sign-up bonus guide: how Pick’em entries work and what its current offer of up to $40 in free entries includes.',
    overview:'Boom Fantasy offers Pick’em and Pick & Spin formats based on athlete statistical outcomes. Users choose player projections and an entry style; the app settles results under the rules for each format. Availability, sports, and entry options vary by jurisdiction, so the lobby is the place to confirm what can be played locally.',
    operation:'Before entering, review the pick count, projection line, payout conditions, and how the app treats ties or player non-participation. Pick & Spin may use a different mechanic from a standard Pick’em entry. Promotional tickets are subject to the same product rules plus additional restrictions on credit use.',
    bonus:'Boom Fantasy’s Terms of Service, effective after April 24, 2026, describe up to $40 in free entries after a first deposit: two $10 Pick & Spin entries and two $10 Pick’em entries. The promotion also references $5 cash entries. Confirm the live state-specific terms, deposit requirement, expiration, and whether this campaign remains active.',
    signup:'Check local eligibility, create and verify a Boom Fantasy account, and read the current first-deposit promotion before funding it. Follow the exact cash-entry or deposit condition and note which reward applies to Pick & Spin versus Pick’em. Use free entries before their stated deadline.',
    focus:'“Up to $40” is in specified free entries, not a $40 cash payout. Verify the required first deposit, the $5 cash-entry condition, eligible format, and expiration for every ticket.',
    sources:[['Boom Fantasy Terms of Service','https://www.boomfantasy.com/terms-of-service'],['Boom Fantasy official site','https://www.boomfantasy.com/']]
  },
  {
    slug:'vivid-picks', name:'Vivid Picks', group:'DFS and pick’em apps', product:'daily fantasy sports pick’em app',
    description:'Vivid Picks status and app guide: learn how its pick’em product operated and why there is no current sign-up bonus.',
    overview:'Vivid Picks was a player-pick fantasy app built around statistical projections and promotional entries. The company’s official site states that it stopped accepting new deposits and closed operations on July 15, 2025. As of this guide’s September 24, 2026 review date, Vivid Picks is not a live option for a new account.',
    operation:'When it operated, the app let users combine player projections into entries that settled against real-game performance. That historical description is not a current offer to participate. Former users with account or payout questions should rely on any official closure notices or support instructions rather than third-party signup pages.',
    bonus:'There is no current Vivid Picks sign-up bonus because the company says it ceased new deposits and closed operations in 2025. Search results or coupon pages showing old Vivid Picks bonuses are outdated and should not be treated as redeemable.',
    signup:'A new customer cannot sign up for an active Vivid Picks product according to the official closure notice. Do not deposit money through a site claiming to reopen Vivid Picks unless the company itself publishes a verifiable operating update.',
    focus:'This page is a status guide, not a recommendation. If the product reopens or a successor launches, verify the legal operator, current terms, and state availability directly before relying on any promotion.',
    sources:[['Vivid Picks official closure notice','https://www.vividpicks.com/']]
  },
  {
    slug:'novig', name:'Novig', group:'Prediction markets', product:'sports prediction market',
    description:'Novig sports prediction market guide: how event contracts and trading credits work, and the current $25 credit offer after a $10 deposit.',
    overview:'Novig presents sports outcomes as event contracts that users can trade at prices between $0 and $1, rather than as fixed sportsbook odds. A contract price reflects the market’s implied probability and can move as buyers and sellers trade. Novig describes itself as a prediction market; eligibility and product structure depend on applicable rules.',
    operation:'Users fund an account, choose a contract, and buy or sell at the displayed market price. Contracts settle according to the defined event outcome, and the position’s value can rise or fall before settlement. This exchange-style model differs from a conventional sportsbook accepting a fixed-odds wager; review liquidity, fees, and settlement terms.',
    bonus:'Novig’s official new-member deposit program offers $25 in Trade Credits after a first deposit of at least $10 and identity verification, subject to eligibility and jurisdiction terms. Trade Credits are promotional trading value, not necessarily cash withdrawable from the account. Check the official offer rules before funding an account.',
    signup:'Confirm that Novig permits accounts in your location and that you meet its minimum age. Register, complete required verification, and review the current deposit-program conditions. Make the qualifying first deposit only if you understand the trade-credit restrictions, then check the account for reward issuance.',
    focus:'An event-contract quote is a tradable price, not sportsbook odds. Assess liquidity and the maximum possible contract value, and read whether promotional credits can be withdrawn or only used to trade.',
    sources:[['Novig new member deposit program terms','https://support.novig.com/en/articles/16116457-new-member-deposit-program-terms-conditions'],['What is Novig?','https://support.novig.com/en/articles/10336081-what-is-novig']]
  },
  {
    slug:'prophetx', name:'ProphetX', group:'Prediction markets', product:'peer-to-peer sports exchange',
    description:'ProphetX sports exchange guide: how peer-to-peer trading works and how its $75 promo credit offer is released over 14 days.',
    overview:'ProphetX operates a peer-to-peer sports prediction exchange where users trade positions against other market participants rather than simply taking a house-posted sportsbook price. The exchange can display sports markets and tradeable positions; actual access and product terms depend on the user’s location and eligibility.',
    operation:'An exchange price reflects available counterparties and can change as orders enter or leave. Users should review how an order is matched, whether the position can be sold before settlement, and how the event contract is resolved. Liquidity and fees can affect the practical value of a position.',
    bonus:'ProphetX’s official lobby reviewed for this guide advertises $75 in promotional credit after $50 of trade volume, issued as three $25 credits over 14 days. The campaign has eligibility and timing limits. Verify whether the reward requires matched trading volume, what activity qualifies, and when each credit expires.',
    signup:'Create an account at ProphetX, confirm local eligibility, and complete identity checks. Read the $75 promotion terms before trading, including how $50 volume is calculated and whether buys, sells, or specific markets qualify. Track the three issuance dates and credit-use deadlines.',
    focus:'Promotional credits are not guaranteed cash. Trading to unlock a bonus still exposes a user to price movement, liquidity, and potential loss; understand the order book and settlement rules before participating.',
    sources:[['ProphetX exchange lobby and current promotion','https://www.prophetx.co/lobby/'],['ProphetX official site','https://www.prophetx.co/']]
  },
  {
    slug:'sporttrade', name:'Sporttrade', group:'Prediction markets', product:'sports event-contract exchange',
    description:'Sporttrade status guide: how its sports contract exchange worked and why Sporttrade has no active sign-up bonus after wagering stopped.',
    overview:'Sporttrade operated a sports trading platform where users could buy or sell positions tied to event outcomes, using market prices rather than only fixed sportsbook odds. The platform’s official site states that it stopped all wagering on May 25, 2026. As of September 24, 2026, it is not an active sports wagering option.',
    operation:'Historically, Sporttrade presented an exchange-style model: participants traded sports event positions at prices that could change before settlement. That description is background only. Do not assume old app downloads, archived tutorials, or account pages mean trading has resumed.',
    bonus:'There is no current Sporttrade signup bonus verified because the operator says all wagering stopped May 25, 2026. Historical new-customer offers are no longer useful for a new account. Check the official site for any future relaunch or customer-service update.',
    signup:'The official status page does not describe an active wagering signup flow. Avoid depositing based on an old promotion or a third-party claim that Sporttrade is open. Former customers should use official operator communications for account questions.',
    focus:'If Sporttrade announces a relaunch, review the operator identity, regulatory status, supported jurisdiction, funds handling, and offer terms as new information; do not rely on pre-closure terms.',
    sources:[['Sporttrade official status','https://getsporttrade.com/']]
  },
  {
    slug:'bettoredge', name:'BettorEdge', group:'Prediction markets', product:'peer-to-peer sports trading platform',
    description:'BettorEdge app and signup bonus guide: how peer-to-peer sports markets work and what the random reward up to $100 means.',
    overview:'BettorEdge is a peer-to-peer sports trading platform where users can take positions with other users in supported markets. The model differs from a traditional sportsbook that posts fixed odds against a house. Market prices and the ability to trade depend on available counterparties and the platform’s rules.',
    operation:'Users browse an event market, review the displayed position and price, and match with another participant. Since it is peer-to-peer, the market can depend on liquidity; a displayed price may not be available for the desired size. Read settlement rules and platform fees before entering or exiting a position.',
    bonus:'BettorEdge’s official signup information says a new user who signs up and verifies ID can receive a random reward up to $100 without a deposit. “Up to” is a maximum, not a promise that every user receives $100. Check the live terms for eligible states, reward distribution, and any usage or expiry limitations.',
    signup:'Register at the official platform, complete ID verification, and review the reward disclosure shown to your account. Confirm the amount and whether the reward is cash, account credit, or trade credit before using it. Separately verify that the platform supports your location.',
    focus:'The reward is random and may be below the advertised maximum. Understand the peer-to-peer matching model and the reward’s withdrawal conditions before treating it as cash value.',
    sources:[['BettorEdge signup and ID verification','https://www.bettoredge.com/'],['BettorEdge official support','https://support.bettoredge.com/']]
  },
  {
    slug:'kalshi', name:'Kalshi', group:'Prediction markets', product:'regulated event-contract exchange',
    description:'Kalshi guide to event contracts, account funding, and personalized referral credits. Learn how Kalshi differs from a sportsbook.',
    overview:'Kalshi is a regulated exchange where users trade event contracts that resolve to a defined outcome. A contract price generally moves between $0 and $1 and reflects the market’s current expectation. Sports-related markets may be available subject to product rules and current legal or regulatory developments.',
    operation:'Users review a contract question, buy or sell at an available price, and hold or trade the position before settlement. The contract’s terms define what event counts and how the result is determined. This is an exchange structure; price movement, order execution, fees, and liquidity differ from a sportsbook’s fixed-odds bet slip.',
    bonus:'Kalshi’s official referral FAQ describes personalized referral credits rather than a universal public signup amount. Qualification and value are shown in the account or referral offer. Credits are not automatically cash, and eligibility, deposit, trading, and expiry conditions can vary by promotion.',
    signup:'Use Kalshi’s official website or app, complete required identity and location checks, and read the contract and account terms. If an invite or referral offer appears, inspect its personalized conditions before depositing or trading. Confirm that the specific market is available to you under current rules.',
    focus:'Review the event definition and resolution source before trading. Regulatory status or court decisions can affect particular event markets; verify current availability and exchange disclosures instead of assuming every sports contract is offered everywhere.',
    sources:[['Kalshi referral program FAQ','https://help.kalshi.com/en/articles/13823783-kalshi-referral-program-faq'],['Kalshi official exchange','https://kalshi.com/']]
  },
  {
    slug:'polymarket', name:'Polymarket', group:'Prediction markets', product:'event-contract prediction market',
    description:'Polymarket guide to event contracts, the separate U.S. platform, and why there is no universal U.S. sign-up bonus verified.',
    overview:'Polymarket is a prediction-market brand with separate international and U.S. services. Users trade outcome contracts at market prices rather than place conventional fixed-odds sportsbook bets. The international site and U.S. service are not interchangeable: U.S. customers should use only the platform intended and authorized for their location.',
    operation:'A market contract is tied to a stated question and resolution rules. Traders buy or sell available outcomes, and prices may move with market activity before the event resolves. Review the market’s settlement source, available liquidity, fees, and account-funding method before trading.',
    bonus:'No ongoing universal U.S. Polymarket signup bonus was verified on September 24, 2026. Promotional programs, if offered, may be account-specific or tied to a particular platform. Check Polymarket US’s own current terms; do not assume an international-site promotion is available to U.S. users.',
    signup:'Confirm the correct Polymarket service for your country and physical location, then follow its official eligibility and verification process. Read the contract rules and current account terms before funding an account. Do not use a VPN or an alternate platform to bypass location restrictions.',
    focus:'Polymarket’s U.S. and international offerings have different access and regulatory frameworks. Check the exact site, operator, supported jurisdiction, contract rules, and current terms before participating.',
    sources:[['Polymarket international site','https://polymarket.com/'],['Polymarket US','https://polymarket.us/']]
  },
];

// Additional brand-specific editorial sections keep each page useful beyond
// its offer summary and avoid producing a set of thin, interchangeable posts.
const longformDetails = {
  betmgm:{
    product:"The BetMGM betting board groups events by sport and lets a customer move between pregame markets and live odds. A ticket can contain a straight wager or a supported parlay. The accepted odds matter: a price shown while browsing may update before the final confirmation.",
    offer:"When an offer is written as a winning-bet reward, the qualifying wager must settle as a win before the stated Bonus Bets arrive. First-bet protection follows a different path because a loss can trigger a credit up to its published limit. These two formats have different expected value.",
    account:"BetMGM accounts may connect with MGM Rewards activity under the loyalty program's own eligibility terms. Treat the sportsbook offer and hotel or entertainment rewards as separate benefits until the operator confirms how qualifying play earns or redeems each one.",
    evaluate:"Compare the BetMGM promotion shown for your state with the offer's exact minimum odds, wager cap, qualifying market, issuance time, and credit expiry. If you prefer cash value, calculate a Bonus Bet's potential net return with its stake treatment included."
  },
  bet365:{
    product:"The bet365 app is built around event listings, market menus, and live score or in-play views. Customers can compare moneyline, spread, total, and player markets where offered, then review the bet slip before placing a wager. Live markets may pause as game conditions change.",
    offer:"The former $10-to-$365 campaign should be treated as historical after its September 22, 2026 close. A current bet365 sign-up bonus must be visible in the applicable state flow. Old promo codes, cached pages, or social posts do not extend an expired campaign.",
    account:"Because bet365 directs customers through a state selector, the state landing page is a useful first check before downloading or funding an account. Registration information must match the identity documents used for verification, and location checks occur when the customer tries to wager.",
    evaluate:"Before joining bet365, compare the offer's qualifying odds, the number and value of Bonus Bets, each credit's expiry, excluded bet types, and the required first-deposit or first-wager action. An advertised maximum can represent several credits rather than one withdrawable amount."
  },
  betrivers:{
    product:"BetRivers' event board presents available sports and markets for the customer's state. Review each market's settlement language and the displayed price before submission; a parlay combines several selections, so all legs and their individual odds should be checked in the final slip.",
    offer:"BetRivers promotions can be built around a first wager, a deposit, or a reward issued after qualifying play. The state page determines which format is active. Read whether the reward is cash, Bonus Bets, or another credit and whether a qualifying ticket has to win.",
    account:"The Rush Street Interactive brand operates across state-specific sportsbook experiences. Start from the official local site and keep that jurisdiction selected while reviewing the welcome offer. Account availability, banking methods, bonus rules, and responsible-gaming resources can all differ by market.",
    evaluate:"Compare the advertised BetRivers reward with its release schedule, minimum odds, maximum eligible stake, and deadline. Check excluded leagues or bet types too. If the app offers an early cash-out quote, remember that the amount is a changing offer on a ticket, not a guaranteed feature."
  },
  caesars:{
    product:"Caesars Sportsbook lists events and wagering markets in its app and at participating retail locations. A mobile bet requires an accepted ticket and a location check; a bet placed at a casino may follow a different process. The ticket and market rules govern settlement.",
    offer:"Caesars' new-player promotion can be a Bonus Bet or another state-specific reward. A Bonus Bet normally has a different stake-return rule from cash. If an offer names Caesars Rewards, read the loyalty terms separately to see what activity earns points and how points may be redeemed.",
    account:"The Caesars account may connect sportsbook activity with the Caesars Rewards ecosystem, but account linking does not guarantee every promotion qualifies for loyalty credit. Keep the promotional offer, sportsbook ticket, and loyalty balance in view as separate records when checking a reward.",
    evaluate:"For a Caesars sign-up offer, verify the state, customer definition, code or opt-in, first-wager odds, eligible sports, and Bonus Bet expiry. Also check whether a prior account with another Caesars product affects eligibility; promotional terms define who counts as a new customer."
  },
  draftkings:{
    product:"DraftKings Sportsbook organizes pregame, live, and futures markets in the sportsbook interface. Same-game parlays and player props may appear for selected events. The sportsbook ticket is separate from a fantasy lineup, and an available price or market is not final until the wager is accepted.",
    offer:"The $5 wager for $200 in Bonus Bets campaign reviewed for this guide ended September 20, 2026. Future DraftKings welcome offers may use a different credit schedule or qualifying action. Review whether any promotion defines a new customer across the wider DraftKings account ecosystem.",
    account:"DraftKings offers sportsbook, fantasy, and other products under its brand. Shared account details do not make their promotions interchangeable. Check whether prior Fantasy participation, a previously opened account, or an earlier welcome offer affects eligibility for the Sportsbook campaign in your state.",
    evaluate:"Compare the DraftKings offer's reward amount with the number of Bonus Bet credits, minimum odds, eligible bet types, max stake, and expiry. Confirm the qualifying bet is accepted before its deadline, then check the account's promotion tracker rather than assuming an unsettled wager has earned a reward."
  },
  fanatics:{
    product:"Fanatics Sportsbook presents odds and event markets through its state-specific app. Customers can build a ticket, inspect the potential return, and submit it for acceptance. Some campaigns use FanCash alongside wagering features, so learn which screen shows sportsbook balance and which shows rewards.",
    offer:"A Fanatics welcome promotion may provide a sportsbook credit, an odds offer, or FanCash, depending on the campaign. These rewards do not necessarily have the same cash value or redemption path. Use the offer's definition of FanCash and any conversion rate rather than the headline alone.",
    account:"The Fanatics brand spans sports merchandise and digital products, while the sportsbook remains governed by sportsbook account and state rules. Check the account's reward wallet to see whether FanCash is available for eligible merchandise or another use, and whether any reward has an expiration date.",
    evaluate:"For a Fanatics Sportsbook bonus, check the state page, required odds and stake, eligible markets, reward issuance timing, and whether the reward can be withdrawn or only used in the Fanatics ecosystem. A campaign for an event or tournament may end before a general signup page does."
  },
  fanduel:{
    product:"FanDuel's sportsbook slip shows selections, wager amount, odds, and a potential payout before submission. The board may offer same-game parlays, live betting, player props, and futures, subject to the event and state. FanDuel Fantasy contests use different rules and a separate promotion path.",
    offer:"The $250 Bonus Bets schedule displayed at review was issued in $50 increments after qualifying daily wagers across seven days. That structure makes timing part of the offer's value: missing a qualifying day or letting an issued credit expire can reduce the total reward.",
    account:"Check that the page and app are set to the correct state before creating an account. FanDuel may run separate sportsbook and fantasy campaigns, and a person who has used one product should read the campaign's customer definition before assuming the other product's offer applies.",
    evaluate:"For FanDuel's signup bonus, check each daily wager requirement, minimum odds, bet type, maximum qualifying stake, credit issue date, and expiry. Determine whether the offer is for new sportsbook customers or existing customers, and do not count an unaccepted or voided ticket as qualifying without checking terms."
  },
  hardrockbet:{
    product:"Hard Rock Bet's sportsbook includes pregame and live markets in participating locations. Its bet slip confirms the wager details before submission, while promotional credits are managed under separate offer rules. Availability of a league, player prop, or cash-out feature can depend on local product settings.",
    offer:"The $100 Bonus Bets promotion reviewed here is paid as five $20 credits over five weeks after the qualifying $5 bet. That staggered schedule is central to the offer: each credit has its own seven-day expiry, so the full headline value is realized only by meeting each use deadline.",
    account:"Hard Rock Bet eligibility can depend on participating state, age, and the app's geolocation check. Open the promotion page after selecting the state where you will wager. If the campaign is available to both new and existing users, confirm which route and qualifying step match your account.",
    evaluate:"Assess the Hard Rock Bet reward by its five-credit schedule, not as a single $100 cash award. Verify qualifying odds, eligible bet markets, credit release dates, seven-day expiry, and whether a losing or voided qualifying ticket earns the later installments."
  },
  thescore:{
    product:"theScore Bet places wagering features alongside theScore's sports coverage. Users still need to open the sportsbook flow, confirm an eligible location, and submit an accepted wager. Scores, news, or editorial picks in the media app do not themselves create or settle a sportsbook ticket.",
    offer:"A theScore Bet signup bonus is controlled by the offer in the current state app. Customers with ESPN BET history should check the transition rules and the promotion's definition of a new customer. Previous brand campaigns may have different codes, dates, or credit balances.",
    account:"The brand transition from ESPN BET to theScore Bet makes account status an important signup detail. Follow official migration instructions for login, identity, and balances. Avoid creating a duplicate profile when the operator says an existing account should transition, and ask official support about unsettled tickets.",
    evaluate:"Compare the theScore Bet offer's new-user definition, qualifying wager, minimum odds, eligible markets, and credit expiry. If you are a former ESPN BET customer, check whether the promotion excludes prior users and whether legacy rewards or account history change your qualification."
  },
  ballybet:{
    product:"Bally Bet's local sportsbook page is the best starting point for its current state product. The app presents markets and accepted tickets under that jurisdiction's rules. Some states may also have retail or casino context, so separate the mobile sportsbook terms from any venue-specific service.",
    offer:"The $10-to-$50 Bonus Bets example is displayed by Bally Bet state pages such as Colorado and Ohio. It should be read as a local campaign example, with its own eligibility and issuance terms, rather than as a promise that every state uses the same amount.",
    account:"Use the state selector or state landing page before you register. Promotions, available sports, and account features can differ between Bally Bet jurisdictions. Complete verification and confirm the current promotion appears in your account before placing the wager intended to qualify.",
    evaluate:"Read the Bally Bet offer's minimum odds, number of Bonus Bet credits, promotional stake treatment, expiry, and any required opt-in. Check the page for your state on the day you sign up; search snippets and another state's promotion may show a different campaign."
  },
  desertdiamond:{
    product:"Desert Diamond Sports is a location-specific Arizona sportsbook. The official help material says customers must be in Arizona and outside tribal lands to use the mobile service. Its event board and account flow therefore have a tighter geographic scope than a broadly available national app.",
    offer:"The official help center lists Welcome Deposit Match and Bet & Get categories, without one universal current amount established for this guide. A deposit match and a bet-and-get reward are different: one is tied to qualifying funding, while the other follows a qualifying wager.",
    account:"Before signup, confirm Arizona location eligibility, the applicable age requirement, and the tribal-land restriction in the current terms. Identity and geolocation checks can prevent registration or wagering when an account is outside the permitted area, even if the app has already been installed.",
    evaluate:"Check the Desert Diamond promotion for its deposit amount, matching cap, eligible payment method, wagering or release rules, and expiration. For Bet & Get, confirm whether the first bet must win and whether the reward is cash or sportsbook credit."
  },
  'draftkings-fantasy':{
    product:"DraftKings Fantasy contests use real player statistics to score a roster. Salary-cap contests ask the user to build within a budget; draft formats allocate athletes through selections. Contest entry deadlines, scoring categories, roster limits, and prize distribution appear in the specific contest rules.",
    offer:"A Fantasy reward may arrive as a ticket or contest credit that can only be used in eligible DFS contests. Its value depends on the contest options and expiry. DraftKings Sportsbook Bonus Bets belong to a different product flow and should not be counted as Fantasy signup value.",
    account:"DraftKings may let a customer use one account across multiple products, but each promotion has its own eligibility rules. Check whether prior use of Sportsbook or Fantasy affects a new-user reward. Review the contest lobby for restricted sports or formats before you deposit or spend an entry ticket.",
    evaluate:"Compare DraftKings Fantasy offers by the contest ticket's entry fee, eligible contest types, number of entries, expiration, and whether any winnings can be withdrawn. Also inspect scoring and payout tables: a large-field tournament has a different risk profile from a small head-to-head contest."
  },
  'fanduel-fantasy':{
    product:"FanDuel Fantasy entries are scored from athletes' real-game statistics. A salary-cap lineup must meet its budget and roster rules, while head-to-head and tournament contests place entries against different fields. The contest page provides scoring, lock times, entry limits, and payout details.",
    offer:"Fantasy welcome promotions may be issued as tickets, entry credit, or another contest reward. A FanDuel Sportsbook Bonus Bet does not automatically fund a fantasy entry. Review whether a ticket can be used for a specific sport or contest type and what happens if it expires unused.",
    account:"FanDuel separates sportsbook betting from fantasy contests even when customers use the same brand or account. Check the Fantasy lobby and offer terms directly. Eligibility, paid contest access, and scoring rules can differ by state, so the sportsbook page alone is not sufficient for signup decisions.",
    evaluate:"Before accepting a FanDuel Fantasy offer, compare its allowed contests, entry limits, lock deadlines, prize distribution, and use-by date. Review the scoring system and contest size too; promotional credit does not change the lineup's chance of finishing in a payout position."
  },
  prizepicks:{
    product:"PrizePicks entries revolve around player projections such as points, rebounds, or yards. Users choose the athletes and the permitted over/under or other entry style. The selected format controls required picks and payout rules, while stat corrections and participation rules govern settlement.",
    offer:"The PLAYBOOK campaign's $150 reward is in Bonus Lineups and is conditional on a qualifying $5 play winning; it also lists a $10 minimum deposit. Bonus Lineups are entries with use conditions, so their value depends on eligible projections, deadlines, and the allowed lineup format.",
    account:"PrizePicks can show different entry products by location. Check which format and promotion appear after selecting your state, then confirm the claim deadline and the deadline to use earned Bonus Lineups. Keep the promotion details with the qualifying entry so you can verify that it meets the offer conditions.",
    evaluate:"Evaluate the PrizePicks signup offer by separating the deposit, qualifying entry, win condition, promo code, and reward-use window. Read the entry's payout table and the operator's rules for ties, postponed games, player participation, and stat corrections before building a lineup."
  },
  'underdog-fantasy':{
    product:"Underdog combines fantasy formats that can include drafts and player-pick entries. A draft creates a roster under that contest's rules; a pick'em entry compares selected players with projections. The format shown in the app determines scoring, payout, and whether an entry is available in a given location.",
    offer:"Underdog campaigns can rotate between deposit matches, bonus funds, free entries, and protected-play tokens. Those formats release value differently. Confirm the exact reward displayed in your account and whether it must be used in drafts, pick'em, or another contest before its stated expiry.",
    account:"Select your location and product before signup so the app presents the correct terms. Finish identity checks before funding. Since fantasy and pick'em products can have different state rules, an offer available for one format may not mean every Underdog contest is available to that account.",
    evaluate:"Review an Underdog promotion's qualifying deposit, matching percentage, max credit, entry eligibility, token protection rules, and expiry. For paid contests, also check scoring, ties, player non-participation, and payout structure. These rules affect how much use a promotional balance actually has."
  },
  'sleeper-picks':{
    product:"Sleeper Picks focuses on player-stat selections within the broader Sleeper fantasy and sports community app. The projections, eligible picks, and entry options can vary by location. Read the specific contest's requirements and stat settlement terms before combining multiple player outcomes.",
    offer:"The published PLAY first-deposit match is up to $100 at 100%, with matched funds intended for contest entries. The maximum requires a qualifying deposit at that ceiling, and the promotional balance has use restrictions. It is not the same as cash being added to a withdrawable balance.",
    account:"Sleeper also supports fantasy leagues and social features, so make sure the screen you are using is Picks when applying a Picks offer. Verify account details and location before funding, then check that the match appears in the correct promotional balance and that the account can enter eligible contests.",
    evaluate:"For Sleeper Picks, compare the match cap, qualifying deposit, code requirement, promotional-fund expiry, eligible entry formats, and withdrawal rules. Understand which entries consume matched funds and how any winnings are handled under the official promotion and contest terms."
  },
  'betr-picks':{
    product:"Betr Picks uses player projections to build entries in supported markets. Users choose from the lines and formats available in the app, then results settle against the operator's scoring rules. The account's promotion area explains whether an entry uses cash, a token, or another credit.",
    offer:"The listed four No Sweat Tokens are a conditional entry-protection reward after the first deposit. A token's benefit depends on the qualifying entry and the outcome covered by its rules. Token count alone does not state cash value or guarantee the user wins an entry.",
    account:"Betr includes multiple products and state-specific promotions. Open the Betr Picks offer rather than relying on a general brand campaign. Confirm the deposit and token issuance steps, then note where token availability and expiry are shown in the account before you create an entry.",
    evaluate:"Review the Betr Picks token rules for the eligible entry type, token consumption, covered result, returned balance type, and expiry. Compare the available projection lines and payout format too; a token's protection does not remove the need to understand the entry's risk."
  },
  dabble:{
    product:"Dabble combines player-pick entries with social tools for following and sharing selections. A shared pick is informational until a customer creates and submits an eligible entry. Check the app's specific format, required picks, projection lines, and settlement rules for the sport and location.",
    offer:"The homepage's P2026 campaign combines a $5 qualifying play for a stated $50 reward with a first-deposit spin match. Separate each benefit: the qualifying entry, the reward credit, and the deposit match may each have a different trigger, release method, and expiration.",
    account:"Dabble's signup flow should be completed in the official app and within a supported location. If a code is needed, enter it before submitting the qualifying play. Keep a record of the offer screen and confirm that a copied or shared entry satisfies the campaign's own definition of eligible play.",
    evaluate:"Check whether Dabble's $50 is bonus credit, how it can be used, and whether it is released at once or in stages. For the deposit spin match, inspect the percentage, cap, qualifying deposit, and spin deadline. The current in-app terms should resolve any conflicting campaign copy."
  },
  chalkboard:{
    product:"Chalkboard centers on player picks and social sports discussion. A Boost Card, free square, and standard projection entry affect different parts of play. Review the entry type and each selected player's projection; a social post or boosted line does not substitute for the contest's settlement rules.",
    offer:"The described Promo Pack combines two Boost Cards, a 50% match up to $500 in bonus funds, and a free square after verification. The $500 figure is a maximum. A user should confirm whether matching applies to a deposit or purchase and how bonus funds become usable.",
    account:"Complete verification before expecting the Promo Pack. Chalkboard's help page describes the reward components separately, which makes the account wallet important: verify each card, match, or square appears and note whether they have different eligible entry formats and expiry dates.",
    evaluate:"Check the pack's match percentage, cap, qualifying spend, bonus-fund release rules, Boost Card conditions, free-square restrictions, and deadline. Compare the value of a free square to the entry and payout it can be used with instead of treating every Promo Pack item as cash."
  },
  parlayplay:{
    product:"ParlayPlay entries combine player projections under selectable pick'em formats. The number of picks and entry style can change payout terms. Review the market board, athlete participation rules, and any tie or void treatment before submitting a multi-player entry.",
    offer:"The help center lists a $5 free entry at signup and a separate 100% first-deposit match up to $100 in Promo Funds. The free entry and deposit match should be tracked independently because they may have separate expiration, entry eligibility, and withdrawal restrictions.",
    account:"After account verification, check the promo wallet and the contest lobby together. Some credit types can only fund particular entries. Before you deposit, confirm the minimum amount required to earn the match and whether the promotional balance is available immediately or after another qualifying step.",
    evaluate:"Assess ParlayPlay's offer using the free entry's pick requirements and payout table, plus the match's deposit cap, eligible payment method, use period, and cash-out rules. Confirm what happens to winnings from an entry funded partly or fully with Promo Funds."
  },
  ownersbox:{
    product:"OwnersBox fantasy contests use player performance to score a lineup or entry. The contest rules specify roster construction, scoring, entry size, lock time, and prize distribution. Compare the available contest formats in the lobby before using an OwnersBucks ticket.",
    offer:"The five OwnersBucks signup reward is platform credit intended for eligible tickets, not withdrawable money. Its practical value depends on the ticket choices and contest availability. Check the account after signup and read whether prizes won from a promotional entry follow separate withdrawal conditions.",
    account:"OwnersBox's support article explains how OwnersBucks work, so use that source alongside the contest page. Confirm that the bonus balance is credited, which contest tickets accept it, and whether any location, verification, or account requirement must be completed before redemption.",
    evaluate:"Compare OwnersBox ticket use by entry fee, eligible sport, payout structure, number of competitors, and expiry. Review contest scoring and roster rules before paying any amount beyond the signup reward, and check withdrawal terms for any winnings from a promotional entry."
  },
  'boom-fantasy':{
    product:"Boom Fantasy offers Pick'em and Pick & Spin entry styles based on player statistics. Each format has its own selection flow and payout rules. Check the stat line, number of picks, and rules for ties or player participation on the entry page before submitting.",
    offer:"The terms describe two $10 Pick & Spin entries and two $10 Pick'em entries after a first deposit, alongside a $5 cash-entry condition. That package totals up to $40 in free entries; the tickets have format-specific use and do not represent a $40 cash balance.",
    account:"After registering, verify which product and state are active in the app. Read the first-deposit offer before funding, then confirm the app credits two tickets in each named format. Because Pick & Spin and Pick'em are different products, note their separate expiry and entry rules.",
    evaluate:"For Boom Fantasy, check the first-deposit minimum, $5 cash-entry condition, four free-ticket denominations, eligible formats, and expiration dates. Review whether the offer remains active in your jurisdiction and how any winnings from a free entry are settled or withdrawn."
  },
  'vivid-picks':{
    product:"Vivid Picks historically offered player-projection entries that settled against real-game statistics. The company says it stopped new deposits and closed operations on July 15, 2025. That status means archived product descriptions are useful only as background, not as current signup instructions.",
    offer:"There is no active Vivid Picks welcome bonus in the closure status reviewed for this guide. Old promo codes and coupon pages may remain indexed, but the operator's closure notice takes precedence. A new offer would require a verifiable official reopening announcement and current terms.",
    account:"Former users should follow official closure communications for account or payout questions. Do not send new funds to an app, clone site, or promotion page that uses Vivid Picks branding without confirming the current operator and official source.",
    evaluate:"If a successor or relaunch appears, check the legal operator name, supported states, current product rules, customer-fund handling, and live promotion conditions from the official site. Treat any old Vivid Picks signup bonus as expired unless the company explicitly renews it."
  },
  novig:{
    product:"Novig displays sports event contracts with prices between zero and one dollar. A user can buy or sell a position at the available market price, and the position's value may move before the event resolves. Review liquidity, order execution, and settlement definitions as part of how the market works.",
    offer:"The new-member program lists $25 in Trade Credits after at least a $10 first deposit and identity verification, subject to location and offer terms. Trade Credits are designed for market activity, and their balance should be valued separately from cash available to withdraw.",
    account:"Novig requires identity verification and location eligibility. Read the official new-member terms before depositing, including the states where the offer applies and the time window for credit issuance. Check the wallet labels so Trade Credits are not confused with a cash deposit or realized proceeds.",
    evaluate:"Compare a Novig contract price with its defined maximum settlement value and available liquidity; it is not the same quote format as sportsbook odds. Check any trading fee, ability to exit early, market resolution source, and Trade Credit restrictions before using the signup reward."
  },
  prophetx:{
    product:"ProphetX's peer-to-peer exchange matches users trading positions in sports markets. The quoted price depends on available orders and can move when other participants buy or sell. Review whether an order is fully matched and how a position can be closed before the underlying event settles.",
    offer:"The lobby's $75 credit campaign follows $50 in qualifying trade volume and distributes three $25 credits over 14 days. The staged schedule means both the volume definition and the credit-use windows matter. Confirm which trade actions count before trying to qualify.",
    account:"After registration and identity checks, locate the campaign terms and watch for each credit in the account. An exchange wallet may distinguish deposited funds, open positions, and promotional credit. Read withdrawal treatment for each balance type before moving money into a market.",
    evaluate:"Evaluate the ProphetX reward alongside market liquidity, order matching, transaction costs, position settlement, and the 14-day issue schedule. Trading volume can expose an account to price movement and loss, so calculate the value of each credit before deciding whether to participate."
  },
  sporttrade:{
    product:"Sporttrade historically presented sports event positions as tradeable contracts whose prices could change before resolution. Its official site says wagering stopped on May 25, 2026. The former exchange interface and archived signup guides describe a discontinued service as of this review.",
    offer:"There is no current Sporttrade signup bonus associated with an active wagering product in the official status information reviewed. A campaign from before the May closure should be treated as historical; a bonus headline cannot make a stopped market available for new trading.",
    account:"Former customers should use operator communications for account and funds questions. If an app remains installed, its presence on a device does not indicate the service accepts new deposits or trades. Look for a dated statement directly from Sporttrade before acting on a purported update.",
    evaluate:"A future relaunch would need fresh checks of the operator, regulatory status, state access, account balances, market rules, and promotion terms. Keep any historical Sporttrade comparison separate from current sportsbook or prediction-market choices."
  },
  bettoredge:{
    product:"BettorEdge describes a peer-to-peer sports trading environment. Positions depend on finding another participant at a matching price and size, so liquidity affects whether a trade executes. Review how the platform handles order matching, fees, and event resolution before opening a position.",
    offer:"The signup reward is described as a random amount up to $100 after registration and ID verification, with no deposit required. The word random matters: the maximum is not guaranteed. Confirm the specific amount and whether it appears as cash, credit, or a restricted promotional balance.",
    account:"Complete identity checks through the official signup flow and verify the platform supports your location. Check the account after verification for the reward disclosure. If the reward is a trade credit, the rules for using or withdrawing it may differ from a cash award.",
    evaluate:"Compare the BettorEdge reward with market liquidity, matching availability, settlement terms, fees, and reward restrictions. A no-deposit offer still does not guarantee a particular reward value or an easy exit from a position; read the platform rules first."
  },
  kalshi:{
    product:"Kalshi event contracts settle against a defined question and resolution source. Traders can buy or sell at available prices, often between zero and one dollar, and market prices can change before settlement. Review contract wording closely; small differences in event definitions can change the outcome.",
    offer:"Kalshi referral credits are personalized rather than a single universal public signup bonus. The qualifying account, reward amount, deposit or trading requirement, and expiry should appear in the specific invitation. Treat credits according to the displayed terms, not as automatically withdrawable cash.",
    account:"Complete identity and location checks in the official exchange flow. Availability of a particular contract can vary by jurisdiction and product rules. Read the account's current disclosures and contract-specific resolution details before funding or placing an order.",
    evaluate:"When comparing Kalshi, look at contract terms, available bid and ask prices, order depth, fees, settlement source, and the treatment of referral credit. Sports-related contract availability can change with regulatory or legal developments, so re-check current listings."
  },
  polymarket:{
    product:"Polymarket markets are framed as questions with stated outcome tokens and resolution rules. Traders buy or sell outcomes at prices that move with market activity. Liquidity, fees, and the source used to resolve a market can matter as much as the current quote.",
    offer:"No universal ongoing U.S. signup bonus was verified for this review. Any offer should be checked on the U.S. service itself, with its own terms. A promotion shown on an international Polymarket page should not be assumed to apply to a U.S. customer.",
    account:"Polymarket has separate international and U.S. services. Choose only the service intended for your location and follow its eligibility and verification steps. Do not bypass geographic controls; platform access and permitted contracts depend on the account's jurisdiction.",
    evaluate:"Before trading, compare the market's resolution wording, source, depth, fees, and platform-specific account rules. Confirm the domain and operator for the service you are using, since the international and U.S. experiences have different access and regulatory frameworks."
  }
};

const guideBySlug = new Map(guides.map(guide => [guide.slug, guide]));
const urlFor = (base, path) => `${base}${path}`;

function titleFor(guide) {
  return `${guide.name}: How It Works & Sign-Up Bonus Guide (2026)`;
}

function operatorResearchSections(guide, details) {
  const name = esc(guide.name);
  const productType = guide.group === 'Sportsbooks' ? 'sportsbook' : guide.group === 'Prediction Markets' ? 'prediction market product' : 'pick’em or fantasy app';
  return `<section><h2>How this ${productType} guide evaluates ${name}</h2><p>A useful ${productType} review starts with the product's actual rules and the reader's location. Check whether the operator is available in the relevant jurisdiction, which legal entity operates the service, and whether the listed app or retail channel is the one being described. Then look at the mechanics that affect ordinary use: account verification, market or contest selection, accepted price or entry terms, settlement, deposits, withdrawals, and support.</p><p>These details matter more than a single star rating or promotion headline. A feature may be available in one state but not another, and a public product page may not describe every restriction in an account. This guide summarizes ${name} using the linked operator sources and flags information that should be checked again before use.</p></section>
    <section><h2>Compare ${name} sign-up bonus terms line by line</h2><p>To evaluate a ${name} sign-up bonus, read the promotion as a list of conditions rather than a cash amount. Find who qualifies, whether an opt-in or code is required, what activity counts, any minimum price or entry requirements, the deadline, and the form of the reward. Then check if the reward is withdrawable cash, bonus credit, a free entry, or another restricted balance. The advertised value may depend on all of those steps being completed.</p><p>For a hypothetical offer, imagine an operator advertises a reward after a qualifying action. Before estimating its value, identify what happens if the action loses, when the reward expires, whether it can be used on every market, and what amount is returned after settlement. This is an example of how to read terms, not a description of a current ${name} promotion. Use the offer displayed in the eligible account as the controlling source.</p></section>
    <section><h2>Account, payment, and withdrawal details to verify</h2><p>Before opening an account, check the identity and location verification steps, supported deposit methods, withdrawal options, processing conditions, minimums or fees, and the account closure or dispute process. A payment method shown at registration may not be available for every withdrawal. Keep the operator's confirmation and terms for an accepted wager, paid entry, or promotion until it is settled.</p><p>Do not assume that a fast deposit means a fast withdrawal. The operator may need to complete identity review, payment checks, or other conditions listed in its current terms. If an important payment detail is unclear, ask the operator's support team or consult the applicable regulator before relying on a third-party summary.</p></section>
    <section><h2>Market rules and price comparisons for ${name}</h2><p>When comparing a ${name} market with another source, match the event, selection, line, period, price, and timestamp. A better price on a different line does not describe the same outcome. Read the rules for overtime, player participation, postponements, pushes, and voids; those details can vary between markets and providers. A displayed quote may also change or become unavailable before an account accepts it.</p><p>For a fair comparison, preserve the original quote and note where it came from. VisualOdds's research tools can organize available data, but the operator's accepted ticket and current official rules determine how a particular wager or entry works. No comparison proves that a selection will win.</p></section>
    <section><h2>Questions to ask before using a ${name} account</h2><ul><li>Is the product currently available in my location, and which regulator or official source confirms it?</li><li>What personal information and location checks are required?</li><li>Are the current promotion terms visible in the account before any qualifying action?</li><li>How are accepted wagers, entries, withdrawals, and disputes handled?</li><li>Which spending limits, time-outs, or self-exclusion controls can I use?</li></ul><p>These checks apply to a ${productType} even when the product is familiar. A brand name or app-store listing is not proof of local eligibility or current offer terms.</p></section>
    <section><h2>How VisualOdds keeps this ${name} guide useful</h2><p>The page links directly to operator or official help materials for product and offer details. Information such as welcome promotions, market menus, payment methods, and jurisdiction availability can change, so the review date is a snapshot rather than a guarantee that every detail remains live. Follow the primary links and compare them with what appears in the account before acting.</p><p>VisualOdds provides independent research and education. It is not affiliated with ${name}, does not accept wagers or paid entries, and does not promise that any account or promotion will produce a profit. This guide is for general information and should not replace official terms, local rules, or responsible-play resources.</p></section>`;
}

function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function article(guide, base) {
  const canonical = urlFor(base, `${BASE_PATH}/${guide.slug}`);
  const title = titleFor(guide);
  const details = longformDetails[guide.slug];
  const interactive = brandInteractiveForSlug(guide.slug);
  const faq = [
    { question:`How does ${guide.name} work?`, answer:guide.operation },
    { question:`What is the ${guide.name} sign-up bonus?`, answer:guide.bonus },
    { question:`How do I sign up for ${guide.name}?`, answer:guide.signup },
  ];
  const categoryLinks = guides.filter(item => item.group === guide.group && item.slug !== guide.slug).slice(0, 5);
  const sources = guide.sources.map(([label, href]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a><span>Operator or official help source</span></li>`).join('');
  const relatedMarkup = categoryLinks.slice(0, 3).length ? `<nav class="related" aria-label="Similar articles"><h2>Similar articles</h2><ul>${categoryLinks.slice(0, 3).map(item => renderRelatedCard({
    href: `${BASE_PATH}/${item.slug}`,
    slug: item.slug,
    category: item.group,
    title: item.name,
    description: item.description,
    meta: 'Updated September 25, 2026',
  })).join('')}</ul></nav>` : '';
  const articleSchema = { '@context':'https://schema.org','@type':'Article',headline:title,description:guide.description,datePublished:REVIEW_DATE,dateModified:CONTENT_UPDATED_DATE,mainEntityOfPage:canonical,author:{'@type':'Organization',name:'VisualOdds Editorial'},publisher:{'@type':'Organization',name:'VisualOdds',url:base} };
  const faqSchema = { '@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(item=>({'@type':'Question',name:item.question,acceptedAnswer:{'@type':'Answer',text:item.answer}})) };
  const breadcrumb = { '@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:base},{'@type':'ListItem',position:2,name:'Sportsbook, DFS & prediction market guides',item:urlFor(base,BASE_PATH)},{'@type':'ListItem',position:3,name:guide.name,item:canonical}] };
  const content = `
    <main id="main" class="edu-main market-article-page sportsbook-guide-page">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="${BASE_PATH}">Sportsbook and app guides</a><span>/</span><span>${esc(guide.name)}</span></nav>
      <article class="edu-article market-article sportsbook-guide-article">
      <div class="longform-article-grid">
        <header class="article-header"><span class="article-category">${esc(guide.group)} · 2026 guide</span><h1>${esc(title)}</h1><p class="article-description">${esc(guide.description)}</p><div class="article-byline"><span>VisualOdds Editorial</span><span aria-hidden="true">·</span><time datetime="${REVIEW_DATE}">Reviewed ${REVIEW_LABEL}</time></div></header>
        <div class="article-content">
          <p class="article-lede">${esc(guide.overview)}</p>
          <aside class="sg-offer-card"><div><span>Sign-up bonus status</span><strong>${esc(guide.name)}</strong></div><p>${esc(guide.bonus)}</p><small>Offer details checked ${REVIEW_LABEL}. Promotions and eligibility can change; confirm the live terms for your location.</small></aside>
          <section><h2>How ${esc(guide.name)} works</h2><p>${esc(guide.operation)}</p><p>${esc(details.product)}</p><p>${esc(guide.focus)}</p></section>
          <section><h2>${esc(guide.name)} sign-up bonus and current offers</h2><p>For ${esc(guide.name)}, use the official sources below to confirm whether an offer is still live and available to your account. The promotion page shown in the app controls if an older campaign page or third-party listing conflicts.</p><p>Promotional value depends on the reward type and conditions. Before you deposit or enter, check the minimum qualifying amount, eligible market or contest, required odds or trade volume, opt-in or promo code, expiration date, and whether the award is cash, a bonus balance, a free entry, or a trade credit.</p><p>${esc(details.offer)}</p></section>
          <section><h2>How to sign up for ${esc(guide.name)}</h2><p>${esc(guide.signup)}</p><p>${esc(details.account)}</p><ol><li>Confirm the service is available to you and review its age, location, and identity-verification requirements.</li><li>Read the current welcome promotion and full terms before making a deposit or paid entry.</li><li>Complete only the qualifying actions shown in the official offer, then check the account for the promised credit or entry.</li></ol></section>
          <section><h2>What to compare before signing up for ${esc(guide.name)}</h2><p>${esc(details.evaluate)}</p><ul><li>Confirm current availability and eligibility for your physical location.</li><li>Check qualifying amounts, minimum odds or entry rules, reward format, and expiration.</li><li>Understand settlement, fees, withdrawals, and restrictions on promotional balances.</li><li>Review deposit limits, self-exclusion, and customer support options before funding the account.</li></ul></section>
          ${interactive}
          <section class="market-sources"><h2>Official ${esc(guide.name)} sources</h2><ul class="market-source-list">${sources}</ul></section>
          <section class="faq market-faq"><h2>Frequently asked questions about ${esc(guide.name)}</h2>${faq.map(item=>`<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</section>
          ${operatorResearchSections(guide, details)}
          <aside class="editorial-note"><strong>Important:</strong> Offers, product access, and laws can change. This guide is informational, is not an endorsement, and does not promise a bonus. Sports wagering and paid fantasy contests involve financial risk.</aside>
        </div>
      </div>
      ${relatedMarkup}
        <nav class="article-pagination" aria-label="Guide navigation"><a href="${BASE_PATH}">← All sportsbook and app guides</a></nav>
      </article>
    </main>`;
  const contentMatch = content.match(/<div class="article-content">([\s\S]*)<\/div>\s*<\/div>(?=\s*(?:<nav class="related"|<nav class="article-pagination"))/);
  const presentation = prepareLongformContent(contentMatch?.[1] || '', guide.slug, title);
  articleSchema.wordCount = presentation.wordCount;
  const withLongform = content.replace(/<div class="article-content">([\s\S]*)<\/div>\s*<\/div>(?=\s*(?:<nav class="related"|<nav class="article-pagination"))/, (_match, inner) => `<div class="article-content">${presentation.html}</div></div>`)
    .replace('</time></div></header>', `</time><span aria-hidden="true">·</span><span class="article-reading-time">${readingTimeLabel(presentation.minutes)}</span></div></header>`)
    .replace('class="edu-article market-article sportsbook-guide-article"', 'class="edu-article market-article sportsbook-guide-article has-longform"');
  return shell({title:`${title} | VisualOdds`,description:guide.description,canonical,body:withLongform,structuredData:[articleSchema,faqSchema,breadcrumb],interactive:Boolean(interactive)});
}

function directory(base, category = null) {
  const pageGuides = category ? guides.filter(guide=>guide.group===category) : guides;
  const groups = category ? [category] : [...new Set(guides.map(guide=>guide.group))];
  const groupId = group => `guide-group-${group.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
  const directoryPath = category === 'Sportsbooks' ? SPORTSBOOK_PATH : BASE_PATH;
  const title = category === 'Sportsbooks' ? 'Sportsbook Reviews & Sign-Up Bonuses (2026)' : 'Sportsbook, Fantasy & Prediction Market Guides (2026)';
  const description = category === 'Sportsbooks'
    ? 'Browse sportsbook reviews for BetMGM, bet365, BetRivers, Caesars, DraftKings, Fanatics, FanDuel, Hard Rock Bet, theScore Bet, Bally Bet, and Desert Diamond Sports. Compare how each sportsbook works and its sign-up bonus terms.'
    : 'Compare how major U.S. sportsbooks, daily fantasy and pick’em apps, and prediction markets work. Read brand-specific signup bonus guides with official terms and current offer notes.';
  const canonical = urlFor(base,directoryPath);
  const structuredData = { '@context':'https://schema.org','@type':'CollectionPage',name:title,description,url:canonical,mainEntity:{'@type':'ItemList',numberOfItems:pageGuides.length,itemListElement:pageGuides.map((guide,index)=>({'@type':'ListItem',position:index+1,url:urlFor(base,`${BASE_PATH}/${guide.slug}`),name:`${guide.name} sign-up bonus and how it works`}))} };
  const sections = groups.map(group=>`<section id="${groupId(group)}" class="sg-directory-section" data-guide-section><div class="guide-list-heading"><div><span class="eyebrow">${esc(group)}</span><h2>${esc(group)} guides</h2></div><span>${pageGuides.filter(guide=>guide.group===group).length} guides</span></div><ul class="sg-directory-grid">${pageGuides.filter(guide=>guide.group===group).map(guide=>`<li class="sg-guide-item" data-guide-item data-search="${esc(`${guide.name} ${guide.product} ${guide.description}`.toLowerCase())}"><a class="sg-guide-card" href="${BASE_PATH}/${esc(guide.slug)}"><span class="sg-guide-art longform-art--${artworkForSlug(guide.slug,true)}" role="img" aria-label="Editorial illustration for ${esc(guide.name)}"></span><span class="sg-guide-copy"><span class="sg-guide-category">${esc(guide.product)}</span><strong>${esc(guide.name)}</strong><small>${esc(guide.description)}</small><span class="sg-guide-meta">Official terms <span aria-hidden="true">·</span> Reviewed ${esc(REVIEW_LABEL)}</span><b>Read the guide <i aria-hidden="true">→</i></b></span></a></li>`).join('')}</ul><p class="sg-no-results" data-guide-empty hidden>No guides match this search.</p></section>`).join('');
  const heading = category === 'Sportsbooks' ? 'Sportsbook reviews and sign-up bonuses' : 'Sportsbook bonuses and app guides';
  const intro = category === 'Sportsbooks'
    ? `Compare ${pageGuides.length} sportsbook guides. Select a sportsbook to read how its app works, understand its current sign-up bonus information, and review official terms.`
    : 'Learn how popular sportsbooks, fantasy pick’em apps, and prediction markets operate, what their sign-up promotions actually provide, and which terms to verify before joining.';
  const fullLibraryLink = category === 'Sportsbooks' ? `<p><a class="sg-all-guides-link" href="${BASE_PATH}">Browse fantasy pick’em and prediction market guides →</a></p>` : `<p><a class="sg-all-guides-link" href="${SPORTSBOOK_PATH}">Browse the sportsbook dashboard →</a></p>`;
  const categoryTabs = groups.map(group=>`<a href="#${groupId(group)}">${esc(group)} <span>${pageGuides.filter(guide=>guide.group===group).length}</span></a>`).join('');
  const body = `<main id="main" class="edu-main sportsbook-guide-directory"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>${category === 'Sportsbooks' ? 'Sportsbooks' : 'Sportsbook and app guides'}</span></nav><header class="sg-library-heading"><span class="eyebrow">VISUALODDS GUIDES · REVIEWED ${REVIEW_LABEL.toUpperCase()}</span><h1>${esc(heading)}</h1><p>${esc(intro)}</p><p class="sg-library-note">${pageGuides.length} ${category === 'Sportsbooks' ? 'sportsbooks' : 'brand guides'} · Official operator links · Updated ${REVIEW_LABEL}</p></header><nav class="sg-category-tabs" aria-label="Guide categories">${categoryTabs}</nav><div class="sg-library-toolbar"><label class="sg-directory-search"><span aria-hidden="true">⌕</span><input type="search" data-guide-search placeholder="Search these guides…" aria-label="Search sportsbook and app guides" autocomplete="off"><kbd>/</kbd></label><span class="sg-directory-count" aria-live="polite"><strong data-guide-count>${pageGuides.length}</strong> guides</span></div>${sections}<p class="sg-library-no-results" data-library-empty hidden>No guides match that search. Try another sportsbook or app name.</p>${fullLibraryLink}<section class="sg-editorial-intro"><h2>How to compare sign-up bonuses</h2><p>A bonus headline can describe cash, Bonus Bets, contest entries, trade credits, or a conditional refund. Those rewards have different rules and real-world value. Each guide explains the product mechanics, summarizes the current official offer information we could verify, and links to the operator’s own promotion terms.</p><p>Offers can vary by state, account history, campaign date, and product. Confirm that an app is currently available where you are physically located, and use the live terms shown by the operator before creating an account or depositing. VisualOdds does not take bets or sell access to these operators.</p></section><aside class="editorial-note"><strong>Play responsibly.</strong> These pages are for general information, not legal or financial advice. Eligibility and rules change. Never deposit or enter a contest to chase a promotion; use age, location, spending-limit, and self-exclusion tools where available.</aside></main>`;
  return shell({title:`${title} | VisualOdds`,description,canonical,body,structuredData,directorySearch:true});
}

function shell({title,description,canonical,body,structuredData,directorySearch=false,interactive=false}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#080d12"><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="article"><meta property="og:site_name" content="VisualOdds"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><title>${esc(title)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/betting-education.css"><link rel="stylesheet" href="/online-sports-betting.css"><link rel="stylesheet" href="/sportsbook-guide.css"><link rel="stylesheet" href="/longform-articles.css?v=3">${interactive ? '<link rel="stylesheet" href="/article-interactives.css?v=5">' : ''}<script type="module" src="/longform-articles.js"></script>${interactive ? '<script type="module" src="/article-interactives.js?v=3"></script>' : ''}${directorySearch ? '<script type="module" src="/sportsbook-guide-directory.js"></script>' : ''}<script type="application/ld+json">${jsonLd(structuredData)}</script><link rel="stylesheet" href="/content-2026.css?v=1"></head><body><a class="skip-link" href="#main">Skip to content</a><header class="edu-header"><a class="edu-brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" alt="" width="34" height="34"><span>Visual<span>Odds</span><small>INDEPENDENT SPORTS RESEARCH</small></span></a><nav aria-label="Site navigation"><a href="${SPORTSBOOK_PATH}">Sportsbooks</a><a href="${BASE_PATH}">All brand guides</a><a href="/online-sports-betting">State guides</a><a href="/betting-education">Education</a><a href="/live">Live games</a><a class="edu-workspace-link" href="/research">Open workspace</a></nav></header>${body}<footer class="edu-footer"><div><a href="${SPORTSBOOK_PATH}">Sportsbooks</a><span>Independent operator information. VisualOdds does not operate a sportsbook or accept wagers.</span></div><p>Sports betting and paid fantasy contests involve risk. Check local rules and use limits that work for you.</p></footer></body></html>`;
}

export function isSportsbookGuidePath(pathname) {
  return pathname === SPORTSBOOK_PATH || pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`);
}

export function renderSportsbookGuidePage(pathname, request) {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const base = siteUrl(request);
  if (normalized === SPORTSBOOK_PATH) return directory(base, 'Sportsbooks');
  if (normalized === BASE_PATH) return directory(base);
  const match = normalized.match(/^\/online-sportsbooks\/([a-z0-9-]+)$/);
  if (!match) return null;
  const guide = guideBySlug.get(match[1]);
  return guide ? article(guide, base) : null;
}

export function renderSportsbookGuideSitemapEntries(request) {
  const base = siteUrl(request);
  return [SPORTSBOOK_PATH, BASE_PATH, ...guides.map(guide=>`${BASE_PATH}/${guide.slug}`)].map(path=>`<url><loc>${esc(urlFor(base,path))}</loc><lastmod>${CONTENT_UPDATED_DATE}</lastmod></url>`).join('');
}
