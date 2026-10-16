import assert from 'node:assert/strict';
import {captureLoafs} from './loaf-capture.mjs';
const observers=[];let serializations=0;
const entry=(startTime,duration)=>({startTime,duration,toJSON(){serializations++;return {startTime,duration,scripts:[{invoker:'FrameRequestCallback'}]};}});
class Observer {
 constructor(callback){this.callback=callback;this.queued=[];observers.push(this);}
 observe(options){assert.deepEqual(options,{type:'long-animation-frame'});}
 takeRecords(){const q=this.queued;this.queued=[];return q;}
 disconnect(){this.disconnected=true;}
}
const capture=captureLoafs(Observer),observer=observers[0];
observer.callback({getEntries:()=>[entry(1,60),entry(100,60)]});
assert.equal(serializations,0,'observer delivery must not serialize on the measured hot path');
observer.queued=[entry(200,60),entry(301,60)];
assert.deepEqual(capture.finish(50,300),[
 {startTime:1,duration:60,scripts:[{invoker:'FrameRequestCallback'}]},
 {startTime:100,duration:60,scripts:[{invoker:'FrameRequestCallback'}]},
 {startTime:200,duration:60,scripts:[{invoker:'FrameRequestCallback'}]},
]);
assert.equal(serializations,3,'serialize every overlapping entry exactly once, including takeRecords');
assert.equal(observer.disconnected,true);
console.log('PASS LoAF delivery avoids serialization; overlap, queued records and script attribution preserved');
