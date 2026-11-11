export const developmentKinds=['knight','roads','plenty','monopoly','church','market','school','reservoir','festival'] as const;
export type DevelopmentKind=typeof developmentKinds[number];
export interface DevelopmentCard {id:number;kind:DevelopmentKind;boughtTurn:number}
export interface UsedDevelopmentCard extends DevelopmentCard {owner:number;playedTurn:number}
export interface DevelopmentState {
 deck:DevelopmentKind[];hands:DevelopmentCard[][];discard:UsedDevelopmentCard[];armyOwner:number|null;
 freeRoads:{owner:number;left:number;returnPhase:'roll'|'build'}|null;robberReturn:'roll'|'build'|null;
}
export const developmentCost={couro:1,pedra:1,milho:1} as const;
export const developmentInfo:Record<DevelopmentKind,{title:string;description:string;count:number;art:number;prestige:boolean}>={
 knight:{title:'Cangaceiro',description:'Mova o Cobrador e receba uma carta de um adversário vizinho. Conta para o Maior Grupo de Cangaceiros.',count:14,art:0,prestige:false},
 roads:{title:'Mutirão',description:'Construa até duas estradas grátis, respeitando sua rede e o limite de peças.',count:2,art:1,prestige:false},
 plenty:{title:'Safra Generosa',description:'Escolha dois recursos disponíveis no banco. Podem ser iguais.',count:2,art:2,prestige:false},
 monopoly:{title:'Acordo do Coronel',description:'Escolha um recurso e receba todas as cartas desse tipo que os adversários possuem.',count:2,art:3,prestige:false},
 church:{title:'Igreja do Sertão',description:'Vale 1 ponto de prestígio. Fica oculta dos adversários até o fim da partida.',count:1,art:4,prestige:true},
 market:{title:'Feira Livre',description:'Vale 1 ponto de prestígio. Fica oculta dos adversários até o fim da partida.',count:1,art:5,prestige:true},
 school:{title:'Escola Rural',description:'Vale 1 ponto de prestígio. Fica oculta dos adversários até o fim da partida.',count:1,art:6,prestige:true},
 reservoir:{title:'Açude Comunitário',description:'Vale 1 ponto de prestígio. Fica oculta dos adversários até o fim da partida.',count:1,art:7,prestige:true},
 festival:{title:'Festa de São João',description:'Vale 1 ponto de prestígio. Fica oculta dos adversários até o fim da partida.',count:1,art:8,prestige:true},
};
export function createDevelopment(seed=0):DevelopmentState{
 const deck=developmentKinds.flatMap(kind=>Array<DevelopmentKind>(developmentInfo[kind].count).fill(kind));let value=(seed^0x2c9277b5)>>>0;
 for(let i=deck.length-1;i>0;i--){value=(Math.imul(value,1664525)+1013904223)>>>0;const j=Math.floor(value/4294967296*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 return{deck,hands:[[],[],[]],discard:[],armyOwner:null,freeRoads:null,robberReturn:null};
}
export const developmentTurn=(s:{round:number;current:number;onlineTurn?:number})=>s.onlineTurn??((s.round-1)*3+s.current);
export function validateDevelopment(value:unknown,turn:number,current:number,phase:string):boolean{
 if(value===undefined)return phase!=='free-roads';
 try{
  const d=value as DevelopmentState;if(!d||!Array.isArray(d.deck)||!Array.isArray(d.hands)||d.hands.length!==3||d.hands.some(h=>!Array.isArray(h))||!Array.isArray(d.discard))return false;
  const known=(k:unknown):k is DevelopmentKind=>developmentKinds.includes(k as DevelopmentKind),counts=Object.fromEntries(developmentKinds.map(k=>[k,0])) as Record<DevelopmentKind,number>;
  for(const kind of d.deck){if(!known(kind))return false;counts[kind]++;}
  const ids=new Set<number>(),played=new Set<number>();
  const card=(c:DevelopmentCard,owner:number)=>{if(!c||!known(c.kind)||!Number.isInteger(c.id)||c.id<0||c.id>=25||ids.has(c.id)||!Number.isInteger(c.boughtTurn)||c.boughtTurn<0||c.boughtTurn>turn||c.boughtTurn%3!==owner)return false;ids.add(c.id);counts[c.kind]++;return true;};
  for(let owner=0;owner<3;owner++)for(const c of d.hands[owner])if(!card(c,owner))return false;
  for(const c of d.discard){if(!Number.isInteger(c.owner)||c.owner<0||c.owner>2||!card(c,c.owner)||developmentInfo[c.kind].prestige||!Number.isInteger(c.playedTurn)||c.playedTurn<=c.boughtTurn||c.playedTurn>turn||c.playedTurn%3!==c.owner||played.has(c.playedTurn))return false;played.add(c.playedTurn);}
  if(developmentKinds.some(k=>counts[k]!==developmentInfo[k].count)||ids.size!==25-d.deck.length||[...ids].some(id=>id>=ids.size))return false;
  const army=[0,1,2].map(p=>d.discard.filter(c=>c.kind==='knight'&&c.owner===p).length),max=Math.max(...army);
  if(d.armyOwner!==null&&(!Number.isInteger(d.armyOwner)||d.armyOwner<0||d.armyOwner>2||army[d.armyOwner]<3||army[d.armyOwner]!==max))return false;
  if(d.armyOwner===null&&max>=3&&army.filter(n=>n===max).length===1)return false;
  if(d.freeRoads!==null){const f=d.freeRoads;if(!f||f.owner!==current||![1,2].includes(f.left)||!['roll','build'].includes(f.returnPhase)||phase!=='free-roads'||!d.discard.some(c=>c.kind==='roads'&&c.owner===current&&c.playedTurn===turn))return false;}else if(phase==='free-roads')return false;
  if(d.robberReturn!==null&&(!['roll','build'].includes(d.robberReturn)||phase!=='robber'||!d.discard.some(c=>c.kind==='knight'&&c.owner===current&&c.playedTurn===turn)))return false;
  return !(d.freeRoads&&d.robberReturn);
 }catch{return false;}
}
