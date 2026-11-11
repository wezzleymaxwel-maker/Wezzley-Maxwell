import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),folder=new URL('../release/pc-host/',import.meta.url),web=new URL('../release/caatinga-web/',import.meta.url);await mkdir(folder,{recursive:true});await mkdir(web,{recursive:true});
await build({absWorkingDir:fileURLToPath(root),entryPoints:['server/index.ts'],outfile:fileURLToPath(new URL('servidor.mjs',folder)),bundle:true,platform:'node',target:'node22',format:'esm',legalComments:'eof'});
for(const name of ['INICIAR-ONLINE.cmd','Iniciar-Online.ps1','Host-Funcoes.ps1','runtimes.json','LEIA-ME.txt']){let bytes=await readFile(new URL('../server/pc/'+name,import.meta.url));if(name.endsWith('.ps1'))bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),bytes]);if(/\.(cmd|ps1|txt)$/.test(name))bytes=Buffer.from(bytes.toString('utf8').replace(/\r?\n/g,'\r\n'),'utf8');await writeFile(new URL(name,folder),bytes);}
const bundle=await readFile(new URL('servidor.mjs',folder));await writeFile(new URL('pacote.json',folder),JSON.stringify({version:1,serverSha256:createHash('sha256').update(bundle).digest('hex')},null,2)+'\n');
execFileSync('python',['-c',`import zipfile,pathlib
base=pathlib.Path('release/pc-host')
with zipfile.ZipFile('release/caatinga-web/CAATINGA-Servidor-Windows.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
 for p in sorted(base.iterdir()):
  if p.is_file():z.write(p,'CAATINGA-Servidor/'+p.name)
`],{cwd:root,stdio:'inherit'});console.log('Iniciador pronto: release/caatinga-web/CAATINGA-Servidor-Windows.zip');
