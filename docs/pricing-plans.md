# Current pricing display and stable billing mapping

The owner approved these monthly display amounts: **Basic $14.99, Pro $24.99, Premium $49.99, and Premium Max $99.99**. The pricing layout has three cards: Basic, Pro, and a third card that switches between Premium and Premium Max. These updated names and monthly amounts supersede the earlier illustrative pricing copy; they do not rewrite existing subscription records or create provider prices.

| Current display | Approved monthly display | Stable plan ID | Existing Stripe price variable prefix | Current access/purchase behavior |
| --- | ---: | --- | --- | --- |
| Free | Free | `free` | None | Verified account, personal tracker, saved data/filters |
| Basic | $14.99 | `premium` | `STRIPE_PRICE_PREMIUM_` | Existing research, trends, models and simulation access; checkout requires an active configured provider price |
| Pro | $24.99 | `premium_plus` | `STRIPE_PRICE_PREMIUM_PLUS_` | Existing research entitlement retained; new checkout remains disabled while its distinct feature scope is reviewed |
| Premium | $49.99 | `pro` | `STRIPE_PRICE_PRO_` | Existing complete research and EV/odds workspace entitlement; checkout requires an active configured provider price |
| Premium Max | $99.99 | None | None | Presentation-only variant; unavailable until its feature scope, authorization and provider configuration are defined; not eligible for an administrative grant |

The legacy IDs, entitlement ranks, feature permissions, subscription rows and `STRIPE_PRICE_*` environment variable names are unchanged. In particular, the ID `pro` now displays **Premium**, while the display name **Pro** uses `premium_plus`. Account labels, staff grant labels and billing/trial notices use the current names. Existing audit records and older implementation reports retain their historical terminology.

The `previewMonthly` field retains its existing API name for compatibility and now contains the approved monthly display amount. Checkout still selects an allowlisted configured Stripe Price ID and obtains its actual amount from Stripe. Configure the approved monthly Price IDs before enabling purchase; changing display copy does not mutate a Stripe price, migrate an existing customer, or change a recurring charge. Preserve any existing customer agreement during an explicit billing migration.

No annual amounts or discount were approved by the monthly-price instruction. Do not derive an annual offer with the old illustrative multiplier or invent a percentage saving. An annual option requires separately approved pricing and a configured annual Stripe Price; otherwise leave it unavailable.

No new paid features, automated alerts, Founder plan, self-service trial, or Premium Max entitlement are implied by this display change. Operations and credentials remain documented in [account-operations.md](account-operations.md); apply the current-name mapping above when reading its earlier naming references.
