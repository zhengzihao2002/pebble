const vertex = `attribute vec2 a_position;
void main(){gl_Position=vec4(a_position,0.,1.);}`;
const fragment = `precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colors[4];
uniform vec3 u_base;
const float TAU=6.2831853;
vec3 palette(float t){
  vec3 primary=u_colors[0], accent=u_colors[1];
  vec3 contrast=u_colors[2], bridge=u_colors[3];
  float p=mod(t,4.);
  if(p<1.)return mix(primary,accent,smoothstep(0.,1.,p));
  if(p<2.)return mix(accent,contrast,smoothstep(0.,1.,p-1.));
  if(p<3.)return mix(contrast,bridge,smoothstep(0.,1.,p-2.));
  return mix(bridge,primary,smoothstep(0.,1.,p-3.));
}
void main(){
  // Distances in units of the shorter edge keep every Gaussian circular.
  vec2 aspect=u_resolution/min(u_resolution.x,u_resolution.y);
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec3 sum=vec3(0.);float density=0.;
  for(int i=0;i<5;i++){
    float f=float(i), phase=f*TAU/5.;
    vec2 center=.5+.62*vec2(sin(u_time*TAU/(91.+f*17.)+phase),cos(u_time*TAU/(113.+f*19.)+phase*1.73+.6));
    vec2 d=(uv-center)*aspect;
    float sigma=.36+.05*sin(f*1.7+u_time*.025);
    float weight=exp(-dot(d,d)/(2.*sigma*sigma));
    density+=weight;
    sum+=weight*palette(f*.8+u_time/67.);
  }
  vec3 baseTone=u_base;
  vec3 hue=sum/max(density,.0001);
  gl_FragColor=vec4(mix(baseTone,hue,.88*(1.-exp(-density))),1.);
}`;

/** One low-power, bounded framebuffer. Hidden/reduced-motion states never
 * keep a RAF loop alive. Animation time advances only while visible. */
export function startFluidBackground(canvas: HTMLCanvasElement): () => void {
  canvas.style.opacity='0';
  const gl = canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
  if (!gl) return () => {};
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null;
  let shaders: WebGLShader[] = [], resolution: WebGLUniformLocation | null = null, clock: WebGLUniformLocation | null = null;
  const sampler=document.createElement('canvas'); sampler.width=1; sampler.height=1;
  const paint=sampler.getContext('2d',{willReadFrequently:true});
  const root=canvas.closest('.pebble-root');
  const readColor=(value: string): number[] => {
    if (!paint) return [.2,.3,.25];
    paint.clearRect(0,0,1,1); paint.fillStyle='#24382e'; paint.fillStyle=value; paint.fillRect(0,0,1,1);
    return Array.from(paint.getImageData(0,0,1,1).data).slice(0,3).map(n=>n/255);
  };
  const tint=() => {
    if (!program || !root || lost) return;
    const style=getComputedStyle(root);
    const pine=readColor(style.getPropertyValue('--pine').trim());
    const gold=readColor(style.getPropertyValue('--gold').trim());
    const wine=readColor(style.getPropertyValue('--wine').trim());
    const paper=readColor(style.getPropertyValue('--paper').trim());
    const muted=(color: number[])=>color.map((n,i)=>Math.min(.68,n*.82+pine[i]*.07));
    const colors=[muted(pine),muted(gold),muted(wine),muted(pine.map((n,i)=>n*.65+gold[i]*.35))];
    gl.useProgram(program); gl.uniform3fv(gl.getUniformLocation(program,'u_colors[0]'),new Float32Array(colors.flat()));
    gl.uniform3fv(gl.getUniformLocation(program,'u_base'),new Float32Array(paper.map((n,i)=>n*.10+pine[i]*.045)));
  };
  let raf = 0, last = 0, time = 0, lost = false, disposed = false;
  const release = () => { if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); shaders.forEach(s=>gl.deleteShader(s)); shaders=[]; buffer=null; program=null; };
  const init = () => {
    release();
    program=gl.createProgram();
    if (!program) return false;
    for (const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
      const shader=gl.createShader(type);
      if (!shader) { release(); return false; }
      shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { release(); return false; }
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) { release(); return false; }
    buffer=gl.createBuffer();
    if (!buffer) { release(); return false; }
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'a_position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    resolution=gl.getUniformLocation(program,'u_resolution'); clock=gl.getUniformLocation(program,'u_time');
    tint();
    return true;
  };
  const draw = () => {
    if (!program || lost || disposed || document.hidden) return;
    gl.useProgram(program); gl.uniform2f(resolution,canvas.width,canvas.height); gl.uniform1f(clock,time);
    gl.drawArrays(gl.TRIANGLES,0,6);
    canvas.style.opacity='1';
  };
  const frame = (now: number) => {
    raf=0;
    if (disposed || lost || document.hidden || motion.matches || !program) return;
    if (!last) last=now;
    if (now-last >= 1000/24) { time+=(now-last)/1000; last=now; draw(); }
    raf=requestAnimationFrame(frame);
  };
  const sync = () => {
    cancelAnimationFrame(raf); raf=0; last=0;
    if (disposed || lost || !program || document.hidden) return;
    tint(); draw();
    if (!motion.matches) raf=requestAnimationFrame(frame);
  };
  const resize = () => {
    const box=canvas.getBoundingClientRect(), scale=Math.min(1,700/Math.max(box.width,box.height));
    const width=Math.max(1,Math.round(box.width*scale)),height=Math.max(1,Math.round(box.height*scale));
    if (canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height); }
    sync();
  };
  const onLost = (event: Event) => { event.preventDefault(); lost=true; canvas.style.opacity='0'; cancelAnimationFrame(raf); raf=0; };
  const onRestored = () => { if (!disposed) { lost=false; if (init()) resize(); } };
  const observer=new ResizeObserver(resize);
  let themeFrame=0;
  const refreshTheme=() => {
    if (themeFrame || document.hidden) return;
    themeFrame=requestAnimationFrame(()=>{themeFrame=0; sync();});
  };
  const theme=new MutationObserver(refreshTheme);
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-pebble-theme']});
  if (root) theme.observe(root,{attributes:true,attributeFilter:['class','style']});
  // Registered theme colours may still be interpolating at the first mutation.
  const onThemeTransition=(event: Event) => { if (event.target===root) refreshTheme(); };
  root?.addEventListener('transitionend',onThemeTransition);
  canvas.addEventListener('webglcontextlost',onLost); canvas.addEventListener('webglcontextrestored',onRestored);
  document.addEventListener('visibilitychange',sync); motion.addEventListener('change',sync);
  observer.observe(canvas);
  if (init()) resize();
  return () => { disposed=true; cancelAnimationFrame(raf); cancelAnimationFrame(themeFrame); observer.disconnect(); theme.disconnect(); root?.removeEventListener('transitionend',onThemeTransition); motion.removeEventListener('change',sync); document.removeEventListener('visibilitychange',sync); canvas.removeEventListener('webglcontextlost',onLost); canvas.removeEventListener('webglcontextrestored',onRestored); release(); };
}
