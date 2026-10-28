import { useEffect, useRef } from 'react';
import bodyUrl from './ribbon/body.png';
import {
  ACROSS,
  BODY_W,
  CTRL,
  FRAMES,
  FRONT_A,
  FRONT_B,
  HEAD_RANGE,
  HEAD_W,
  HW,
  LENGTH,
  REF_W,
  SPLIT,
} from './ribbon/data';
import headUrl from './ribbon/head.png';

/*
 * The ribbon from the reference video, replayed: path, width, timing and colours all come
 * from ./ribbon (traced frame by frame). It is drawn as round stamps along the centre line,
 * newest first so older parts lie on top; each pixel looks its colour up by where it sits
 * on the ribbon (along, across) and the video frame for the current moment.
 */

/** Spacing of the strip's cross-sections, reference px. */
const STEP = 3;
const CAP = 24;
const END = FRAMES.start + (FRAMES.count - 1) / FRAMES.fps;
const V0 = ACROSS[0];
const V1 = ACROSS[ACROSS.length - 1];
const f = (n: number) => n.toFixed(3);

const VERT = `
attribute vec2 aPos;
attribute vec2 aSV; // distance along the centre line (reference px), position across (-1 … 1)
uniform vec2 uRes;
varying vec2 vSV;
void main(){
  vSV=aSV;
  gl_Position=vec4(aPos.x/uRes.x*2.-1.,1.-aPos.y/uRes.y*2.,0.,1.);
}`;

const FRAG = `
precision highp float;
uniform sampler2D uBody;
uniform sampler2D uHead;
uniform float uR;      // half-width in canvas px
uniform float uScale;  // canvas px per reference px
uniform float uRow;    // video frame, fractional
uniform float uNT;
uniform float uNV;
uniform float uFront;  // where this part ends; huge once it is finished
uniform float uWhich;  // which end's head colours to use
varying vec2 vSV;

vec4 at(sampler2D t,float u,float row,float rows){return texture2D(t,vec2(u,(row+.5)/rows));}
vec4 across(sampler2D t,float u,float base,float v,float rows){
  float i=floor(v);
  return mix(at(t,u,base+i,rows),at(t,u,base+min(i+1.,uNV-1.),rows),v-i);
}
vec4 frame(sampler2D t,float u,float base,float v,float rows){
  float r=floor(uRow);
  vec4 a=across(t,u,base+r*uNV,v,rows);
  vec4 b=across(t,u,base+min(r+1.,uNT-1.)*uNV,v,rows);
  return mix(a,b,uRow-r);
}

void main(){
  float s=vSV.x, v=vSV.y;
  // Distance to the edge in px: the sides, or the round cap past the end.
  float along=(s-uFront)*uScale, side=v*uR;
  float edge=along>0.?uR-length(vec2(along,side)):uR-abs(side);
  float cover=clamp(edge+.5,0.,1.);
  if(cover<=0.) discard;
  float vi=(clamp(v,${f(V0)},${f(V1)})-(${f(V0)}))/${f(V1 - V0)}*(uNV-1.);
  vec4 body=frame(uBody,(clamp(s/${f(LENGTH)},0.,1.)*${f(BODY_W - 1)}+.5)/${f(BODY_W)},0.,vi,uNT*uNV);
  vec3 c=body.rgb;
  // Where the reference shows background inside the outline (the ribbon turning edge-on).
  cover*=smoothstep(.3,.7,body.a);
  if(cover<=0.) discard;
  float behind=uFront-s;
  if(behind<${f(HW * 2.6)}){
    float hu=clamp((behind-(${f(HEAD_RANGE[0])}))/${f(HEAD_RANGE[1] - HEAD_RANGE[0])},0.,1.);
    vec3 h=frame(uHead,(hu*${f(HEAD_W - 1)}+.5)/${f(HEAD_W)},uWhich*uNT*uNV,vi,2.*uNT*uNV).rgb;
    c=mix(c,h,1.-smoothstep(${f(HW * 2)},${f(HW * 2.6)},behind));
  }
  gl_FragColor=vec4(c*cover,cover);
}`;

/** Warm halo ahead of a hot head, as measured in the reference (amber, ~10 px falloff). */
const HALO_VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec2 uC;
varying vec2 vOff;
void main(){
  vOff=aPos-uC;
  gl_Position=vec4(aPos.x/uRes.x*2.-1.,1.-aPos.y/uRes.y*2.,0.,1.);
}`;

const HALO_FRAG = `
precision mediump float;
uniform float uR;
uniform float uScale;
uniform vec2 uTan;
uniform float uAmount;
varying vec2 vOff;
void main(){
  float d=length(vOff)-uR;
  if(d<0.) discard;
  float ahead=dot(vOff/max(length(vOff),1e-3),uTan);
  float k=.37*exp(-d/(10.*uScale))*mix(.12,1.,smoothstep(-.3,.7,ahead))*uAmount;
  gl_FragColor=vec4(vec3(.99,.58,.49)*k,k);
}`;

/** When each head glows in the reference: [seconds, 0 … 1]. */
const HOT_A: [number, number][] = [[0.6, 0], [0.8, 1], [2.6, 1], [3.0, 0]];
const HOT_B: [number, number][] = [[2.2, 0], [2.4, 1], [3.6, 1], [3.95, 0]];
const ramp = (keys: [number, number][], t: number) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return keys[i - 1][1] + ((keys[i][1] - keys[i - 1][1]) * (t - keys[i - 1][0])) / (keys[i][0] - keys[i - 1][0]);
  }
  return keys[keys.length - 1][1];
};

type Pt = [number, number];

/** Catmull-Rom, 40 steps per segment: the same curve the colours were sampled along. */
function centreLine() {
  const pts: Pt[] = [];
  for (let i = 0; i < CTRL.length - 1; i++) {
    const p0 = CTRL[Math.max(0, i - 1)], p1 = CTRL[i], p2 = CTRL[i + 1], p3 = CTRL[Math.min(CTRL.length - 1, i + 2)];
    for (let k = 0; k < 40; k++) {
      const t = k / 40, t2 = t * t, t3 = t2 * t;
      const c = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      pts.push([c(0), c(1)]);
    }
  }
  pts.push(CTRL[CTRL.length - 1]);
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  /** Point and unit tangent at distance `d` along the line. */
  const sample = (d: number): [Pt, Pt] => {
    d = Math.min(acc[acc.length - 1], Math.max(0, d));
    let lo = 1, hi = acc.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (acc[m] < d) lo = m + 1;
      else hi = m;
    }
    const a = pts[lo - 1], b = pts[lo];
    const k = (d - acc[lo - 1]) / (acc[lo] - acc[lo - 1] || 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [[a[0] + dx * k, a[1] + dy * k], [dx / l, dy / l]];
  };
  /** Signed curvature (turn per px) from the tangents a few px either side. */
  const bend = (d: number) => {
    const [, t1] = sample(d - 6), [, t2] = sample(d + 6);
    return (t1[0] * t2[1] - t1[1] * t2[0]) / 12;
  };
  return { sample, bend };
}

/** Monotone cubic through the measured keys: steady speed between video frames, no overshoot. */
function smoothKeys(keys: [number, number][]) {
  const n = keys.length;
  const x = keys.map((k) => k[0]), y = keys.map((k) => k[1]);
  const h = x.slice(1).map((v, i) => v - x[i]);
  const dl = h.map((hi, i) => (y[i + 1] - y[i]) / hi);
  const m = y.map((_, i) => {
    if (i === 0) return dl[0];
    if (i === n - 1) return dl[n - 2];
    if (dl[i - 1] * dl[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);
  });
  return (t: number) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (t > x[i + 1]) i++;
    const u = (t - x[i]) / h[i], u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * y[i + 1] + (u3 - u2) * h[i] * m[i + 1];
  };
}

function loadTexture(gl: WebGLRenderingContext, unit: number, url: string, format: number, onReady: () => void, alive: () => boolean) {
  const tex = gl.createTexture();
  const img = new Image();
  img.onload = () => {
    if (!alive()) return;
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    onReady();
  };
  img.src = url;
  return tex;
}

export function Ribbon({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!gl) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const build = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (import.meta.env.DEV && !gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn('Ribbon shader:', gl.getShaderInfoLog(sh));
        gl.attachShader(p, sh);
      }
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    const prog = build(VERT, FRAG);
    const haloProg = build(HALO_VERT, HALO_FRAG);
    if (!prog || !haloProg) return;
    const H_ = (n: string) => gl.getUniformLocation(haloProg, n);
    const hRes = H_('uRes'), hC = H_('uC'), hR = H_('uR'), hScale = H_('uScale'), hTan = H_('uTan'), hAmount = H_('uAmount');
    const hPos = gl.getAttribLocation(haloProg, 'aPos');
    gl.useProgram(prog);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = U('uRes'), uR = U('uR'), uScale = U('uScale'), uRow = U('uRow');
    gl.uniform1f(U('uNT'), FRAMES.count);
    gl.uniform1f(U('uNV'), ACROSS.length);
    gl.uniform1i(U('uBody'), 0);
    gl.uniform1i(U('uHead'), 1);
    const uFront = U('uFront'), uWhich = U('uWhich');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aSV = gl.getAttribLocation(prog, 'aSV');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aSV);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aSV, 2, gl.FLOAT, false, 16, 8);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let alive = true;
    let loaded = 0;
    const ready = () => {
      if (++loaded < 2) return;
      draw();
      sync();
    };
    const body = loadTexture(gl, gl.TEXTURE0, bodyUrl, gl.RGBA, ready, () => alive);
    const head = loadTexture(gl, gl.TEXTURE1, headUrl, gl.RGB, ready, () => alive);

    const { sample, bend } = centreLine();
    const frontA = smoothKeys(FRONT_A);
    const frontB = smoothKeys(FRONT_B);
    const data = new Float32Array((Math.ceil(LENGTH / STEP) + 4) * 2 * 4 + (CAP + 2) * 4);

    const dpr = Math.min(devicePixelRatio || 1, 2);
    let W = 1, H = 1;
    const resize = () => {
      W = Math.max(1, Math.round(canvas.clientWidth * dpr));
      H = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
    };
    const ro = new ResizeObserver(() => {
      resize();
      if (loaded === 2 && !running) draw();
    });
    ro.observe(canvas);
    resize();

    // Dev hook for comparing against the reference frame by frame: ?ribbon=2.6 holds that moment.
    const pinParam = import.meta.env.DEV ? new URLSearchParams(location.search).get('ribbon') : null;
    const pinned = pinParam !== null;
    let clock = pinned ? Number(pinParam) : reduced ? END : 0;
    let last = performance.now();
    let frame = 0;
    let running = false;
    let visible = true;

    const draw = () => {
      const t = Math.min(clock, END);
      // The reference is a phone screen: scale by width, keep the right edge, never run into the text.
      const sc = Math.min(W / REF_W, H / 560);
      const ox = W - REF_W * sc;
      const r = HW * sc;
      const rx = r + 1; // one extra px for the anti-aliased edge

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const a = Math.min(frontA(t), SPLIT);
      const b = Math.min(frontB(t), LENGTH);

      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const halo = (front: number, amount: number) => {
        if (amount <= 0) return;
        const [p, tan] = sample(front);
        const cx = ox + p[0] * sc, cy = p[1] * sc, e = r + 60 * sc;
        gl.useProgram(haloProg);
        gl.uniform2f(hRes, W, H);
        gl.uniform2f(hC, cx, cy);
        gl.uniform1f(hR, r);
        gl.uniform1f(hScale, sc);
        gl.uniform2f(hTan, tan[0], tan[1]);
        gl.uniform1f(hAmount, amount);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([cx - e, cy - e, cx + e, cy - e, cx - e, cy + e, cx + e, cy + e]), gl.DYNAMIC_DRAW);
        gl.disableVertexAttribArray(aSV);
        gl.enableVertexAttribArray(hPos);
        gl.vertexAttribPointer(hPos, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      if (a < SPLIT - 0.5) halo(a, ramp(HOT_A, t));
      if (b > SPLIT + 1 && b < LENGTH - 0.5) halo(b, ramp(HOT_B, t));
      gl.useProgram(prog);
      if (hPos !== aPos && hPos !== aSV) gl.disableVertexAttribArray(hPos);
      gl.enableVertexAttribArray(aPos);
      gl.enableVertexAttribArray(aSV);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(aSV, 2, gl.FLOAT, false, 16, 8);

      gl.uniform2f(uRes, W, H);
      gl.uniform1f(uR, r);
      gl.uniform1f(uScale, sc);
      gl.uniform1f(uRow, Math.min(FRAMES.count - 1, Math.max(0, (t - FRAMES.start) * FRAMES.fps)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, body);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, head);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);

      let k = 0;
      const vert = (x: number, y: number, s: number, v: number) => {
        data[k++] = ox + x * sc;
        data[k++] = y * sc;
        data[k++] = s;
        data[k++] = v;
      };
      const flush = (mode: number) => {
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, k), gl.DYNAMIC_DRAW);
        gl.drawArrays(mode, 0, k / 4);
        k = 0;
      };
      const section = (s: number) => {
        const [p, tan] = sample(s);
        const nx = -tan[1], ny = tan[0];
        const kap = bend(s);
        for (const side of [-1, 1]) {
          // On a turn tighter than the ribbon, the inner edge stops at the centre of the turn
          // instead of folding back over itself.
          let w = rx;
          if (side * kap > 0) w = Math.min(w, (0.96 / Math.abs(kap)) * sc);
          vert(p[0] + (nx * side * w) / sc, p[1] + (ny * side * w) / sc, s, (side * w) / r);
        }
      };
      // Newest first, so blending paints the older parts over them.
      const part = (from: number, to: number, finished: boolean, which: number) => {
        if (to <= from + 0.5) return;
        gl.uniform1f(uFront, finished ? 1e6 : to);
        gl.uniform1f(uWhich, which);
        if (!finished) {
          const [p, tan] = sample(to);
          vert(p[0], p[1], to, 0);
          for (let i = 0; i <= CAP; i++) {
            const a = -Math.PI / 2 + (Math.PI * i) / CAP;
            const ax = Math.cos(a) * rx, ay = Math.sin(a) * rx;
            vert(p[0] + (tan[0] * ax - tan[1] * ay) / sc, p[1] + (tan[1] * ax + tan[0] * ay) / sc, to + ax / sc, ay / r);
          }
          flush(gl.TRIANGLE_FAN);
        }
        section(to);
        for (let s = Math.floor(to / STEP) * STEP; s > from; s -= STEP) if (s < to) section(s);
        section(from);
        flush(gl.TRIANGLE_STRIP);
      };
      part(SPLIT, b, b >= LENGTH - 0.5, 1);
      part(0, a, a >= SPLIT - 0.5, 0);
    };

    const tick = (now: number) => {
      clock += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
      // The reference ends on a still frame; so does the ribbon.
      if (clock >= END) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      const should = !pinned && loaded === 2 && clock < END && visible && document.visibilityState === 'visible';
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

    return () => {
      alive = false;
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      // The context itself goes with the canvas; StrictMode remounts reuse it, so it must stay alive.
      gl.deleteProgram(prog);
      gl.deleteProgram(haloProg);
      gl.deleteBuffer(buf);
      gl.deleteTexture(body);
      gl.deleteTexture(head);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
