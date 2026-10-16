import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {assetFiles} from '../src/AssetManifest.js';
import {SCORE_VERSION} from '../src/game/systems/ScoreSystem.js';
import {LATEST_PLAN_VERSION} from '../src/game/systems/RunPlan.js';
import {alarmSamples} from '../src/game/presentation/AlarmSamples.js';
import {verifyRelease} from './verify-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const releases=path.join(root,'dist','releases');await mkdir(releases,{recursive:true});
// Fresh output avoids obsolete bundles/unused models without deleting anything.
const destination=await mkdtemp(path.join(releases,'public-'));
await build({root,build:{outDir:destination,emptyOutDir:false}});
await mkdir(path.join(destination,'assets'),{recursive:true});
for(const [file] of assetFiles)await copyFile(path.join(root,'assets',file),path.join(destination,'assets',file));
await writeFile(path.join(destination,'.nojekyll'),'');
const audioNames=Object.values(alarmSamples).map(sample=>decodeURIComponent(new URL(sample.url).pathname.split('/').at(-1)));
await writeFile(path.join(destination,'credits.txt'),`MOONBASE INTERN\nModel source names preserved:\n${assetFiles.map(([name])=>name).join('\n')}\n\nAudio recordings supplied by the project owner (original download filenames):\n${audioNames.join('\n')}\n\nThree.js license:\n${await readFile(path.join(root,'vendor','LICENSE-threejs.txt'),'utf8')}`);
async function filesIn(directory,prefix=''){
  const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){
    const name=prefix+entry.name;if(entry.isDirectory())files.push(...await filesIn(path.join(directory,entry.name),name+'/'));
    else files.push(name);
  }return files.sort();
}
const files=[];for(const name of await filesIn(destination)){
  const content=await readFile(path.join(destination,name));files.push({path:name,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});
}
await writeFile(path.join(destination,'release-manifest.json'),JSON.stringify({game:'Moonbase Intern',planVersion:LATEST_PLAN_VERSION,scoreVersion:SCORE_VERSION,files},null,2));
const verified=await verifyRelease(destination);
await writeFile(path.join(root,'dist','latest-release.txt'),path.relative(path.join(root,'dist'),destination).split(path.sep).join('/'));
console.log(`Public build: ${path.relative(root,destination)}\nVerified ${verified.files} files (${(verified.bytes/1048576).toFixed(1)} MiB). No source assets were changed.`);
