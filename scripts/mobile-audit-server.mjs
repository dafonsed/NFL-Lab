// Isolated localhost audit server, using the account project's explicit test
// runtime. No production database, mail, payments, or credentials are used.
process.env.NODE_ENV='test';
process.env.AUTO_SYNC='0';
process.env.PORT=process.env.MOBILE_AUDIT_PORT||'3201';
const origin=`http://127.0.0.1:${process.env.PORT}`;
const {authenticatedAccountFixture}=await import('../test/helpers/account-fixture.mjs');
const fixture=await authenticatedAccountFixture(origin);
const {writeFile}=await import('node:fs/promises');
const {tmpdir}=await import('node:os');
const {join}=await import('node:path');
const response=await fixture.system.auth.api.signInEmail({body:{email:'existing-customer@example.test',password:'Existing sports research passphrase 42'},asResponse:true,headers:new Headers({origin})});
if(!response.ok)throw Error('Local fixture session could not be created.');
const cookies=response.headers.getSetCookie().map(cookie=>{const pair=cookie.split(';')[0],split=pair.indexOf('=');return{name:pair.slice(0,split),value:pair.slice(split+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'};});
await writeFile(join(tmpdir(),`sportslab-mobile-audit-session-${process.env.PORT}.json`),JSON.stringify({cookies,origins:[]}));
const {server}=await import('../server.mjs');
process.on('SIGINT',()=>server.close(async()=>{await fixture.close();process.exit(0);}));
process.on('SIGTERM',()=>server.close(async()=>{await fixture.close();process.exit(0);}));
