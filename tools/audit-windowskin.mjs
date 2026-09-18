// Offline audit for the canonical 192x192 RGBA8 asset. No PNG rewriting or dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
const root = new URL('../assets/source/ui/base/', import.meta.url);
const bytes = readFileSync(new URL('Window.png', root));
const manifestBytes = readFileSync(new URL('Window.manifest.json', root));
const manifest = JSON.parse(manifestBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const check = (ok, reason) => { if (!ok) throw new Error(reason); };
function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}
check(bytes.length <= 65536 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'Invalid PNG signature/size');
let width, height, ended = false; const data = [];
for (let p = 8; p + 12 <= bytes.length;) {
  const n = bytes.readUInt32BE(p), kind = bytes.toString('ascii',p+4,p+8), end = p + 12 + n;
  check(end <= bytes.length, 'Truncated PNG chunk');
  check(crc32(bytes.subarray(p+4,p+8+n)) === bytes.readUInt32BE(p+8+n), `PNG CRC mismatch: ${kind}`);
  const chunk = bytes.subarray(p+8,p+8+n);
  if (kind === 'IHDR') {
    width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
    check(n === 13 && width === 192 && height === 192 && chunk[8] === 8 && chunk[9] === 6 && chunk[10] === 0 && chunk[11] === 0 && chunk[12] === 0, 'Only 192x192 noninterlaced RGBA8 is accepted');
  }
  if (kind === 'IDAT') data.push(chunk);
  if (kind === 'IEND') { ended = true; check(end === bytes.length, 'Unexpected trailing PNG bytes'); break; }
  p = end;
}
check(ended && width === 192 && height === 192 && data.length > 0, 'Incomplete PNG');
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
const tileMap = new Map(manifest.tiles.map(t=>[t.id,t]));
check(manifest.formatVersion === 1 && manifest.tiles.length === 64 && tileMap.size === 64,'Wrong manifest slots');
const owned = new Set();
for (const t of manifest.tiles) {
  const {x,y,w,h}=t.rect;
  check(w===16&&h===16&&x===4+24*t.column&&y===4+24*t.row&&t.row>=0&&t.row<8&&t.column>=0&&t.column<8,'Incorrect tile packing');
  for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++) { const i=py*width+px;check(!owned.has(i),'Overlapping slots');owned.add(i); }
}
let partialAlphaPixels=0, gutterPixels=0, gutterNontransparent=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=rgba(x,y)[3]; if(a>0&&a<255)partialAlphaPixels++;
  if(!owned.has(y*width+x)){gutterPixels++;if(a)gutterNontransparent++;}
}
check(gutterNontransparent===0,'Nontransparent packing gutter');
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
const report={format:'rpgameworks.windowskin.audit',version:1,sourceSha256:sha(bytes),manifestSha256:sha(manifestBytes),bytes:bytes.length,
 width,height,packingPassed:true,reservedTransparent:true,gutterPixels,gutterNontransparent,partialAlphaPixels,
 portCount:ports.length,portMatches:ports.filter(p=>p.matches).length,portMismatches:ports.filter(p=>!p.matches),
 repeatCount:shoulders.length,shoulderMismatches:shoulders.filter(s=>s.differingPixels),rightAdapterChecks,
 policy:'Source unchanged. Runtime right-side plain spans repeat B4/B6 N-port pixels, not F7. D6 attachments are audited but not used in W1. Other shoulder differences retained; no universal seam claim.'};
const result=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--write'))writeFileSync(new URL('Window.audit.json',root),result);
process.stdout.write(result);
