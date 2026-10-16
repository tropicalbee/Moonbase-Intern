import { cpSync, readFileSync } from 'node:fs';
const release = readFileSync('dist/latest-release.txt', 'utf8').trim();
cpSync(`dist/${release}`, 'dist/site', { recursive: true });
