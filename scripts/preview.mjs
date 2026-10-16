import {preview} from 'vite';
import {latestRelease,verifyRelease} from './verify-release.mjs';
const directory=await latestRelease();await verifyRelease(directory);
const server=await preview({build:{outDir:directory},preview:{host:'127.0.0.1',port:4173,strictPort:true,open:false}});server.printUrls();
