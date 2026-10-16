import assert from 'node:assert/strict';
import { test } from 'node:test';
const mod = await import('./frame-work.mjs').catch(() => ({}));
const x=(name,ts,dur,extra={})=>({name,ts,dur,ph:'X',pid:1,tid:2,...extra});
const mark=(name,ts)=>({name,ts,ph:'I',pid:1,tid:2});
test('trace work is unioned once per main-thread frame, not callback cadence',()=>{
  assert.equal(typeof mod.analyzeTrace,'function','trace analyzer must exist');
  const events=[mark('fw:start',0),x('ProxyMain::BeginMainFrame',0,4000),x('FireAnimationFrame',100,1000),x('Layout',200,500),x('PrePaint',1200,200),x('Paint',1400,400),x('Decode Image',1450,200),x('Paint',1500,1000,{tid:9}),x('ProxyMain::BeginMainFrame',16000,500),x('FireAnimationFrame',16100,100),mark('fw:end',32000)];
  const r=mod.analyzeTrace(events);
  assert.deepEqual(r.frames.map(f=>f.workMs),[1.6,.1]);
  assert.equal(r.forcedLayouts.length,1);
  assert.equal(r.frameCount,2);
});
test('admission fails closed on missing frames, thrash, LoAF and either work tail',()=>{
  assert.equal(typeof mod.gateRun,'function','gate must exist');
  const good={frameCount:240,work:{p95:4,max:8.3},counts:{FireAnimationFrame:240},forcedLayouts:[],loafs:[],errors:[],scrollDistance:5760};
  assert.equal(mod.gateRun(good).pass,true);
  for(const delta of [{frameCount:0},{work:{p95:4.01,max:5}},{work:{p95:1,max:8.31}},{forcedLayouts:[{}]},{loafs:[{}]},{errors:['image 404']},{scrollDistance:0}]) assert.equal(mod.gateRun({...good,...delta}).pass,false);
  assert.equal(mod.gateRun({...good,counts:{FireAnimationFrame:0}}).pass,false,'missing trace categories cannot pass');
  assert.throws(()=>mod.analyzeTrace([]),/marks/);
});
