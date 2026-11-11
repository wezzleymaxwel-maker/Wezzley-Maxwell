import type {Resource} from './sertao-rules';
export interface TradeStop {id:string;resource:Resource|null;edge:number;nodes:[number,number];x:number;z:number;angle:number}
interface Topology {nodes:{id:number;x:number;z:number;tiles:number[]}[];edges:{id:number;a:number;b:number}[]}
/** Only edges belonging to one hexagon are on the outer boundary. */
export function createTradeStops(map:Topology):TradeStop[]{
 const boundary=map.edges.filter(e=>map.nodes[e.a].tiles.filter(t=>map.nodes[e.b].tiles.includes(t)).length===1).sort((a,b)=>{
  const angle=(e:typeof a)=>Math.atan2(map.nodes[e.a].z+map.nodes[e.b].z,map.nodes[e.a].x+map.nodes[e.b].x);return angle(a)-angle(b);
 });
 const types:(Resource|null)[]=[null,'lenha',null,'barro','pedra',null,'milho',null,'couro'];
 return types.map((resource,i)=>{const edge=boundary[Math.floor(i*boundary.length/9)],a=map.nodes[edge.a],b=map.nodes[edge.b],x=(a.x+b.x)/2,z=(a.z+b.z)/2,length=Math.hypot(x,z);return{id:`tropeiro-${i+1}`,resource,edge:edge.id,nodes:[edge.a,edge.b],x:x+x/length*1.15,z:z+z/length*1.15,angle:Math.atan2(x,z)};});
}
