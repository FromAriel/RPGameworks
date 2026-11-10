// Offline window skin audit. No PNG rewriting and no dependencies beyond the shared manifest reader.
//
//   node tools/audit-windowskin.mjs                          Ariel's canonical W1 skin (strict v1 checks)
//   node tools/audit-windowskin.mjs --manifest <file>        any v1 or v2 skin manifest; the PNG sits beside it
//   ... --write                                              also write <name>.audit.json beside the manifest
//
// Every skin: the PNG must be noninterlaced RGBA8 matching the manifest's atlas size, the manifest must pass the v2
// reader (decision 0011 W3.1; version 1 is read as v2), and pixels outside every tile must be transparent.
// A version 1 manifest additionally gets W1's strict checks and report: 64 slots in an 8 × 8 grid of 16-pixel tiles
// at a 24-pixel pitch, a transparent reserved slot, connector ports, repeat shoulders and the right-edge adapter.
// Run `npm run schemas` first in a fresh checkout: the reader uses the generated windowskin validator.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readSkinManifest, tileRects, frameReach, contentInsets } from '../src/presentation/skin/skin-manifest.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const canonical = new URL('../assets/source/ui/base/Window.manifest.json', import.meta.url);
const manifestUrl = option('--manifest') ? pathToFileURL(path.resolve(option('--manifest'))) : canonical;
const manifestBytes = readFileSync(manifestUrl);
const manifest = JSON.parse(manifestBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
const read = readSkinManifest(manifest);
check(read.ok, `Invalid window skin manifest:\n  ${read.ok ? '' : read.errors.join('\n  ')}`);
const skin = read.skin, v1 = read.sourceVersion === 1;
const bytes = readFileSync(new URL(skin.image, manifestUrl));
function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
check(bytes.length <= (v1 ? 65536 : 4 * 1024 * 1024) && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Invalid PNG signature/size');
let width, height, ended = false; const data = [];
for (let p = 8; p + 12 <= bytes.length;) {
  const n = bytes.readUInt32BE(p), kind = bytes.toString('ascii',p+4,p+8), end = p + 12 + n;
  check(end <= bytes.length, 'Truncated PNG chunk');
  check(crc32(bytes.subarray(p+4,p+8+n)) === bytes.readUInt32BE(p+8+n), `PNG CRC mismatch: ${kind}`);
  const chunk = bytes.subarray(p+8,p+8+n);
  if (kind === 'IHDR') {
    width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
    check(n === 13 && chunk[8] === 8 && chunk[9] === 6 && chunk[10] === 0 && chunk[11] === 0 && chunk[12] === 0, 'Only noninterlaced RGBA8 is accepted');
    check(width === skin.size.width && height === skin.size.height, `The PNG is ${width}x${height}, but the manifest declares ${skin.size.width}x${skin.size.height}`);
    if (v1) check(width === 192 && height === 192, 'Only 192x192 noninterlaced RGBA8 is accepted');
  }
  if (kind === 'IDAT') data.push(chunk);
  if (kind === 'IEND') { ended = true; check(end === bytes.length, 'Unexpected trailing PNG bytes'); break; }
  p = end;
}
check(ended && width > 0 && height > 0 && data.length > 0, 'Incomplete PNG');
const stride = width * 4;
const scan = inflateSync(Buffer.concat(data), { maxOutputLength: (stride+1)*height });
check(scan.length === (stride+1)*height, 'Unexpected decoded PNG size');
const pixels = Buffer.alloc(stride*height);
const paeth = (a,b,c) => { const p = a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c); return x<=y&&x<=z?a:y<=z?b:c; };
for (let y=0;y<height;y++) {
  const filter=scan[y*(stride+1)]; check(filter<=4,'Unknown PNG filter');
  for(let x=0;x<stride;x++) {
    const i=y*stride+x, a=x>=4?pixels[i-4]:0, b=y?pixels[i-stride]:0, c=y&&x>=4?pixels[i-stride-4]:0;
    const predict=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
    pixels[i]=(scan[y*(stride+1)+1+x]+predict)&255;
  }
}
const rgba = (x,y) => pixels.subarray((y*width+x)*4,(y*width+x+1)*4);
const owned = new Set();
if (v1) {
  // W1's strict packing for Ariel's canonical file.
  check(manifest.tiles.length === 64 && new Set(manifest.tiles.map(t=>t.id)).size === 64,'Wrong manifest slots');
  for (const t of manifest.tiles) {
    const {x,y,w,h}=t.rect;
    check(w===16&&h===16&&x===4+24*t.column&&y===4+24*t.row&&t.row>=0&&t.row<8&&t.column>=0&&t.column<8,'Incorrect tile packing');
  }
}
// Overlaps and bounds were checked by the reader; here every tile pixel is claimed once to find the gutters.
for (const t of skin.tiles) {
  if (!t.rect) continue;
  const {x,y,w,h}=t.rect;
  for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++) { const i=py*width+px;check(!owned.has(i),'Overlapping slots');owned.add(i); }
}
let partialAlphaPixels=0, gutterPixels=0, gutterNontransparent=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=rgba(x,y)[3]; if(a>0&&a<255)partialAlphaPixels++;
  if(!owned.has(y*width+x)){gutterPixels++;if(a)gutterNontransparent++;}
}
check(gutterNontransparent===0,'Nontransparent packing gutter');
let report;
if (v1) {
  const tileMap = new Map(manifest.tiles.map(t=>[t.id,t]));
  const at=(t,x,y)=>rgba(t.rect.x+x,t.rect.y+y);
  const edge=(t,p)=>Buffer.concat(Array.from({length:16},(_,i)=>at(t,...({N:[i,0],S:[i,15],W:[0,i],E:[15,i]}[p]))));
  const ports=[], shoulders=[];
  for(const t of manifest.tiles){
    for(const [port,profile] of Object.entries(t.ports??{})){
      const fallback=tileMap.get(`${profile==='frame'?'edge':'divider'}.${'NS'.includes(port)?'v':'h'}.plain`);
      ports.push({slot:t.slot,id:t.id,port,matches:edge(t,port).equals(edge(fallback,port))});
    }
    if(t.kind==='repeat'){
      const plain=tileMap.get(t.fallback);let differences=0;
      for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=t.axis==='h'?x:y;if((n<4||n>=12)&&!at(t,x,y).equals(at(plain,x,y)))differences++;}
      shoulders.push({slot:t.slot,id:t.id,differingPixels:differences});
    }
  }
  const reserved=tileMap.get('reserved');
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)check(at(reserved,x,y)[3]===0,'Reserved H8 is not transparent');
  const right=tileMap.get('edge.right.upper');
  const rightAdapterChecks=['corner.tr','edge.right.upper','mid.right','edge.right.lower','corner.br'].flatMap(id=>{
   const t=tileMap.get(id);return Object.keys(t.ports).filter(p=>'NS'.includes(p)).map(port=>({id,port,matches:edge(t,port).equals(edge(right,'N'))}));
  });
  report={format:'rpgameworks.windowskin.audit',version:1,sourceSha256:sha(bytes),manifestSha256:sha(manifestBytes),bytes:bytes.length,
   width,height,packingPassed:true,reservedTransparent:true,gutterPixels,gutterNontransparent,partialAlphaPixels,
   portCount:ports.length,portMatches:ports.filter(p=>p.matches).length,portMismatches:ports.filter(p=>!p.matches),
   repeatCount:shoulders.length,shoulderMismatches:shoulders.filter(s=>s.differingPixels),rightAdapterChecks,
   policy:'Source unchanged. Runtime right-side plain spans repeat B4/B6 N-port pixels, not F7. D6 attachments are audited but not used in W1. Other shoulder differences retained; no universal seam claim.'};
} else {
  report={format:'rpgameworks.windowskin.audit',version:2,sourceSha256:sha(bytes),manifestSha256:sha(manifestBytes),bytes:bytes.length,
   width,height,tiles:skin.tiles.length,resolvedTiles:tileRects(skin).size,gutterPixels,gutterNontransparent,partialAlphaPixels,
   frameReach:frameReach(skin),contentInsets:contentInsets(skin)};
}
const result=JSON.stringify(report,null,2)+'\n';
if(args.includes('--write')){
  const target = manifestUrl.href === canonical.href ? new URL('Window.audit.json', canonical)
    : new URL(path.basename(fileURLToPath(manifestUrl)).replace(/(\.manifest)?\.json$/, '') + '.audit.json', manifestUrl);
  writeFileSync(target,result);
}
process.stdout.write(result);
