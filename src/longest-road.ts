import {boardFor,type State} from './sertao-rules';
/** Longest trail: edges cannot repeat; loops are allowed; enemy settlements stop a trail. */
export function longestRoadLength(s:State,player:number){
 const board=boardFor(s),roads=Object.entries(s.roads).filter(([,p])=>p===player).map(([id])=>+id);if(!roads.length)return 0;
 const bits=new Map(roads.map((id,i)=>[id,1<<i])),nodes=new Set(roads.flatMap(id=>[board.edges[id].a,board.edges[id].b])),memo=new Map<string,number>();
 function walk(node:number,used:number):number{if(used&&s.buildings[node]&&s.buildings[node].owner!==player)return 0;const key=`${node}:${used}`;if(memo.has(key))return memo.get(key)!;let best=0;for(const id of board.nodes[node].edges){const bit=bits.get(id);if(bit===undefined||(used&bit))continue;const edge=board.edges[id];best=Math.max(best,1+walk(edge.a===node?edge.b:edge.a,used|bit));}memo.set(key,best);return best;}
 return Math.max(...[...nodes].map(node=>walk(node,0)));
}
export function updateLongestRoad(s:State){const lengths=s.players.map((_,p)=>longestRoadLength(s,p)),maximum=Math.max(...lengths),leaders=lengths.flatMap((length,p)=>length===maximum?[p]:[]),old=s.longestRoadOwner??null;s.longestRoadOwner=maximum<5?null:old!==null&&leaders.includes(old)?old:leaders.length===1?leaders[0]:null;return lengths;}
