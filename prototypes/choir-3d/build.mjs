import { build } from 'esbuild';
import fs from 'fs';
const tpl = fs.readFileSync('src/template.html', 'utf8');
fs.mkdirSync('dist', { recursive: true });
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
// 1) publish build: three from jsDelivr through an import map
const cdn = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', write: false, target: 'es2020', external: ['three', 'three/addons/*'], legalComments: 'none' });
const map = `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>`;
fs.writeFileSync('dist/choir-cdn.html', tpl.replace('<!--IMPORTMAP-->', () => map).replace('<!--BUNDLE-->', () => `<script type="module">${esc(cdn.outputFiles[0].text)}</script>`));
// 2) offline test build: everything inlined
const full = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
fs.writeFileSync('dist/index.html', '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + tpl.replace('<!--IMPORTMAP-->', '').replace('<!--BUNDLE-->', () => `<script>${esc(full.outputFiles[0].text)}</script>`) + '</body></html>');
console.log('ok', fs.statSync('dist/index.html').size);
