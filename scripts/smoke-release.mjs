import {preview} from 'vite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {latestRelease,verifyRelease} from './verify-release.mjs';

const directory=await latestRelease();await verifyRelease(directory);
const manifest=JSON.parse(await readFile(path.join(directory,'release-manifest.json'),'utf8'));
const server=await preview({build:{outDir:directory},preview:{host:'127.0.0.1',port:5193,strictPort:true,open:false}});
try{
  for(const file of manifest.files){
    const url='http://127.0.0.1:5193/'+file.path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch(url);if(!response.ok)throw new Error(`${file.path}: HTTP ${response.status}`);
    const content=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(content).digest('hex')!==file.sha256)throw new Error(`HTTP content mismatch: ${file.path}`);
    const type=response.headers.get('content-type')??'';
    if(file.path.endsWith('.js')&&!/javascript/.test(type))throw new Error('Invalid JavaScript MIME type');
    if(file.path.endsWith('.css')&&!/text\/css/.test(type))throw new Error('Invalid CSS MIME type');
  }
  console.log(`Local HTTP smoke passed for ${manifest.files.length} release files. No browser was launched.`);
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
