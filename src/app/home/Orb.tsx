import { useEffect, useRef } from 'react';

/*
 * A slowly flowing glass sphere: folded silk-like sheets inside a lens, a thin rim light and
 * a warm ember glowing through from below. One full-screen triangle, one fragment shader.
 */

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPulse;
uniform float uIntro;

float hash(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}

// Warped coordinates: each pass bends the plane by the other axis, which reads as folded fabric.
vec2 warp(vec2 w, float t){
  for(int i=1;i<6;i++){
    float fi=float(i);
    w+=vec2(.62/fi*sin(fi*w.y*1.15+t+.9*fi), .5/fi*cos(fi*w.x*1.05-t*1.1+1.7*fi));
  }
  return w;
}

void main(){
  vec3 bg=vec3(.047,.024,.031);
  float intro=uIntro;
  vec2 p=(gl_FragCoord.xy-uCenter)/uRadius;
  p-=uPointer*.06;
  p/=mix(.78,1.,intro);
  float r=length(p);
  float z=sqrt(max(0.,1.-r*r));

  // Glass lens: the inside bunches up towards the rim like a real sphere.
  vec2 q=p*(1.+.6*(1.-z));
  float ang=uTime*.05;
  q=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*q;
  vec2 w=warp(q*1.3+vec2(.3,-.2),uTime*.22);
  float s=sin(w.x*1.7+w.y*1.1);
  float sheet=.5+.5*s;
  float fold=pow(1.-abs(s),14.);
  float fold2=pow(1.-abs(sin(w.x*1.7+w.y*1.1+1.3)),34.);

  vec3 deep=vec3(.05,.006,.014);
  vec3 wine=vec3(.42,.03,.085);
  vec3 crimson=vec3(.9,.1,.19);
  vec3 rose=vec3(1.,.78,.8);
  vec3 ember=vec3(1.,.42,.16);

  float body=smoothstep(1.,.985,r);
  float fres=pow(1.-z,3.);
  float crest=pow(sheet,9.);
  vec3 c=mix(deep,wine,smoothstep(.05,1.,sheet))*(.2+.8*z);
  c+=mix(wine,crimson,.6)*crest*.55*(.35+.65*z);
  c+=crimson*fold*(.35+.65*fres)*.85;
  c+=rose*fold2*.55*(.25+fres);

  // A second, slower sheet behind, seen through the glass where the front one is thin.
  vec2 wb=warp(-q.yx*1.05+vec2(1.7,.6),uTime*.15+4.);
  float sb=sin(wb.x*1.4+wb.y*1.2);
  c+=wine*pow(1.-abs(sb),9.)*.7*(1.-sheet)*z;
  c+=crimson*pow(.5+.5*sb,9.)*.25*(1.-sheet);

  // Window reflection on the upper left of the glass.
  vec2 dir=p/max(r,1e-4);
  float spec=exp(-pow((r-.84)*8.,2.))*pow(max(0.,dot(dir,vec2(-.62,.78))),8.);
  c+=vec3(1.,.9,.92)*spec*.32*body;

  // Rim light that drifts around the edge.
  float a=atan(p.y,p.x);
  float ring=exp(-pow((r-.982)*55.,2.));
  c+=rose*ring*(.12+.38*pow(.5+.5*sin(a*1.+uTime*.25+.8),3.));

  // Ember below the centre, flickering softly; it lights the sheets it passes through.
  vec2 g=(p-vec2(.08,-.36))*vec2(2.5,1.7);
  float flick=.82+.12*sin(uTime*1.7)+.14*noise(vec2(uTime*.9,3.1));
  float glow=exp(-dot(g,g)*2.)*flick*(1.+uPulse*.8);
  c+=ember*glow*(.25+1.5*sheet);
  c+=vec3(1.,.92,.82)*pow(glow,3.)*(fold+fold2)*1.6;
  c+=crimson*uPulse*.22*sheet;

  // Outside: a faint halo and a few silk folds spilling past the glass.
  float out1=max(r-1.,0.);
  vec2 wo=warp(p*1.1+vec2(1.3,.4),uTime*.18);
  float so=pow(1.-abs(sin(wo.x*1.5+wo.y)),18.);
  vec3 o=wine*exp(-out1*4.)*.22+crimson*so*.18*exp(-out1*3.5);

  c=mix(o,c,body)*intro;
  c=1.-exp(-c*1.5);
  // Fine grain hides banding on the dark gradient.
  c+=(hash(gl_FragCoord.xy+fract(uTime))-.5)*.012;
  gl_FragColor=vec4(bg+c,1.);
}`;

interface Props {
  className?: string;
  /** Orb centre as a share of the canvas, from the top-left. */
  cx?: number;
  cy?: number;
  /** Radius as a share of the shorter side. */
  size?: number;
}

export function Orb({ className, cx = 0.5, cy = 0.42, size = 0.44 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = matchMedia('(max-width: 820px)').matches;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) console.warn('Orb shader:', gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes'), uCenter = u('uCenter'), uRadius = u('uRadius'), uTime = u('uTime');
    const uPointer = u('uPointer'), uPulse = u('uPulse'), uIntro = u('uIntro');

    // Phones render below native resolution: the shader is soft by nature, so nobody sees it.
    const dpr = Math.min(devicePixelRatio || 1, phone ? 1.25 : 1.5);
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uCenter, w * cx, h * (1 - cy));
      gl.uniform1f(uRadius, Math.min(w, h) * size);
    };
    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw();
    });
    ro.observe(canvas);
    resize();

    // Pointer follows with easing; a tap sends a pulse that speeds the flow up for a moment.
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    let pulse = 0;
    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((e.clientX - b.left) / b.width) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, -(((e.clientY - b.top) / b.height) * 2 - 1)));
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const onDown = () => {
      pulse = 1;
    };
    const host = canvas.parentElement ?? canvas;
    host.addEventListener('pointermove', onMove, { passive: true });
    host.addEventListener('pointerleave', onLeave);
    host.addEventListener('pointerdown', onDown, { passive: true });

    let time = 8 + Math.random() * 20;
    let intro = reduced ? 1 : 0;
    let last = performance.now();
    let frame = 0;
    let running = false;
    let visible = true;

    const draw = () => {
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform1f(uPulse, pulse);
      gl.uniform1f(uIntro, 1 - Math.pow(1 - intro, 3));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt * (1 + pulse * 2.5);
      pulse = Math.max(0, pulse - dt * 0.9);
      intro = Math.min(1, intro + dt / 1.8);
      pointer.x += (target.x - pointer.x) * Math.min(1, dt * 3);
      pointer.y += (target.y - pointer.y) * Math.min(1, dt * 3);
      draw();
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      const should = !reduced && visible && document.visibilityState === 'visible';
      if (should && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    draw();
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      // The context itself goes with the canvas; StrictMode remounts reuse it, so it must stay alive.
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [cx, cy, size]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
