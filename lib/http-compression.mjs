import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
const compress=promisify(gzip);

export function acceptsGzip(value='') {
 const encodings=new Map(String(value).toLowerCase().split(',').map(part=>{
  const [name,...params]=part.trim().split(';');
  const quality=params.find(item=>item.trim().startsWith('q='));
  return [name,quality===undefined?1:Number(quality.trim().slice(2))];
 }));
 return (encodings.get('gzip')??encodings.get('*')??0)>0;
}
export function publicCompressionPath(url='') {
 const path=url.split('?')[0];
 return /\.(?:css|js)$/.test(path)||/^\/api\/(?:board|catalog|landing\/research|(?:mlb|sports)\/(?:board|catalog)|(?:nfl|mlb|nba|wnba)\/live|simulation\/(?:catalog|run|props))$/.test(path);
}

// Only public code/styles and public research responses are compressed. Account,
// session, admin and user data responses never enter this path. Compression is
// asynchronous so concurrent live requests do not block the main event loop.
export async function sendPublicResponse(req,res,body,{status=200,headers={}}={}) {
 let output=Buffer.isBuffer(body)?body:Buffer.from(String(body));
 const eligible=req.method!=='HEAD'&&status===200&&output.length>=1024&&publicCompressionPath(req.url)&&!res.hasHeader('Content-Encoding')&&!headers['Content-Encoding'];
 if(eligible){
  headers={...headers,Vary:[headers.Vary||res.getHeader('Vary'),'Accept-Encoding'].filter(Boolean).join(', ')};
  if(acceptsGzip(req.headers['accept-encoding'])){
   try{const encoded=await compress(output,{level:6});if(encoded.length<output.length){output=encoded;headers['Content-Encoding']='gzip';}}catch{/* Serve the original response if compression is unavailable. */}
  }
 }
 if(res.destroyed)return;
 res.writeHead(status,{...headers,'Content-Length':output.length});
 res.end(req.method==='HEAD'?undefined:output);
}
