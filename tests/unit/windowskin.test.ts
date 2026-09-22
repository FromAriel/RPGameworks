import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { frameGeometry, spanParts } from '../../src/presentation/skin/layout';

const asset = 'assets/source/ui/base/';
/** Pinned to Ariel's second accepted edit (September 21, 2026). A future art edit must re-pin these with her acceptance. */
describe('selected windowskin source', () => {
  it('preserves Ariel’s accepted PNG and the documented companion manifest', () => {
    const hash = (file: string) => createHash('sha256').update(readFileSync(asset+file)).digest('hex');
    expect(hash('Window.png')).toBe('758fb5bf370a5c7c2cee950c861245491cd127a8a48d036a7f3d0030c79007e6');
    expect(hash('Window.manifest.json')).toBe('c2968d1ed7b7c93c60eaf55b045e0d93217debd141de151940609396ccc29056');
  });
  it('recomputes the real alpha/port audit without repainting the asset', () => {
    const result = JSON.parse(execFileSync(process.execPath,['tools/audit-windowskin.mjs'],{encoding:'utf8'})) as {
      portCount:number;portMatches:number;partialAlphaPixels:number;shoulderMismatches:unknown[];rightAdapterChecks:{id:string;port:string;matches:boolean}[];
    };
    expect(result).toEqual(JSON.parse(readFileSync(asset+'Window.audit.json','utf8')));
    expect(result.portCount).toBe(96); expect(result.portMatches).toBe(82);
    expect(result.partialAlphaPixels).toBe(32); expect(result.shoulderMismatches).toHaveLength(2);
    // The prior edit had all eight derived checks matching; the second edit moves the mid.right
    // edge profile, so its north/south derived checks record as retained, seen seams.
    expect(result.rightAdapterChecks.filter(c=>!c.matches).map(c=>`${c.id}:${c.port}`)).toEqual(['mid.right:N','mid.right:S']);
  });
});
describe('bounded border geometry', () => {
  it('covers every length 0–4096 without a gap, overlap, stretched or cropped motif', () => {
    for(let length=0;length<=4096;length++) {
      const parts=spanParts(length); let covered=0;
      for(const p of parts) {
        if(p.offset!==covered || p.length<=0 || (p.kind==='repeat'?p.length!==16:p.length>=16)) {
          throw new Error(`Bad span at length ${length}: ${JSON.stringify(p)}`);
        }
        covered+=p.length;
      }
      expect(covered).toBe(length);
      if(length>16&&length%16)expect(parts.at(-1)).toEqual({offset:length-16,length:16,kind:'repeat',mirror:true});
    }
  });
  it('retains the exact 53-pixel mirrored finish contract',()=>{
    expect(spanParts(53).map(p=>[p.length,p.kind,p.mirror])).toEqual([[16,'repeat',false],[16,'repeat',false],[5,'plain',false],[16,'repeat',true]]);
  });
  it.each([-1,1.5,4097,NaN,Infinity])('rejects invalid/unbounded span %s',length=>expect(()=>spanParts(length)).toThrow());
  it('keeps a measured single-line live title in a protected gap',()=>{
    const g=frameGeometry(319,123,{left:120,right:198,centerY:22,height:14,lineHeight:16});
    expect(g.title).toEqual({openX:100,closeX:202});expect(g.top).toBe(14);
    expect(g.bottomMid).toBe(151);
  });
  it('uses an ordinary header for wrapped or overlong titles',()=>{
    expect(frameGeometry(160,180,{left:20,right:140,centerY:30,height:40,lineHeight:20}).title).toBeNull();
    expect(frameGeometry(160,180,{left:20,right:140,centerY:30,height:16,lineHeight:20}).title).toBeNull();
  });
  it('omits ornaments before they can crowd small frames',()=>{
    expect(frameGeometry(40,40).sideMid).toBeNull();expect(frameGeometry(40,40).bottomMid).toBeNull();
  });
  it.each([[0,80],[80,31],[NaN,80],[4097,64],[2000,2000]])('rejects unsafe frame %s × %s',(w,h)=>expect(()=>frameGeometry(w,h)).toThrow());
});
