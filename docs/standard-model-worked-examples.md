# Reproducible worked-example and missingness tables

All examples use existing local data. Current code was called directly without downloading, capturing predictions, fitting or using simulation outputs. The JSON preserves full precision and all selected observations: [reports/standard-model-explanation.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/standard-model-explanation.json).

## Kyler Murray — pass_tds, 2025-09-07

ARI @ NO. `model.buildPlayers` with season 2025, week 1, rates from 2024. No current injury/availability/line/weather additions in this reconstruction. Target/future dates, later season-weeks, preseason, ineligible rosters and older appearances beyond the last five are excluded. This does not prove pregame publication.

|Game ID|Date|Attempts|Pass TD|Carries|Receptions|Targets|Rush yards|Receiving yards|
|---|---|---|---|---|---|---|---|---|
|2024_18_SF_ARI|2025-01-05|35|4|3|0|0|22|0|
|2024_17_ARI_LA|2024-12-28|48|1|4|0|0|32|0|
|2024_16_ARI_CAR|2024-12-22|32|1|8|0|0|63|0|
|2024_15_NE_ARI|2024-12-15|30|0|5|0|0|11|0|
|2024_14_SEA_ARI|2024-12-08|38|2|3|0|0|16|0|

|Bin|Sample opportunities|Old rate|New rate|Old expected total|New expected total|
|---|---|---|---|---|---|
|open|114|0.008287292817679558|0.00799160477881821|0.9447513812154695|0.911042944785276|
|fringe|38|0.04299825682742592|0.04114539894356408|1.633933759442185|1.5635251598554352|
|red_zone|23|0.19150080688542226|0.1797979797979798|4.404518558364712|4.135353535353535|
|goal_line|8|0.48303393213572854|0.44814814814814813|3.8642714570858283|3.585185185185185|

Expected-production total is divided by 5 appearances; debt subtracts observed sample production before dividing (debt is a sample total). Projected 2.169 → 2.039; debt 2.847 → 2.195. The ranking is 75.333 → 75.333.

|Factor|Scaled input /100|Effective weight|Score points|
|---|---|---|---|
|volume|100|0.5|50|
|baseline|53.333333333333336|0.3|16|
|matchup|46.666666666666664|0.2|9.333333333333334|

Exact input statistics: `{"rz_attempts_pg":6.2,"rz_pass_rate":0.544,"pass_tds_pg":1.6,"end_zone_acc":0.188,"opp_pass_tds_allowed_pg":1.4,"points_favored":6,"implied_total":25.25,"passtd_debt":2.195}`. Source functions: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs) `buildPlayers`, [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs) `ratingFromComponents`.

## Alvin Kamara — rec, 2025-09-07

ARI @ NO. `model.buildPlayers` with season 2025, week 1, rates from 2024. No current injury/availability/line/weather additions in this reconstruction. Target/future dates, later season-weeks, preseason, ineligible rosters and older appearances beyond the last five are excluded. This does not prove pregame publication.

|Game ID|Date|Attempts|Pass TD|Carries|Receptions|Targets|Rush yards|Receiving yards|
|---|---|---|---|---|---|---|---|---|
|2024_15_WAS_NO|2024-12-15|0|0|5|4|5|12|58|
|2024_14_NO_NYG|2024-12-08|0|0|17|5|5|44|35|
|2024_13_LA_NO|2024-12-01|0|0|23|4|6|112|7|
|2024_11_CLE_NO|2024-11-17|0|0|16|4|4|67|22|
|2024_10_ATL_NO|2024-11-10|0|0|17|5|6|55|54|

|Bin|Sample opportunities|Old rate|New rate|Old expected total|New expected total|
|---|---|---|---|---|---|
|short|11|0.7202530265023449|0.748159057437408|7.922783291525794|8.229749631811487|
|deep|3|0.3522514071294559|0.36403296170625304|1.0567542213883678|1.0920988851187592|
|behind|12|0.7902222222222223|0.8355263157894737|9.482666666666667|10.026315789473685|

Expected-production total is divided by 5 appearances; debt subtracts observed sample production before dividing (debt is a sample total). Projected 3.692 → 3.87; debt -3.538 → -2.652. The ranking is 41 → 41.

|Factor|Scaled input /100|Effective weight|Score points|
|---|---|---|---|
|volume|43.333333333333336|0.5|21.666666666666668|
|baseline|48.88888888888889|0.3|14.666666666666668|
|matchup|23.333333333333332|0.2|4.666666666666667|

Exact input statistics: `{"target_share":0.182,"targets_pg":5.2,"rec_pg":4.4,"catch_pct":0.846,"quick_share":0.885,"opp_rec_allowed_pg":4.2,"opp_catch_rate_allowed":0.84,"points_favored":-6,"implied_total":19.25,"reception_debt":-2.652,"ngs_separation":null}`. Source functions: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs) `buildPlayers`, [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs) `ratingFromComponents`.

## Josh Allen — pass_tds, 2026-09-27

LAC @ BUF. `model.buildPlayers` with season 2026, week 3, rates from 2025. No current injury/availability/line/weather additions in this reconstruction. Target/future dates, later season-weeks, preseason, ineligible rosters and older appearances beyond the last five are excluded. This does not prove pregame publication.

|Game ID|Date|Attempts|Pass TD|Carries|Receptions|Targets|Rush yards|Receiving yards|
|---|---|---|---|---|---|---|---|---|
|2026_02_DET_BUF|2026-09-17|31|3|14|0|0|69|0|
|2026_01_BUF_HOU|2026-09-13|29|2|6|0|0|23|0|
|2025_20_BUF_DEN|2026-01-17|39|3|12|0|0|66|0|
|2025_19_BUF_JAX|2026-01-11|35|1|11|0|0|33|0|
|2025_18_NYJ_BUF|2026-01-04|0|0|0|0|0|0|0|

|Bin|Sample opportunities|Old rate|New rate|Old expected total|New expected total|
|---|---|---|---|---|---|
|open|88|0.00600497555117097|0.005772719775688603|0.5284378485030453|0.507999340260597|
|fringe|24|0.050684532478881446|0.04823953423897976|1.2164287794931548|1.1577488217355143|
|red_zone|19|0.18995290423861852|0.17961405244928252|3.609105180533752|3.412666996536368|
|goal_line|3|0.5051124744376279|0.46254681647940077|1.5153374233128836|1.3876404494382024|

Expected-production total is divided by 5 appearances; debt subtracts observed sample production before dividing (debt is a sample total). Projected 1.374 → 1.293; debt -2.131 → -2.534. The ranking is 64 → 64.

|Factor|Scaled input /100|Effective weight|Score points|
|---|---|---|---|
|volume|73.33333333333334|0.5|36.66666666666667|
|baseline|60|0.3|17.999999999999996|
|matchup|46.666666666666664|0.2|9.333333333333334|

Exact input statistics: `{"rz_attempts_pg":4.4,"rz_pass_rate":0.47,"pass_tds_pg":1.8,"end_zone_acc":0.429,"opp_pass_tds_allowed_pg":1.4,"points_favored":7,"implied_total":28.75,"passtd_debt":-2.534}`. Source functions: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs) `buildPlayers`, [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs) `ratingFromComponents`.

## Justin Jefferson — rec, 2026-09-27

MIN @ TB. `model.buildPlayers` with season 2026, week 3, rates from 2025. No current injury/availability/line/weather additions in this reconstruction. Target/future dates, later season-weeks, preseason, ineligible rosters and older appearances beyond the last five are excluded. This does not prove pregame publication.

|Game ID|Date|Attempts|Pass TD|Carries|Receptions|Targets|Rush yards|Receiving yards|
|---|---|---|---|---|---|---|---|---|
|2026_02_MIN_CHI|2026-09-20|0|0|0|3|6|0|55|
|2026_01_GB_MIN|2026-09-13|0|0|0|8|9|0|92|
|2025_18_GB_MIN|2026-01-04|0|0|1|8|11|3|101|
|2025_17_DET_MIN|2025-12-25|0|0|0|4|5|0|30|
|2025_16_MIN_NYG|2025-12-21|0|0|0|6|8|0|85|

|Bin|Sample opportunities|Old rate|New rate|Old expected total|New expected total|
|---|---|---|---|---|---|
|deep|4|0.361652739090065|0.3738003838771593|1.44661095636026|1.4952015355086372|
|medium|10|0.5313850063532402|0.5559691571390588|5.313850063532401|5.559691571390588|
|short|17|0.7137923351158645|0.7426683667555349|12.134469696969695|12.625362234844093|
|behind|8|0.7669872789326714|0.8190854870775348|6.135898231461371|6.5526838966202785|

Expected-production total is divided by 5 appearances; debt subtracts observed sample production before dividing (debt is a sample total). Projected 5.006 → 5.247; debt -3.969 → -2.767. The ranking is 62.722 → 62.722.

|Factor|Scaled input /100|Effective weight|Score points|
|---|---|---|---|
|volume|65|0.5|32.5|
|baseline|64.44444444444444|0.3|19.333333333333332|
|matchup|54.44444444444445|0.2|10.888888888888891|

Exact input statistics: `{"target_share":0.358,"targets_pg":7.8,"rec_pg":5.8,"catch_pct":0.744,"quick_share":0.436,"opp_rec_allowed_pg":9.8,"opp_catch_rate_allowed":0.662,"points_favored":1.5,"implied_total":22,"reception_debt":-2.767,"ngs_separation":null}`. Source functions: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs) `buildPlayers`, [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs) `ratingFromComponents`.

## Saquon Barkley — any_td, 2026-09-28

PHI @ CHI. `model.buildPlayers` with season 2026, week 3, rates from 2025. No current injury/availability/line/weather additions in this reconstruction. Target/future dates, later season-weeks, preseason, ineligible rosters and older appearances beyond the last five are excluded. This does not prove pregame publication.

|Game ID|Date|Attempts|Pass TD|Carries|Receptions|Targets|Rush yards|Receiving yards|
|---|---|---|---|---|---|---|---|---|
|2026_02_PHI_TEN|2026-09-20|0|0|4|1|2|9|11|
|2026_01_WAS_PHI|2026-09-13|0|0|15|1|2|83|-3|
|2025_19_SF_PHI|2026-01-11|0|0|26|3|6|106|25|
|2025_17_PHI_BUF|2025-12-28|0|0|19|0|0|68|0|
|2025_16_PHI_WAS|2025-12-20|0|0|21|0|2|132|0|

Expected-production total is divided by 5 appearances; debt subtracts observed sample production before dividing (debt is a sample total). Projected 0.566 → 0.566; debt 1.831 → 1.831. The ranking is 56.41 → 56.41.

|Factor|Scaled input /100|Effective weight|Score points|
|---|---|---|---|
|implied_total_score|65.71428571428571|0.22000000000000003|14.457142857142857|
|rz_role|60.46511627906976|0.21|12.697674418604649|
|matchup_score|66.66666666666666|0.18000000000000002|12|
|volume|72|0.15|10.799999999999999|
|goal_line|40|0.09|3.5999999999999996|
|target_share|24.316109422492403|0.09|2.188449848024316|
|td_rate|11.11111111111111|0.06|0.6666666666666666|

Exact input statistics: `{"touches_pg":18,"rz_touch_share":0.302,"goal_line_carries_pg":0.8,"target_share_avg":0.085,"td_per_touch":0.011,"games_since_td":4,"snap_pct_avg":0.658,"points_favored":4.5,"implied_total":23,"opp_td_allowed_pg":1}`. Source functions: [lib/model.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/model.mjs) `buildPlayers`, [lib/rating.mjs](C:/Users/eturn/Desktop/nfl-anayltics-app/lib/rating.mjs) `ratingFromComponents`.

## Garrett Wilson — separate workload forecast, NYJ at DET, 2026-09-27

Saved local preview 2026-09-23T02:32:09.654Z. [data-independent/predictions/nfl-predictions/v1/preview/2026/03/rec_yds/2026-09-23-workload-opportunities-v4.1.json](C:/Users/eturn/Desktop/nfl-anayltics-app/data-independent/predictions/nfl-predictions/v1/preview/2026/03/rec_yds/2026-09-23-workload-opportunities-v4.1.json). Current `forecast` reproduces saved point and probabilities: true / true. Full saved-input replay: [reports/standard-model-direct-example.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/standard-model-direct-example.json). This is a pregame local snapshot, not a production record.

|Date|Game ID|Targets|Receiving yards|
|---|---|---|---|
|2026-09-20|2026_02_GB_NYJ|7|57|
|2026-09-13|2026_01_NYJ_TEN|7|79|
|2025-11-09|2025_10_CLE_NYJ|3|0|
|2025-10-12|2025_06_DEN_NYJ|8|13|
|2025-10-05|2025_05_DAL_NYJ|10|71|
|2025-09-29|2025_04_NYJ_MIA|8|82|
|2025-09-21|2025_03_NYJ_TB|13|84|
|2025-09-14|2025_02_BUF_NYJ|8|50|
|2025-09-07|2025_01_PIT_NYJ|9|95|

Last-three targets = 17/3 = 5.666666666666667. Nine-game efficiency = 531/73 = 7.273972602739726 yards/target. Base 41.2192 yards. Team targets 29.4 divided by recent matched team average (36+23+11)/3 = 23.3333333333 hits the 1.2 cap: workload rises from 5.6666666667 to 6.8, projection 49.4630. Saved teammate allocation adds 0.1061 targets: 6.9061 × 531/73 = 50.2348 after rounding. Context is disabled: applied change zero, shadow-only change +0.012511283998843407. Final 50.2348 yards; posted line 59.5; gap −9.2652. Historical matched errors 871 give over 0.3192 / under 0.6808, interval 11–100. Lean is null because team/injury adjustments lack separate calibration. Archive eligibility means usable saved quote/point, not a betting recommendation. Current UI renders this as approximately 50.2 yards.

## Shohei Ohtani — hits, LAD at SEA, 2025-09-28 (game 776139)

Latest eligible appearance in the fixed 2025 training/evaluation cache. This is a reconstructed base forecast with unavailable historical context, not proof of a displayed pregame forecast. Source [data-independent/mlb-training/2025.json](C:/Users/eturn/Desktop/nfl-anayltics-app/data-independent/mlb-training/2025.json); `forecastInputs` → `design` → `predictMean` → `attachMlbForecast`.

All 60 selected games (2025-07-20 through 2025-09-26), with all raw count fields, and excluded observations/reasons are in JSON `mlbExample.sample` and `excluded`. Target game, same-day rows, pitching-role rows, previous seasons, nonpositive/invalid PA and rows beyond the 100-day/60-appearance window do not enter the hits estimate.

|Date|Game ID|PA|Hits|
|---|---|---|---|
|2025-09-26|776168|4|0|
|2025-09-25|776185|5|1|
|2025-09-24|776193|5|1|
|2025-09-23|776213|4|0|
|2025-09-21|776227|4|1|
|2025-09-20|776233|5|1|
|2025-09-19|776256|4|1|
|2025-09-18|776271|4|2|
|2025-09-17|776280|4|1|
|2025-09-16|776297|5|2|
|2025-09-15|776311|5|1|
|2025-09-14|776325|6|1|
|2025-09-13|776328|6|3|
|2025-09-12|776350|5|0|
|2025-09-10|776380|5|1|
|2025-09-09|776389|4|1|
|2025-09-08|776408|4|1|
|2025-09-07|776427|5|2|
|2025-09-06|776443|5|1|
|2025-09-05|776454|4|0|
|2025-09-04|776461|4|0|
|2025-09-03|776479|5|2|
|2025-09-02|776496|5|3|
|2025-08-31|776509|4|1|
|2025-08-30|776523|4|0|
|2025-08-29|776534|4|1|
|2025-08-27|776562|5|1|
|2025-08-26|776574|5|1|
|2025-08-25|776594|4|0|
|2025-08-24|776603|5|1|
|2025-08-23|776617|4|0|
|2025-08-22|776636|4|0|
|2025-08-20|776660|3|1|
|2025-08-19|776671|6|1|
|2025-08-18|776693|4|2|
|2025-08-17|776697|4|1|
|2025-08-16|776717|4|1|
|2025-08-15|776727|4|0|
|2025-08-13|776752|5|1|
|2025-08-12|776763|5|1|
|2025-08-11|776779|4|1|
|2025-08-10|776788|6|2|
|2025-08-09|776808|5|2|
|2025-08-08|776823|5|3|
|2025-08-06|776839|4|1|
|2025-08-05|776858|5|2|
|2025-08-04|776870|4|1|
|2025-08-03|776889|5|2|
|2025-08-02|776901|4|1|
|2025-08-01|776918|5|2|
|2025-07-30|776941|5|0|
|2025-07-29|776963|5|0|
|2025-07-28|776967|5|1|
|2025-07-27|776983|5|2|
|2025-07-26|776998|4|1|
|2025-07-25|777012|5|1|
|2025-07-23|777022|5|1|
|2025-07-22|777039|5|1|
|2025-07-21|777051|4|1|
|2025-07-20|777070|4|1|

65 hits / 275 PA; recent five 3 hits / 22 PA. Prior rate 0.21792674620438116 hits/PA with 40 prior PA. Long rate=(65+40×prior)/(275+40)=0.23402244396246108. Recent rate=(3+40×prior)/(22+40)=0.18898499755121365. Recent workload 4.4 PA; long workload 4.583333333333333 PA; prior workload 3.767242628039317 PA; away=0; rest=2 days.

|Feature|Raw feature|Training center|Training scale|Standardized|Coefficient|Log contribution|
|---|---|---|---|---|---|---|
|Intercept|1|unavailable|unavailable|1|-0.18305310261575145|-0.18305310261575145|
|Long-term production rate|0.07125804539360633|0.014179988778409265|0.13680381460155655|0.4172256218252238|0.05670616529889665|0.023659265078156085|
|Recent rate change|-0.2137493912545714|-0.018217918839146995|0.14838080986660826|-1.3177679282867087|0.007082644936521855|-0.009333282344790752|
|Recent workload|0.15526120546465413|-0.006818129694606555|0.20285859341414733|0.7989769249181695|0.0371430847684501|0.02967646765027116|
|Long-term workload|0.19608319998490914|0.006687601602474703|0.1432293287576588|1.3223241358820303|0.12274594393969679|0.1623099242530837|
|Home game|0|0.49983947163215986|0.49999997423050774|-0.9996789947867599|-0.008839070338964021|0.008836232951305019|
|Days since previous appearance|0.2857142857142857|0.22342927906387322|0.20576144299638474|0.3027049467742449|-0.013114422230310318|-0.003969800483201059|

Sum log contributions=0.028125704489072686; exp(sum)=1.0285249665009983. Context inputs [0,0,0] add zero; workload and matchup factors stay 1 because evidence is unavailable. Final `forecast.point`=1.028525 hits, interval 0–2; no posted-line probability or lean. Frontend formatting gives approximately 1.03 hits; no claim this historical user screen was captured.

The separate profile uses 21 hits in 20 games and 3 in the last five: 0.6×1.05+0.4×0.6=0.87 hits; rating=0.87/1.6×100=54.375. The fitted forecast and profile are different numbers with different meanings.

## Kelsey Mitchell — points, MIN at IND, 2026-09-22 local / 2026-09-23 00:00 UTC

Archive [data-independent/predictions/sports-forecasts/v1/preview/wnba/wnba/2026-09-22/401857209/points/wnba-opportunities-v1-2026-09-22-21.json](C:/Users/eturn/Desktop/nfl-anayltics-app/data-independent/predictions/sports-forecasts/v1/preview/wnba/wnba/2026-09-22/401857209/points/wnba-opportunities-v1-2026-09-22-21.json). All 49 historical raw-source receipt hashes match their saved hashes. Reproduction uses current `predict`, the saved injury/availability and saved team-minute factor: point match true; probability match true. The complete candidate roster behind the original team-minute calculation was not independently reconstructed.

|Date UTC|Game ID|Points|Minutes|
|---|---|---|---|
|2026-09-20T20:00Z|401857203|22|35|
|2026-09-18T23:30Z|401857195|33|33|
|2026-08-28T23:30Z|401857181|34|31|
|2026-08-23T23:00Z|401857168|30|35|
|2026-08-22T23:00Z|401857164|25|33|
|2026-08-21T00:00Z|401857158|37|35|
|2026-08-18T23:00Z|401857153|29|24|
|2026-08-16T21:00Z|401857150|20|36|
|2026-08-14T23:30Z|401857143|23|36|
|2026-08-11T23:30Z|401857134|28|31|
|2026-08-08T19:30Z|401857126|27|36|
|2026-08-06T23:00Z|401857119|28|39|
|2026-08-02T17:00Z|401857107|37|35|
|2026-08-01T02:00Z|401857104|26|36|
|2026-07-29T01:30Z|401857094|28|35|
|2026-07-23T00:00Z|401857090|23|26|
|2026-07-19T00:00Z|401857077|33|30|
|2026-07-17T23:30Z|401857073|30|34|
|2026-07-16T00:00Z|401857070|20|35|
|2026-07-13T01:00Z|401857063|27|30|

Only last 20 positive-minute appearances in complete earlier games enter. Older personal games, DNPs, missing/noninteger counts and games at/after kickoff are excluded. Positional prior uses 496 guard appearances, 5240 points/10695 minutes = 0.4899485741000468 points/minute. Player totals: 560 points/665 minutes. Prior minutes=(665/20)×5=166.25. Stabilized rate=(560+166.25×prior)/(665+166.25)=0.7716739253463251. Recent five minutes total 167; base minutes=.6×(167/5)+.4×(665/20)=33.34. Base points=25.72760867104648. Saved team budget factor 202.6/213.7993984962406=0.9476172590988953; workload=31.59355941835717 minutes.

|Sequential effect|Exact change in points|
|---|---|
|Playing time|-1.3476826590204443|
|Production-rate adjustments|0|
|Opponent|-0.726646099812374|
|Pace|-0.2899546741854664|
|Venue|-0.13632809181660832|
|Rest|0|
|Weather|0|
|Power-play usage|0|
|Combined adjustment bounds|-3.552713678800501e-15|

Final 23.227 points, displayed approximately 23.23. Poisson distribution: over 25.5 = 0.3090889323889138, under = 0.6909110676110861, interval 17–29. No automatic lean. The research threshold 15.5 gives 0.9525676286336753 over; it is a different question from the posted 25.5. The shot-conversion rate 0.8242060559817366 is disabled research output and contributes zero. Counts and factors shown by the API may be rounded; use full-precision contributions to reconcile exactly.

## Score distributions by market and missingness

2025 weeks 1–22 plus 2026 week 3: 253 market/weekly boards, 42,382 player-market rows. These are `buildPlayers` rankings before live injury adjustments, current availability exclusions and UI filters. Rank percentile 0 is the top, 1 the bottom. Quantiles use the sorted element at floor((n−1)×p). Rows repeat players across weeks; they are not independent samples.

|Season / market / missing|Rows|Players|P10|Median|P90|Min|Max|Mean rank|Mean rank percentile|Top10|
|---|---|---|---|---|---|---|---|---|---|---|
|2025|any_td|complete|7008|579|18.644|31.514|49.514|8.337|89.213|187.35131278538813|0.47760578061172637|220|
|2025|any_td|td_rate|598|151|14.657|22.082|30.629|7.857|36.543|300.4464882943144|0.7614236967390332|0|
|2025|pass_yds|complete|1106|87|17.765|62.345|82.95|9.187|99.24|28.99276672694394|0.4999999999999998|211|
|2025|pass_tds|complete|1106|87|10.667|45.667|74|0|93.333|28.99276672694394|0.4999999999999998|211|
|2025|rush_yds|complete|3839|356|14.483|20.955|54.68|9.057|99.242|99.05418077624381|0.5|220|
|2025|rec|complete|5976|503|8.556|22.667|54.111|0.833|99.111|154.08232931726909|0.4999999999999973|220|
|2025|rush_attempts|complete|3839|356|16.875|24.951|65.301|11.694|98.677|99.05418077624381|0.5|220|
|2025|rec_yds|complete|5976|503|8.14|25.12|60.56|0.833|100|154.08232931726909|0.4999999999999973|220|
|2025|pass_attempts|complete|1106|87|19.088|76.244|92.721|12.8|99.76|28.99276672694394|0.4999999999999998|211|
|2025|pass_completions|complete|1106|87|17.411|61.518|82.029|10.857|97|28.99276672694394|0.4999999999999998|211|
|2025|pass_interceptions|complete|1106|87|11.604|49.5|72.417|0|92.583|28.99276672694394|0.4999999999999998|211|
|2025|rush_rec_yds|complete|7141|587|7.131|20.602|45.977|1.151|98.695|183.9089763338468|0.5000000000000001|220|
|2025|any_td|rz_role|4|3|16.209|30.429|32.604|16.209|37.047|219.75|0.5452024091832222|0|
|2025|any_td|rz_role,td_rate|1|1|17.257|17.257|17.257|17.257|17.257|354|0.926509186351706|0|
|2026|any_td|complete|433|433|18.182|30.849|46.603|12.303|84.006|222.26789838337183|0.4748238162733299|10|
|2026|any_td|td_rate|32|32|14.343|19.457|24.8|12.886|31.729|385.03125|0.8241013948497853|0|
|2026|any_td|rz_role|2|2|13.789|13.789|13.789|13.789|28.848|357.5|0.7650214592274678|0|
|2026|pass_yds|complete|69|69|22.37|60.056|81.44|16.2|92.399|35|0.5|10|
|2026|pass_tds|complete|69|69|13|42.333|66.333|2.667|90.667|35|0.5|10|
|2026|rush_yds|complete|239|239|13.865|21.566|49.663|11.889|93.333|120|0.5|10|
|2026|rec|complete|369|369|8.5|21.5|49.278|0.833|90.889|185|0.5|10|
|2026|rush_attempts|complete|239|239|17.091|27.088|60.378|13.721|92.4|120|0.5|10|
|2026|rec_yds|complete|369|369|8.067|24.003|56.267|0.833|96.607|185|0.5|10|
|2026|pass_attempts|complete|69|69|30.523|73.767|90.911|16.3|96.5|35|0.5|10|
|2026|pass_completions|complete|69|69|26.029|58.164|77.529|14.473|92.2|35|0.5|10|
|2026|pass_interceptions|complete|69|69|16.75|51.75|71.833|2.667|83.75|35|0.5|10|
|2026|rush_rec_yds|complete|442|442|7.118|20.141|43.08|2.821|95.326|221.5|0.5000000000000001|10|

All 23 anytime-TD boards mix missingness patterns. The ten non-TD markets have complete components in this cache; real missing-pattern score comparability there remains untested. No missing-pattern cohort reached the top 10 in these TD boards; this is not a fairness or accuracy proof because role/position and sample-size differences are confounded. Per-row evidence: [reports/standard-model-missingness-rows.jsonl](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/standard-model-missingness-rows.jsonl).

## Negative rushing-efficiency priors in 2026 week 3

336 negative-rushing-yard weekly records exist in the loaded 2024–2026 files. Sixteen current same-team live priors have negative raw historical efficiency. Both old and new builders floor all sixteen to zero before `projectLiveProp` checks validity.

|Player|Target game|Appearances|Carries|Yards|Raw yards/carry|Old supplied rate|New supplied rate|Kneels in PBP|
|---|---|---|---|---|---|---|---|---|
|DJ Moore|2026_03_LAC_BUF|2|1|-1|-1|0|0|0|
|Adonai Mitchell|2026_03_NYJ_DET|10|1|-4|-4|0|0|0|
|Josh Downs|2026_03_HOU_IND|10|2|-2|-1|0|0|0|
|Anthony Richardson|2026_03_HOU_IND|2|4|-1|-0.25|0|0|3|
|Nick Mullens|2026_03_NE_JAX|5|15|-11|-0.7333333333333333|0|0|15|
|Parker Washington|2026_03_NE_JAX|10|3|-3|-1|0|0|0|
|Greg Dulcich|2026_03_KC_MIA|10|1|-7|-7|0|0|0|
|Jaxon Smith-Njigba|2026_03_SEA_WAS|10|1|-1|-1|0|0|0|
|Adrian Martinez|2026_03_ARI_SF|1|1|-1|-1|0|0|1|
|Kyle Juszczyk|2026_03_ARI_SF|10|1|-3|-3|0|0|0|
|Ricky Pearsall|2026_03_ARI_SF|10|2|-2|-1|0|0|0|
|Emeka Egbuka|2026_03_MIN_TB|10|1|-3|-3|0|0|0|
|Kirk Cousins|2026_03_LV_NO|2|9|-5|-0.5555555555555556|0|0|6|
|Malik Benson|2026_03_LV_NO|2|1|-8|-8|0|0|0|
|Colston Loveland|2026_03_PHI_CHI|10|1|-2|-2|0|0|0|
|Makai Lemon|2026_03_PHI_CHI|2|1|-5|-5|0|0|0|

Adonai Mitchell: `2025_15_NYJ_JAX`, play 1566, a non-kneel rush for −4 yards. Nick Mullens: five prior appearances, 15 kneels for −11 yards; efficiency −11/15. These are valid outcomes, not malformed counts. Neither reaches the new guard as a negative prior. The unchanged zero floor removes expected future negative yardage; recorded current negative yardage remains recorded. Its predictive merits require actual timestamped live-state evaluation. No durable live scoreboard/clock/box/player-status snapshot was available, so a real live final forecast is NOT VERIFIED.

## Complete NFL field dictionary

The weights table in the main explanation identifies which fields enter each rating. Everything else here is descriptive or a separate expected-production calculation; it must not be assumed to add score points. Missing source coverage remains unknown, except verified zero-stat appearances.

|Field|Definition from current source|
|---|---|
|receiving_ypg|nflverse weekly player stats: receiving yards ÷ sample appearances.|
|yards_per_target|nflverse weekly player stats: receiving yards ÷ targets in the same sample.|
|pass_attempt_share|nflverse weekly player stats: player passing attempts ÷ team passing attempts in the same sample games.|
|completions_pg|nflverse weekly player stats: passing completions ÷ sample appearances.|
|completion_pct|nflverse weekly player stats: completions ÷ passing attempts.|
|interceptions_pg|nflverse weekly player stats: passing interceptions thrown ÷ sample appearances.|
|interception_pct|nflverse weekly player stats: interceptions thrown ÷ passing attempts.|
|rush_rec_ypg|nflverse weekly player stats: (rushing yards + receiving yards) ÷ sample appearances. Passing yards are excluded.|
|opp_carries_allowed_pg|Opponent last five completed games: all opposing player carries ÷ games. Includes official kneel-down attempts.|
|opp_receiving_ypg_allowed|Opponent last five completed games: receiving yards allowed to this player’s position ÷ games.|
|opp_pass_attempts_allowed_pg|Opponent last five completed games: all opposing passing attempts ÷ games.|
|opp_completions_allowed_pg|Opponent last five completed games: completions by opposing passers ÷ games.|
|opp_interceptions_pg|Opponent last five completed games: interceptions thrown by opposing passers ÷ games.|
|opp_rush_rec_ypg_allowed|Opponent last five completed games: rushing + receiving yards allowed to this player’s position ÷ games.|
|touches_pg|nflverse weekly player stats: (carries + receptions) ÷ sampled games. Includes official kneel-down carries.|
|rz_touch_share|nflverse play-by-play: player's carries + targets inside the opponent 20 ÷ team carries + targets there in the same games. Excludes kneels, spikes, nullified plays and two-point tries.|
|goal_line_carries_pg|nflverse play-by-play: carries starting within 5 yards of the goal line ÷ sampled games; kneels excluded.|
|target_share_avg|nflverse weekly player stats: player targets ÷ team targets across the same sample.|
|target_share|nflverse weekly player stats: player targets ÷ team targets across the same sample.|
|td_per_touch|nflverse weekly player stats: (rushing TDs + receiving TDs) ÷ (carries + receptions). Passing TDs are not player scoring TDs.|
|games_since_td|Consecutive sample appearances without a rushing or receiving touchdown, capped at the five-game sample.|
|snap_pct_avg|Pro Football Reference snap counts via nflverse: average offensive snap percentage over available sample games. Missing snap games are omitted, not counted as zero.|
|implied_total|nflverse schedule: (game total + points favored) ÷ 2. Missing lines remain blank. Historical lines may be closing lines.|
|points_favored|nflverse schedule spread_line: positive means this team is favored. The home spread is positive for home favorites; negate for the away team.|
|opp_td_allowed_pg|Opponent last five completed games: rushing + receiving TDs allowed to this player’s position ÷ opponent games.|
|attempts_pg|nflverse weekly player stats: pass attempts ÷ sample games. Sacks excluded; official spikes included.|
|pass_ypg|nflverse weekly player stats: passing yards ÷ sample games.|
|ypa|nflverse weekly player stats: passing yards ÷ attempts.|
|adot|nflverse play-by-play: mean air_yards on this player's pass attempts with a recorded depth.|
|air_volume|nflverse play-by-play: summed recorded air_yards ÷ sample games.|
|sack_rate|nflverse weekly player stats: sacks suffered ÷ (attempts + sacks suffered).|
|opp_pass_ypg_allowed|Opponent last five completed games: total player passing yards allowed ÷ games.|
|opp_sack_rate_forced|Opponent last five completed games: sacks suffered by opposing passers ÷ their attempts plus sacks.|
|yardage_debt|Local model: sum prior-season league passing yards per non-spike attempt in each depth bin over sampled non-spike attempts, minus actual passing yards. Bins: behind line, 0–9, 10–19, 20+, unknown. Not an NFL NGS metric.|
|rz_pass_rate|nflverse play-by-play: team pass attempts inside the opponent 20 ÷ team passes plus modeled carries there; excludes sacks and kneels.|
|rz_attempts_pg|nflverse play-by-play: this player's pass attempts starting inside the opponent 20 ÷ sampled games. This is the volume component of the passing-TD rating.|
|pass_tds_pg|nflverse weekly player stats: passing touchdowns ÷ sample games.|
|end_zone_acc|nflverse play-by-play: completions ÷ attempts where air_yards reaches the starting yardline_100. Unknown depths are omitted.|
|opp_pass_tds_allowed_pg|Opponent last five completed games: passing TDs allowed ÷ games.|
|passtd_debt|Local model: prior-season league TD rates per non-spike pass attempt (including throwaways, excluding sacks) by starting field zone, applied to the same type of sampled attempts, minus actual passing TDs.|
|carry_share|nflverse weekly player stats: player carries ÷ team carries over the same sample; includes official kneels.|
|carries_pg|nflverse weekly player stats: carries ÷ sample games.|
|rush_ypg|nflverse weekly player stats: rushing yards ÷ sample games.|
|ypc|nflverse weekly player stats: rushing yards ÷ carries.|
|explosive_pct|nflverse play-by-play: modeled carries gaining at least 10 yards ÷ modeled carries (kneels excluded).|
|stuff_avoid_pct|nflverse play-by-play: modeled carries gaining more than zero yards ÷ modeled carries (kneels excluded).|
|opp_light_box_rate|FTN via nflverse: opponent defended carries with 1–6 box defenders ÷ defended carries with recorded box count in the opponent sample. Only charted carries count; usually prior-season games during the current season. See charted-carry count. Zero/unknown defenders are excluded.|
|opp_charted_carries|Number of non-kneel opponent-sample carries with recorded positive box counts used by the light-box rate. Current-season free participation charting is unavailable until the postseason ends.|
|opp_ypc_allowed|Opponent last five completed games: opponent rushing yards ÷ carries, including official kneels.|
|rush_debt|NFL Next Gen Stats via nflverse: negative of summed rush_yards_over_expected across matched published sample games. Positive means fewer yards than the NFL tracking model expected. Uses the published RYOE field, since its tracked attempts may differ from all rush_yards. Missing games are excluded; see NGS game count.|
|rush_baseline_gap|Local model: prior-season league mean rushing yards by field zone applied to sampled non-kneel carries, minus yards on those carries. Separate from NFL NGS.|
|ngs_rush_over_expected|NFL Next Gen Stats: sum rush_yards_over_expected across matched published sample games. Positive means more yards than the tracking model expected.|
|ngs_rush_games|Number of sample games with published NGS rushing expectations. Zero means no published data; no estimate is substituted.|
|ngs_time_to_throw|NFL Next Gen Stats: average time to throw in seconds, weighted by attempts across matched published sample weeks.|
|ngs_separation|NFL Next Gen Stats: average separation in yards, weighted by targets across matched published sample weeks.|
|targets_pg|nflverse weekly player stats: targets ÷ sample games.|
|rec_pg|nflverse weekly player stats: receptions ÷ sample games.|
|catch_pct|nflverse weekly player stats: receptions ÷ targets.|
|quick_share|nflverse play-by-play: targets with air_yards ≤5 ÷ targets with recorded air_yards. This measures shallow depth, not time to throw.|
|opp_rec_allowed_pg|Opponent last five completed games: receptions allowed to this player’s position ÷ games.|
|opp_catch_rate_allowed|Opponent last five completed games: receptions ÷ targets allowed to this player’s position.|
|reception_debt|Local model: prior-season league completions per assigned target by target-depth bin applied to sampled targets, minus receptions. Positive does not guarantee future regression.|

## Recent MLB saved example — Luke Keaschall, MIN at SF, 2026-09-21 local

[data-independent/predictions/paper/v1/preview/mlb/2026-09-21/hits/2026-09-21-22.json](C:/Users/eturn/Desktop/nfl-anayltics-app/data-independent/predictions/paper/v1/preview/mlb/2026-09-21/hits/2026-09-21-22.json). Player identity comes from the cached MLB person record: Luke Keaschall. Full-precision inputs and receipt hashes: [reports/standard-model-recent-mlb-example.json](C:/Users/eturn/Desktop/nfl-anayltics-app/reports/standard-model-recent-mlb-example.json).

Reproduces archived base regression plus its saved opponent/weather correction with current functions. Archive predates opportunity v2.1; not a full current-serving replay of unarchived matchup/lineup scenarios. All relevant raw receipt hashes match: true. Point matches: true; probability matches: true.

|Date|Game ID|PA|Hits|
|---|---|---|---|
|2026-07-08|823684|5|1|
|2026-07-09|823683|3|0|
|2026-07-10|823685|4|0|
|2026-07-11|823682|3|1|
|2026-07-12|823681|3|2|
|2026-07-17|824655|4|2|
|2026-07-18|824657|3|1|
|2026-07-19|824653|4|1|
|2026-07-21|824409|4|0|
|2026-07-22|824408|5|1|
|2026-07-23|824406|5|1|
|2026-07-24|823680|4|0|
|2026-07-26|823678|4|0|
|2026-07-28|823676|4|1|
|2026-07-29|823677|3|1|
|2026-07-30|823674|3|0|
|2026-07-31|823111|4|2|
|2026-08-01|823109|4|1|
|2026-08-02|823107|4|2|
|2026-08-04|824084|4|1|
|2026-08-06|824080|5|1|
|2026-08-07|823750|5|1|
|2026-08-08|823752|4|2|
|2026-08-09|823751|4|0|
|2026-08-10|823675|5|1|
|2026-08-11|823673|4|1|
|2026-08-12|823672|4|0|
|2026-08-13|823669|4|2|
|2026-08-15|823671|4|2|
|2026-08-16|823670|4|0|
|2026-08-17|823668|5|2|
|2026-08-18|823667|4|2|
|2026-08-19|823664|5|2|
|2026-08-21|823262|4|1|
|2026-08-22|823261|5|2|
|2026-08-23|823258|4|1|
|2026-08-24|824964|6|2|
|2026-08-25|824962|4|0|
|2026-08-26|824963|5|0|
|2026-08-28|823666|5|2|
|2026-08-29|823665|4|1|
|2026-08-30|823662|4|2|
|2026-08-31|823663|4|2|
|2026-09-01|823661|5|2|
|2026-09-02|823660|6|1|
|2026-09-04|824554|5|0|
|2026-09-05|824553|5|2|
|2026-09-06|824552|3|0|
|2026-09-07|824229|5|1|
|2026-09-08|824228|4|1|
|2026-09-09|824226|4|0|
|2026-09-11|823659|4|0|
|2026-09-12|823657|4|1|
|2026-09-13|823658|4|2|
|2026-09-14|823656|5|0|
|2026-09-15|823654|4|3|
|2026-09-16|823655|6|3|
|2026-09-17|823978|5|1|
|2026-09-18|823977|4|1|
|2026-09-19|823976|5|1|

Input totals and stabilized rates: `{"longRate":0.2515726257514318,"recentRate":0.2768292163777382,"recentWorkload":4.8,"longWorkload":4.283333333333333,"priorRate":0.21792674620438116,"priorExposure":40,"observedTotal":66,"observedExposure":257,"restDays":2,"home":false,"firstDate":"2026-07-08","lastDate":"2026-09-19","exposureUnit":"plate appearances"}`. The target game and same-day/future games are excluded; same-season, last100days, last60 eligible appearances are used.

|Feature|Raw value|Standardized value|Coefficient|Log contribution|
|---|---|---|---|---|
|intercept|1|1|-0.18305310261575145|-0.18305310261575145|
|long rate|0.14357273850298044|0.9458270597309715|0.05670616529889665|0.05363422559327387|
|recent rate change|0.09566905043398352|0.7675316597578413|0.007082644936521855|0.00543615422360409|
|recent workload|0.24227258245428385|1.2279031810121919|0.0371430847684501|0.045608111939785374|
|long workload|0.12838818721355774|0.8496903997713906|0.12274594393969679|0.10429605017643766|
|home|0|-0.9996789947867599|-0.008839070338964021|0.008836232951305019|
|rest|0.2857142857142857|0.3027049467742449|-0.013114422230310318|-0.003969800483201059|

Base mean=1.0312667199141998. Context vector=[0.04665623415263109, -0.31000000000000016, 0.9400000000000001]; exact applied changes=[0.007387707835231741, -0.01576311403220443, -0.02181780658860882]. Final=1.0010735071286183, returned 1.001074 hits; saved over0.5=0.632515, under=0.367485. Saved version mlb-context-v2. The current MLB numeric projection formatter would display 1; shared narrative also displays 1 hit. This is not an integer promise: the full mean is 1.001074. It is a local archived forecast, not verified production output.
