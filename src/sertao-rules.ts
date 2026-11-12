import {createDevelopment,developmentCost,developmentInfo,developmentTurn,validateDevelopment,type DevelopmentCard,type DevelopmentState} from './development';
import { boardRows,rowLengths,type MapSize } from './layout';
import {createTradeStops} from './trade-stops';
export const resources = ['couro','lenha','barro','pedra','milho'] as const;
export type Resource = typeof resources[number];
export type Wallet = Record<Resource,number>;
export type Build = 'road'|'settlement'|'city';
export const costs: Record<Build, Partial<Wallet>> = {
 road:{lenha:1,barro:1}, settlement:{lenha:1,barro:1,couro:1,milho:1}, city:{pedra:3,milho:2},
};
export const names:Record<Resource,string>={couro:'Couro',lenha:'Lenha',barro:'Barro',pedra:'Pedra',milho:'Milho'};
export const terrainResource:Record<string,Resource|null>={pastagem:'couro',caatinga:'lenha',barreiro:'barro',serrote:'pedra',rocado:'milho','terra-seca':null};
export const TARGET=8;
export const setupOrder=[0,1,2,2,1,0];
export const setupFor=(s:{players:unknown[]})=>{const ids=s.players.map((_,i)=>i);return [...ids,...ids.slice().reverse()];};
export const bankCapacity=(s:{mapSize?:MapSize})=>s.mapSize==='double'?38:19;
export interface Tile {id:number;biome:string;resource:Resource|null;number:number|null;x:number;z:number;nodes:number[]}
export interface Node {id:number;x:number;z:number;tiles:number[];edges:number[]}
export interface Edge {id:number;a:number;b:number}
export function makeMap(rows:ReadonlyArray<ReadonlyArray<string>>=boardRows,numbers:ReadonlyArray<number>=[5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11]){
 const tiles:Tile[]=[],nodes:Node[]=[],edges:Edge[]=[],nodeKeys=new Map<string,number>(),edgeKeys=new Map<string,number>();
 let numberIndex=0;
 rows.forEach((row,r)=>row.forEach((biome,c)=>{
  const x=(c-(row.length-1)/2)*Math.sqrt(3)*2.66,z=(r-(rows.length-1)/2)*1.5*2.66;
  const tile:Tile={id:tiles.length,biome,resource:terrainResource[biome],number:biome==='terra-seca'?null:numbers[numberIndex++],x,z,nodes:[]};tiles.push(tile);
  for(let k=0;k<6;k++){
   const angle=Math.PI/6+k*Math.PI/3,nx=x+Math.cos(angle)*2.66,nz=z+Math.sin(angle)*2.66;
   // Quantize near-zero coordinates as well, avoiding -0.0000 duplicate vertices.
   const safeKey=`${Math.round(nx*10000)},${Math.round(nz*10000)}`;
   let id=nodeKeys.get(safeKey);if(id===undefined){id=nodes.length;nodeKeys.set(safeKey,id);nodes.push({id,x:nx,z:nz,tiles:[],edges:[]});}
   tile.nodes.push(id);nodes[id].tiles.push(tile.id);
  }
  for(let k=0;k<6;k++){
   const a=tile.nodes[k],b=tile.nodes[(k+1)%6],key=[a,b].sort((a,b)=>a-b).join('-');
   if(!edgeKeys.has(key)){const id=edges.length;edgeKeys.set(key,id);edges.push({id,a,b});nodes[a].edges.push(id);nodes[b].edges.push(id);}
  }
 }));
 return {tiles,nodes,edges};
}
export const map=makeMap();
export const tradeStops=createTradeStops(map);
export function accessibleStops(s:State,p:number){return stopsFor(s).filter(stop=>stop.nodes.some(id=>s.buildings[id]?.owner===p));}
export function tradeRate(s:State,p:number,resource:Resource):2|3|4{const stops=accessibleStops(s,p);return stops.some(stop=>stop.resource===resource)?2:stops.some(stop=>stop.resource===null)?3:4;}
export function tradingStop(s:State,p:number,resource:Resource){const rate=tradeRate(s,p,resource);return accessibleStops(s,p).find(stop=>rate===2?stop.resource===resource:rate===3&&stop.resource===null);}
// Persist the seed, rather than re-shuffling when a saved match is opened.
const boardCache=new Map<string,ReturnType<typeof makeMap>>();
const stopCache=new WeakMap<ReturnType<typeof makeMap>,ReturnType<typeof createTradeStops>>();
export function stopsFor(s:{boardSeed?:number|null;mapSize?:MapSize}){const board=boardFor(s);let stops=stopCache.get(board);if(!stops){stops=createTradeStops(board);stopCache.set(board,stops);}return stops;}
export function boardFor(s:{boardSeed?:number|null;mapSize?:MapSize}){
 if(s.boardSeed==null&&s.mapSize!=='double')return map; // Existing matches keep their original board.
 const seed=s.boardSeed??0,key=seed+':'+(s.mapSize??'classic');if(boardCache.has(key))return boardCache.get(key)!;
 let value=seed>>>0;
 const random=()=>{value=(value+0x6D2B79F5)>>>0;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 const shuffle=<T,>(items:T[])=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;};
 const biomes=shuffle(Array.from({length:s.mapSize==='double'?2:1},()=>boardRows.flat()).flat()),numbers=shuffle(Array.from({length:s.mapSize==='double'?2:1},()=>map.tiles.flatMap(t=>t.number===null?[]:[t.number])).flat());
 let offset=0;const rows=rowLengths(s.mapSize).map(length=>{const result=biomes.slice(offset,offset+length);offset+=length;return result;});
 const result=makeMap(rows,numbers);if(boardCache.size>=32)boardCache.delete(boardCache.keys().next().value!);boardCache.set(key,result);return result;
}
export type Phase='setup-house'|'setup-road'|'roll'|'build'|'robber'|'finished'|'free-roads';
export interface Building {owner:number;level:1|2}
export interface State {
 mapSize?:MapSize;onlineTurn?:number;development?:DevelopmentState;boardSeed?:number|null;version:1;current:number;round:number;phase:Phase;setupStep:number;lastNode:number|null;
 players:{cards:Wallet}[];bank:Wallet;buildings:Record<number,Building>;roads:Record<number,number>;
 robber:number;dice:[number,number]|null;winner:number|null;log:string[];
}
const wallet=(n=0):Wallet=>({couro:n,lenha:n,barro:n,pedra:n,milho:n});
export const playerNames=['Você','Dona Cícera','Seu Zé','Dona Lúcia','Seu Antônio','Dona Rosa'];
export interface GameOptions {players?:number;mapSize?:MapSize}
export function newGame(boardSeed:number|null=Math.floor(Math.random()*4294967296),options:GameOptions={}):State{const count=options.players??3;if(!Number.isInteger(count)||count<2||count>6)throw Error('Escolha de 2 a 6 jogadores.');const mapSize=options.mapSize??'classic';return{mapSize,development:createDevelopment(boardSeed??0,count),boardSeed,version:1,current:0,round:1,phase:'setup-house',setupStep:0,lastNode:null,players:Array.from({length:count},()=>({cards:wallet()})),bank:wallet(bankCapacity({mapSize})),buildings:{},roads:{},robber:boardFor({boardSeed,mapSize}).tiles.find(t=>!t.resource)!.id,dice:null,winner:null,log:['Escolha o primeiro local da sua Casa de Taipa.']};}

export function points(s:State,p:number){return Object.values(s.buildings).filter(b=>b.owner===p).reduce((n,b)=>n+b.level,0)+(s.development?.hands[p].filter(c=>developmentInfo[c.kind].prestige).length??0)+(s.development?.armyOwner===p?2:0);}
export function publicPoints(s:State,p:number,viewer=0){return points(s,p)-(p!==viewer&&s.phase!=='finished'?(s.development?.hands[p].filter(c=>developmentInfo[c.kind].prestige).length??0):0);}
export function affordable(s:State,p:number,kind:Build){return resources.every(r=>s.players[p].cards[r]>=(costs[kind][r]??0));}
export function legalHouses(s:State,p=s.current,setup=s.phase==='setup-house'){
 const map=boardFor(s);
 if(Object.values(s.buildings).filter(b=>b.owner===p&&b.level===1).length>=5)return [];
 return map.nodes.filter(n=>!s.buildings[n.id]&&n.edges.every(id=>!s.buildings[otherEnd(id,n.id,map)])&&(setup||n.edges.some(id=>s.roads[id]===p))).map(n=>n.id);
}
function otherEnd(edge:number,node:number,board=map){const e=board.edges[edge];return e.a===node?e.b:e.a;}
export function legalRoads(s:State,p=s.current){
 const map=boardFor(s);
 if(Object.values(s.roads).filter(owner=>owner===p).length>=15)return [];
 return map.edges.filter(e=>s.roads[e.id]===undefined&&(s.phase==='setup-road'?(e.a===s.lastNode||e.b===s.lastNode):[e.a,e.b].some(id=>s.buildings[id]?s.buildings[id].owner===p:map.nodes[id].edges.some(edge=>s.roads[edge]===p)))).map(e=>e.id);
}
export function legalCities(s:State,p=s.current){return Object.values(s.buildings).filter(b=>b.owner===p&&b.level===2).length>=4?[]:Object.entries(s.buildings).filter(([,b])=>b.owner===p&&b.level===1).map(([id])=>Number(id));}
function note(s:State,message:string){s.log.push(message);if(s.log.length>50)s.log.shift();}
function checkPlayer(s:State,p:number){if(s.winner!==null)throw new Error('A partida já terminou.');if(s.current!==p)throw new Error('Espere a sua vez.');}
function pay(s:State,p:number,kind:Build){if(!affordable(s,p,kind))throw new Error('Você ainda não tem os recursos necessários.');for(const r of resources){const n=costs[kind][r]??0;s.players[p].cards[r]-=n;s.bank[r]+=n;}}
function victory(s:State,p:number){if(points(s,p)>=TARGET){s.winner=p;s.phase='finished';if(s.development){s.development.freeRoads=null;s.development.robberReturn=null;}note(s,`${playerNames[p]} venceu com ${points(s,p)} pontos!`);}}
function give(s:State,p:number,r:Resource,n:number){const amount=Math.min(n,s.bank[r]);s.bank[r]-=amount;s.players[p].cards[r]+=amount;}
export function build(s:State,p:number,kind:Build,id:number){
 const map=boardFor(s);
 checkPlayer(s,p);
 const setup=s.phase==='setup-house'||s.phase==='setup-road',free=s.phase==='free-roads'&&kind==='road'&&s.development?.freeRoads?.owner===p;
 if(setup&&kind!==(s.phase==='setup-house'?'settlement':'road'))throw new Error('Conclua a construção inicial indicada.');
 if(!setup&&!free&&s.phase!=='build')throw new Error('Role os dados antes de construir.');
 const legal=kind==='road'?legalRoads(s,p):kind==='city'?legalCities(s,p):legalHouses(s,p,setup);
 if(!legal.includes(id))throw new Error('Este local não está disponível para essa construção.');
 if(!setup&&!free)pay(s,p,kind);
 if(kind==='road'){
  s.roads[id]=p;note(s,`${playerNames[p]} construiu uma estrada${free?' com o Mutirão':''}.`);
  if(free){const pending=s.development!.freeRoads!;pending.left--;if(!pending.left||!legalRoads(s,p).length){s.phase=pending.returnPhase;s.development!.freeRoads=null;}}
  if(setup){s.setupStep++;s.lastNode=null;if(s.setupStep===setupFor(s).length){s.current=0;s.phase='roll';note(s,'Tudo pronto! Role os dados para começar.');}else{s.current=setupFor(s)[s.setupStep];s.phase='setup-house';}}
 }else{
  s.buildings[id]={owner:p,level:kind==='city'?2:1};
  note(s,`${playerNames[p]} construiu ${kind==='city'?'uma Vila Sertaneja':'uma Casa de Taipa'}.`);
  if(setup){s.lastNode=id;s.phase='setup-road';if(s.setupStep>=s.players.length)for(const tid of map.nodes[id].tiles){const r=boardFor(s).tiles[tid].resource;if(r)give(s,p,r,1);}}
 }
 if(!setup)victory(s,p);
}
export function rollDice(s:State,p:number,random:()=>number=Math.random){
 checkPlayer(s,p);if(s.phase!=='roll')throw new Error('Os dados já foram rolados neste turno.');
 const die=()=>Math.min(6,Math.max(1,Math.floor(random()*6)+1));s.dice=[die(),die()];const sum=s.dice[0]+s.dice[1];note(s,`${playerNames[p]} tirou ${s.dice.join(' + ')} = ${sum}.`);
 if(sum===7){
  for(let owner=0;owner<s.players.length;owner++){
   const cards=s.players[owner].cards,total=resources.reduce((n,r)=>n+cards[r],0);if(total<=7)continue;
   let remaining=Math.floor(total/2);const count=remaining;
   while(remaining--){const r=resources.reduce((a,b)=>cards[a]>=cards[b]?a:b);cards[r]--;s.bank[r]++;}
   note(s,`${playerNames[owner]} devolveu ${count} recursos ao banco (limite de 7).`);
  }
  s.phase='robber';note(s,'Mova o Cobrador do Coronel para outro terreno. Ele ficará sem produzir.');return sum;
 }
 const demand=resources.reduce((out,r)=>(out[r]=[],out),{} as Record<Resource,{owner:number;amount:number}[]>);
 for(const t of boardFor(s).tiles){if(t.number!==sum||!t.resource||t.id===s.robber)continue;for(const node of t.nodes){const b=s.buildings[node];if(b)demand[t.resource].push({owner:b.owner,amount:b.level});}}
 const received=[0,0,0];
 for(const r of resources){const total=demand[r].reduce((n,a)=>n+a.amount,0);if(total>s.bank[r]){note(s,`O banco ficou sem ${names[r]}; esta produção não foi distribuída.`);continue;}for(const a of demand[r]){give(s,a.owner,r,a.amount);received[a.owner]+=a.amount;}}
 if(!received.some(Boolean))note(s,'Nenhuma construção recebeu recursos nesta rodada.');else note(s,received.map((n,i)=>n?`${playerNames[i]}: +${n}`:'').filter(Boolean).join(' · '));
 s.phase='build';return sum;
}
export function moveRobber(s:State,p:number,tile:number,random:()=>number=Math.random){
 const map=boardFor(s);
 checkPlayer(s,p);if(s.phase!=='robber')throw new Error('Não é hora de mover o Cobrador.');if(!map.tiles[tile]||tile===s.robber)throw new Error('Escolha outro terreno.');s.robber=tile;
 const victims=[...new Set(map.tiles[tile].nodes.map(id=>s.buildings[id]?.owner).filter((owner):owner is number=>owner!==undefined&&owner!==p))].filter(owner=>resources.some(r=>s.players[owner].cards[r]>0));
 if(victims.length){const victim=victims[Math.min(victims.length-1,Math.floor(random()*victims.length))],cards=s.players[victim].cards,total=resources.reduce((n,r)=>n+cards[r],0);let index=Math.floor(random()*total);for(const r of resources){index-=cards[r];if(index<0){cards[r]--;s.players[p].cards[r]++;note(s,`${playerNames[p]} recebeu 1 ${names[r]} de ${playerNames[victim]}.`);break;}}}
 s.phase=s.development?.robberReturn??'build';if(s.development)s.development.robberReturn=null;note(s,`O Cobrador bloqueou o terreno ${tile+1}.`);
}
export function trade(s:State,p:number,from:Resource,to:Resource,amount=1){
 checkPlayer(s,p);if(s.phase!=='build')throw new Error('Role os dados antes de trocar.');if(!resources.includes(from)||!resources.includes(to)||from===to)throw new Error('Escolha dois recursos diferentes.');if(!Number.isInteger(amount)||amount<1||amount>bankCapacity(s))throw new Error('Escolha uma quantidade inteira de 1 a 19.');const rate=tradeRate(s,p,from),required=rate*amount;if(s.players[p].cards[from]<required)throw new Error(`Você precisa de ${required} cartas iguais para trocar.`);if(s.bank[to]<amount)throw new Error('O banco não tem a quantidade solicitada.');
 s.players[p].cards[from]-=required;s.bank[from]+=required;s.bank[to]-=amount;s.players[p].cards[to]+=amount;note(s,`${playerNames[p]} trocou ${required} ${names[from]} por ${amount} ${names[to]}.`);
}
export interface PlayerTradeResult {accepted:boolean;message:string}
function tradeBundle(value:Partial<Wallet>):Wallet{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(r=>!resources.includes(r as Resource)))throw new Error('Use apenas os cinco recursos do jogo.');
 const entries=resources.map(r=>[r,value[r]??0] as const);
 if(entries.some(([,n])=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>38))throw new Error('Use quantidades inteiras de 0 a 19 para os cinco recursos.');
 return Object.fromEntries(entries) as Wallet;
}

function tradeWalletValue(s:State,p:number,cards:Wallet){
 const goals:Build[]=[];if(legalCities(s,p).length)goals.push('city');if(legalHouses(s,p,false).length)goals.push('settlement');if(legalRoads(s,p).length)goals.push('road');
 const progress=goals.reduce((best,kind)=>{const ingredients=Object.entries(costs[kind]) as [Resource,number][],total=ingredients.reduce((n,[,q])=>n+q,0),filled=ingredients.reduce((n,[r,q])=>n+Math.min(cards[r],q),0),complete=filled===total;return Math.max(best,({city:2.2,settlement:2,road:.7}[kind])*(filled/total+(complete ? .8 : 0)));},0);
 return resources.reduce((n,r)=>n+1.8*Math.sqrt(cards[r]),0)+progress;
}
/** A local computer opponent explicitly accepts or refuses; no cards move on refusal. */
export function proposePlayerTrade(s:State,p:number,partner:number,offer:Partial<Wallet>,request:Partial<Wallet>):PlayerTradeResult{
 checkPlayer(s,p);if(s.phase!=='build')throw new Error('Role os dados antes de negociar com os jogadores.');
 if(!Number.isInteger(partner)||partner===p||partner<0||partner>=s.players.length)throw new Error('Escolha outro jogador para negociar.');
 const give=tradeBundle(offer),take=tradeBundle(request),total=(cards:Wallet)=>resources.reduce((n,r)=>n+cards[r],0);
 if(!total(give)||!total(take))throw new Error('Escolha ao menos um recurso para oferecer e um para receber.');
 if(resources.some(r=>give[r]&&take[r]))throw new Error('Não ofereça e peça o mesmo recurso na mesma proposta.');
 if(resources.some(r=>s.players[p].cards[r]<give[r]))throw new Error('Você não tem todos os recursos que está oferecendo.');
 const reject=(message:string):PlayerTradeResult=>{note(s,`${playerNames[partner]} recusou a proposta de ${playerNames[p]}.`);return{accepted:false,message:`${playerNames[partner]} recusou: ${message}`};};
 if(resources.some(r=>s.players[partner].cards[r]<take[r]))return reject('Não tenho todos os recursos que você pediu.');
 const other=s.players[partner].cards,after=Object.fromEntries(resources.map(r=>[r,other[r]+give[r]-take[r]])) as Wallet;
 if(tradeWalletValue(s,partner,after)+1e-6<tradeWalletValue(s,partner,other))return reject('Prefiro guardar esses recursos para minhas construções. Tente oferecer mais ou pedir menos.');
 for(const r of resources){s.players[p].cards[r]+=take[r]-give[r];other[r]+=give[r]-take[r];}
 const describe=(bundle:Wallet)=>resources.filter(r=>bundle[r]>0).map(r=>`${bundle[r]} ${names[r]}`).join(' + ');
 note(s,`${playerNames[p]} negociou com ${playerNames[partner]}: ${describe(give)} por ${describe(take)}.`);
 return{accepted:true,message:`${playerNames[partner]} aceitou! Você entregou ${describe(give)} e recebeu ${describe(take)}.`};
}
export function developmentHand(s:State,p:number){return s.development?.hands[p]??[];}
export function canBuyDevelopment(s:State,p=s.current){return s.current===p&&s.phase==='build'&&s.winner===null&&(s.development?.deck.length??25)>0&&Object.entries(developmentCost).every(([r,n])=>s.players[p].cards[r as Resource]>=n);}
export function buyDevelopment(s:State,p:number):DevelopmentCard{
 checkPlayer(s,p);if(s.phase!=='build')throw new Error('Role os dados antes de comprar cartas.');
 const d=s.development??createDevelopment(s.boardSeed??0,s.players.length);if(!d.deck.length)throw new Error('As cartas de desenvolvimento acabaram.');
 if(!Object.entries(developmentCost).every(([r,n])=>s.players[p].cards[r as Resource]>=n))throw new Error('A carta custa 1 Couro + 1 Pedra + 1 Milho.');
 const id=25-d.deck.length,kind=d.deck.pop()!;s.development=d;for(const [r,n]of Object.entries(developmentCost)){s.players[p].cards[r as Resource]-=n;s.bank[r as Resource]+=n;}
 const card={id,kind,boughtTurn:developmentTurn(s)};d.hands[p].push(card);note(s,`${playerNames[p]} comprou uma carta do Sertão.`);victory(s,p);return card;
}
export function usedDevelopmentThisTurn(s:State){return s.development?.discard.some(c=>c.playedTurn===developmentTurn(s))??false;}
export function canPlayDevelopment(s:State,p:number,id:number){
 const card=developmentHand(s,p).find(c=>c.id===id);if(!card||developmentInfo[card.kind].prestige||s.current!==p||s.winner!==null||!['roll','build'].includes(s.phase)||card.boughtTurn>=developmentTurn(s)||usedDevelopmentThisTurn(s))return false;
 if(card.kind==='roads')return legalRoads(s,p).length>0;if(card.kind==='plenty')return resources.some(r=>s.bank[r]>0);return true;
}
export function knightCount(s:State,p:number){return s.development?.discard.filter(c=>c.kind==='knight'&&c.owner===p).length??0;}
function updateArmy(s:State){const d=s.development!;const counts=s.players.map((_,p)=>knightCount(s,p)),max=Math.max(...counts),old=d.armyOwner;if(max<3)d.armyOwner=null;else if(old===null||counts[old]!==max){const candidates=s.players.map((_,i)=>i).filter(p=>counts[p]===max);d.armyOwner=candidates.length===1?candidates[0]:null;}if(d.armyOwner!==old&&d.armyOwner!==null)note(s,`${playerNames[d.armyOwner]} conquistou o Maior Grupo de Cangaceiros: +2 pontos.`);}
export function playDevelopment(s:State,p:number,id:number,choice?:Resource|Resource[]){
 checkPlayer(s,p);if(!canPlayDevelopment(s,p,id))throw new Error('Use apenas uma carta de ação por turno, a partir do turno seguinte à compra.');
 const d=s.development!,card=d.hands[p].find(c=>c.id===id)!,returnPhase=s.phase as 'roll'|'build';let selected:Resource[]=[];
 if(card.kind==='monopoly'){if(!resources.includes(choice as Resource))throw new Error('Escolha o recurso do Acordo.');selected=[choice as Resource];}
 if(card.kind==='plenty'){const needed=Math.min(2,resources.reduce((n,r)=>n+s.bank[r],0));if(!Array.isArray(choice)||choice.length!==needed||choice.some(r=>!resources.includes(r)))throw new Error(`Escolha ${needed} recurso(s) para a Safra.`);selected=choice;for(const r of resources)if(selected.filter(v=>v===r).length>s.bank[r])throw new Error('O banco não tem os recursos escolhidos.');}
 d.hands[p]=d.hands[p].filter(c=>c.id!==id);d.discard.push({...card,owner:p,playedTurn:developmentTurn(s)});note(s,`${playerNames[p]} usou ${developmentInfo[card.kind].title}.`);
 if(card.kind==='knight'){d.robberReturn=returnPhase;s.phase='robber';updateArmy(s);}
 if(card.kind==='roads'){d.freeRoads={owner:p,left:2,returnPhase};s.phase='free-roads';}
 if(card.kind==='plenty')for(const r of selected)give(s,p,r,1);
 if(card.kind==='monopoly'){const r=selected[0];let amount=0;for(let owner=0;owner<s.players.length;owner++)if(owner!==p){amount+=s.players[owner].cards[r];s.players[owner].cards[r]=0;}s.players[p].cards[r]+=amount;note(s,`${playerNames[p]} recebeu ${amount} ${names[r]} pelo Acordo.`);}
 victory(s,p);
}
export function finishFreeRoads(s:State,p:number){checkPlayer(s,p);const pending=s.development?.freeRoads;if(s.phase!=='free-roads'||!pending||pending.owner!==p||pending.left===2)throw new Error('Coloque pelo menos uma estrada do Mutirão.');s.phase=pending.returnPhase;s.development!.freeRoads=null;}
export function endTurn(s:State,p:number){checkPlayer(s,p);if(s.phase!=='build')throw new Error('Conclua a ação indicada antes de terminar o turno.');victory(s,p);if(s.winner!==null)return;s.current=(p+1)%s.players.length;if(s.current===0)s.round++;s.phase='roll';s.dice=null;note(s,`Vez de ${playerNames[s.current]}.`);}
export function scoreNode(id:number,board=map,numbersKnown=true){return board.nodes[id].tiles.reduce((n,tid)=>{const t=board.tiles[tid];return n+(numbersKnown?(t.number?6-Math.abs(7-t.number):0):(t.resource?3:0));},0)+new Set(board.nodes[id].tiles.map(t=>board.tiles[t].resource).filter(Boolean)).size*1.2;}
export function chooseRoad(s:State,p:number){
 const map=boardFor(s);
 const targets=map.nodes.filter(n=>!s.buildings[n.id]&&n.edges.every(id=>!s.buildings[otherEnd(id,n.id,map)]));
 const distance=(node:number)=>targets.reduce((best,t)=>Math.min(best,Math.hypot(t.x-map.nodes[node].x,t.z-map.nodes[node].z)-scoreNode(t.id,boardFor(s),!s.phase.startsWith('setup-'))*.05),99);
 return legalRoads(s,p).sort((a,b)=>Math.min(distance(map.edges[a].a),distance(map.edges[a].b))-Math.min(distance(map.edges[b].a),distance(map.edges[b].b)))[0];
}
function botDevelopment(s:State,p:number){
 if(s.phase!=='build')return false;const ready=developmentHand(s,p).filter(c=>canPlayDevelopment(s,p,c.id));
 const monopoly=ready.find(c=>c.kind==='monopoly');if(monopoly){const r=resources.reduce((a,b)=>s.players.reduce((n,v,i)=>n+(i!==p?v.cards[b]:0),0)>s.players.reduce((n,v,i)=>n+(i!==p?v.cards[a]:0),0)?b:a);if(s.players.some((v,i)=>i!==p&&v.cards[r]>0)){playDevelopment(s,p,monopoly.id,r);return true;}}
 const plenty=ready.find(c=>c.kind==='plenty');if(plenty){const bank={...s.bank},cards={...s.players[p].cards},choices:Resource[]=[];const goals=([['city',legalCities(s,p)],['settlement',legalHouses(s,p,false)],['road',legalRoads(s,p)]] as [Build,number[]][]).filter(([,ids])=>ids.length);for(let i=0;i<Math.min(2,resources.reduce((n,r)=>n+s.bank[r],0));i++){const r=goals.flatMap(([kind])=>resources.filter(r=>cards[r]<(costs[kind][r]??0)&&bank[r]>0))[0]??resources.filter(r=>bank[r]>0).sort((a,b)=>cards[a]-cards[b])[0];choices.push(r);bank[r]--;cards[r]++;}playDevelopment(s,p,plenty.id,choices);return true;}
 const roads=ready.find(c=>c.kind==='roads');if(roads){playDevelopment(s,p,roads.id);return true;}
 const knight=ready.find(c=>c.kind==='knight');if(knight){playDevelopment(s,p,knight.id);return true;}return false;
}
export function botStep(s:State,random:()=>number=Math.random){
 const p=s.current;if(s.phase==='finished')return;
 if(s.phase==='setup-house'){const ids=legalHouses(s,p,true).sort((a,b)=>scoreNode(b,boardFor(s),false)-scoreNode(a,boardFor(s),false));if(!ids.length)throw new Error('Sem espaço para a preparação.');build(s,p,'settlement',ids[0]);return;}
 if(s.phase==='setup-road'){const id=chooseRoad(s,p);if(id===undefined)throw new Error('Sem estrada inicial disponível.');build(s,p,'road',id);return;}
 if(s.phase==='roll'){rollDice(s,p,random);return;}
 if(s.phase==='robber'){
  const tile=boardFor(s).tiles.filter(t=>t.id!==s.robber).sort((a,b)=>{
   const score=(t:Tile)=>t.nodes.reduce((n,id)=>{const v=s.buildings[id];return n+(v?(v.owner===p?-3:1)*v.level:0);},0)*(t.number?6-Math.abs(7-t.number):0);
   return score(b)-score(a);
  })[0];moveRobber(s,p,tile.id,random);return;
 }
 if(s.phase==='free-roads'){const id=chooseRoad(s,p);if(id!==undefined)build(s,p,'road',id);else finishFreeRoads(s,p);return;}
 if(botDevelopment(s,p))return;
 const options: {kind:Build;ids:number[]}[]=[{kind:'city',ids:legalCities(s,p)},{kind:'settlement',ids:legalHouses(s,p,false)},{kind:'road',ids:legalRoads(s,p)}];
 for(const option of options){if(option.ids.length&&affordable(s,p,option.kind)){const id=option.kind==='road'?chooseRoad(s,p)!:option.ids.sort((a,b)=>scoreNode(b,boardFor(s))-scoreNode(a,boardFor(s)))[0];build(s,p,option.kind,id);return;}}
 if(canBuyDevelopment(s,p)){buyDevelopment(s,p);return;}
 // Trade towards a build that has a valid placement, without sacrificing ingredients it needs.
 for(const option of options){if(!option.ids.length)continue;const cost=costs[option.kind];const need=resources.find(r=>s.players[p].cards[r]<(cost[r]??0)&&s.bank[r]>0);if(!need)continue;const surplus=resources.filter(r=>r!==need&&s.players[p].cards[r]-(cost[r]??0)>=tradeRate(s,p,r)).sort((a,b)=>s.players[p].cards[b]-s.players[p].cards[a])[0];if(surplus){trade(s,p,surplus,need);return;}}
 endTurn(s,p);
}
export function validSave(value:unknown):value is State {
 try{
  const s=value as State;const map=boardFor(s??{});
  if(!s||s.version!==1||!Number.isInteger(s.current)||s.current<0||s.current>=s.players.length||!['setup-house','setup-road','roll','build','robber','finished','free-roads'].includes(s.phase)||!Array.isArray(s.players)||(s.players.length<2||s.players.length>6)||!Array.isArray(s.log)||s.log.some(x=>typeof x!=='string')||!Number.isInteger(s.round)||s.round<1||!Number.isInteger(s.setupStep)||s.setupStep<0||s.setupStep>s.players.length*2||!map.tiles[s.robber]||!(s.winner===null||Number.isInteger(s.winner)&&s.winner>=0&&s.winner<s.players.length)||!s.buildings||!s.roads)return false;
  if(s.mapSize!==undefined&&!['classic','double'].includes(s.mapSize))return false;
  if(!validateDevelopment(s.development,developmentTurn(s),s.current,s.phase,s.players.length))return false;
  if(s.boardSeed!=null&&(!Number.isInteger(s.boardSeed)||s.boardSeed<0||s.boardSeed>4294967295))return false;
  if(s.phase.startsWith('setup')&&(s.setupStep>=s.players.length*2||s.current!==setupFor(s)[s.setupStep]))return false;
  if(s.phase==='setup-road'&&(s.lastNode===null||s.buildings[s.lastNode]?.owner!==s.current))return false;
  if(s.phase==='finished'&&(s.winner===null||points(s,s.winner)<TARGET))return false;
  if(s.phase!=='finished'&&s.winner!==null)return false;
  if(s.dice!==null&&(!Array.isArray(s.dice)||s.dice.length!==2||s.dice.some(n=>!Number.isInteger(n)||n<1||n>6)))return false;
  for(const r of resources){const counts=[s.bank[r],...s.players.map(p=>p.cards[r])];if(counts.some(n=>!Number.isInteger(n)||n<0)||counts.reduce((a,b)=>a+b,0)!==bankCapacity(s))return false;}
  for(const [id,b]of Object.entries(s.buildings)){if(!map.nodes[Number(id)]||!b||(!Number.isInteger(b.owner)||b.owner<0||b.owner>=s.players.length)||![1,2].includes(b.level))return false;}
  for(const [id,owner]of Object.entries(s.roads))if(!map.edges[Number(id)]||(!Number.isInteger(owner)||owner<0||owner>=s.players.length))return false;
  return true;
 }catch{return false;}
}
