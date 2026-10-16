// One surface, three immutable texture pages. Scrubbing changes uniforms only.
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 rect;
layout(location=1) in vec4 meta;
uniform vec2 size;
uniform float time, duration, end, columns, motion, mode;
out vec2 uv;
out float alpha;
flat out float status;
const vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
void main(){
 vec2 c=corners[gl_VertexID];
 vec2 p; vec2 extent;
 status=meta.z;
 alpha=1.;
 if(mode<.5){
   p=vec2(58.+clamp(meta.x/duration,0.,1.)*(size.x-64.),meta.y*28.+45.);
   extent=vec2(2.,19.);
   alpha=meta.x<=time?1.:.28;
 }else{
   float start=max(0.,end-6.);
   float slot=meta.w-start;
   float age=max(0.,time-meta.x);
   alpha=motion>.5?1.:.4+.6*smoothstep(0.,10800.,age);
   float scale=motion>.5?1.:.85+.15*alpha;
   float cell=size.x/columns;
   float h=(size.y-192.)/ceil(6./columns);
   extent=vec2(min(cell-10.,h*.75),h-8.)*scale;
   p=vec2(mod(slot,columns)*cell+(cell-extent.x)*.5,192.+floor(slot/columns)*h+(h-extent.y)*.5);
   if(meta.w<start || meta.w>=end || meta.w<0. || meta.x>time){p=vec2(-10000.);alpha=0.;}
 }
 vec2 pixel=p+c*extent;
 gl_Position=vec4(pixel.x/size.x*2.-1.,1.-pixel.y/size.y*2.,0.,1.);
 uv=rect.xy+c*rect.zw;
}`;
const fragment=`#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform float mode;
in vec2 uv;
in float alpha;
flat in float status;
out vec4 color;
void main(){
 if(mode>.5){color=vec4(texture(atlas,uv).rgb,alpha);}
 else{vec3 ink=vec3(.55,.58,.65);if(status<.5)ink=vec3(.02,.43,.39);else if(status<1.5)ink=vec3(.18,.35,.83);else if(status<2.5)ink=vec3(.76,.23,.29);else if(status<3.5)ink=vec3(.62,.41,.04);color=vec4(ink,alpha);}
}`;
const statuses=['current','kept','rejected','shipped','candidate','unknown'];
const colors=['#066d64','#2e59d4','#c23b4a','#9e690a','#8c93a5','#8c93a5'];
export async function createSpriteRenderer(canvas,{atlas,base,rows,themes,min,max,reducedMotion}) {
  const sprites=new Map(atlas.sprites.map(s=>[s.key,s]));
  const images=await Promise.all(atlas.pages.map(async p=>{const image=new Image();image.decoding='async';image.src=new URL(p.file,base).href;await image.decode();return image;}));
  const entries=rows.map((e,i)=>({sprite:sprites.get(`${e.theme}/${e.version}`),time:(Date.parse(e.date)-min)/1000,lane:themes.indexOf(e.theme),status:Math.max(0,statuses.indexOf(e.status)),position:i,ordinal:i}));
  if(entries.some(e=>!e.sprite))throw new Error('Incomplete atlas');
  let width=1,height=1,dpr=1,now=(max-min)/1000,end=rows.length,raf=0,lost=false;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false});
  const ctx=gl?null:canvas.getContext('2d',{alpha:false});
  if(!gl&&!ctx)throw new Error('Canvas unavailable; use the archive');
  let program,uniforms,batches=[];
  function initializeGL(){
    function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
    program=gl.createProgram();const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    uniforms=Object.fromEntries(['size','time','duration','end','columns','motion','mode','atlas'].map(n=>[n,gl.getUniformLocation(program,n)]));
    batches=images.map((image,page)=>{
      const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
      const items=entries.filter(e=>e.sprite.page===page),buffer=gl.createBuffer(),vao=gl.createVertexArray();
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(let a=0;a<2;a++){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,32,a*16);gl.vertexAttribDivisor(a,1);}
      return {texture,buffer,vao,items};
    });
    upload();gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const debug=gl.getExtension('WEBGL_debug_renderer_info');canvas.dataset.gl=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  }
  function upload(){if(!gl||lost)return;for(const b of batches){gl.bindBuffer(gl.ARRAY_BUFFER,b.buffer);gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from(b.items.flatMap(e=>[...e.sprite.uv,e.time,e.lane,e.status,e.ordinal])),gl.STATIC_DRAW);}}
  function draw(){
    raf=0;if(lost||width<=16||height<=192)return;
    const columns=width<600?3:6;
    if(gl){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(242/255,241/255,236/255,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.round(8*dpr),Math.round((height-19)*dpr),Math.round((width-16)*dpr),Math.round(6*dpr));gl.clearColor(.72,.74,.78,1);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.scissor(Math.round(Math.max(0,Math.min(1,now/((max-min)/1000)))*(width-16)*dpr),Math.round((height-24)*dpr),Math.round(16*dpr),Math.round(16*dpr));gl.clearColor(.09,.23,.86,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.disable(gl.SCISSOR_TEST);
      gl.uniform2f(uniforms.size,width,height);gl.uniform1f(uniforms.time,now);gl.uniform1f(uniforms.duration,(max-min)/1000);gl.uniform1f(uniforms.end,end);gl.uniform1f(uniforms.columns,columns);gl.uniform1f(uniforms.motion,reducedMotion?1:0);gl.uniform1i(uniforms.atlas,0);
      for(const mode of [0,1]){gl.uniform1f(uniforms.mode,mode);for(const b of batches){gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.bindVertexArray(b.vao);gl.drawArraysInstanced(gl.TRIANGLES,0,6,b.items.length);}}
    }else{
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=1;ctx.fillStyle='#f2f1ec';ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#b8bdc8';ctx.fillRect(8,13,width-16,6);ctx.fillStyle='#173bdc';ctx.fillRect(Math.max(0,Math.min(1,now/((max-min)/1000)))*(width-16),8,16,16);
      const start=Math.max(0,end-6),cell=width/columns,h=(height-192)/Math.ceil(6/columns);
      for(const e of entries){ctx.globalAlpha=e.time<=now?1:.28;ctx.fillStyle=colors[e.status];ctx.fillRect(58+Math.max(0,Math.min(1,e.time/((max-min)/1000)))*(width-64),e.lane*28+45,2,19);
        if(e.ordinal<start||e.ordinal>=end||e.ordinal<0||e.time>now)continue;
        const t=Math.min(1,Math.max(0,(now-e.time)/10800)),alpha=reducedMotion?1:.4+.6*t*t*(3-2*t),scale=reducedMotion?1:.85+.15*alpha;
        const w=Math.min(cell-10,h*.75)*scale,sh=(h-8)*scale,slot=e.ordinal-start,image=images[e.sprite.page],uv=e.sprite.uv;
        ctx.globalAlpha=alpha;ctx.drawImage(image,uv[0]*image.width,uv[1]*image.height,uv[2]*image.width,uv[3]*image.height,(slot%columns)*cell+(cell-w)/2,192+Math.floor(slot/columns)*h+(h-sh)/2,w,sh);
      }
      ctx.globalAlpha=1;
    }
  }
  function request(){if(!raf)raf=requestAnimationFrame(draw);}
  if(gl)initializeGL();
  canvas.dataset.renderer=gl?'webgl2':'canvas2d';canvas.dataset.instances=String(entries.length);canvas.dataset.ready='true';
  const observer=new ResizeObserver(records=>{const r=records[0].contentRect;width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,3);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);request();});observer.observe(canvas);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;canvas.dataset.ready='false';});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;initializeGL();canvas.dataset.ready='true';request();});
  return {
    draw(time,streamEnd){now=(time-min)/1000;end=streamEnd;cancelAnimationFrame(raf);draw();},
    filter(positions){const ordinals=new Map(positions.map((p,i)=>[p,i]));for(const e of entries)e.ordinal=ordinals.get(e.position)??-1;upload();},
    hit(x,y){
      if(y>=40&&y<180){const lane=Math.min(4,Math.floor((y-40)/28)),time=min+Math.max(0,Math.min(1,(x-58)/(width-64)))*(max-min);let closest=-1,distance=Infinity;for(const e of entries){const delta=Math.abs(e.time*1000+min-time);if(e.lane===lane&&delta<distance){distance=delta;closest=e.position;}}return closest;}
      if(y<192)return -1;
      const columns=width<600?3:6,slot=Math.floor(x/(width/columns))+Math.floor((y-192)/((height-192)/Math.ceil(6/columns)))*columns;
      const e=entries.find(e=>e.ordinal===Math.max(0,end-6)+slot&&e.ordinal<end&&e.time<=now);return e?.position??-1;
    }
  };
}
