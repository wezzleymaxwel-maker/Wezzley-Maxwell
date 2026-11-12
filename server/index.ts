import {GAME_VERSION,GAME_BUILD,PROTOCOL_VERSION} from '../src/release';
import {createServer} from 'node:http';import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomInt,timingSafeEqual} from 'node:crypto';import {Room,cleanName} from './room';
const rooms=new Map<string,Room>(),limits=new Map<string,{count:number;until:number}>(),dataDir=process.env.CAATINGA_DATA_DIR||'.online-data',originList=new Set((process.env.CAATINGA_ORIGINS||'https://wezzleymaxwel-maker.github.io,http://localhost:5174,http://127.0.0.1:5174').split(',').map(s=>s.trim()));
if(dataDir){await mkdir(dataDir,{recursive:true});try{const saved=JSON.parse(await readFile(join(dataDir,'rooms.json'),'utf8'));for(const data of saved){try{const r=Room.restore(data);if(Date.now()-r.updatedAt<86400000)rooms.set(r.code,r);}catch{}}}catch{}}
let dirty=false,savePromise:Promise<void>|null=null;
function persist():Promise<void>{
 if(savePromise)return savePromise;if(!dataDir||!dirty)return Promise.resolve();dirty=false;
 savePromise=(async()=>{try{const file=join(dataDir,'rooms.json');await writeFile(file+'.tmp',JSON.stringify([...rooms.values()].map(r=>r.dump())),{mode:0o600});await rename(file+'.tmp',file);}catch(e){dirty=true;console.error('Não foi possível salvar as salas:',e instanceof Error?e.message:'erro');}finally{savePromise=null;}})();return savePromise;
}
let shuttingDown=false;
async function shutdown(){if(shuttingDown)return;shuttingDown=true;clearInterval(timer);if(savePromise)await savePromise;dirty=true;await persist();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),2000).unref();}

const server=createServer(async(req,res)=>{const origin=req.headers.origin;if(origin&&originList.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');
 const reply=(status:number,data:unknown)=>{res.statusCode=status;res.end(JSON.stringify({...data as object,serverVersion:GAME_VERSION,serverBuild:GAME_BUILD,protocol:PROTOCOL_VERSION}));};
 if(shuttingDown)return reply(503,{ok:false,error:'O anfitrião está encerrando o servidor.'});
 if(origin&&!originList.has(origin))return reply(403,{ok:false,error:'Origem não autorizada.'});
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.statusCode=204;return res.end();}
 if(req.method==='POST'&&req.url==='/host/stop'){const secret=process.env.CAATINGA_CONTROL_TOKEN,received=req.headers.authorization,expected=secret?'Bearer '+secret:'';if(!secret||typeof received!=='string'||Buffer.byteLength(received)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return reply(403,{ok:false,error:'Acesso reservado ao iniciador.'});reply(200,{ok:true});void shutdown();return;}
 if(req.method==='GET'&&req.url==='/health')return reply(200,{ok:true,game:'CAATINGA',protocol:PROTOCOL_VERSION});
 if(req.method!=='POST'||req.url!=='/api')return reply(404,{ok:false,error:'Não encontrado.'});
 const ip=req.socket.remoteAddress||'unknown',now=Date.now(),limit=limits.get(ip);if(!limit||limit.until<now)limits.set(ip,{count:1,until:now+60000});else if(++limit.count>600)return reply(429,{ok:false,error:'Muitas solicitações. Aguarde um instante.'});
 try{req.setEncoding('utf8');let size=0,body='';for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>8192){reply(413,{ok:false,error:'Solicitação grande demais.'});req.destroy();return;}body+=chunk;}const a=JSON.parse(body);if(!a||typeof a!=='object')throw Error('Solicitação inválida.');
 if(a.protocol!==PROTOCOL_VERSION)throw Error('Versão incompatível. Atualize o jogo e o pacote do servidor antes de entrar na sala.');
 if(a.type==='create'){if(rooms.size>=500)throw Error('O servidor está cheio. Tente mais tarde.');const name=cleanName(a.name);let code='';do{code=Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');}while(rooms.has(code));const room=new Room(code,undefined,a.options),member=room.join(name);rooms.set(code,room);dirty=true;return reply(200,{ok:true,session:{code,token:member.token},view:room.view(member.seat)});}
 const room=typeof a.code==='string'?rooms.get(a.code.toUpperCase()):null;if(!room)throw Error('Sala não encontrada. Confira o código.');
 if(a.type==='join'){const member=room.join(a.name);dirty=true;return reply(200,{ok:true,session:{code:room.code,token:member.token},view:room.view(member.seat)});}
 const p=room.authenticate(a.token);
 switch(a.type){case 'poll':case 'resume':break;case 'start':room.start(p);dirty=true;break;case 'action':room.command(p,a.command,a.version,a.requestId);dirty=true;break;case 'leave':room.leave(p);dirty=true;return reply(200,{ok:true});default:throw Error('Solicitação inválida.');}
 return reply(200,{ok:true,view:room.view(p)});
 }catch(e){return reply(400,{ok:false,error:e instanceof SyntaxError?'Solicitação inválida.':e instanceof Error?e.message:'Não foi possível realizar a ação.'});}});
const timer=setInterval(()=>{for(const [code,room]of rooms){if(Date.now()-room.updatedAt>86400000){rooms.delete(code);dirty=true;continue;}const version=room.version;try{room.tick();}catch(e){console.error('Erro no turno automático:',e instanceof Error?e.message:'erro');}if(room.version!==version)dirty=true;}for(const [ip,l]of limits)if(l.until<Date.now())limits.delete(ip);void persist();},700);timer.unref();
const port=Number(process.env.PORT||8787);server.listen(port,process.env.CAATINGA_HOST||'0.0.0.0',()=>console.log(`CAATINGA online na porta ${port}`));for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void shutdown();});
