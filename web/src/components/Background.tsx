import { useEffect, useRef } from 'react';

// Full-screen WebGL2 scene: drifting neon aurora ribbons over a perspective grid floor.
// Rendered at reduced resolution, capped at 30fps, paused when the tab is hidden; static when reduced motion is on.
const FRAG = `#version 300 es
precision highp float;
uniform vec2 r; uniform float t; uniform vec2 m;
out vec4 o;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+7.1;a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  vec2 p=(gl_FragCoord.xy-.5*r)/r.y + m*.03;
  vec3 col=mix(vec3(.035,.045,.07),vec3(.07,.085,.12),smoothstep(-.6,.7,p.y));
  float tt=t*.05;
  // aurora ribbons
  for(int i=0;i<3;i++){
    float fi=float(i);
    float y=.05+.16*fi-.12 + .10*sin(p.x*1.4+tt*2.6+fi*2.1) + .32*(fbm(vec2(p.x*.9+tt+fi*5.,tt*.6+fi))-.5);
    float d=abs(p.y-y);
    float body=exp(-d*d*90.)*.55 + .006/(d+.012);
    vec3 c = i==0 ? vec3(.22,.78,.96) : i==1 ? vec3(.05,.55,.80) : vec3(.50,.42,.98);
    float flick=.55+.45*fbm(vec2(p.x*2.5-tt*3.,fi*3.+tt));
    col+=c*body*.16*flick;
  }
  // perspective grid floor
  float hz=-.22;
  if(p.y<hz){
    float z=.42/(hz-p.y);
    vec2 g=vec2(p.x*z,z+t*.35);
    vec2 w=fwidth(g);
    vec2 gl=abs(fract(g)-.5)/max(w,1e-4);
    float line=1.-min(min(gl.x,gl.y),1.);
    float fade=smoothstep(14.,1.2,z)*smoothstep(0.,.25,hz-p.y);
    col+=vec3(.22,.78,.96)*line*.22*fade;
    col+=vec3(.22,.78,.96)*.05*exp(-(hz-p.y)*9.);
  }
  // horizon glow
  col+=vec3(.15,.55,.85)*.10*exp(-abs(p.y-hz)*14.);
  // stars
  vec2 sp=floor(gl_FragCoord.xy/3.);
  float s=step(.9975,h(sp))*smoothstep(hz,hz+.3,p.y);
  col+=vec3(.7,.9,1.)*s*(.4+.6*sin(t*2.+h(sp)*40.));
  // vignette + grain
  col*=1.-.6*pow(length(uv-.5)*1.15,2.);
  col+=(h(gl_FragCoord.xy+fract(t))-.5)*.018;
  o=vec4(col,1.);
}`;
const VERT = `#version 300 es
in vec2 a; void main(){gl_Position=vec4(a,0,1);}`;

export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'low-power' });
    if (!gl) return; // CSS gradient fallback stays visible
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't'), uM = gl.getUniformLocation(prog, 'm');

    const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.55;
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { mouse.tx = e.clientX / window.innerWidth - .5; mouse.ty = .5 - e.clientY / window.innerHeight; };
    window.addEventListener('pointermove', onMove);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0;
    const start = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (document.hidden || now - last < 33) return;
      last = now;
      mouse.x += (mouse.tx - mouse.x) * .05; mouse.y += (mouse.ty - mouse.y) * .05;
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, still ? 12 : (now - start) / 1000);
      gl.uniform2f(uM, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 -z-10 h-full w-full"
      style={{ background: 'radial-gradient(1200px 600px at 30% 20%, #10304a 0%, #0B0E14 60%)' }}
    />
  );
}
