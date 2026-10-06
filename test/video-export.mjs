import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const code = (await readFile(new URL('../js/blocks/video-export.js', import.meta.url),'utf8')).replace(/^import .*;\r?\n/, 'const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo } = globalThis.videoMocks;\n');
for (const mode of ['success','unsupported','cancel','encode-error']) {
 let restored=0, frames=0, cancelled=0, finalized=0;
 const nodes={};const node=key=>nodes[key] ||= {style:{},hidden:true,textContent:'',addEventListener(){},prepend(){},setAttribute(){}};
 const dialog={style:{},querySelector:node,addEventListener(type,fn){this[type]=fn;},showModal(){},close(){this.closeEvent?.();},remove(){}};
 dialog.addEventListener=(type,fn)=>{dialog[type==='close'?'closeEvent':type]=fn;};
 globalThis.document={body:{append(){}},styleSheets:[],createElement(tag){if(tag==='dialog')return dialog;return {getContext:()=>({fillRect(){},drawImage(){}})};},createElementNS:()=>node('style')};
 globalThis.Image=class {async decode(){}};
 globalThis.XMLSerializer=class {serializeToString(){return '<svg/>';}};
 globalThis.videoMocks={
  Output:class {constructor(){this.target={buffer:new ArrayBuffer(8)};}addVideoTrack(){}async start(){}async finalize(){finalized++;}async cancel(){cancelled++;}},
  Mp4OutputFormat:class {},BufferTarget:class {},canEncodeVideo:async()=>mode!=='unsupported',
  CanvasSource:class {async add(t,d){assert.equal(t,frames/24);assert.equal(d,1/24);frames++;if(mode==='cancel')node('button').onclick();if(mode==='encode-error')throw Error('test encoder error');}}
 };
 const module=await import('data:text/javascript;base64,'+Buffer.from(code+'\n// '+mode).toString('base64'));
 await module.exportAnimation({svg:{cloneNode:()=>node('svg')},begin:()=>({frame(){},restore(){restored++;}})});
 if(mode==='success'){assert.equal(frames,240);assert.equal(finalized,1);assert.equal(node('a').hidden,false);}
 if(mode==='unsupported'){assert.equal(frames,0);assert.equal(restored,0);}
 else assert.equal(restored,1);
 if(mode==='cancel'||mode==='encode-error')assert.equal(cancelled,1);
 if(mode!=='cancel')node('button').onclick();
 console.log('PASS video export:',mode);
}
