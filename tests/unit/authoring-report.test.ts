import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixture = 'tests/fixtures/content-authoring';
const demo = 'content/games/demo';
type BrokenCase = {name:string;file:string;pointer:string;value:unknown;error?:string;recordId?:string;warning?:string};
type Report = {
  schemaVersion:number;gameId:string;
  summary:{maps:number;definitions:number;references:number;warnings:number};
  definitions:{kind:string;id:string;file:string;path:string;referencedBy:{file:string;id:string;path:string}[]}[];
  warnings:{severity:string;code:string;file:string;id:string;path:string;message:string}[];
};
const cases = JSON.parse(readFileSync(join(fixture, 'broken-cases.json'), 'utf8')) as BrokenCase[];

function run(source:string, output:string, check=false, report?:string) {
  const args = ['tools/build-content.mjs', '--source', source, '--output', output];
  if (check) args.push('--check');
  if (report) args.push('--report-json', report);
  return spawnSync(process.execPath, args, {encoding:'utf8'});
}
function packBytes(root:string):Record<string,string> {
  const result:Record<string,string> = {};
  const visit=(directory:string, prefix=''):void=>{
    for(const entry of readdirSync(directory,{withFileTypes:true})) {
      const path=join(directory,entry.name), relative=prefix+entry.name;
      if(entry.isDirectory())visit(path,relative+'/');
      else result[relative]=readFileSync(path).toString('base64');
    }
  };
  visit(root);
  return result;
}
function setPointer(root:unknown,pointer:string,value:unknown):void {
  const parts=pointer.split('/').slice(1);
  let owner=root as Record<string,unknown>;
  for(const part of parts.slice(0,-1))owner=owner[part] as Record<string,unknown>;
  owner[parts.at(-1)!]=value;
}

describe('M3.5 authoring inventory',()=>{
  it('reports every definition and reference in stable source-relative JSON',()=>{
    const temp=mkdtempSync(join(tmpdir(),'rpgameworks-authoring-'));
    try {
      const copy=join(temp,'source'),output=join(temp,'out'),a=join(temp,'a.json'),b=join(temp,'b.json');
      cpSync(fixture,copy,{recursive:true});
      expect(run(fixture,output,true,a).status).toBe(0);
      expect(run(copy,output,true,b).status).toBe(0);
      expect(readFileSync(a,'utf8')).toBe(readFileSync(b,'utf8'));
      const report=JSON.parse(readFileSync(a,'utf8')) as Report;
      expect(report).toMatchObject({schemaVersion:1,gameId:'demo:game.authoring-fixture',summary:{maps:2,warnings:6}});
      expect(report.definitions.map(def=>`${def.file}:${def.path}`)).toEqual([...report.definitions.map(def=>`${def.file}:${def.path}`)].sort());
      expect(report.warnings.map(warning=>warning.code)).toContain('orphan-definition');
      expect(new Set(report.warnings.map(warning=>warning.file))).toEqual(new Set(['facts.json','items.json','maps/start.json','quests.json']));
      expect(report.definitions.find(def=>def.id==='demo:map.fixture-side')?.referencedBy).toEqual([{file:'maps/start.json',id:'to-side',path:'/exits/0/targetMap'}]);
      expect(report.definitions.find(def=>def.id==='line')?.referencedBy).toEqual([
        {file:'maps/start.json',id:'unused-dialogue',path:'/dialogues/0/nodes/0/pages/0'},
        {file:'maps/start.json',id:'unused-message',path:'/messages/0/pages/0'},
      ]);
      expect(readFileSync(a,'utf8')).not.toContain(temp);
    } finally {rmSync(temp,{recursive:true,force:true});}
  });

  it('does not alter generated demo maps or manifest when validation writes a report',()=>{
    const temp=mkdtempSync(join(tmpdir(),'rpgameworks-authoring-'));
    try {
      const output=join(temp,'out'),reportPath=join(temp,'report.json');
      expect(run(demo,output).status).toBe(0);
      const before=packBytes(output);
      const checked=run(demo,output,true,reportPath);
      expect(checked.status).toBe(0);
      expect(checked.stdout).toContain('Authoring report:');
      expect(packBytes(output)).toEqual(before);
      expect(JSON.parse(readFileSync(reportPath,'utf8')) as Report).toMatchObject({summary:{maps:4,warnings:4}});
      expect(run(demo,output).status).toBe(0);
      expect(packBytes(output)).toEqual(before);
    } finally {rmSync(temp,{recursive:true,force:true});}
  });

  it.each(cases)('$name fixture has the expected severity and preserves prior output',testCase=>{
    const temp=mkdtempSync(join(tmpdir(),'rpgameworks-authoring-'));
    try {
      const source=join(temp,'source'),output=join(temp,'out'),reportPath=join(temp,'report.json');
      cpSync(fixture,source,{recursive:true});
      expect(run(source,output).status).toBe(0);
      expect(run(source,output,true,reportPath).status).toBe(0);
      const priorOutput=packBytes(output),priorReport=readFileSync(reportPath,'utf8');
      const file=join(source,testCase.file),data=JSON.parse(readFileSync(file,'utf8')) as unknown;
      setPointer(data,testCase.pointer,testCase.value);
      writeFileSync(file,JSON.stringify(data)+'\n');
      const result=run(source,output,true,reportPath);
      if(testCase.error) {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(`${testCase.file} [${testCase.recordId}]`);
        expect(result.stderr).toContain(testCase.pointer.replace(/\/x$/,''));
        expect(result.stderr).toContain(testCase.error);
        expect(readFileSync(reportPath,'utf8')).toBe(priorReport);
        expect(run(source,output).status).toBe(1);
      } else {
        expect(result.status).toBe(0);
        const report=JSON.parse(readFileSync(reportPath,'utf8')) as Report;
        expect(report.warnings.some(warning=>warning.code===testCase.warning && warning.severity==='warning')).toBe(true);
      }
      expect(packBytes(output)).toEqual(priorOutput);
    } finally {rmSync(temp,{recursive:true,force:true});}
  });

  it('rejects report output inside source or public assets',()=>{
    const temp=mkdtempSync(join(tmpdir(),'rpgameworks-authoring-'));
    try {
      const source=join(temp,'source');cpSync(fixture,source,{recursive:true});
      const output=join(temp,'out');
      expect(run(source,output,true,join(source,'report.json')).stderr).toContain('must be outside source');
      expect(run(source,output,true,'public/report.json').stderr).toContain('must be outside source');
      expect(run(source,output,false,join(temp,'report.json')).stderr).toContain('requires --check');
    } finally {rmSync(temp,{recursive:true,force:true});}
  });
});
