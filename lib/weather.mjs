import { numeric } from './context-model.mjs';
export const WEATHER_DOCS='https://open-meteo.com/en/docs';
export function roofState(roof,condition=''){
  if(/closed|dome|indoor/i.test(roof+' '+condition))return 'indoor';
  if(/retract/i.test(roof))return 'unknown';
  return /open|outdoor/i.test(roof)?'outdoor':'unknown';
}
export function observedWeather({roof,condition='',temperatureF,windMph,sourceUrl}){
  const state=roofState(roof,condition),temp=numeric(temperatureF),wind=numeric(windMph);
  return {status:state==='indoor'?'available':state==='outdoor'&&temp!==null&&wind!==null?'available':'unavailable',indoor:state==='indoor',roof:state,temperatureF:temp,windMph:wind,sourceUrl,basis:'historical observation',note:state==='unknown'?'Roof status unknown; outdoor effects withheld.':'Historical observed conditions; not a saved pregame weather forecast.'};
}
export function selectWeather(payload,kickoff){
  const start=Date.parse(kickoff),times=payload?.hourly?.time||[];
  const candidates=times.map((t,i)=>({i,time:typeof t==='number'?t*1000:Date.parse(t+'Z')})).filter(t=>Number.isFinite(t.time)).sort((a,b)=>Math.abs(a.time-start)-Math.abs(b.time-start));
  const best=candidates[0];if(!best||Math.abs(best.time-start)>3600000)return null;
  const temperatureF=numeric(payload.hourly.temperature_2m?.[best.i]),windMph=numeric(payload.hourly.wind_speed_10m?.[best.i]);
  if(temperatureF===null||windMph===null||temperatureF< -70||temperatureF>140||windMph<0||windMph>160)return null;
  return {temperatureF,windMph,validAt:new Date(best.time).toISOString()};
}
const states={AZ:'Arizona',CA:'California',CO:'Colorado',DC:'District of Columbia',FL:'Florida',GA:'Georgia',IL:'Illinois',IN:'Indiana',LA:'Louisiana',MA:'Massachusetts',MD:'Maryland',MI:'Michigan',MN:'Minnesota',MO:'Missouri',NC:'North Carolina',NJ:'New Jersey',NV:'Nevada',NY:'New York',OH:'Ohio',PA:'Pennsylvania',TN:'Tennessee',TX:'Texas',WA:'Washington',WI:'Wisconsin'};
export class WeatherStore {
  constructor({fetcher=fetch,now=()=>Date.now()}={}){this.fetcher=fetcher;this.now=now;this.cache=new Map();}
  async json(url,ttl=900000){const old=this.cache.get(url);if(old&&this.now()-old.at<ttl)return old.promise;const promise=(async()=>{const r=await this.fetcher(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Weather input unavailable');return r.json();})();this.cache.set(url,{at:this.now(),promise});if(this.cache.size>300)this.cache.delete(this.cache.keys().next().value);return promise;}
  async forecast({kickoff,roof,latitude,longitude,sourceUrl,location}){
    const state=roofState(roof),base={roof:state,sourceUrl:sourceUrl||WEATHER_DOCS,basis:'pregame forecast',checkedAt:new Date(this.now()).toISOString(),location};
    if(state==='indoor')return {...base,status:'available',indoor:true,note:'Published closed/indoor roof; outdoor weather has zero effect.'};
    if(state!=='outdoor')return {...base,status:'unavailable',note:'Roof status is unknown; outdoor effects withheld.'};
    if(numeric(latitude)===null||numeric(longitude)===null||Date.parse(kickoff)<=this.now()||Date.parse(kickoff)>this.now()+15*86400000)return {...base,status:'unavailable',note:'No usable pregame weather forecast for this location and time.'};
    const url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude,longitude,hourly:'temperature_2m,wind_speed_10m',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timeformat:'unixtime',timezone:'UTC',forecast_days:'16'});
    try{const values=selectWeather(await this.json(url),kickoff);if(!values)throw Error('Missing weather hour');return {...base,...values,sourceUrl:url,status:'available',indoor:false,note:'Forecast nearest scheduled start. Historical model fitting used observed weather; prospective performance is tracked separately.'};}
    catch{return {...base,sourceUrl:url,status:'unavailable',note:'Weather lookup failed; no numerical weather adjustment applied.'};}
  }
  async nfl(game,kickoff){
    const sourceUrl='https://github.com/nflverse/nflverse-data/releases/tag/schedules';
    if(Date.parse(kickoff)<=this.now())return observedWeather({roof:game.roof,temperatureF:game.temp,windMph:game.wind,sourceUrl});
    if(roofState(game.roof)!=='outdoor')return this.forecast({kickoff,roof:game.roof,sourceUrl});
    try{
      const venueSource=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.espn}`;
      const venue=(await this.json(venueSource,86400000)).gameInfo?.venue,address=venue?.address;
      if(!address?.city||address.country!=='USA'||!states[address.state])throw Error('Unverified venue location');
      const geocodeUrl='https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:address.city,count:'20',countryCode:'US',language:'en',format:'json'});
      const matches=((await this.json(geocodeUrl,86400000)).results||[]).filter(r=>r.country_code==='US'&&r.admin1===states[address.state]&&r.name.toLowerCase()===address.city.toLowerCase());
      if(matches.length!==1)throw Error('Ambiguous stadium city');
      const result=await this.forecast({kickoff,roof:game.roof,...matches[0],location:`${venue.fullName} area · ${address.city}, ${address.state}`});
      return {...result,venueSource,geocodeUrl};
    }catch{return {status:'unavailable',sourceUrl,basis:'pregame forecast',note:'Stadium-area location could not be verified; no weather adjustment applied.'};}
  }
  async mlb(game){
    const venue=game.venueInfo,roof=venue?.fieldInfo?.roofType,sourceUrl=game.scheduleSource;
    if(Date.parse(game.startTime)<=this.now())return observedWeather({roof,condition:game.weather?.condition,temperatureF:game.weather?.temp,windMph:game.weather?.wind?.match(/^\d+(?:\.\d+)?/)?.[0],sourceUrl});
    return this.forecast({kickoff:game.startTime,roof,...venue?.location?.defaultCoordinates,sourceUrl,location:game.venue});
  }
}
