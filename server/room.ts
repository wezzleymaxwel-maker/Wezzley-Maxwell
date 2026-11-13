import {PLAYER_COLORS} from '../src/player-colors';
import {GAME_VERSION,GAME_BUILD,PROTOCOL_VERSION} from '../src/release';
import {createDevelopment} from '../src/development';
import {randomBytes,randomInt} from 'node:crypto';
import {newGame,upgradeSavedGame,build,rollDice,moveRobber,trade,endTurn,buyDevelopment,playDevelopment,finishFreeRoads,proposePlayerTrade,botStep,resources,points,publicPoints,validSave,playerNames,type GameOptions,type State,type Resource,type Wallet} from '../src/sertao-rules';
import type {OnlineCommand,OnlineView,OnlineEvent,TradeOffer} from '../src/online-protocol';
export const token=()=>randomBytes(24).toString('hex');const random=()=>randomInt(16777216)/16777216;
const wallet=(v:unknown):v is Wallet=>!!v&&typeof v==='object'&&resources.every(r=>Number.isInteger((v as Wallet)[r])&&(v as Wallet)[r]>=0&&(v as Wallet)[r]<=38)&&Object.keys(v).length===5;
const resource=(v:unknown):v is Resource=>resources.includes(v as Resource);
export function parseCommand(v:unknown):OnlineCommand{
 if(!v||typeof v!=='object')throw Error('Jogada inválida.');const a=v as Record<string,unknown>,id=Number.isInteger(a.id)&&Number(a.id)>=0&&Number(a.id)<300;
 switch(a.kind){case 'color':if(typeof a.color!=='number'||!PLAYER_COLORS.includes(a.color))throw Error('Cor inválida.');break;case 'roll':case 'end':case 'buy':case 'finish':break;
 case 'build':if(!id||!['road','settlement','city'].includes(String(a.build)))throw Error('Construção inválida.');break;
 case 'robber':if(!id||Number(a.id)>37)throw Error('Terreno inválido.');break;
 case 'bank':if(!resource(a.from)||!resource(a.to)||!Number.isInteger(a.amount)||Number(a.amount)<1||Number(a.amount)>38)throw Error('Troca inválida.');break;
 case 'play':if(!id||Number(a.id)>24||!(a.choice===undefined||resource(a.choice)||Array.isArray(a.choice)&&a.choice.length>=1&&a.choice.length<=2&&a.choice.every(resource)))throw Error('Carta inválida.');break;
 case 'offer':if(!Number.isInteger(a.to)||Number(a.to)<0||Number(a.to)>5||!wallet(a.give)||!wallet(a.take))throw Error('Proposta inválida.');break;
 case 'reply':if(typeof a.offerId!=='string'||a.offerId.length>60||typeof a.accept!=='boolean')throw Error('Resposta inválida.');break;
 default:throw Error('Jogada desconhecida.');}
 return a as OnlineCommand;
}
export interface Member{name:string;token:string;lastSeen:number}
export class Room{
 private recoveredAt=0;private awaySince=new Map<number,number>();
 colors=PLAYER_COLORS.slice(0,6);members:(Member|null)[];options:Required<GameOptions>;host=0;state:State|null=null;version=0;event:OnlineEvent|null=null;offer:TradeOffer|null=null;busyUntil=0;updatedAt=Date.now();private requests=new Map<string,Set<string>>();
 constructor(readonly code:string,private now=()=>Date.now(),options:GameOptions={},private rng:()=>number=random){const count=options?.players??3,mapSize=options?.mapSize??'classic';if(!Number.isInteger(count)||count<2||count>6||!['classic','double'].includes(mapSize))throw Error('Escolha de 2 a 6 jogadores e um mapa válido.');this.options={players:count,mapSize};this.members=Array.from({length:count},()=>null);}
 join(name:string){if(this.state)throw Error('Esta partida já começou.');const seat=this.members.findIndex(m=>!m);if(seat<0)throw Error('A sala está cheia.');const member={name:cleanName(name),token:token(),lastSeen:this.now()};this.members[seat]=member;if(this.host<0)this.host=seat;this.changed();return{seat,token:member.token};}
 authenticate(secret:unknown){if(typeof secret!=='string'||secret.length!==48)throw Error('Entre na sala novamente.');const seat=this.members.findIndex(m=>m?.token===secret);if(seat<0)throw Error('Sua sessão não foi encontrada.');this.members[seat]!.lastSeen=this.now();this.awaySince.delete(seat);return seat;}
 start(p:number){if(p!==this.host)throw Error('Somente quem criou a sala pode começar.');if(this.state)throw Error('A partida já começou.');if(this.members.filter(Boolean).length<2)throw Error('Aguarde pelo menos mais um jogador.');this.state=newGame(randomInt(4294967296),this.options);this.state.development=createDevelopment(0,this.members.length);const deck=this.state.development.deck;for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}this.changed('start');}
 leave(p:number){if(this.state){this.members[p]!.lastSeen=0;this.awaySince.set(p,this.now());if(this.offer&&(this.offer.from===p||this.offer.to===p))this.offer=null;this.changed();return;}this.members[p]=null;if(this.host===p)this.host=this.members.findIndex(Boolean);this.changed();}
 private changed(kind?:OnlineEvent['kind'],build?:'road'|'settlement'|'city'){this.version++;this.updatedAt=this.now();if(kind)this.event={id:this.version,at:this.now(),kind,build,dice:kind==='roll'?this.state!.dice!:undefined};}

 command(p:number,command:unknown,version:number,requestId:string){if(typeof requestId!=='string'||!/^[\w-]{8,80}$/.test(requestId))throw Error('Identificador de jogada inválido.');const secret=this.members[p]!.token,seen=this.requests.get(secret)??new Set<string>();if(seen.has(requestId))return;
 const a=parseCommand(command),s=this.state;if(a.kind==='color'){if(this.colors.some((c,i)=>i!==p&&i<this.members.length&&c===a.color))throw Error('Essa cor já está em uso.');this.colors[p]=a.color;this.changed();seen.add(requestId);if(seen.size>64)seen.delete(seen.values().next().value!);this.requests.set(secret,seen);return;}if(!s)throw Error('Aguarde o início da partida.');if(version!==this.version)throw Error('O tabuleiro mudou. Tente novamente.');if(this.now()<this.busyUntil)throw Error('Aguarde a animação da jogada.');if(s.winner!==null)throw Error('A partida terminou.');
 const next=structuredClone(s);let event:OnlineEvent['kind']='action',kind:undefined|'road'|'settlement'|'city';
 if(a.kind==='reply'){const o=this.offer;if(!o||o.id!==a.offerId||o.to!==p||o.expires<this.now()||s.current!==o.from||s.phase!=='build')throw Error('Esta proposta não está mais disponível.');if(a.accept){this.transfer(next,o);next.log.push('Troca entre jogadores concluída.');}else next.log.push('A proposta de troca foi recusada.');this.offer=null;}
 else{if(s.current!==p)throw Error('Aguarde a sua vez.');switch(a.kind){case 'color':if(typeof a.color!=='number'||!PLAYER_COLORS.includes(a.color))throw Error('Cor inválida.');break;
 case 'build':build(next,p,a.build,a.id);event='build';kind=a.build;break;
 case 'roll':rollDice(next,p,this.rng);event='roll';break;
 case 'robber':moveRobber(next,p,a.id,this.rng);break;
 case 'end':endTurn(next,p);this.offer=null;break;
 case 'bank':trade(next,p,a.from,a.to,a.amount);break;
 case 'buy':buyDevelopment(next,p);break;
 case 'play':playDevelopment(next,p,a.id,a.choice);break;
 case 'finish':finishFreeRoads(next,p);break;
 case 'offer':{if(s.phase!=='build'||a.to===p)throw Error('Você só pode negociar com outro jogador após os dados.');this.validateOffer(next,p,a.to,a.give,a.take);if(!this.members[a.to]||this.automatic(a.to)){const result=proposePlayerTrade(next,p,a.to,a.give,a.take);if(!result.accepted)next.log.push('O Tropeiro recusou a proposta.');}else{this.offer={id:token(),from:p,to:a.to,give:{...a.give},take:{...a.take},expires:this.now()+90000};}break;}
 }}
 if(this.offer){try{this.validateOffer(next,this.offer.from,this.offer.to,this.offer.give,this.offer.take);}catch{this.offer=null;}}
 next.log=next.log.slice(-50);if(!validSave(next))throw Error('Não foi possível validar a jogada.');this.state=next;this.changed(event,kind);if(event==='roll')this.busyUntil=this.now()+6500;if(event==='build')this.busyUntil=this.now()+3500;
 seen.add(requestId);if(seen.size>64)seen.delete(seen.values().next().value!);this.requests.set(secret,seen);
 }
 private validateOffer(s:State,from:number,to:number,give:Wallet,take:Wallet){if(!resources.some(r=>give[r])||!resources.some(r=>take[r])||resources.some(r=>give[r]&&take[r]||give[r]>s.players[from].cards[r]||take[r]>s.players[to].cards[r]))throw Error('A proposta precisa de recursos disponíveis dos dois lados.');}
 private transfer(s:State,o:TradeOffer){this.validateOffer(s,o.from,o.to,o.give,o.take);for(const r of resources){s.players[o.from].cards[r]+=o.take[r]-o.give[r];s.players[o.to].cards[r]+=o.give[r]-o.take[r];}}
 private automatic(p:number){const m=this.members[p];return !!m&&this.now()-Math.max(m.lastSeen,this.awaySince.get(p)??0,this.recoveredAt)>=90000;}
 tick(){if(!this.state||this.state.winner!==null||(this.members[this.state.current]&&!this.automatic(this.state.current))||this.now()<this.busyUntil)return;const before=this.state,next=structuredClone(before);botStep(next,this.rng);const built=Object.keys(next.roads).length>Object.keys(before.roads).length?'road':Object.entries(next.buildings).find(([id,b])=>!before.buildings[+id]||b.level>before.buildings[+id].level)?.[1].level===2?'city':Object.keys(next.buildings).length>Object.keys(before.buildings).length?'settlement':undefined;const kind=before.phase==='roll'?'roll':built?'build':'action';this.state=next;this.offer=null;this.changed(kind,built);this.busyUntil=this.now()+(kind==='roll'?6500:kind==='build'?3500:700);}
 view(p:number):OnlineView{const order=Array.from({length:this.members.length},(_,i)=>(p+i)%this.members.length),index=(n:number)=>order.indexOf(n),s=this.state?structuredClone(this.state):null;
 const totals=order.map(i=>this.state?resources.reduce((n,r)=>n+this.state!.players[i].cards[r],0):0),handCounts=order.map(i=>this.state?.development?.hands[i].length??0),scores=order.map(i=>this.state?publicPoints(this.state,i,p):0);
 if(s){const labels=playerNames;s.log=s.log.map(line=>line.replace(new RegExp(labels.join('|'),'g'),v=>this.members[labels.indexOf(v)]?.name??(labels.indexOf(v)===0?'Seu Chico':v)));s.onlineTurn=(s.round-1)*s.players.length+s.current;s.current=index(s.current);if(s.longestRoadOwner!=null)s.longestRoadOwner=index(s.longestRoadOwner);s.winner=s.winner===null?null:index(s.winner);s.players=order.map(i=>i===p?s.players[i]:{cards:{couro:0,lenha:0,barro:0,pedra:0,milho:0}});for(const b of Object.values(s.buildings))b.owner=index(b.owner);for(const id of Object.keys(s.roads))s.roads[+id]=index(s.roads[+id]);if(s.development){const d=s.development;d.hands=order.map(i=>i===p||s.phase==='finished'?d.hands[i]:[]);d.deck=d.deck.map(()=> 'knight');d.discard.forEach(c=>c.owner=index(c.owner));if(d.armyOwner!==null)d.armyOwner=index(d.armyOwner);if(d.freeRoads)d.freeRoads.owner=index(d.freeRoads.owner);}}
 const offer=this.offer&&(this.offer.to===p||this.offer.from===p)&&this.offer.expires>=this.now()?{...this.offer,from:index(this.offer.from),to:index(this.offer.to)}:null;
 return{serverVersion:GAME_VERSION,serverBuild:GAME_BUILD,protocol:PROTOCOL_VERSION,code:this.code,colors:order.map(i=>this.colors[i]),options:this.options,version:this.version,seat:p,host:this.host===p,started:!!s,members:order.map(i=>({name:this.members[i]?.name??(i===0?'Seu Chico':playerNames[i]),connected:!!this.members[i]&&this.now()-this.members[i]!.lastSeen<20000,bot:!this.members[i],automatic:this.automatic(i)})),state:s,totals,handCounts,scores,offer,event:this.event,busyUntil:this.busyUntil,serverTime:this.now()};}
 dump(){return{colors:this.colors,serverVersion:GAME_VERSION,serverBuild:GAME_BUILD,protocol:PROTOCOL_VERSION,code:this.code,options:this.options,members:this.members,host:this.host,state:this.state,version:this.version,event:this.event,offer:this.offer,busyUntil:this.busyUntil,updatedAt:this.updatedAt};}
 static restore(v:ReturnType<Room['dump']>,clock=()=>Date.now()){if(!/^[A-Z2-9]{6}$/.test(v.code)||v.state&&!validSave(v.state))throw Error('Sala salva inválida.');const r=new Room(v.code,clock,v.options??{players:v.members.length,mapSize:v.state?.mapSize??'classic'});Object.assign(r,structuredClone(v));r.recoveredAt=clock();if(r.state)upgradeSavedGame(r.state);r.members.forEach(m=>{if(m)m.lastSeen=0;});return r;}
}
export function cleanName(v:unknown){if(typeof v!=='string')throw Error('Digite seu nome.');const name=v.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24);if(name.length<2)throw Error('Use um nome com pelo menos 2 letras.');return name;}
