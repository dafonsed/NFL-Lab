// Decorative jersey art for the DFS comparison only. No roster or image lookup is implied.
const palettes = {
  NFL: {
    ARI:['Arizona','AZ','#97233f','#ffb612'], ATL:['Atlanta','ATL','#a71930','#a5acaf'], BAL:['Baltimore','BAL','#241773','#9e7c0c'], BUF:['Buffalo','BUF','#00338d','#c60c30'], CAR:['Carolina','CAR','#0085ca','#101820'], CHI:['Chicago','CHI','#0b162a','#c83803'], CIN:['Cincinnati','CIN','#fb4f14','#101820'], CLE:['Cleveland','CLE','#311d00','#ff3c00'], DAL:['Dallas','DAL','#003594','#869397'], DEN:['Denver','DEN','#fb4f14','#002244'], DET:['Detroit','DET','#0076b6','#b0b7bc'], GB:['Green Bay','GB','#203731','#ffb612'], HOU:['Houston','HOU','#03202f','#a71930'], IND:['Indianapolis','IND','#002c5f','#a2aaad'], JAX:['Jacksonville','JAX','#006778','#d7a22a'], KC:['Kansas City','KC','#e31837','#ffb81c'], LAC:['Los Angeles Chargers','LAC','#0080c6','#ffc20e'], LAR:['Los Angeles Rams','LAR','#003594','#ffa300'], LV:['Las Vegas','LV','#000000','#a5acaf'], MIA:['Miami','MIA','#008e97','#fc4c02'], MIN:['Minnesota','MIN','#4f2683','#ffc62f'], NE:['New England','NE','#002244','#c60c30'], NO:['New Orleans','NO','#101820','#d3bc8d'], NYG:['New York Giants','NYG','#0b2265','#a71930'], NYJ:['New York Jets','NYJ','#125740','#ffffff'], PHI:['Philadelphia','PHI','#004c54','#a5acaf'], PIT:['Pittsburgh','PIT','#101820','#ffb612'], SEA:['Seattle','SEA','#002244','#69be28'], SF:['San Francisco','SF','#aa0000','#b3995d'], TB:['Tampa Bay','TB','#d50a0a','#ff7900'], TEN:['Tennessee','TEN','#0c2340','#4b92db'], WSH:['Washington','WSH','#5a1414','#ffb612']
  },
  NBA: {
    ATL:['Atlanta','ATL','#c8102e','#fdb927'], BOS:['Boston','BOS','#007a33','#ba9653'], BKN:['Brooklyn','BKN','#151515','#ffffff'], CHA:['Charlotte','CHA','#1d1160','#00788c'], CHI:['Chicago','CHI','#ce1141','#0b0b0b'], CLE:['Cleveland','CLE','#860038','#fdbb30'], DAL:['Dallas','DAL','#00538c','#b8c4ca'], DEN:['Denver','DEN','#0e2240','#fec524'], DET:['Detroit','DET','#c8102e','#1d42ba'], GSW:['Golden State','GSW','#1d428a','#ffc72c'], HOU:['Houston','HOU','#ce1141','#c4ced4'], IND:['Indiana','IND','#002d62','#fdbb30'], LAC:['LA Clippers','LAC','#c8102e','#1d428a'], LAL:['LA Lakers','LAL','#552583','#fdb927'], MEM:['Memphis','MEM','#5d76a9','#f5b112'], MIA:['Miami','MIA','#98002e','#f9a01b'], MIL:['Milwaukee','MIL','#00471b','#eee1c6'], MIN:['Minnesota','MIN','#0c2340','#9ea2a2'], NOP:['New Orleans','NOP','#0c2340','#c8102e'], NYK:['New York Knicks','NYK','#006bb6','#f58426'], OKC:['Oklahoma City','OKC','#007ac1','#ef3b24'], ORL:['Orlando','ORL','#0077c0','#c4ced4'], PHI:['Philadelphia','PHI','#006bb6','#ed174c'], PHX:['Phoenix','PHX','#1d1160','#e56020'], POR:['Portland','POR','#e03a3e','#000000'], SAC:['Sacramento','SAC','#5a2d81','#63727a'], SAS:['San Antonio','SAS','#000000','#c4ced4'], TOR:['Toronto','TOR','#ce1141','#000000'], UTA:['Utah','UTA','#1d1160','#f9a01b'], WSH:['Washington','WSH','#002b5c','#e31837']
  },
  WNBA: {
    ATL:['Atlanta','ATL','#e03a3e','#ffffff'], CHI:['Chicago','CHI','#5091cd','#fdd502'], CON:['Connecticut','CON','#f05023','#0a2240'], DAL:['Dallas','DAL','#c4d600','#00529b'], GSV:['Golden State','GSV','#8a8d8f','#000000'], IND:['Indiana','IND','#002d62','#fdbb30'], LVA:['Las Vegas','LVA','#c4ced4','#000000'], LAS:['Los Angeles','LAS','#702f8a','#ffc72c'], MIN:['Minnesota','MIN','#266092','#79bde9'], NYL:['New York','NYL','#6eceb2','#000000'], PHX:['Phoenix','PHX','#e56020','#5c2f92'], SEA:['Seattle','SEA','#2c5234','#f2a900'], WAS:['Washington','WAS','#002b5c','#e31837']
  },
  MLB: {
    ARI:['Arizona','ARI','#a71930','#e3d4ad'], ATL:['Atlanta','ATL','#ce1141','#13274f'], BAL:['Baltimore','BAL','#df4601','#000000'], BOS:['Boston','BOS','#bd3039','#0c2340'], CHC:['Chicago Cubs','CHC','#0e3386','#cc3433'], CWS:['Chicago White Sox','CWS','#27251f','#c4ced4'], CIN:['Cincinnati','CIN','#c6011f','#000000'], CLE:['Cleveland','CLE','#0c2340','#e31937'], COL:['Colorado','COL','#333366','#c4ced4'], DET:['Detroit','DET','#0c2340','#fa4616'], HOU:['Houston','HOU','#002d62','#eb6e1f'], KC:['Kansas City','KC','#004687','#bd9b60'], LAA:['LA Angels','LAA','#ba0021','#003263'], LAD:['LA Dodgers','LAD','#005a9c','#ef3e42'], MIA:['Miami','MIA','#00a3e0','#ef3340'], MIL:['Milwaukee','MIL','#12284b','#ffc52f'], MIN:['Minnesota','MIN','#002b5c','#d31145'], NYM:['New York Mets','NYM','#002d72','#ff5910'], NYY:['New York Yankees','NYY','#0c2340','#c4ced4'], ATH:['Athletics','ATH','#003831','#efb21e'], PHI:['Philadelphia','PHI','#e81828','#002d72'], PIT:['Pittsburgh','PIT','#27251f','#fdb827'], SD:['San Diego','SD','#2f241d','#ffc425'], SF:['San Francisco','SF','#fd5a1e','#27251f'], SEA:['Seattle','SEA','#0c2c56','#005c5c'], STL:['St. Louis','STL','#c41e3a','#0c2340'], TB:['Tampa Bay','TB','#092c5c','#8fbce6'], TEX:['Texas','TEX','#003278','#c0111f'], TOR:['Toronto','TOR','#134a8e','#e8291c'], WSH:['Washington','WSH','#ab0003','#14225a']
  }
};

const defaults = { NFL:['NFL','#193c46','#56b7c2'], NBA:['NBA','#303865','#eaac5a'], WNBA:['WNBA','#59365b','#f49b57'], MLB:['MLB','#294965','#e17b62'], NHL:['NHL','#263e56','#a4cde4'], Soccer:['FC','#194d43','#b9dc9e'] };
const aliases = {NFL:{AZ:'ARI',JAC:'JAX',LA:'LAR',WAS:'WSH'}, NBA:{NY:'NYK',GS:'GSW',NO:'NOP',PHO:'PHX',SA:'SAS',UTAH:'UTA'}, MLB:{AZ:'ARI',CHW:'CWS',OAK:'ATH',SDP:'SD',SFG:'SF',TBR:'TB',WSN:'WSH'}};
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const clean = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');

export function jerseyIdentity({sport,team} = {}) {
  const league = String(sport || 'NFL').toUpperCase() === 'SOCCER' ? 'Soccer' : String(sport || 'NFL').toUpperCase();
  const raw = String(team || '').trim();
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const records = palettes[league] || {};
  const code = aliases[league]?.[key] || key;
  const normalizedNames = [clean(raw), clean(raw.replace(/^Los Angeles\s+/i, 'LA '))];
  const match = records[code] || Object.entries(records).find(([,row]) => normalizedNames.some(name => name === clean(row[0]) || name.startsWith(clean(row[0]))))?.[1];
  if (match) return {name:match[0],label:match[1],primary:match[2],trim:match[3],known:true};
  const [label,primary,trim] = defaults[league] || defaults.NFL;
  return {name:raw || label,label:raw ? raw.replace(/[^a-z0-9]/gi,'').slice(0,4).toUpperCase() || label : label,primary,trim,known:false};
}

export function renderDfsJersey(record) {
  const sport = String(record?.sport || 'NFL').toUpperCase();
  const team = jerseyIdentity(record);
  const number = /^\d{1,2}$/.test(String(record?.jerseyNumber ?? '')) ? String(record.jerseyNumber) : '';
  const badge = escape(team.label.slice(0,4));
  const primary = team.primary, trim = team.trim;
  const sleeveless = sport === 'NBA' || sport === 'WNBA';
  const body = sleeveless
    ? `<path d="M35 15 48 10Q60 22 72 10l13 5-7 25 2 59H40l2-59Z" fill="${primary}" stroke="${trim}" stroke-width="2"/><path d="m35 15 7 5-6 24m49-29-7 5 6 24" fill="none" stroke="${trim}" stroke-width="5"/>`
    : `<path d="m35 14 13-5Q60 19 72 9l13 5 25 21-15 18-11-8-3 54H39l-3-54-11 8-15-18Z" fill="${primary}" stroke="${trim}" stroke-width="2"/><path d="m11 36 15 16m83-16L94 52" stroke="${trim}" stroke-width="6"/><path d="m37 44 2 55m44-55-2 55" stroke="#000" stroke-opacity=".18" stroke-width="4"/>`;
  return `<span class="ev-dfs-jersey" aria-hidden="true" style="--jersey-primary:${primary};--jersey-trim:${trim}"><svg viewBox="0 0 120 110" focusable="false" role="presentation" xmlns="http://www.w3.org/2000/svg"><ellipse cx="60" cy="102" rx="39" ry="5" fill="#000" opacity=".25"/>${body}<path d="M48 10Q60 27 72 10" fill="none" stroke="${trim}" stroke-width="6"/><path d="M48 10Q60 23 72 10" fill="none" stroke="#071013" stroke-opacity=".75" stroke-width="3"/><path d="M39 34h42" stroke="${trim}" stroke-opacity=".48" stroke-width="2"/><path d="M40 19 48 13m32 6-8-6" stroke="#fff" stroke-opacity=".17" stroke-width="4"/><path d="M42 30 47 94" stroke="#fff" stroke-opacity=".08" stroke-width="8"/><path d="M76 29 74 95" stroke="#000" stroke-opacity=".18" stroke-width="12"/><text x="60" y="43" text-anchor="middle" fill="${trim}" font-family="Arial,sans-serif" font-size="8" font-weight="800" letter-spacing="1">${badge}</text><text x="60" y="76" text-anchor="middle" fill="#fff" stroke="${trim}" stroke-width=".7" paint-order="stroke" font-family="Arial,sans-serif" font-size="31" font-weight="900">${escape(number || '·')}</text>${sport === 'MLB' ? '<path d="M60 22v75" stroke="#fff" stroke-opacity=".38" stroke-width="1.5"/>' : ''}</svg></span>`;
}
