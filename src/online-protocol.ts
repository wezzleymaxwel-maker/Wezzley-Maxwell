import type {State,Build,Resource,Wallet} from './sertao-rules';
export type OnlineCommand={kind:'build';build:Build;id:number}|{kind:'roll'|'end'|'buy'|'finish'}|{kind:'robber';id:number}|{kind:'bank';from:Resource;to:Resource;amount:number}|{kind:'play';id:number;choice?:Resource|Resource[]}|{kind:'offer';to:number;give:Wallet;take:Wallet}|{kind:'reply';offerId:string;accept:boolean};
export interface OnlineEvent{id:number;at:number;kind:'start'|'roll'|'build'|'action';build?:Build;dice?:[number,number]}
export interface TradeOffer{id:string;from:number;to:number;give:Wallet;take:Wallet;expires:number}
export interface OnlineView{code:string;version:number;seat:number;host:boolean;started:boolean;members:{name:string;connected:boolean;bot:boolean}[];state:State|null;totals:number[];handCounts:number[];scores:number[];offer:TradeOffer|null;event:OnlineEvent|null;busyUntil:number;serverTime:number}
export interface OnlineSession{endpoint:string;code:string;token:string}
export interface OnlineReply{ok:boolean;error?:string;view?:OnlineView;session?:OnlineSession}
