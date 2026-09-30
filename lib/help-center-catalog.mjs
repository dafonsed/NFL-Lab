// Original product help, checked against the account, research, tracker, and EV
// controllers in this repository. Plain strings only; the page renderer escapes
// all content. Related values are globally unique article slugs, not URLs.
export const HELP_COLLECTIONS = [
  {
    id: 'getting-started', title: 'Getting started', icon: 'start',
    description: 'Set up your account, find your workspace, and make your first research session count.',
    articles: [
      {
        slug: 'create-and-verify-your-account', title: 'Create and verify your VisualOdds account',
        summary: 'Register with your email, finish verification, and check that you are signed in to the right account.',
        sections: [
          { heading: 'Create your account', paragraphs: ['Your VisualOdds account keeps your saved research and bet records associated with your identity. Creating an account does not place a wager or deposit betting funds.'], steps: ['Open Create account and enter a display name and an email address you can access.', 'Choose a unique password between 15 and 128 characters, then enter it again.', 'Review and accept the Terms and Privacy Policy. The product-news checkbox is optional.', 'Submit the form and read the confirmation message before leaving the page.'], links: [{ label: 'Create account', href: '/register' }] },
          { heading: 'Complete email verification', paragraphs: ['Check your inbox and spam folder for the verification message. Follow the link, then sign in when prompted. Registration and recovery responses deliberately avoid confirming whether a particular email already has an account.', 'If you need another link, use Verify email and enter the same address. Use the most recent email. A missing or expired link does not mean your saved research was deleted.'], links: [{ label: 'Request a verification email', href: '/verify-email' }] },
          { heading: 'Check your account before saving', paragraphs: ['Open Account settings and confirm the email address and verification status in Profile. Plan & billing shows the tools your account can access. If a protected tool redirects you there, read the access notice rather than creating a second account.'], links: [{ label: 'Account settings', href: '/account' }] }
        ], related: ['choose-your-workspace', 'recover-sign-in-access', 'understand-plans-and-billing']
      },
      {
        slug: 'choose-your-workspace', title: 'Find the right workspace',
        summary: 'Know when to open Models, Trends, the market tools, or your Bet Tracker.',
        sections: [
          { heading: 'Choose a starting point', paragraphs: ['The main navigation separates different kinds of work. Dashboard is a starting point for the selected sport. Models opens projections and related research. Trends focuses on historical player results. The +EV workspace compares recorded market prices. Bet Tracker holds your personal tickets and their results.', 'These views answer different questions. A historical hit rate is not a model forecast, and a market-price comparison is not proof that a future outcome will occur.'], links: [{ label: 'Research dashboard', href: '/research' }, { label: 'Models', href: '/models' }, { label: 'Trends', href: '/trends' }] },
          { heading: 'Keep the sport and tool in view', steps: ['Select a sport in the workspace navigation.', 'Choose the tool for that sport and check the date, matchup, and market controls after it opens.', 'Use More tools for additional market calculators and research views.', 'On a narrow screen, open the navigation menu to reach the same destinations.'], paragraphs: ['Available research tools vary by sport. Changing sports can take you back to that sport’s model page when the current tool is not offered there. Access also depends on the features listed in your account.'] },
          { heading: 'Keep personal records separate from market data', paragraphs: ['Your Bet Tracker holds only the tickets you enter or import. The market workspace shows prices from the connected odds feed and any prices you add yourself; the data label on each screen tells you which.'], links: [{ label: 'Bet Tracker', href: '/ev/tracker' }, { label: 'Market workspace', href: '/ev' }] }
        ], related: ['your-first-research-session', 'market-data-sources-and-demo', 'understand-plans-and-billing']
      },
      {
        slug: 'your-first-research-session', title: 'Start a player research session',
        summary: 'Choose a sport and market, inspect a player, and understand the context behind the numbers.',
        sections: [
          { heading: 'Set the context first', steps: ['Open Models or Trends and choose the sport you want to research.', 'Check the selected date or week, matchup, and market. The available controls depend on the sport.', 'Search for a player or narrow the board with the available filters.', 'Open the player’s research view to inspect the underlying game sample and comparison line.'], paragraphs: ['A result that looks surprising is often using a different sample, threshold, or matchup than expected. Confirm those selections before comparing two views.'], links: [{ label: 'Open Models', href: '/models' }, { label: 'Open Trends', href: '/trends' }] },
          { heading: 'Read the units and labels', paragraphs: ['A projection is expressed in the market’s units, such as yards or points. Historical rates describe the displayed eligible games. A research rating orders profiles on its stated scale; it is not automatically a probability.', 'When you change a comparison line, you are changing the threshold used to read the data. That does not create a posted sportsbook offer. Check whether the price or line is labeled posted, recorded, or manually entered.'] },
          { heading: 'Check evidence before drawing conclusions', paragraphs: ['Use the game log, sample count, retrieval time, and any Model & evidence, Data & methodology, or Source receipts section offered by the current view. A dash means the value is unavailable, not zero.', 'If the page has no matching players, broaden one filter at a time. If a source is unavailable, preserve the page URL and selected context when reporting the issue.'], links: [{ label: 'Report a research problem', href: '/support#new-report' }] }
        ], related: ['filter-player-trends', 'read-model-evidence', 'refresh-and-missing-data']
      },
      {
        slug: 'save-sync-and-change-devices', title: 'Save your work and move between devices',
        summary: 'Understand account sync, pending changes, conflicts, and importing older browser records.',
        sections: [
          { heading: 'Wait for the save status', paragraphs: ['Supported research collections and preferences use your signed-in account. A change can be visible on the current device before the server has accepted it. Check the save or sync notice before closing the browser or switching devices.', 'If a network error leaves changes pending, the sync notice provides Retry sync and a way to download pending changes. Keep that copy before discarding data or clearing browser storage.'] },
          { heading: 'Handle a conflicting edit', steps: ['Stop editing when a notice says your account changed or another device has a newer version.', 'Download pending changes from the notice if you need to preserve edits made on this device.', 'Use the saved cloud version only after reviewing the confirmation that local pending edits will be discarded.', 'Reload and check your account identity before continuing.'], paragraphs: ['The conflict control does not automatically merge two different versions. Do not assume the last screen you saw was the version saved on the server.'] },
          { heading: 'Import older device-only research', paragraphs: ['Account settings has an Import research saved on this device section. Review the detected groups and confirm that the records belong to you before importing, especially on a shared computer. Existing groups may be kept unchanged; the result message explains what was imported or skipped. The original browser data is preserved.'], links: [{ label: 'Research and preferences', href: '/account#workspace' }] }
        ], related: ['export-or-delete-account-data', 'log-a-bet-ticket', 'refresh-and-missing-data']
      },
      {
        slug: 'report-a-problem', title: 'Report an issue and follow its status',
        summary: 'Send a real support report with enough context for staff to investigate.',
        sections: [
          { heading: 'Submit a report', steps: ['Sign in and open Report an issue in Support & notices.', 'Enter a short title and choose the closest category, such as Bug, Incorrect line, Grading dispute, Billing, or Account.', 'Describe what you expected, what happened, and the steps that reproduce it. Include the page URL, sport, event, market, and approximate time when relevant.', 'Add a bet, market, or snapshot reference if you have one, then submit. Wait for the saved confirmation.'], paragraphs: ['The report is attached to your signed-in account. Do not include passwords, authenticator codes, API keys, or payment-card details. The current form accepts text and an optional reference, not attachments.'], links: [{ label: 'Report an issue', href: '/support#new-report' }] },
          { heading: 'Check progress in My reports', paragraphs: ['Your saved report appears in My reports. Use Refresh reports or the page controls to find it again. Statuses include open, in progress, waiting on customer, and resolved. Report updates appear here; the support workflow does not send email notifications.', 'Staff internal notes and assignments are not included in your customer report view. Resolving a billing or grading report does not itself execute a refund or settle a ticket.'], links: [{ label: 'My reports', href: '/support#reports' }] },
          { heading: 'Use the connected support form', paragraphs: ['A diagnostic report saved inside a market workspace can remain a local workspace record. Use the Support & notices form when you want a report to reach the connected staff queue. If you cannot sign in, use the support contact described in the Privacy Policy for account recovery.'], links: [{ label: 'Privacy Policy and recovery contact', href: '/privacy' }] }
        ], related: ['service-notices-and-alert-preferences', 'recover-sign-in-access', 'update-ticket-results']
      }
    ]
  },
  {
    id: 'research-and-tracking', title: 'Research and tracking', icon: 'research',
    description: 'Explore player history, organize your watchlist, and keep accurate ticket records.',
    articles: [
      {
        slug: 'filter-player-trends', title: 'Filter player trends and choose a game sample',
        summary: 'Use sample, venue, player, and price filters without losing track of what the result measures.',
        sections: [
          { heading: 'Open the filter editor', paragraphs: ['In a sport’s Player trends view, open Filters. Performance contains the game sample, venue, comparison side, minimum hit rate, minimum games, and sorting controls. Players & teams narrows teams, positions, saved players, and available-player options. Lines & odds contains sportsbook and range controls.'], steps: ['Choose a sample such as L5, L10, L20, H2H, or All.', 'Set Over or Under and review the comparison line used by the player view.', 'Add only the team, player, or price restrictions you need.', 'Review the matching-player count and select Apply filters.'], links: [{ label: 'Open Trends', href: '/trends' }] },
          { heading: 'Interpret the remaining sample', paragraphs: ['L5, L10, and L20 refer to recent eligible games. Venue and other filters can make the actual sample smaller. H2H restricts the comparison to the relevant opponent history, which can also be a small sample.', 'A high historical hit rate describes those games at the displayed threshold. It does not establish the chance of the next result. Inspect the game log and sample count alongside the percentage.'] },
          { heading: 'Recover an empty board', paragraphs: ['Check minimum games first: a strict requirement can exclude players with shorter histories. Then relax team, position, sportsbook, line, and odds restrictions. Minimum values must not exceed maximums, and the minimum-game count must be a whole number.', 'Use Reset in the filter editor when you want to start again. Watchlist-only mode also limits results, so an empty saved list can make an otherwise populated board appear blank.'] }
        ], related: ['build-a-player-watchlist', 'your-first-research-session', 'read-model-evidence']
      },
      {
        slug: 'build-a-player-watchlist', title: 'Build and use a player watchlist',
        summary: 'Save players for later and understand why a saved player may not appear in the current view.',
        sections: [
          { heading: 'Save a player from Trends', steps: ['Open a sport’s Player trends view and find the player you want to keep.', 'Use the player’s save or bookmark control.', 'Open Watchlist in the Trends navigation, or enable Saved players only in Filters.', 'Check the account sync status before moving to another device.'], paragraphs: ['Watchlists are organized by sport. Saving an MLB player does not place that player in an NFL watchlist. A bookmark is a research shortcut; it is not a wager or a subscription to a delivered alert.'], links: [{ label: 'Open Trends', href: '/trends' }] },
          { heading: 'Keep filters in mind', paragraphs: ['The watchlist still uses the selected sport, date, market, and research filters. A saved player can be absent because the current source has no eligible data for that context or because a filter excludes them.', 'If the list seems incomplete, clear the search, relax the filters, and check the date or market. Return to the full Player trends board to confirm the player is available there. Removing a bookmark changes the saved list; it does not delete historical player data.'] },
          { heading: 'Use one account consistently', paragraphs: ['Sign in to the same account when checking the watchlist elsewhere. If older bookmarks exist only in a browser, review the one-time device import in Account settings. On a shared device, only import records that belong to you.'], links: [{ label: 'Import older saved research', href: '/account#workspace' }] }
        ], related: ['filter-player-trends', 'save-sync-and-change-devices', 'service-notices-and-alert-preferences']
      },
      {
        slug: 'log-a-bet-ticket', title: 'Add and edit a ticket in Bet Tracker',
        summary: 'Record the ticket you actually booked, including odds, stake, status, and optional notes.',
        sections: [
          { heading: 'Create the record', steps: ['Open Bet Tracker and select Add bet.', 'Enter the ticket description, sport, bet type, date, sportsbook, stake, and booked odds.', 'Choose the correct odds format before entering the price. Use the combined ticket odds for a parlay.', 'Choose the result or leave the ticket open. Add a market, source, tags, or notes when useful.', 'Review the return preview, save, and check the sync status.'], paragraphs: ['The tracker records your activity. Saving a ticket does not submit it to a sportsbook, move money, or verify that a wager was accepted. Use the receipt from your sportsbook as the source for the booked details.'], links: [{ label: 'Open Bet Tracker', href: '/ev/tracker' }] },
          { heading: 'Use valid prices and amounts', paragraphs: ['American odds use whole numbers at or beyond +100 or −100. Decimal odds must be greater than 1. Stakes use at most two decimal places. Optional closing odds must use the same format as the ticket.', 'A connected single has one leg, while a connected parlay needs at least two. You can also keep a manually settled ticket without connecting result data.'] },
          { heading: 'Correct a saved ticket', paragraphs: ['Open the ticket details and choose Edit ticket to correct its fields or notes. Deleting a ticket requires confirmation. If the page is showing Sample data preview, switch to View my bets before working with your own ledger.', 'If a save or sync error appears, preserve pending changes before reloading or replacing stored data.'] }
        ], related: ['import-a-bet-screenshot', 'update-ticket-results', 'tracker-performance-and-exports']
      },
      {
        slug: 'import-a-bet-screenshot', title: 'Import a ticket from a screenshot',
        summary: 'Turn an image into a draft, correct the recognized text, and review every field before saving.',
        sections: [
          { heading: 'Choose a readable image', steps: ['Open Bet Tracker and select Import.', 'Choose, drop, or paste a PNG, JPG, or WebP screenshot.', 'Keep the image within 12 MB. Convert a PDF or HEIC file to a supported image first.', 'Wait for the text reader, then review the detected sportsbook, date, stake, odds, and selections.'], paragraphs: ['The image reader runs on your device. The screenshot itself is not uploaded or stored as part of the saved ticket. English text works best; a tightly cropped image with clear text is easier to recognize.'], links: [{ label: 'Import in Bet Tracker', href: '/ev/tracker' }] },
          { heading: 'Correct the draft before saving', paragraphs: ['Use Paste or correct the ticket text if recognition missed details. Select Read these details to parse the corrected text, then Review ticket to open the normal ticket form.', 'Nothing is saved at the recognition step. Check every selection, the stake, and especially the combined price against the original receipt. A leg’s individual odds are not a substitute for a parlay’s booked total price.'] },
          { heading: 'Review result tracking separately', paragraphs: ['Imported selections begin with open, manually reviewed results until you connect them to a supported game. Recognizing a player’s name does not prove the app found the correct event or settlement rule.', 'If image reading fails, try a sharper or smaller image, or paste the ticket text. Images over 24 megapixels must be resized. You can cancel reading and enter the ticket manually at any time.'] }
        ], related: ['log-a-bet-ticket', 'update-ticket-results', 'save-sync-and-change-devices']
      },
      {
        slug: 'update-ticket-results', title: 'Update ticket results and check connected legs',
        summary: 'Use manual results or supported game data, and handle missing statistics, pushes, and voids.',
        sections: [
          { heading: 'Choose how the ticket is settled', paragraphs: ['Manual settlement lets you record the result from your sportsbook. Supported results are Open, Won, Lost, Push, Void, and Cashed out. A winning ticket can include an actual-return override; a cashed-out ticket needs the cash-out return.', 'Automatic ticket results require connected legs. Each leg must identify the correct game and supported market. The ticket state is then derived from the leg states. This is result tracking, not a connection to your sportsbook balance.'], links: [{ label: 'Open Bet Tracker', href: '/ev/tracker' }] },
          { heading: 'Refresh connected results', steps: ['Open the ticket and verify the game, player or team, market, threshold, and side for each connected leg.', 'Use Refresh results when it is available.', 'Read the checked time and source message next to each leg.', 'Compare a disputed result with the sportsbook’s receipt and settlement rules before changing the recorded ticket.'], paragraphs: ['A stale feed, missing statistic, or unverified game identity can leave a leg marked Data unavailable or Check with book. Missing data is not automatically counted as a loss.'] },
          { heading: 'Handle special settlements explicitly', paragraphs: ['A push or void in a parlay can change its payout. The tracker may leave the ticket open and ask you to confirm its result and actual return rather than inventing a revised payout. Quarter-point lines also require manual book settlement.', 'If the connected result is incorrect, include the ticket or market reference and the exact discrepancy in a support report. Reporting the issue does not automatically overwrite your ticket.'], links: [{ label: 'Report a grading issue', href: '/support#new-report' }] }
        ], related: ['log-a-bet-ticket', 'tracker-performance-and-exports', 'report-a-problem']
      },
      {
        slug: 'tracker-performance-and-exports', title: 'Read tracker totals and export your tickets',
        summary: 'Understand filters, open exposure, returned money, profit, and the scope of an export.',
        sections: [
          { heading: 'Choose the records you want to inspect', paragraphs: ['Use Week, Month, Year, All time, or Custom to set a performance date range. The ticket list also supports search and filters such as sport, sportsbook, market, source, tag, and result. All tickets, Open, and Settled help separate unresolved records from completed ones.', 'Check active filters when a ticket or total appears missing. A calendar selection or date range can narrow what you are looking at without deleting any records.'], links: [{ label: 'Open Bet Tracker', href: '/ev/tracker' }] },
          { heading: 'Read returns and profit correctly', paragraphs: ['Total returned includes money returned to you; net profit subtracts the stake. An open ticket shows a potential return rather than a realized result. Pushes and voids return the recorded stake and are excluded from the settled-stake denominator used by the tracker’s ROI calculation.', 'The win-rate calculation uses won and lost tickets. It does not treat every settled status as a win or loss. Missing closing odds produce an unavailable CLV value, not a zero. These figures describe your recorded inputs and results.'] },
          { heading: 'Choose the right export', steps: ['Leave Sample data preview and open your own tickets.', 'Set the filters for the records you need.', 'Use Export CSV to download the visible ticket selection.', 'For the bet data stored to your account as JSON, use Export bets in Account settings instead.'], paragraphs: ['Wait for account sync before exporting from another device. Keep downloaded files private if they contain personal notes or account information.'], links: [{ label: 'Account data exports', href: '/account#privacy' }] }
        ], related: ['update-ticket-results', 'export-or-delete-account-data', 'save-sync-and-change-devices']
      }
    ]
  },
  {
    id: 'tools-and-updates', title: 'Tools and updates', icon: 'updates',
    description: 'Adjust the workspace, read source status, and understand notices and calculation tools.',
    articles: [
      {
        slug: 'adjust-display-and-navigation', title: 'Adjust display settings and navigate on mobile',
        summary: 'Change card spacing and motion preferences, and find the full navigation on a smaller screen.',
        sections: [
          { heading: 'Open Appearance', paragraphs: ['The research workspace navigation includes Appearance. Its display settings offer Comfortable or Compact card spacing and a Reduce animations option. These controls change presentation; they do not change source data, projections, or calculated results.'], steps: ['Open Appearance from the workspace navigation.', 'Choose the card spacing that makes the current view easier to read.', 'Enable Reduce animations if you prefer less motion.', 'Read the save message, then select Done.'], links: [{ label: 'Open the research workspace', href: '/research' }] },
          { heading: 'Use the smaller-screen navigation', paragraphs: ['On narrow screens, use the navigation button in the top bar to open the sidebar. Choose a primary workspace, then its sport or tool. Close the navigation to return to the content.', 'Wide comparison tables may scroll horizontally. A table with more books or columns than fit on the screen has not necessarily lost its right-hand values. Scroll the table region to inspect them.'] },
          { heading: 'Use developer detail when needed', paragraphs: ['Dev mode exposes additional model inputs, formulas, and source information where a view provides them. It does not grant a different subscription or turn experimental estimates into validated forecasts.', 'If a preference cannot be saved, the interface explains that it applies only for the current session. Resolve any account or storage notice before assuming the preference will follow you to another device.'] }
        ], related: ['choose-your-workspace', 'read-model-evidence', 'save-sync-and-change-devices']
      },
      {
        slug: 'refresh-and-missing-data', title: 'Troubleshoot missing, stale, or empty data',
        summary: 'Separate filter problems from unavailable sources and preserve saved work before retrying.',
        sections: [
          { heading: 'Check the selected context', steps: ['Confirm the sport, date or week, matchup, and market.', 'Clear text search and relax restrictive filters.', 'Check whether Watchlist, Current lines, a specific sportsbook, or a date range is limiting the view.', 'Read the empty-state explanation and any retrieval or source message.'], paragraphs: ['No matching rows can be a valid result for the current context. A dash means a value was not available; it should not be read as a score or price of zero.'], links: [{ label: 'Research dashboard', href: '/research' }] },
          { heading: 'Understand refresh boundaries', paragraphs: ['Research pages, connected ticket results, and market quote sync use different data paths. Refreshing one does not promise an update to every other tool. Quote sync does not supply historical player results or a DFS platform’s complete payout rules.', 'A failed market sync keeps saved prices. Compare the last successful sync time with the price’s observed time: a recent attempt is not the same as fresh underlying data.'] },
          { heading: 'Retry without losing work', paragraphs: ['If a save notice shows pending changes, download or successfully sync them before clearing browser storage or replacing a workspace. Then retry the relevant refresh control.', 'If the problem continues, report the page URL, selections, observed time, and exact message. Do not include account secrets. A screenshot can help you retain context, but the connected support form currently accepts a written description and reference.'], links: [{ label: 'Report a data problem', href: '/support#new-report' }] }
        ], related: ['save-sync-and-change-devices', 'market-data-sources-and-demo', 'report-a-problem']
      },
      {
        slug: 'service-notices-and-alert-preferences', title: 'Find service notices and understand alert preferences',
        summary: 'Know which information appears in the app and which settings do not provide automatic delivery.',
        sections: [
          { heading: 'Read current service notices', paragraphs: ['Support & notices displays currently published customer notices. A scheduled notice appears once its publication window starts; an expired or archived notice no longer appears on the next read. An already open page needs a refresh to retrieve the latest list.', 'Use Load more notices when it is offered. The absence of a notice is not a guarantee that every data provider or tool is available.'], links: [{ label: 'Service notices', href: '/support#notices' }] },
          { heading: 'Manage saved preferences', steps: ['Open Research & preferences in Account settings.', 'Review saved alert preferences, important product updates, and optional promotional consent.', 'Select Save preferences and wait for the result.'], paragraphs: ['These choices store your preferences. Automated alert delivery is not connected simply because a checkbox is enabled. Security and billing messages are separate from these preferences.'], links: [{ label: 'Research and email preferences', href: '/account#workspace' }] },
          { heading: 'Distinguish browser alerts from messages', paragraphs: ['Market price and movement rules can evaluate saved quotes in the open browser after a sync or local change. They do not establish a background email, push, or Discord delivery service.', 'Support report status updates are read in My reports. No support email notification is sent by the current report workflow. Return to that page and use Refresh reports to check progress.'], links: [{ label: 'My reports', href: '/support#reports' }] }
        ], related: ['report-a-problem', 'market-data-sources-and-demo', 'market-filters-and-saved-views']
      },
      {
        slug: 'use-the-calculation-tools', title: 'Use a calculator without changing your records',
        summary: 'Enter prices and assumptions, inspect a result, and keep calculations distinct from booked tickets.',
        sections: [
          { heading: 'Pick the calculation you need', paragraphs: ['The calculator library includes tools for odds and implied probability, expected value, hold, and arbitrage or hedge comparisons. Each page explains its inputs and the meaning of the output. A calculator operates on the values you enter; it does not verify that a quoted price is currently available.', 'Use the stated odds format and units. A stake, a probability percentage, and decimal odds are different kinds of inputs. Read field labels before transferring a value from another screen.'], links: [{ label: 'Calculator library', href: '/betting-calculators' }, { label: 'Implied probability calculator', href: '/betting-calculators/implied-probability' }] },
          { heading: 'Change one input at a time', steps: ['Enter the values from the scenario you want to inspect.', 'Read any validation message before using the output.', 'Change one input to see how it affects the result.', 'Recheck all values when comparing the output with a different market or ticket.'], paragraphs: ['Probability-based tools use your probability assumption. They do not prove that estimate is accurate or promise a particular return. A result can change immediately when an input price changes.'] },
          { heading: 'Keep the result in context', paragraphs: ['Opening a calculator or changing its inputs does not place a wager or create a Bet Tracker record. If you want a personal record, add the ticket you actually booked to Bet Tracker with its actual odds and stake.', 'When a calculation seems wrong, include the tool, input values, units, and expected output in a support report.'], links: [{ label: 'Expected value calculator', href: '/betting-calculators/expected-value' }, { label: 'Report a calculator issue', href: '/support#new-report' }] }
        ], related: ['read-positive-ev-comparisons', 'log-a-bet-ticket', 'read-arbitrage-comparisons']
      },
      {
        slug: 'read-model-evidence', title: 'Read model evidence and historical statistics',
        summary: 'Tell a projection, historical rate, market probability, and simulation interval apart.',
        sections: [
          { heading: 'Identify the type of number', paragraphs: ['A historical statistic summarizes recorded games in the selected sample. A projection estimates production in the chosen market’s units. A model probability estimates a chance under model assumptions. A research rating is an ordering measure unless the view explicitly defines it otherwise.', 'Implied probability comes from a quoted price. A no-vig estimate adjusts market prices for margin. Neither label by itself means the app measured a model’s accuracy.'] },
          { heading: 'Open the supporting detail', steps: ['Check the sample count, date range, and any unavailable or stale markers.', 'Open the game log or source receipts offered by the view.', 'Use Model & evidence or Data & methodology to inspect the actual method and limitations.', 'Enable Dev mode when you need the additional inputs or formulas exposed by the research page.'], links: [{ label: 'Open Models', href: '/models' }, { label: 'Market workspace documentation', href: '/docs' }] },
          { heading: 'Treat simulation output as conditional', paragraphs: ['A simulation uses the inputs and assumptions selected for that run. Increasing the number of runs can reduce simulation noise, but it does not prove that the model represents the real event accurately.', 'A Monte Carlo interval is not the same as a validated prediction interval. Similarly, a difference in probability points is a comparison between estimates, not a guaranteed advantage. Keep the source context attached when saving or discussing a result.'] }
        ], related: ['your-first-research-session', 'filter-player-trends', 'read-positive-ev-comparisons']
      }
    ]
  },
  {
    id: 'account-and-billing', title: 'Account and billing', icon: 'account',
    description: 'Manage your profile, sign-in security, subscription access, and personal data.',
    articles: [
      {
        slug: 'change-profile-email-and-password', title: 'Change your profile, email, or password',
        summary: 'Update account details using the appropriate verification and security steps.',
        sections: [
          { heading: 'Update your display name', paragraphs: ['Open Profile in Account settings, edit Display name, and select Save profile. This changes how your account is labeled; it does not replace the email address you use to sign in.'], links: [{ label: 'Profile settings', href: '/account#profile' }] },
          { heading: 'Request a new email address', steps: ['Expand Change email address.', 'Enter the new address and select Verify a new address.', 'Confirm your current password when asked.', 'Follow the email approval and verification steps before trying the new address at sign-in.'], paragraphs: ['The current address remains active until the change completes. Read the messages sent during the process; submitting the form alone does not complete the change. If you see a verification error, return to your account to check its current status.'] },
          { heading: 'Change your password while signed in', paragraphs: ['In Security, expand Change password. Enter the current password, choose a new password between 15 and 128 characters, and confirm it. A successful change signs out your other sessions.', 'If you do not know the current password, use the password-reset flow instead. Changing or resetting a password does not remove an enabled authenticator.'], links: [{ label: 'Security settings', href: '/account#security' }, { label: 'Reset a forgotten password', href: '/forgot-password' }] }
        ], related: ['recover-sign-in-access', 'secure-account-and-sessions', 'create-and-verify-your-account']
      },
      {
        slug: 'secure-account-and-sessions', title: 'Set up two-step verification and review sessions',
        summary: 'Add an authenticator, preserve recovery codes, and sign out devices you no longer use.',
        sections: [
          { heading: 'Set up an authenticator', steps: ['Open Security in Account settings and select Set up authenticator.', 'Confirm your current password.', 'Add the displayed setup key to an authenticator app using time-based, six-digit codes with a 30-second interval.', 'Enter a current code and select Verify and enable.', 'Save the recovery codes somewhere private before closing the dialog.'], paragraphs: ['The setup is not finished until the verification step succeeds. The app clears the displayed setup key and recovery codes when the dialog closes.'], links: [{ label: 'Security settings', href: '/account#security' }] },
          { heading: 'Protect and replace recovery codes', paragraphs: ['Each recovery code can be used once. At the two-step sign-in screen, choose Use a recovery code instead when you need it. Never include a code or the authenticator setup key in a support report.', 'Replace recovery codes creates a new set and immediately invalidates the old set. A password reset does not remove two-step verification. If both the authenticator and codes are lost, follow the reviewed recovery contact in the Privacy Policy.'], links: [{ label: 'Privacy Policy and recovery contact', href: '/privacy' }] },
          { heading: 'Review active sessions', paragraphs: ['Security lists active sessions with their start and expiry times. Use Refresh to retrieve the current list. Sign out removes an individual other session; Sign out all devices requires password confirmation and signs out the current device too.', 'Staff accounts must retain authenticator protection. Session and MFA checks are enforced by the server, not just by the visible buttons.'] }
        ], related: ['recover-sign-in-access', 'change-profile-email-and-password', 'export-or-delete-account-data']
      },
      {
        slug: 'understand-plans-and-billing', title: 'Check your plan and manage billing',
        summary: 'Find your actual access, available checkout options, and the billing-management link.',
        sections: [
          { heading: 'Start with your account’s access summary', paragraphs: ['Plan & billing shows your current plan, access state, included features, and a relevant end or period date when available. The display names used by the account are Free, Basic, Pro, and Premium.', 'A manual access grant is different from a paid subscription. The account labels granted access and its expiry separately. A tool can redirect you to this section when your current features do not include it.'], links: [{ label: 'Plan and billing settings', href: '/account#subscription' }] },
          { heading: 'Use the options actually available', paragraphs: ['Available purchase buttons show the configured amount and billing interval. Review those values in the account and at checkout; do not assume a marketing preview is the live charge.', 'Checkout availability depends on the configured billing service and price records. The current Pro plan is not offered for purchase while its scope is under review. If online checkout is unavailable, your existing plan and access remain visible.'] },
          { heading: 'Open billing management', steps: ['Select Manage billing when it is shown for your account.', 'Confirm your password in the security check.', 'Review the subscription and payment options offered by the secure billing-provider page.', 'Return to Account settings and check the updated access state.'], paragraphs: ['Provider options depend on the subscription and billing configuration. If a charge or access state looks wrong, submit a Billing report with a description and reference, without card details. Saving a support report does not itself issue a refund.'], links: [{ label: 'Report a billing issue', href: '/support#new-report' }] }
        ], related: ['choose-your-workspace', 'report-a-problem', 'export-or-delete-account-data']
      },
      {
        slug: 'recover-sign-in-access', title: 'Recover sign-in access',
        summary: 'Reset a forgotten password, request verification again, or use an unused recovery code.',
        sections: [
          { heading: 'Reset a forgotten password', steps: ['Open Reset password and enter the email address used for your account.', 'Check the inbox and spam folder for a reset email.', 'Open the link, choose a new password between 15 and 128 characters, and confirm it.', 'After the successful reset message, sign in with the new password.'], paragraphs: ['The request message does not reveal whether an account exists for the address. If the reset link is missing, expired, or already used, request a new link rather than editing its URL.'], links: [{ label: 'Request a password reset', href: '/forgot-password' }, { label: 'Sign in', href: '/login' }] },
          { heading: 'Complete email verification', paragraphs: ['If sign-in says the email is not verified, use Request a verification email. Enter the intended address and use the latest message you receive. After completing verification, return to sign-in.', 'If the application reports that email delivery is unavailable, another attempt may not produce a message until the service is restored. Keep the exact error text when contacting support.'], links: [{ label: 'Request verification', href: '/verify-email' }] },
          { heading: 'Recover the second verification step', paragraphs: ['When prompted, enter the current six-digit authenticator code. If you cannot use the authenticator, select Use a recovery code instead and enter an unused saved code.', 'Resetting your password does not bypass two-step verification. If you have lost both the authenticator and recovery codes, use the support contact in the Privacy Policy for reviewed recovery. The signed-in support form cannot restore a session you cannot access.'], links: [{ label: 'Recovery contact', href: '/privacy' }] }
        ], related: ['secure-account-and-sessions', 'create-and-verify-your-account', 'change-profile-email-and-password']
      },
      {
        slug: 'export-or-delete-account-data', title: 'Export your data or request account deletion',
        summary: 'Download account records and understand the immediate effect of a deletion request.',
        sections: [
          { heading: 'Choose an export', paragraphs: ['Privacy & data offers Export bets for the bet records saved to your account and Export account data for a broader account download. The broader export requires a password security check.', 'Bet Tracker also offers a CSV of the visible ticket selection. That is useful for a filtered table, while the account exports are JSON files. Keep exports private when they contain personal details, research, or notes.'], steps: ['Resolve pending sync changes before downloading a saved-data copy.', 'Open Privacy & data and choose the appropriate export.', 'Complete the security check if requested.', 'Confirm that the file downloaded and store it somewhere you control.'], links: [{ label: 'Privacy and data settings', href: '/account#privacy' }] },
          { heading: 'Understand deletion before submitting', paragraphs: ['Request account deletion is a reviewed process. Submitting the request disables your account and signs out its sessions; it is not presented as instant deletion of every retained billing or security record.', 'Read the Privacy Policy and download any records you need before continuing. The form asks you to acknowledge the effect, type DELETE, and confirm your password.'], links: [{ label: 'Read the Privacy Policy', href: '/privacy' }] },
          { heading: 'Wait for the recorded confirmation', paragraphs: ['After a successful request, the account page states that the request was recorded and the account is disabled. If the request fails, read the error instead of assuming deletion completed.', 'Account deletion and provider subscription management are separate workflows in the interface. Review any active subscription in Plan & billing and use the provider’s management options when needed.'], links: [{ label: 'Plan and billing settings', href: '/account#subscription' }] }
        ], related: ['save-sync-and-change-devices', 'understand-plans-and-billing', 'tracker-performance-and-exports']
      }
    ]
  },
  {
    id: 'ev-and-odds', title: 'EV and odds', icon: 'ev',
    description: 'Compare recorded prices, inspect their sources, and understand the market workspace’s limits.',
    articles: [
      {
        slug: 'compare-prices-in-odds-screen', title: 'Compare prices in Odds Screen',
        summary: 'Read like-for-like markets across books and distinguish current prices from unavailable entries.',
        sections: [
          { heading: 'Find the market you mean', steps: ['Open Odds Screen from the market workspace.', 'Choose the sport and narrow the event or market controls.', 'Search by player, team, league, or market when needed.', 'Check the event, player, market period, side, and line before comparing the sportsbook columns.'], paragraphs: ['Different thresholds stay separate. A larger payout at a different line is not the same selection. Pregame and live entries also have different context.'], links: [{ label: 'Open Odds Screen', href: '/ev#odds' }] },
          { heading: 'Read the price format and freshness', paragraphs: ['The screen supports American and decimal price display. Your display choice changes the notation, not the underlying market. Inspect the observed time and any stale, suspended, or unavailable state before treating an entry as current.', 'A missing column price can mean the current records do not contain an eligible quote for that book and side. It does not mean the book offers a zero price. Best-price comparisons use the available records, not every possible sportsbook offer.'] },
          { heading: 'Check where the board came from', paragraphs: ['The screen can show saved manual entries, imported records, or connected feed quotes. Read the data badge and source message. When the odds feed has not synced yet, the board is empty rather than filled with sample prices.', 'Changing the sportsbook display or state selection only changes what the app shows. Confirm the actual market and availability with the operator before relying on a comparison.'], links: [{ label: 'Market feed documentation', href: '/docs#api-requirements' }] }
        ], related: ['market-data-sources-and-demo', 'market-filters-and-saved-views', 'read-positive-ev-comparisons']
      },
      {
        slug: 'read-positive-ev-comparisons', title: 'Read a positive EV comparison',
        summary: 'Understand the offered price, reference estimate, and assumptions behind an EV result.',
        sections: [
          { heading: 'Compare the offered price with its reference', paragraphs: ['A positive EV view compares an offered price with a fair-probability estimate derived from qualifying reference prices. The recorded event, market, period, side, and line need to match before prices are comparable.', 'The basic comparison averages no-vig estimates from other complete books. Pricing settings and detailed analysis in the expanded tools expose reference-book rules and methods. Read the method displayed for the view you are using rather than treating every fair-value label as an independent model forecast.'], links: [{ label: 'Positive EV workspace', href: '/ev#ev-pre' }] },
          { heading: 'Inspect the supporting prices', steps: ['Open a comparison and check the target price and observed time.', 'Review the listed reference books and any estimated-line label.', 'Check the selected sport, books, date range, and odds filters.', 'If a value is missing, inspect whether enough complete, qualifying reference data exists.'], paragraphs: ['Incomplete, stale, suspended, or nonmatching records can prevent a calculation. An empty list does not establish that no opportunities exist elsewhere; it means the current records and settings produced no qualifying rows.'] },
          { heading: 'Treat stake output as a calculation', paragraphs: ['Bankroll and multiplier controls affect the displayed stake estimate. They are inputs to a calculation, not balances held by VisualOdds or instructions sent to a sportsbook.', 'An EV percentage is conditional on the reference estimate and recorded price. It does not guarantee a result. Recheck the source and price if either changes; the software cannot verify acceptance of a wager.'], links: [{ label: 'Pricing and saved filters', href: '/ev#settings' }] }
        ], related: ['market-filters-and-saved-views', 'read-model-evidence', 'market-data-sources-and-demo']
      },
      {
        slug: 'read-arbitrage-comparisons', title: 'Read an arbitrage comparison and its calculator',
        summary: 'Inspect opposing prices, stake splits, and the assumptions that make the displayed calculation possible.',
        sections: [
          { heading: 'Check the two selections', paragraphs: ['The arbitrage view looks for opposing prices at different books in matching supported markets. Open a comparison and verify both events, sides, lines, periods, and recorded prices before inspecting the calculator.', 'A pair of prices from different settlement rules is not interchangeable merely because the event names look similar. The software’s matching and arithmetic do not confirm the operator’s final rules or acceptance.'], links: [{ label: 'Pregame arbitrage view', href: '/ev#arb-pre' }] },
          { heading: 'Use the calculator as a scenario', steps: ['Open the comparison’s calculator or the standalone arbitrage calculator.', 'Enter or review both prices and the total amount used by the calculation.', 'Inspect the split and the return shown for each outcome.', 'Recalculate if either input changes.'], paragraphs: ['The displayed split balances the modeled outcomes under the entered inputs. It does not reserve prices, place either side, or guarantee that both stakes can be accepted. A simulated or manual price remains an input even when the arithmetic is internally consistent.'], links: [{ label: 'Arbitrage calculator', href: '/betting-calculators/arbitrage-hedge-bet' }] },
          { heading: 'Troubleshoot an empty list', paragraphs: ['Check the sport, selected books, market filters, and pregame versus live mode. Add or sync eligible opposing prices when using your own workspace. Read freshness and source labels before assuming the list is current.', 'An empty list can also mean the odds feed has not synced yet. Opportunities appear once complete opposing prices are available.'] }
        ], related: ['market-data-sources-and-demo', 'use-the-calculation-tools', 'compare-prices-in-odds-screen']
      },
      {
        slug: 'market-data-sources-and-demo', title: 'Understand manual prices and quote sync',
        summary: 'Identify the source of a market record and know what a successful or failed sync changes.',
        sections: [
          { heading: 'Read the source label first', paragraphs: ['Add price creates a manual market entry. Import accepts a validated JSON workspace export. Connected API quotes come from the configured quote service and are labeled as feed prices.', 'Each quote keeps the time it was observed. Recheck an older observation before relying on it; a saved timestamp is not a live price.'], links: [{ label: 'Market workspace', href: '/ev' }] },
          { heading: 'Use Sync API and inspect the result', steps: ['In your own market workspace, select Sync API when the configured service is available.', 'Wait for the feed-status result.', 'Compare Last sync with Newest price observed.', 'Choose an auto-refresh interval only if you want the open workspace to make repeated update requests.'], paragraphs: ['The feed must return a complete valid quote snapshot. Failed or invalid responses keep saved prices. A failed refresh therefore does not mean an old visible price was observed again. The app excludes expired live records from relevant live calculations.'] },
          { heading: 'Understand what quote sync does not supply', paragraphs: ['Quote sync does not update every workspace dataset. Historical result research, DFS platform props and payout rules, and prediction-market information have their own requirements. Read the tool-specific coverage message.', 'Before importing a replacement workspace, export anything you need to preserve and resolve pending account changes. A JSON import is not the same as adding a single sportsbook quote.'], links: [{ label: 'Feed requirements', href: '/docs#api-requirements' }] }
        ], related: ['refresh-and-missing-data', 'compare-prices-in-odds-screen', 'service-notices-and-alert-preferences']
      },
      {
        slug: 'market-filters-and-saved-views', title: 'Filter the market workspace and save a view',
        summary: 'Narrow the displayed records, review pricing settings, and return to a saved configuration.',
        sections: [
          { heading: 'Start with display filters', paragraphs: ['The market workspace includes sport, market, search, and sportsbook controls. Some views also offer league, observed-date range, or maximum-odds filters. These narrow the recorded inputs visible to that view; they do not ask a sportsbook to offer a market.', 'Observed-date filters describe when prices were recorded. They are not automatically an event start-time filter. Read the control label before using it to find an upcoming game.'], steps: ['Choose the tool first, then select a sport and market.', 'Add a search or sportsbook restriction.', 'Review the result count and active filters.', 'Use Clear all or the view’s reset control if the list becomes unexpectedly empty.'], links: [{ label: 'Open market tools', href: '/ev' }] },
          { heading: 'Review pricing settings separately', paragraphs: ['Pricing & saved filters contains reference-book, weighting, and calculation settings used by the expanded tools. Changing those can change the comparison itself, while a search filter only narrows what you see.', 'Inspect any minimum-reference requirement, method label, or diagnostic before interpreting a changed result. Missing qualifying data should remain unavailable rather than being filled with an assumed probability.'], links: [{ label: 'Pricing and saved filters', href: '/ev#settings' }] },
          { heading: 'Save and reload a configuration', paragraphs: ['The saved-filter workflow captures its supported view context and settings so you can return to them. Give a preset a meaningful name, then check the active tool and controls after loading it.', 'A saved view does not freeze a live offer or guarantee that the same records will still qualify later. New quote data, expired entries, and account access can change the results. Saved browser alert rules also do not create external notification delivery.'] }
        ], related: ['read-positive-ev-comparisons', 'market-data-sources-and-demo', 'service-notices-and-alert-preferences']
      }
    ]
  }
];

export const HELP_ARTICLES = HELP_COLLECTIONS.flatMap(collection =>
  collection.articles.map(article => ({ ...article, collectionId: collection.id }))
);
