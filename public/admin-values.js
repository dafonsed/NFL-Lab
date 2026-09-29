const durationUnits = new Map([['ms',1],['s',1000],['sec',1000],['second',1000],['seconds',1000],['min',60000],['minute',60000],['minutes',60000],['h',3600000],['hour',3600000],['hours',3600000],['d',86400000],['day',86400000],['days',86400000]]);
function valueForSort(value) {
  if (value == null || ['', '—', 'N/A'].includes(String(value).trim())) return { kind:'empty' };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind:'number', value };
  const text=String(value).trim();
  const number='(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
  const duration=new RegExp('^'+number+'\\s*(ms|s|sec|second|seconds|min|minute|minutes|h|hour|hours|d|day|days)(?:\\s+ago)?$','i').exec(text);
  if (duration) return {kind:'duration',value:Number(duration[1].replaceAll(',',''))*durationUnits.get(duration[2].toLowerCase())};
  const scalar=new RegExp('^([$€£]?)'+number+'(%)?$').exec(text);
  if (scalar) return {kind:scalar[1]?'currency:'+scalar[1]:scalar[3]?'percent':'number',value:Number(scalar[2].replaceAll(',',''))};
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text) && Number.isFinite(Date.parse(text))) return {kind:'date',value:Date.parse(text)};
  return {kind:'text',value:text};
}
/** Numeric columns keep their units; unavailable values always sort last. */
export function compareAdminValues(left,right,descending=false) {
  const a=valueForSort(left),b=valueForSort(right);
  if(a.kind==='empty'||b.kind==='empty')return a.kind===b.kind?0:a.kind==='empty'?1:-1;
  const comparison=a.kind===b.kind&&a.kind!=='text'?a.value-b.value:String(left).localeCompare(String(right),undefined,{numeric:true});
  return comparison*(descending?-1:1);
}
