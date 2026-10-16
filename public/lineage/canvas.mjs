import {buildLabelAtlas} from './labels.mjs';
// A transparent atlas surface replaces pixels, never the locked DOM layout.
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 rect;
layout(location=1) in vec4 meta;
uniform vec2 size, pageSize;
uniform vec4 streamBox, previewBox, sliderBox;
uniform float laneLeft,laneWidth;
uniform vec4 heroBox[5],stateCardBox[5],stateTextBox[5];
uniform float streamHeight,textScale,currentIndex;
uniform vec4 dateBox,captionBox;
uniform float captionIndex,countIndex;
uniform vec4 countBox;
uniform float stateOrdinal[5];
uniform float time,duration,end,motion,mode,scrollX,previewIndex,laneTop,elapsed;
out vec2 uv;
out vec2 point;
out float alpha;
flat out float status;
const vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
void main(){
 vec2 c=corners[gl_VertexID],p,extent;
 status=meta.z;alpha=1.;
 if(mode>11.5){p=countBox.xy;extent=rect.zw*pageSize/textScale;if(meta.z!=countIndex){p=vec2(-10000.);alpha=0.;}}else if(mode>10.5){p=captionBox.xy;extent=rect.zw*pageSize/textScale;if(meta.z!=captionIndex){p=vec2(-10000.);alpha=0.;}}else if(mode>9.5){p=dateBox.xy;extent=rect.zw*pageSize/textScale;if(meta.z!=currentIndex){p=vec2(-10000.);alpha=0.;}}else if(mode>8.5){
   float slot=float(gl_InstanceID);p=vec2(streamBox.x+slot*(streamBox.z+10.)-scrollX,streamBox.y);extent=vec2(streamBox.z,streamHeight);
   if(slot>=min(6.,end)){p=vec2(-10000.);alpha=0.;}
 }else if(mode>5.5){
   int lane=int(meta.y);extent=rect.zw*pageSize/textScale;
   if(mode<6.5){p=stateTextBox[lane].xy;if(stateOrdinal[lane]<0.||meta.w!=stateOrdinal[lane]){p=vec2(-10000.);alpha=0.;}}
   else if(mode<7.5){float start=max(0.,end-6.);p=vec2(streamBox.x+(meta.w-start)*(streamBox.z+10.)+7.-scrollX,streamBox.y+streamBox.w+13.);if(meta.w<start||meta.w>=end||meta.w<0.){p=vec2(-10000.);alpha=0.;}}
   else{p=stateCardBox[lane].xy+vec2(12.);if(stateOrdinal[lane]>=0.){p=vec2(-10000.);alpha=0.;}}
 }else if(mode>3.5){
   int lane=mode>4.5?gl_InstanceID:int(meta.y);vec4 box=mode>4.5?stateCardBox[lane]:heroBox[lane];
   p=box.xy;extent=box.zw;
   if(mode<4.5){float ratio=rect.z*pageSize.x/(rect.w*pageSize.y);float h=min(box.w,box.z/ratio);extent=vec2(h*ratio,h);p+=(box.zw-extent)*.5;}
   if(mode<4.5&&(stateOrdinal[lane]<0.||meta.w!=stateOrdinal[lane])){p=vec2(-10000.);alpha=0.;}
 }else if(mode>2.5){p=sliderBox.xy;extent=sliderBox.zw;}else if(mode<.5){
   p=vec2(laneLeft+58.5+clamp(meta.x/duration,0.,1.)*(laneWidth-65.),laneTop+meta.y*28.+6.);
   extent=vec2(3.,17.);
 }else{
   float start=max(0.,end-6.),slot=meta.w-start;
   vec2 box=vec2(streamBox.z-14.,streamBox.w);
   p=vec2(streamBox.x+slot*(streamBox.z+10.)+7.-scrollX,streamBox.y+7.);
   float ratio=rect.z*pageSize.x/(rect.w*pageSize.y);
   float h=min(box.y,box.x/ratio);extent=vec2(h*ratio,h);
   p+=(box-extent)*.5;
   float age=clamp((max(0.,time-meta.x)+elapsed)/.14,0.,1.);
   float eased=1.-pow(1.-age,3.);
   alpha=motion>.5?1.:.65+.35*eased;
   float scale=motion>.5?1.:.985+.015*eased;
   p+=extent*(1.-scale)*.5;extent*=scale;
   if(meta.w<start||meta.w>=end||meta.w<0.){p=vec2(-10000.);alpha=0.;}
   if(mode>1.5){
     alpha=1.;box=previewBox.zw;h=min(box.y,box.x/ratio);extent=vec2(h*ratio,h);
     p=previewBox.xy+(box-extent)*.5;
     if(float(gl_InstanceID)!=previewIndex){p=vec2(-10000.);alpha=0.;}
   }
 }
 vec2 pixel=p+c*extent;
 gl_Position=vec4(pixel.x/size.x*2.-1.,1.-pixel.y/size.y*2.,0.,1.);
 uv=rect.xy+c*rect.zw;point=c*extent;
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform float mode,time,duration;
uniform vec4 sliderBox;
in vec2 uv;
in vec2 point;
in float alpha;
flat in float status;
out vec4 color;
float pill(vec2 p,vec2 center,vec2 halfSize,float radius){vec2 q=abs(p-center)-halfSize+radius;return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}
void main(){
 if(mode>8.5&&mode<9.5){color=vec4(vec3(227.,227.,222.)/255.,alpha);}else if(mode>5.5){color=texture(atlas,uv);color.a*=alpha;}else if(mode>4.5){color=vec4(vec3(227.,227.,222.)/255.,alpha);}else if(mode>2.5&&mode<3.5){
  float w=sliderBox.z,center=8.+clamp(time/duration,0.,1.)*(w-16.);
  vec3 paper=vec3(242.,241.,236.)/255.,blue=vec3(23.,59.,220.)/255.;
  float outer=clamp(.5-pill(point,vec2(w*.5,16.),vec2(w*.5-1.,4.),4.),0.,1.);
  float inner=clamp(.5-pill(point,vec2(w*.5,16.),vec2(w*.5-2.,3.),3.),0.,1.);
  vec3 ink=mix(paper,vec3(178./255.),outer);ink=mix(ink,vec3(239./255.),inner);
  if(point.x<center)ink=mix(paper,blue,outer);
  float thumb=clamp(.5-(length(point-vec2(center,16.))-8.),0.,1.);
  color=vec4(mix(ink,blue,thumb),1.);
 }else if(mode>.5){color=vec4(texture(atlas,uv).rgb,alpha);}
 else{vec3 ink=vec3(140.,147.,165.);if(status<.5)ink=vec3(6.,109.,100.);else if(status<1.5)ink=vec3(53.,123.,51.);else if(status<2.5)ink=vec3(180.,62.,46.);else if(status<3.5)ink=vec3(49.,80.,191.);color=vec4(ink/255.,1.);}
}`;
const statuses=['current','kept','rejected','shipped','candidate','unknown'];
const colors=['#066d64','#357b33','#b43e2e','#3150bf','#8c93a5','#8c93a5'];
export async function createSpriteRenderer(canvas,{atlas,base,rows,themes,min,max,reducedMotion,surface,lanes,previewImage,streamRow,range,readout,stateRow,formatted}){
 const sprites=new Map(atlas.sprites.map(s=>[s.key,s]));
 const images=atlas.pages.map(p=>({width:p.width,height:p.height}));
 let started=false,imagesReady=false,labelsReady=false,labelGeneration=0,interactingUntil=0;
 const idle=()=>new Promise(resolve=>{function next(){if(performance.now()<interactingUntil){setTimeout(next,100);return;}if('requestIdleCallback' in window)requestIdleCallback(()=>{if(performance.now()<interactingUntil)next();else resolve();});else setTimeout(resolve,16);}next();});
 const modes=[0,9,1,2,5,4,6,7,8,3,10,11,12];
 const entries=rows.map((e,i)=>({sprite:sprites.get(`${e.theme}/${e.version}`),time:(Date.parse(e.date)-min)/1000,lane:themes.indexOf(e.theme),status:Math.max(0,statuses.indexOf(e.status)),position:i,ordinal:i,labelVersion:e.version,labelStatus:e.status,labelCaption:`${e.theme} / ${e.version} · ${e.caption||e.phase}`}));
 if(entries.some(e=>!e.sprite))throw new Error('Incomplete atlas');
 let width=1,height=1,dpr=1,now=(max-min)/1000,end=rows.length,raf=0,lost=false,scrollX=0,preview=-1,laneTop=0,changed=0;
 let streamBox=[0,0,164,200],previewBox=[0,0,0,0],sliderBox=[0,0,0,32],laneLeft=0,laneWidth=1,streamWidth=1,documentTop=0,naturalTop=0,bottomPadding=0,scrollY=window.scrollY,visible=true;
 let gl=null,ctx=null;
 let program,uniforms,batches=[],filtered=entries,activePages=new Set(),heroPages=new Set(),live=false,glyphBatches=[],glyphPages=[],labelKey='',glyphLookup=new Map(),currentIndex=entries.length-1,dateBox=[0,0,280,24],captionBox=[0,0,1,64],captionIndex=entries.length-1,beforeDraw=null,labelProfile=null,countBox=[0,0,280,24],countIndex=entries.length;
 const stateIds=new Int32Array(5).fill(-1),stateOrdinal=new Float32Array(5).fill(-1),heroBox=new Float32Array(20);let heroClip=[0,0,1,1],stateScroll=0,streamHeight=1,streamClipHeight=1;const stateCardBox=new Float32Array(20),stateTextBox=new Float32Array(20);
 function visiblePages(){activePages.clear();for(let i=Math.max(0,end-6);i<end&&i<filtered.length;i++)activePages.add(filtered[i].sprite.page);}
 visiblePages();
 function initializeGL(){
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  uniforms=Object.fromEntries(['size','pageSize','streamBox','previewBox','time','duration','end','motion','mode','atlas','scrollX','previewIndex','laneTop','elapsed','sliderBox','laneLeft','laneWidth','heroBox[0]','stateOrdinal[0]','stateCardBox[0]','stateTextBox[0]','streamHeight','textScale','currentIndex','dateBox','captionBox','captionIndex','countBox','countIndex'].map(n=>[n,gl.getUniformLocation(program,n)]));
  batches=images.map((image,page)=>{
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([227,227,222,255]));
   const items=entries.filter(e=>e.sprite.page===page),buffer=gl.createBuffer(),vao=gl.createVertexArray();
   gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,32,a*16);gl.vertexAttribDivisor(a,1);}
   return {texture,buffer,vao,items,image,page,loaded:false};
  });
  const buffer=gl.createBuffer(),vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,32,a*16);gl.vertexAttribDivisor(a,1);}
  batches.push({texture:batches[0].texture,image:images[0],items:entries,buffer,vao,isTicks:true});
  uploadGlyphs();upload();gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const debug=gl.getExtension('WEBGL_debug_renderer_info');canvas.dataset.gl=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 }
 function uploadGlyphs(){
  if(!gl||lost)return;
  for(const b of glyphBatches){gl.deleteTexture(b.texture);gl.deleteBuffer(b.buffer);gl.deleteVertexArray(b.vao);}
  glyphBatches=glyphPages.map(page=>{
   const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,page.image);
   const buffer=gl.createBuffer(),vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,32,a*16);gl.vertexAttribDivisor(a,1);}
   return {...page,texture,buffer,vao};
  });
 }
 function upload(){if(!gl||lost)return;for(const b of [...batches,...glyphBatches]){gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from(b.items.flatMap(e=>[...e.sprite.uv,e.time,e.lane,b.kind>=10?e.position:e.status,(e.origin||e).ordinal])),gl.STATIC_DRAW);}}
 function draw(){
  raf=0;if(lost||(!gl&&!ctx)||width<=65||height<=1)return;
  const elapsed=Math.min(.14,(performance.now()-changed)/1000);
  sliderBox[1]=Math.min(height-bottomPadding-32,Math.max(naturalTop,scrollY-documentTop));
  if(gl){
   gl.disable(gl.SCISSOR_TEST);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
   gl.uniform2f(uniforms.size,width,height);gl.uniform4fv(uniforms.streamBox,streamBox);gl.uniform4fv(uniforms.previewBox,previewBox);gl.uniform4fv(uniforms.sliderBox,sliderBox);gl.uniform4fv(uniforms['heroBox[0]'],heroBox);gl.uniform1fv(uniforms['stateOrdinal[0]'],stateOrdinal);gl.uniform4fv(uniforms['stateCardBox[0]'],stateCardBox);gl.uniform4fv(uniforms['stateTextBox[0]'],stateTextBox);gl.uniform1f(uniforms.streamHeight,streamHeight);gl.uniform1f(uniforms.textScale,dpr);gl.uniform1f(uniforms.currentIndex,currentIndex);gl.uniform4fv(uniforms.dateBox,dateBox);gl.uniform4fv(uniforms.captionBox,captionBox);gl.uniform1f(uniforms.captionIndex,captionIndex);gl.uniform4fv(uniforms.countBox,countBox);gl.uniform1f(uniforms.countIndex,countIndex);
   gl.uniform1f(uniforms.time,now);gl.uniform1f(uniforms.duration,(max-min)/1000);gl.uniform1f(uniforms.end,end);gl.uniform1f(uniforms.motion,reducedMotion?1:0);gl.uniform1f(uniforms.scrollX,scrollX);gl.uniform1f(uniforms.laneTop,laneTop);gl.uniform1f(uniforms.laneLeft,laneLeft);gl.uniform1f(uniforms.laneWidth,laneWidth);gl.uniform1f(uniforms.elapsed,elapsed);
   gl.uniform1i(uniforms.atlas,0);
   if(live){for(let i=0;i<3;i++){const box=i===0?dateBox:i===1?captionBox:countBox;gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round(box[0]*dpr),Math.max(0,Math.round((height-box[1]-box[3])*dpr)),Math.round(box[2]*dpr),Math.round(box[3]*dpr));gl.clearColor(242/255,241/255,236/255,1);gl.clear(gl.COLOR_BUFFER_BIT);}}
   if(live){gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round(streamBox[0]*dpr),Math.max(0,Math.round((height-streamBox[1]-streamClipHeight)*dpr)),Math.round(streamWidth*dpr),Math.round(streamClipHeight*dpr));gl.clearColor(242/255,241/255,236/255,1);gl.clear(gl.COLOR_BUFFER_BIT);}
   for(const mode of modes){
    if(mode>=4&&!live)continue;
    if(mode===2&&preview<0)continue;
    if(mode===1||mode===7||mode===9){gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round(streamBox[0]*dpr),Math.max(0,Math.round((height-streamBox[1]-streamClipHeight)*dpr)),Math.round(streamWidth*dpr),Math.round(streamClipHeight*dpr));}else if(mode===4||mode===5||mode===6||mode===8){gl.enable(gl.SCISSOR_TEST);gl.scissor(Math.round(heroClip[0]*dpr),Math.max(0,Math.round((height-heroClip[1]-heroClip[3])*dpr)),Math.round(heroClip[2]*dpr),Math.round(heroClip[3]*dpr));}else gl.disable(gl.SCISSOR_TEST);
    gl.uniform1f(uniforms.mode,mode);
    if((mode>=6&&mode<=8)||mode>=10){for(const b of glyphBatches){if(b.kind!==mode)continue;if(mode===6&&!stateIds.some(id=>id>=b.first&&id<=b.last))continue;if(mode===7){let intersects=false;for(let i=Math.max(0,end-6);i<end&&i<filtered.length;i++){const id=filtered[i].position;if(id>=b.first&&id<=b.last){intersects=true;break;}}if(!intersects)continue;}if(mode>=10){const selected=mode===10?currentIndex:mode===11?captionIndex:countIndex;if(selected<b.first||selected>b.last)continue;}gl.uniform2f(uniforms.pageSize,b.image.width,b.image.height);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.bindVertexArray(b.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,b.items.length);}continue;}
    if(mode===9){gl.bindVertexArray(batches.at(-1).vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,6);continue;}
    if(mode===5){gl.bindVertexArray(batches.at(-1).vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,5);continue;}
    if(mode===3){gl.bindVertexArray(batches.at(-1).vao);gl.drawArrays(gl.TRIANGLES,0,6);continue;}
    for(const b of batches){
     if((mode===0)!==Boolean(b.isTicks)||(mode===1&&!activePages.has(b.page))||(mode===4&&!heroPages.has(b.page)))continue;
     if(mode!==0&&!b.loaded)continue;
     const previewIndex=mode===2?b.items.findIndex(e=>e.position===preview):-1;
     if(mode===2&&previewIndex<0)continue;
     gl.uniform1f(uniforms.previewIndex,previewIndex);gl.uniform2f(uniforms.pageSize,b.image.width,b.image.height);
     gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.bindVertexArray(b.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,b.items.length);
    }
   }
  }else{
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.globalAlpha=1;
   for(const e of entries){ctx.fillStyle=colors[e.status];ctx.fillRect(laneLeft+58.5+Math.max(0,Math.min(1,e.time/((max-min)/1000)))*(laneWidth-65),laneTop+e.lane*28+6,3,17);}
   function image(e,box,alpha=1,scale=1){
    const image=images[e.sprite.page];if(!image.loaded)return;const uv=e.sprite.uv,ratio=uv[2]*image.width/(uv[3]*image.height),h=Math.min(box[3],box[2]/ratio)*scale,w=h*ratio;
    ctx.globalAlpha=alpha;ctx.drawImage(image,uv[0]*image.width,uv[1]*image.height,uv[2]*image.width,uv[3]*image.height,box[0]+(box[2]-w)/2,box[1]+(box[3]-h)/2,w,h);
   }
   function text(kind,entry,x,y){const g=glyphLookup.get(`${kind}/${entry}`);if(!g)return;const {image,uv}=g;ctx.globalAlpha=1;ctx.drawImage(image,uv[0]*image.width,uv[1]*image.height,uv[2]*image.width,uv[3]*image.height,x,y,uv[2]*image.width/dpr,uv[3]*image.height/dpr);}
   const start=Math.max(0,end-6);ctx.save();ctx.beginPath();ctx.rect(streamBox[0],streamBox[1],streamWidth,streamClipHeight);ctx.clip();
   if(live){ctx.fillStyle='#f2f1ec';ctx.fillRect(streamBox[0],streamBox[1],streamWidth,streamClipHeight);ctx.fillStyle='#e3e3de';for(let slot=0;slot<Math.min(6,end);slot++)ctx.fillRect(streamBox[0]+slot*(streamBox[2]+10)-scrollX,streamBox[1],streamBox[2],streamHeight);}
   for(const e of entries){if(e.ordinal<start||e.ordinal>=end||e.ordinal<0)continue;
    const age=Math.min(1,(Math.max(0,now-e.time)+elapsed)/.14),ease=1-(1-age)**3;
    image(e,[streamBox[0]+(e.ordinal-start)*(streamBox[2]+10)+7-scrollX,streamBox[1]+7,streamBox[2]-14,streamBox[3]],reducedMotion?1:.65+.35*ease,reducedMotion?1:.985+.015*ease);
   }
   if(live)for(const e of filtered.slice(start,end))text(7,e.position,streamBox[0]+(e.ordinal-start)*(streamBox[2]+10)+7-scrollX,streamBox[1]+streamBox[3]+13);
   ctx.restore();if(preview>=0&&previewBox[3]>0)image(entries[preview],previewBox);ctx.globalAlpha=1;
   if(live){ctx.save();ctx.beginPath();ctx.rect(...heroClip);ctx.clip();for(let lane=0;lane<5;lane++){const slot=Array.from(stateCardBox.subarray(lane*4,lane*4+4));ctx.fillStyle='#e3e3de';ctx.fillRect(...slot);if(stateIds[lane]>=0){image(entries[stateIds[lane]],Array.from(heroBox.subarray(lane*4,lane*4+4)));text(6,stateIds[lane],stateTextBox[lane*4],stateTextBox[lane*4+1]);}else text(8,lane,slot[0]+12,slot[1]+12);}ctx.restore();}

   const [sx,sy,sw]=sliderBox,cx=sx+8+Math.max(0,Math.min(1,now/((max-min)/1000)))*(sw-16);
   ctx.fillStyle='#f2f1ec';ctx.fillRect(sx,sy,sw,32);
   ctx.beginPath();ctx.roundRect(sx+1,sy+12,sw-2,8,4);ctx.fillStyle='#b2b2b2';ctx.fill();
   ctx.beginPath();ctx.roundRect(sx+2,sy+13,sw-4,6,3);ctx.fillStyle='#efefef';ctx.fill();
   ctx.save();ctx.beginPath();ctx.rect(sx,sy,cx-sx,32);ctx.clip();ctx.beginPath();ctx.roundRect(sx+1,sy+12,sw-2,8,4);ctx.fillStyle='#173bdc';ctx.fill();ctx.restore();
   ctx.beginPath();ctx.arc(cx,sy+16,8,0,Math.PI*2);ctx.fillStyle='#173bdc';ctx.fill();
   if(live){ctx.globalAlpha=1;ctx.fillStyle='#f2f1ec';for(let i=0;i<3;i++){const box=i===0?dateBox:i===1?captionBox:countBox;ctx.fillRect(box[0],box[1],box[2],box[3]);}text(10,currentIndex,dateBox[0],dateBox[1]);text(11,captionIndex,captionBox[0],captionBox[1]);text(12,countIndex,countBox[0],countBox[1]);}
  }
  if(!reducedMotion&&elapsed<.14)request();
 }
 function markReady(){canvas.dataset.assetsReady=String(imagesReady&&labelsReady);request();}
 async function installImage(page,image,strips){
  const b=batches[page];
  if(gl){
   await idle();gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,image.width,image.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   for(const strip of strips){await idle();gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,strip.y,gl.RGBA,gl.UNSIGNED_BYTE,strip.image);strip.image.close();}
   await idle();gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);b.image=image;b.loaded=true;
  }else for(const strip of strips)strip.image.close();
  image.loaded=true;images[page]=image;request();
 }
 async function loadPages(){
  // Prioritize the current six-card window, then preserved states at end.
  const priority=[...activePages];for(let i=entries.length-1;i>=0;i--){const p=entries[i].sprite.page;if(!priority.includes(p))priority.push(p);}
  const source=`onmessage=async({data})=>{try{const blob=await(await fetch(data)).blob(),image=await createImageBitmap(blob),strips=[];for(let y=0;y<image.height;y+=128)strips.push({y,image:await createImageBitmap(image,0,y,image.width,Math.min(128,image.height-y))});postMessage({image,strips},[image,...strips.map(s=>s.image)]);}catch(e){postMessage({error:String(e)})}}`;
  const workerURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(workerURL);
  try{for(const page of priority){await idle();const result=await new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data);worker.onerror=reject;worker.postMessage(new URL(atlas.pages[page].file,base).href);});await installImage(page,result.image,result.strips);}imagesReady=true;markReady();}
  finally{worker.terminate();URL.revokeObjectURL(workerURL);}
 }
 let labelWorker=null;
 async function refreshLabels(){
  if(!labelProfile)return;
  const generation=++labelGeneration;labelsReady=false;labelWorker?.terminate();
  await idle();if(generation!==labelGeneration)return;
  const source=`const buildLabelAtlas=${buildLabelAtlas.toString()};onmessage=({data})=>{try{const pages=buildLabelAtlas(data);postMessage({pages},pages.map(p=>p.image));}catch(e){postMessage({error:String(e)})}}`;
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url);labelWorker=worker;
  try{
   const pages=await new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.pages);worker.onerror=reject;worker.postMessage({entries,themes,formatted,...labelProfile,total:filtered.length});});
   if(generation!==labelGeneration){for(const page of pages)page.image.close();return;}
   for(const b of glyphBatches){gl?.deleteTexture(b.texture);gl?.deleteBuffer(b.buffer);gl?.deleteVertexArray(b.vao);}for(const p of glyphPages)p.image.close?.();glyphBatches=[];glyphPages=[];glyphLookup.clear();
   for(const page of pages){
    await idle();if(generation!==labelGeneration){for(const p of pages)if(!glyphPages.includes(p))p.image.close();return;}
    for(const e of page.items){e.origin=entries[e.position]||e;glyphLookup.set(`${page.kind}/${page.kind===8?e.lane:e.position}`,{image:page.image,uv:e.sprite.uv});}
    glyphPages.push(page);
    if(gl){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,page.image);
     const buffer=gl.createBuffer(),vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,32,a*16);gl.vertexAttribDivisor(a,1);}gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from(page.items.flatMap(e=>[...e.sprite.uv,e.time,e.lane,page.kind>=10?e.position:e.status,e.origin.ordinal])),gl.STATIC_DRAW);glyphBatches.push({...page,texture,buffer,vao});}
   }
   labelsReady=true;markReady();
  }catch(error){console.warn('Timeline labels unavailable; native text retained',error);}
  finally{worker.terminate();URL.revokeObjectURL(url);if(labelWorker===worker)labelWorker=null;}
 }
 async function startAssets(){if(started)return;started=true;await idle();gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:false,stencil:false,premultipliedAlpha:true});ctx=gl?null:canvas.getContext('2d');if(!gl&&!ctx)return;if(gl)initializeGL();canvas.dataset.renderer=gl?'webgl2':'canvas2d';canvas.dataset.ready='true';loadPages().catch(error=>console.warn('Timeline atlas unavailable; archive retained',error));refreshLabels();request();}
 function request(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;const work=beforeDraw;beforeDraw=null;if(work)work();else draw();});}
 canvas.dataset.renderer='pending';canvas.dataset.instances=String(entries.length);canvas.dataset.ready='false';canvas.dataset.assetsReady='false';
 // Only ResizeObserver reads layout. No geometry read occurs in the scrub path.
 const observer=new ResizeObserver(()=>{
  const r=canvas.getBoundingClientRect(),s=streamRow.getBoundingClientRect(),p=previewImage.getBoundingClientRect(),l=lanes.getBoundingClientRect(),slider=range.getBoundingClientRect(),reading=readout.getBoundingClientRect();
  const card=streamRow.firstElementChild.getBoundingClientRect(),image=streamRow.querySelector('.tl-stream-image').getBoundingClientRect(),state=stateRow.getBoundingClientRect();
  heroClip=[state.left-r.left,state.top-r.top,stateRow.clientWidth,stateRow.clientHeight];stateScroll=stateRow.scrollLeft;
  stateRow.querySelectorAll('img').forEach((n,i)=>{const b=n.getBoundingClientRect();heroBox.set([b.left-r.left,b.top-r.top,b.width,b.height],i*4);const card=n.closest('.tl-state-slot').getBoundingClientRect(),title=n.nextElementSibling.getBoundingClientRect();stateCardBox.set([card.left-r.left,card.top-r.top,card.width,card.height],i*4);stateTextBox.set([title.left-r.left,title.top-r.top,title.width,title.height],i*4);});
  width=Math.max(1,r.width);height=Math.max(1,r.height);laneTop=l.top-r.top;laneLeft=l.left-r.left;laneWidth=l.width;streamWidth=streamRow.clientWidth;streamHeight=card.height;streamClipHeight=streamRow.clientHeight;
  naturalTop=reading.bottom-r.top+16;documentTop=r.top+window.scrollY;scrollY=window.scrollY;bottomPadding=parseFloat(getComputedStyle(surface).paddingBottom);sliderBox=[slider.left-r.left,naturalTop,slider.width,32];
  streamBox=[s.left-r.left,s.top-r.top,card.width,image.height];previewBox=[p.left-r.left,p.top-r.top,p.width,p.height];
  dpr=Math.min(devicePixelRatio||1,3);
  const style=n=>{const s=getComputedStyle(n);return {font:s.font,color:s.color,letterSpacing:s.letterSpacing,lineHeight:parseFloat(s.lineHeight)||0,maxHeight:parseFloat(s.maxHeight)||64};};
  const dateRect=readout.querySelector('time').getBoundingClientRect();dateBox=[dateRect.left-r.left,dateRect.top-r.top,280,24];
  const captionRect=readout.querySelector('p').getBoundingClientRect();const captionCentered=!matchMedia('(max-width:700px)').matches;const captionWidth=captionCentered?Math.floor(readout.clientWidth*.58*64)/64:readout.clientWidth;captionBox=[captionCentered?reading.right-r.left-captionWidth:captionRect.left-r.left,captionCentered?reading.top-r.top+(reading.height-1-64-10)/2:captionRect.top-r.top,captionWidth,64];
  const counter=surface.querySelector('[data-timeline-count]'),counterRect=counter.getBoundingClientRect();countBox=[captionCentered?counterRect.right-r.left-280:counterRect.left-r.left,counterRect.top-r.top,280,24];
  const styles={count:style(counter),caption:style(readout.querySelector('p')),date:style(readout.querySelector('time')),stateTitle:style(stateRow.querySelector('strong')),stateDetail:style(stateRow.querySelector('.tl-state-artifact span')),streamTitle:style(streamRow.querySelector('strong')),streamDetail:style(streamRow.querySelector('span:not(.tl-stream-image)')),empty:style(stateRow.querySelector('.tl-no-state'))};
  const profile={captionWidth,captionCentered,stateWidth:heroBox[2],streamWidth:card.width-14,emptyWidth:stateCardBox[2]-24,styles,dpr},key=JSON.stringify(profile);
  if(key!==labelKey&&profile.stateWidth>0){labelKey=key;labelProfile=profile;if(started)refreshLabels();}
  if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);request();
 });
 for(const node of [surface,lanes,previewImage,streamRow,stateRow,readout.querySelector('time'),readout.querySelector('p'),...stateRow.querySelectorAll('img')])observer.observe(node);
 stateRow.addEventListener('scroll',()=>{const x=stateRow.scrollLeft,delta=x-stateScroll;stateScroll=x;for(let i=0;i<5;i++){heroBox[i*4]-=delta;stateCardBox[i*4]-=delta;stateTextBox[i*4]-=delta;}if(live)request();},{passive:true});
 new IntersectionObserver(records=>{visible=records[0].isIntersecting;if(visible){startAssets();request();}},{rootMargin:'200px'}).observe(canvas);
 document.addEventListener('scroll',()=>{scrollY=window.scrollY;if(visible)request();},{passive:true});
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;imagesReady=false;labelsReady=false;glyphBatches=[];for(const p of glyphPages)p.image.close?.();glyphPages=[];glyphLookup.clear();canvas.dataset.ready='false';canvas.dataset.assetsReady='false';});
 canvas.addEventListener('webglcontextrestored',async()=>{lost=false;for(let i=0;i<images.length;i++){images[i].close?.();images[i]={width:atlas.pages[i].width,height:atlas.pages[i].height};}initializeGL();refreshLabels();await loadPages();canvas.dataset.ready='true';request();});
 return {
  get liveReady(){return imagesReady&&labelsReady;},
  draw(time,streamEnd,states,position){if(states)interactingUntil=performance.now()+120;if(position!==undefined)currentIndex=position;if(states&&imagesReady&&labelsReady){countIndex=streamEnd;if(!live)surface.dataset.canvasLive='true';live=true;heroPages.clear();for(let i=0;i<5;i++){const id=states[i];stateIds[i]=id;stateOrdinal[i]=id>=0?entries[id].ordinal:-1;if(id>=0)heroPages.add(entries[id].sprite.page);}}if(end!==streamEnd){changed=performance.now();end=streamEnd;visiblePages();}now=(time-min)/1000;cancelAnimationFrame(raf);draw();},
  filter(positions){const ordinals=new Map(positions.map((p,i)=>[p,i]));for(const e of entries)e.ordinal=ordinals.get(e.position)??-1;filtered=entries.filter(e=>e.ordinal>=0).sort((a,b)=>a.ordinal-b.ordinal);visiblePages();if(started)refreshLabels();upload();},
  schedule(work){beforeDraw=work;request();},
  caption(index){captionIndex=index;request();},
  settle(){if(live)surface.dataset.canvasLive='false';live=false;request();},
  scroll(x){scrollX=x;request();},
  preview(i){preview=i;request();},
  hitLane(lane,x){let closest=-1,distance=1.5;for(const e of entries){const px=Math.max(0,Math.min(1,e.time/((max-min)/1000)))*(laneWidth-65),delta=Math.abs(px-x);if(e.lane===lane&&delta<=distance){distance=delta;closest=e.position;}}return closest;}
 };
}
