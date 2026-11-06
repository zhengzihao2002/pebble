const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const source=buildSync({entryPoints:['src/lib/fluidBackground.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture(reduced=false){
 const callbacks=new Map(),events=new Map(),canvasEvents=new Map(),motionEvents=new Map();let id=0,draws=0,deleted=0,options;const uniforms={};
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,TRIANGLES:8,
 createProgram:()=>({}),createShader:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,
 drawArrays:()=>draws++,deleteProgram:()=>deleted++,deleteShader:()=>deleted++,deleteBuffer:()=>deleted++};
 gl.uniform1f=(name,value)=>{uniforms[name]=value};gl.uniform3fv=(name,value)=>{uniforms[name]=[...value]};
 for(const key of ['shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','uniform2f','viewport'])gl[key]=()=>{};
 const root={addEventListener(){},removeEventListener(){}};
 const canvas={style:{},dataset:{},width:300,height:150,getContext:(_,configuration)=>{options=configuration;return gl},closest:()=>root,getBoundingClientRect:()=>({width:2168,height:1368}),addEventListener:(k,v)=>canvasEvents.set(k,v),removeEventListener:k=>canvasEvents.delete(k)};
 const motion={matches:reduced,addEventListener:(k,v)=>motionEvents.set(k,v),removeEventListener:k=>motionEvents.delete(k)};
 const document={hidden:false,documentElement:{},createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},getImageData:()=>({data:[30,80,60,255]})})}),addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,document,matchMedia:()=>motion,getComputedStyle:()=>({getPropertyValue:()=> '#123456'}),ResizeObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{callbacks.set(++id,fn);return id},cancelAnimationFrame:n=>callbacks.delete(n)});
 const stop=module.exports.startFluidBackground(canvas);
 const tick=now=>{const queued=[...callbacks.values()];callbacks.clear();queued.forEach(fn=>fn(now))};
 return{canvas,stop,tick,callbacks,events,motion,motionEvents,canvasEvents,document,options,uniforms,get draws(){return draws},get deleted(){return deleted}};
}
test('bounds GPU size and frequency, pauses hidden tabs, resumes and cleans resources',()=>{
 const f=fixture();assert.equal(Math.max(f.canvas.width,f.canvas.height),700);const initial=f.draws;
 for(let n=0;n<=1000;n+=10)f.tick(n);assert(f.draws-initial<=24);assert(f.draws>initial);
 f.document.hidden=true;f.events.get('visibilitychange')();assert.equal(f.callbacks.size,0);const hidden=f.draws;f.tick(2000);assert.equal(f.draws,hidden);
 f.document.hidden=false;f.events.get('visibilitychange')();assert.equal(f.callbacks.size,1);
 f.canvasEvents.get('webglcontextlost')({preventDefault(){}});assert.equal(f.callbacks.size,0);assert.equal(f.canvas.style.opacity,'0');
 f.canvasEvents.get('webglcontextrestored')();assert.equal(f.callbacks.size,1);
 f.stop();assert.equal(f.callbacks.size,0);assert.equal(f.events.size,0);assert.equal(f.motionEvents.size,0);assert.equal(f.canvasEvents.size,0);assert(f.deleted>=4);
});
test('reduced motion draws a static frame without scheduling a loop',()=>{
 const f=fixture(true);assert.equal(f.draws,1);assert.equal(f.callbacks.size,0);f.tick(1000);assert.equal(f.draws,1);
 f.motion.matches=false;f.motionEvents.get('change')();assert.equal(f.callbacks.size,1);f.stop();
});

test('keeps the theme paper transparent and limits primary-colour light to seven percent',()=>{const f=fixture();assert.equal(f.options.alpha,true);assert.equal(f.options.premultipliedAlpha,false);assert.ok(f.uniforms.u_strength<=.07);assert.equal(f.uniforms.u_tint.length,3);assert.equal(f.uniforms.u_colors,undefined);assert.equal(f.uniforms.u_base,undefined);f.stop()});
