import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetFiles} from '../src/AssetManifest.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function latestRelease(){
  const relative=(await readFile(path.join(root,'dist','latest-release.txt'),'utf8')).trim();
  if(!/^releases\/public-[A-Za-z0-9]+$/.test(relative))throw new Error('Invalid release pointer');
  return path.join(root,'dist',relative);
}
export async function verifyRelease(directory){
  const manifest=JSON.parse(await readFile(path.join(directory,'release-manifest.json'),'utf8'));
  if(manifest.game!=='Moonbase Intern'||!Array.isArray(manifest.files))throw new Error('Invalid release manifest');
  const names=new Set();let bytes=0;
  for(const file of manifest.files){
    if(typeof file.path!=='string'||!file.path||file.path.split(/[\\/]/).some(part=>!part||part==='..'||part==='.')||path.isAbsolute(file.path)||names.has(file.path))throw new Error('Unsafe or duplicate release path');
    if(!['index.html','game.html','credits.txt','.nojekyll'].includes(file.path)&&!file.path.startsWith('static/')&&!file.path.startsWith('assets/'))throw new Error(`Unexpected release file: ${file.path}`);
    const content=await readFile(path.join(directory,file.path));
    if(content.length!==file.bytes||createHash('sha256').update(content).digest('hex')!==file.sha256)throw new Error(`Release checksum mismatch: ${file.path}`);
    names.add(file.path);bytes+=content.length;
  }
  for(const name of ['index.html','game.html','credits.txt','.nojekyll',...assetFiles.map(([file])=>'assets/'+file)])if(!names.has(name))throw new Error(`Release is missing ${name}`);
  const modelNames=[...names].filter(name=>name.startsWith('assets/')).sort();
  if(JSON.stringify(modelNames)!==JSON.stringify(assetFiles.map(([name])=>'assets/'+name).sort()))throw new Error('Release includes unused assets');
  async function list(dir,prefix=''){
    const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('Release cannot contain symbolic links');
      if(entry.isDirectory())result.push(...await list(path.join(dir,entry.name),prefix+entry.name+'/'));else result.push(prefix+entry.name);
    }return result;
  }
  const actual=(await list(directory)).filter(name=>name!=='release-manifest.json').sort();
  if(JSON.stringify(actual)!==JSON.stringify([...names].sort()))throw new Error('Release contains unmanifested files');
  for(const name of [...names].filter(name=>/\.(?:html|css)$/.test(name))){
    const content=await readFile(path.join(directory,name),'utf8');
    const refs=name.endsWith('.html')?[...content.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match=>match[1]):[...content.matchAll(/url\(([^)]+)\)/g)].map(match=>match[1].replace(/^['"]|['"]$/g,''));
    for(const ref of refs){
      if(ref.startsWith('data:'))continue;
      if(/^(?:https?:|\/\/)/.test(ref))throw new Error('Release depends on an external resource');
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),decodeURIComponent(ref.split(/[?#]/)[0])));
      if(!names.has(resolved))throw new Error(`Missing resource ${ref} in ${name}`);
    }
  }
  return {files:names.size,bytes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await verifyRelease(await latestRelease()));
