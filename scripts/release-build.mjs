import {readFileSync,readdirSync,existsSync} from 'node:fs';import {join,relative} from 'node:path';import {createHash} from 'node:crypto';
export function sourceBuildId(root=process.cwd()){
 const files=[];function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=join(folder,entry.name);if(entry.isDirectory()){if(!entry.name.startsWith('.')&&entry.name!=='node_modules')walk(path);}else if(!entry.name.endsWith('.test.ts')&&entry.name!=='release.json'&&!entry.name.endsWith('.log'))files.push(path);}}
 for(const name of ['src','server','public'])if(existsSync(join(root,name)))walk(join(root,name));files.push(join(root,'package.json'));const hash=createHash('sha256');for(const file of files.sort()){hash.update(relative(root,file));hash.update(readFileSync(file));}return hash.digest('hex').slice(0,10);
}
export function releaseInfo(root=process.cwd()){const source=readFileSync(join(root,'src/release.ts'),'utf8'),version=source.match(/GAME_VERSION='([^']+)'/)?.[1],protocol=Number(source.match(/PROTOCOL_VERSION=(\d+)/)?.[1]);if(!version||!protocol)throw Error('Versão de lançamento ausente');return{version,protocol,build:sourceBuildId(root)};}
