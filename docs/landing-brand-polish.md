# Homepage league strip and visual polish

The public homepage keeps Sportslab's black, blue and cyan identity and the compact interactive demo. This pass replaces the generic sport symbols with real league artwork, standardizes the landing page's type with self-hosted Inter, simplifies section surfaces, and tightens navigation, supporting copy and the closing action.

## League strip

- A continuous 38-second loop links to each sport's research workspace.
- Hover pauses movement. The Pause/Play control switches between animation and a manually scrollable list.
- Keyboard focus temporarily uses the static list and scrolls the focused link into view. Only the six original links are tab stops; the visual duplicate is excluded from the accessibility tree.
- Reduced motion disables the animation and duplicate. Without JavaScript the original list remains scrollable.
- Failed images leave the visible league name and usable link in place.
- Soccer uses the Premier League mark and explicit label, matching the existing default `eng.1` competition.

## Asset provenance

League artwork was checked against the league records in ESPN's public scoreboard responses on September 23, 2026. Images are stored locally so the homepage does not depend on runtime image requests to ESPN. They identify the supported leagues; they do not indicate an endorsement.

| File | Source |
| --- | --- |
| `public/assets/leagues/nfl.png` | https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png |
| `public/assets/leagues/nba.png` | https://a.espncdn.com/i/teamlogos/leagues/500/nba.png |
| `public/assets/leagues/wnba.png` | https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png |
| `public/assets/leagues/mlb.png` | https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png |
| `public/assets/leagues/nhl.png` | https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png |
| `public/assets/leagues/premier.png` | https://a.espncdn.com/i/leaguelogos/soccer/500-dark/23.png |

Inter 4.1 is from https://rsms.me/inter/font-files/InterVariable.woff2?v=4.1. Its SIL Open Font License is included at `public/assets/fonts/Inter-LICENSE.txt`. The font is scoped to the public landing page. The server exposes only the named assets, with the WOFF2 MIME type.

## Browser review

Reviewed the real https://www.outlier.bet/ homepage for typography, navigation, product presentation and section rhythm. Sportslab retains its own branding, wording, research tools and sample fixtures.

The implementation was checked at 1440×900, 1280×800, 768×1024, 390×844 and 360×800. Research demo height remains 693px on desktop. Verification covered loop continuity, hover, Pause/Play, keyboard navigation, reduced motion, image failure, mobile horizontal scrolling, font loading, and the existing demo's filters, dragging, notes, saves, pagination and 36 player/stat combinations. These checks do not exercise real-data model calculations.

The focused `test/landing-assets.test.mjs` regression verifies image signatures, font signature/MIME, license availability, and rejection of unknown asset paths.
