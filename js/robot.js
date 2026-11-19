/*
 * Hero robot — "Sentinel", a glossy black and gold android built in code with three.js.
 * On load it is "printed" bottom-up out of a gold wireframe by a scan line,
 * then it tracks the cursor, blinks, scans, and waves when clicked.
 */
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const stage = document.getElementById('robotStage');
const canvas = document.getElementById('robotCanvas');
const bubble = document.getElementById('robotBubble');
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const hasGL = (() => {
  try {
    const c = document.createElement('canvas');
    const gl = window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'));
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    return !!gl;
  } catch (e) { return false; }
})();


/* ---------------------------------------------------------------- helpers */
const GOLD = new THREE.Color(1.0, 0.78, 0.32);
const V3 = THREE.Vector3;
const HALF_PI = Math.PI / 2;
const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const easeInOut = (t) => { t = Math.min(Math.max(t, 0), 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function radialTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(.18, 'rgba(255,255,255,.55)');
  gr.addColorStop(.5, 'rgba(255,255,255,.12)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function lineTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(.47, 'rgba(255,255,255,.25)');
  gr.addColorStop(.5, 'rgba(255,255,255,1)');
  gr.addColorStop(.53, 'rgba(255,255,255,.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* Hexagon "tech weave" bump map. One tile = 8 hexes across; geometry UVs are in tiles (~.2 world units). */
function hexTexture() {
  const r = 14, w = Math.sqrt(3) * r;
  const W = Math.round(w * 8), H = r * 3 * 4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000'; g.lineWidth = 2.6;
  for (let row = -1; row <= H / (1.5 * r) + 1; row++) {
    for (let col = -1; col <= W / w + 1; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * 1.5 * r;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 180 * (60 * k - 30);
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* The brand mark in the chest reactor: "AI" inside a hexagon, drawn white and tinted gold. */
function markTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), cx = S / 2, cy = S / 2;
  const hex = (r) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k - HALF_PI; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
  };
  g.fillStyle = 'rgba(255,255,255,.14)'; hex(60); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineJoin = 'round'; hex(57); g.stroke();
  g.lineJoin = 'miter'; g.lineCap = 'butt'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(cx - 33, cy + 25); g.lineTo(cx - 13, cy - 25); g.lineTo(cx + 7, cy + 25); g.stroke();   // A
  g.lineWidth = 7; g.beginPath(); g.moveTo(cx - 24, cy + 9); g.lineTo(cx - 2, cy + 9); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(cx + 18, cy - 26, 10, 51);                                                       // I
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/* Product-photography studio, used only for reflections. The "cool" variant drops the gold strip,
   so the black limbs and hands never mirror gold: their gold comes only from the tips and inlays. */
function studio(cool) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x020202);
  const panel = (w, h, hex, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(7, 2.2, 0xffffff, 2.4, [0, 6, 1.5]);                                    // top softbox
  panel(.9, 7, 0xffffff, 3.2, [-5.5, 1, 3]);                                    // left strip -> long highlight
  panel(1.4, 7, cool ? 0xd9e0ee : 0xffc65c, cool ? 1.5 : 4.2, [5.5, 1, -.5]);   // gold strip -> warm edge
  panel(5, 1.2, cool ? 0x8d929c : 0xffae3c, .7, [0, -4.5, 4]);                 // warm floor bounce
  panel(3, 3, 0x93a8ff, .55, [-3, 2, -5.5]);                                    // cool back fill
  panel(4, 1.6, 0xffffff, .5, [0, 1.5, 6]);                                     // soft front card: gives the black armour readable form
  return s;
}

/* ------------------------------------------------------------ geometry kit */

/* Monotone cubic through evenly spaced samples: smooth, and never overshoots. f runs 0..n-1. */
function smoothSeries(vals) {
  const n = vals.length, m = new Array(n);
  for (let i = 0; i < n; i++) {
    const d0 = i ? vals[i] - vals[i - 1] : vals[1] - vals[0];
    const d1 = i < n - 1 ? vals[i + 1] - vals[i] : d0;
    m[i] = i === 0 ? d1 : i === n - 1 ? d0 : (d0 * d1 <= 0 ? 0 : (d0 + d1) / 2);
  }
  for (let i = 0; i < n - 1; i++) {
    const d = vals[i + 1] - vals[i];
    if (d === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d, b = m[i + 1] / d, h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d; m[i + 1] = k * b * d; }
  }
  return (f) => {
    const i = Math.min(n - 2, Math.max(0, Math.floor(f))), t = f - i, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * vals[i] + (t3 - 2 * t2 + t) * m[i] + (-2 * t3 + 3 * t2) * vals[i + 1] + (t3 - t2) * m[i + 1];
  };
}

/*
 * A loft: a smooth solid swept through superellipse cross-sections stacked up the y axis.
 * Section = [y, halfWidth, halfDepth, zOffset = 0, squareness = 2 (ellipse; higher = boxier)].
 * u runs around the section (0 = front/+z, .25 = +x side), v runs bottom -> top.
 */
class Loft {
  constructor(secs) {
    const col = (k, d) => secs.map((s) => (s[k] === undefined ? d : s[k]));
    this.n = secs.length - 1;
    this.Y = smoothSeries(col(0)); this.W = smoothSeries(col(1)); this.D = smoothSeries(col(2));
    this.Z = smoothSeries(col(3, 0)); this.E = smoothSeries(col(4, 2));
    this._a = new V3(); this._b = new V3(); this._c = new V3(); this._d = new V3();
    // arc-length table along the profile so rows spread evenly over caps and long spans alike
    const K = 240; this.len = [0];
    let py = this.Y(0), pw = this.W(0);
    for (let i = 1; i <= K; i++) {
      const f = i / K * this.n, y = this.Y(f), w = this.W(f);
      this.len.push(this.len[i - 1] + Math.hypot(y - py, w - pw)); py = y; pw = w;
    }
  }
  at(v) {
    const f = clamp(v, 0, 1) * this.n;
    return { y: this.Y(f), w: Math.max(1e-4, this.W(f)), d: Math.max(1e-4, this.D(f)), z: this.Z(f), e: Math.max(1.2, this.E(f)) };
  }
  vByLength(t) {
    const L = this.len, K = L.length - 1, target = t * L[K];
    let lo = 0, hi = K;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < target) lo = m; else hi = m; }
    const k = (target - L[lo]) / ((L[hi] - L[lo]) || 1);
    return (lo + k) / K;
  }
  vAt(y) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (this.Y(m * this.n) < y) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  point(u, v, out) {
    const s = this.at(v), a = u * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a), p = 2 / s.e;
    return out.set(s.w * Math.sign(sn) * Math.pow(Math.abs(sn), p), s.y, s.z + s.d * Math.sign(cs) * Math.pow(Math.abs(cs), p));
  }
  normal(u, v, out) {
    const h = 1e-3;
    this.point(u + h, v, this._a); this.point(u - h, v, this._b); this._a.sub(this._b);
    this.point(u, Math.min(1, v + h), this._c); this.point(u, Math.max(0, v - h), this._d); this._c.sub(this._d);
    out.crossVectors(this._a, this._c);
    if (out.lengthSq() < 1e-14) return out.set(0, v < .5 ? -1 : 1, 0);
    return out.normalize();
  }
  geometry(segU = 64, segV = 40) {
    const pos = [], nor = [], uv = [], idx = [], p = new V3(), n = new V3();
    for (let i = 0; i <= segV; i++) {
      const v = this.vByLength(i / segV), s = this.at(v), circ = Math.PI * (s.w + s.d);
      for (let j = 0; j <= segU; j++) {
        const u = j / segU - .5;
        this.point(u, v, p); this.normal(u, v, n);
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u * circ / .2, p.y / .17);
      }
    }
    for (let i = 0; i < segV; i++) {
      for (let j = 0; j < segU; j++) {
        const a = i * (segU + 1) + j, b = a + 1, c = a + segU + 1, d = c + 1;
        idx.push(a, b, d, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  /* u for a point given in "chart" units as seen from a face: front -> x is world x; right/left -> x is world z seen from that side;
     back -> x is world x seen from behind (mirrored) */
  chartU(s, face, x) {
    const k = s.e / 2;
    if (face === 'front' || face === 'back') {
      const r = clamp(x / s.w, -1, 1), a = Math.sign(r) * Math.asin(Math.pow(Math.abs(r), k));
      return (face === 'front' ? a : Math.PI + a) / (Math.PI * 2);
    }
    const c = clamp((face === 'right' ? -x : x) / s.d, -1, 1);
    const a = Math.acos(Math.sign(c) * Math.pow(Math.abs(c), k));
    return (face === 'right' ? a : -a) / (Math.PI * 2);
  }
  surf(face, x, y, lift, out = new V3()) {
    const v = this.vAt(y), u = this.chartU(this.at(v), face, x);
    this.point(u, v, out); this.normal(u, v, this._d);
    return out.addScaledVector(this._d, lift);
  }
  /* front / back surface depth on the centre line at height y */
  zFront(y) { const s = this.at(this.vAt(y)); return s.z + s.d; }
  zBack(y) { const s = this.at(this.vAt(y)); return s.z - s.d; }
}

/* piecewise-linear edge x(y) through [y, x] pairs (ascending y) */
const edge = (pairs) => (y) => {
  if (y <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    const [y0, x0] = pairs[i - 1], [y1, x1] = pairs[i];
    if (y <= y1) return lerp(x0, x1, (y - y0) / ((y1 - y0) || 1));
  }
  return pairs[pairs.length - 1][1];
};
const mirror = (f) => (y) => -f(y);

/*
 * A raised armour plate hugging a loft, with a rounded bevel all the way round.
 * Its outline is drawn in chart units (see Loft.chartU) between edges xl(y) and xr(y), for y0..y1.
 * Returns the plate geometry and its outline (points at the foot of the bevel) for a light seam.
 */
function plate(L, o) {
  const { y0, y1, xl, xr, face = 'front', lift = .0025, th = .014, bev = .016, ns = 30, nt = 30 } = o;
  const pos = [], uv = [], idx = [];
  const p = new V3(), n = new V3();
  const cosSp = (k, m) => .5 - .5 * Math.cos(Math.PI * k / m);
  for (let i = 0; i <= nt; i++) {
    const t = cosSp(i, nt), y = lerp(y0, y1, t), v = L.vAt(y), sec = L.at(v), a = xl(y), b = xr(y);
    for (let j = 0; j <= ns; j++) {
      const s = cosSp(j, ns), x = lerp(a, b, s), u = L.chartU(sec, face, x);
      const dEdge = Math.min(Math.min(s, 1 - s) * Math.abs(b - a), Math.min(t, 1 - t) * (y1 - y0));
      const k = Math.min(1, dEdge / bev);
      L.point(u, v, p); L.normal(u, v, n); p.addScaledVector(n, lift + th * (1 - (1 - k) * (1 - k)));
      pos.push(p.x, p.y, p.z); uv.push(x / .2, y / .17);
    }
  }
  const W = ns + 1;
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < ns; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, outline: outlinePts(L, face, y0, y1, xl, xr, lift + .0015) };
}
/* points around a chart outline, lifted off the surface */
function outlinePts(L, face, y0, y1, xl, xr, lift) {
  const out = [], E = 11, at = (x, y) => out.push(L.surf(face, x, y, lift));
  for (let k = 0; k < E; k++) at(lerp(xl(y0), xr(y0), k / E), y0);
  for (let k = 0; k < E * 2; k++) { const y = lerp(y0, y1, k / (E * 2)); at(xr(y), y); }
  for (let k = 0; k < E; k++) at(lerp(xr(y1), xl(y1), k / E), y1);
  for (let k = 0; k < E * 2; k++) { const y = lerp(y1, y0, k / (E * 2)); at(xl(y), y); }
  return out;
}
/* a ring of points around a loft at height y, lifted off the surface */
function ringPts(L, y, lift, n = 56) {
  const v = L.vAt(y), out = [], nn = new V3();
  for (let k = 0; k < n; k++) { const u = k / n; out.push(L.point(u, v, new V3()).addScaledVector(L.normal(u, v, nn), lift)); }
  return out;
}

/* a closed / open glowing line through points */
const loopTube = (pts, r = .0042) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), pts.length * 2, r, 3, true);
const lineTube = (pts, r = .0042) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), pts.length * 3, r, 3, false);

/* merge geometries (position + normal, plus color / uv when every part has them) into one draw call */
function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal'];
  if (geos.every((g) => g.attributes.color)) names.push('color');
  if (geos.every((g) => g.attributes.uv)) names.push('uv');
  const out = new THREE.BufferGeometry();
  for (const nm of names) {
    const size = geos[0].attributes[nm].itemSize;
    const arr = new Float32Array(geos.reduce((s, g) => s + g.attributes[nm].count * size, 0));
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[nm].array, off); off += g.attributes[nm].count * size; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

/* bake a flat vertex colour into a geometry (for multi-tone parts sharing one material) */
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/* bake a transform into a geometry */
const _xe = new THREE.Euler(), _xq = new THREE.Quaternion(), _xm = new THREE.Matrix4(), _xs = new V3(), _xp = new V3();
function xf(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return geo.applyMatrix4(_xm.compose(_xp.set(x, y, z), _xq.setFromEuler(_xe.set(rx, ry, rz)), _xs.set(sx, sy, sz)));
}

/* Collects the parts of one rigid group and emits a single merged mesh per material.
   flag: 'overlay' = a plate on a shell that already shows in the build-in wireframe; 'noWire' = a light / seam. */
function batch() {
  const lists = new Map();
  const api = {
    add(geo, mat, flag = '') {
      const k = mat.uuid + flag;
      if (!lists.has(k)) lists.set(k, { mat, flag, geos: [] });
      lists.get(k).geos.push(geo);
      return api;
    },
    emit(parent) {
      const out = [];
      for (const { mat, flag, geos } of lists.values()) {
        const m = new THREE.Mesh(mergeGeos(geos), mat);
        if (flag === 'overlay') m.geometry.userData.overlay = true;
        if (flag === 'noWire') m.userData.noWire = true;
        parent.add(m); out.push(m);
      }
      lists.clear();
      return out;
    },
  };
  return api;
}

/* One skinned geometry from rigid parts: each part follows one bone, and the parts are split into material groups. */
function skinnedGeo(groups, boneIndex, toRoot) {
  const parts = [];
  groups.forEach((list, mi) => list.forEach(({ geo, bone }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(toRoot(bone));
    parts.push({ g, mi, b: boneIndex(bone) });
  }));
  const total = parts.reduce((s, p) => s + p.g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3).fill(1), uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4), sw = new Float32Array(total * 4);
  const out = new THREE.BufferGeometry();
  let off = 0, gStart = 0, gMat = -1;
  for (const { g, mi, b } of parts) {
    const n = g.attributes.position.count;
    if (mi !== gMat) { if (gMat >= 0) out.addGroup(gStart, off - gStart, gMat); gStart = off; gMat = mi; }
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, off * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
    for (let i = 0; i < n; i++) { si[(off + i) * 4] = b; sw[(off + i) * 4] = 1; }
    off += n;
  }
  out.addGroup(gStart, off - gStart, gMat);
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return out;
}

/* orientation whose local -y points along d and local +z faces f (in the parent's space) */
const _ox = new V3(), _oy = new V3(), _oz = new V3(), _om = new THREE.Matrix4();
function orient(d, f, q = new THREE.Quaternion()) {
  _oy.copy(d).normalize().negate();
  _oz.copy(f).addScaledVector(_oy, -f.dot(_oy)).normalize();
  _ox.crossVectors(_oy, _oz);
  _om.makeBasis(_ox, _oy, _oz);
  return q.setFromRotationMatrix(_om);
}

/* ------------------------------------------------------------------- init */
function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envWarm = pmrem.fromScene(studio(false), .03).texture;
  const envCool = pmrem.fromScene(studio(true), .03).texture;
  scene.environment = envWarm;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 4, 5);
  const rimLight = new THREE.DirectionalLight(0xffc35a, 3.2); rimLight.position.set(4, 2.5, -3);
  const rim2 = new THREE.DirectionalLight(0x9db0ff, 1.0); rim2.position.set(-4, 1.5, -3);
  scene.add(key, rimLight, rim2, new THREE.HemisphereLight(0x8890a0, 0x1a1408, .35));

  /* ---- build reveal: solid below the scan plane, wireframe above it */
  const solidClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  const wireClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -100);
  // phones: the hologram card docks over the bottom of the stage; nothing is drawn behind it (see fit)
  const floorClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 100);
  const clip = (m) => { m.clippingPlanes = [solidClip, floorClip]; return m; };

  const M = {
    shell: clip(new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: .4, roughness: .17, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25 })),
    // the arms below the pauldrons reflect the neutral studio: no gold flashes on the limbs
    limb: clip(new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: .4, roughness: .2, clearcoat: 1, clearcoatRoughness: .07, envMap: envCool, envMapIntensity: 1.05 })),
    visor: clip(new THREE.MeshPhysicalMaterial({ color: 0x010102, metalness: .95, roughness: .05, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.7 })),
    metal: clip(new THREE.MeshStandardMaterial({ color: 0x24252a, metalness: .85, roughness: .34, envMapIntensity: 1.1 })),
    gold: clip(new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: .22, envMapIntensity: 1.3 })),
    weave: clip(new THREE.MeshStandardMaterial({ color: 0x151518, metalness: .4, roughness: .55, bumpMap: hexTexture(), bumpScale: 1.6, envMapIntensity: .9 })),
    hand: clip(new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, metalness: .45, roughness: .22, clearcoat: .9, clearcoatRoughness: .08, envMap: envCool, envMapIntensity: 1 })),
    trim: clip(new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(.85), toneMapped: false })),
    cable: clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false })),
  };
  const C = { shell: 0x0b0b0d, joint: 0x2c2d33, chassis: 0x1b1c20, pin: 0x141518 };

  const glowTex = radialTexture();
  const glows = [];
  const glow = (scale, opacity = .9) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: GOLD, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [solidClip, floorClip] }));
    s.scale.set(scale, scale, 1);
    s.userData.baseOpacity = opacity;
    glows.push(s);
    return s;
  };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const lightMat = () => clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));

  /* invisible low-poly stand-ins for click / hover hit tests (cheap, and they follow every joint) */
  const proxies = [];
  const proxyMat = new THREE.MeshBasicMaterial();
  const proxy = (geo, parent) => { const m = new THREE.Mesh(geo, proxyMat); m.visible = false; m.userData.noWire = true; parent.add(m); proxies.push(m); return m; };

  const robot = new THREE.Group();
  scene.add(robot);

  /* ================================================================ BODY
   * body space: shoulder line at y = 0, the robot faces +z. */
  const body = new THREE.Group();
  body.position.y = .32;
  robot.add(body);
  const B = batch();

  // torso: broad, squared chest with trapezius slopes up to the neck, a long V-taper into the waist
  const TL = new Loft([
    [-.8, .001, .001, 0, 2], [-.785, .2, .14, 0, 2.3], [-.73, .268, .17, .004, 2.6], [-.6, .318, .192, .01, 2.8],
    [-.44, .372, .215, .016, 2.9], [-.28, .425, .235, .02, 3.1], [-.14, .455, .244, .02, 3.3], [-.03, .46, .24, .012, 3.4],
    [.04, .44, .226, 0, 3.3], [.07, .372, .208, -.005, 3.1], [.1, .305, .19, -.009, 2.9], [.13, .238, .168, -.012, 2.7],
    [.155, .18, .14, -.012, 2.5], [.172, .1, .09, -.012, 2.2], [.18, .001, .001, -.012, 2],
  ]);
  B.add(TL.geometry(60, 38), M.shell);
  proxy(TL.geometry(16, 10), body);

  // pectoral armour: two bevelled plates around a recessed reactor, outlined by light seams
  const CORE_Y = -.19, NOTCH = .138;
  const pecInner = (y) => .02 + Math.max(Math.sqrt(Math.max(0, NOTCH * NOTCH - (y - CORE_Y) * (y - CORE_Y))), (y - CORE_Y) * .62);
  const pecOuter = edge([[-.39, .07], [-.31, .2], [-.23, .32], [-.14, .395], [-.06, .41], [-.028, .39]]);
  // clavicle plates: from the sternum notch out under the pauldrons, following the trapezius line
  const clavIn = edge([[0, .2], [.055, .078], [.15, .062]]);
  const clavOut = edge([[0, .4], [.04, .41], [.07, .35], [.1, .285], [.13, .22], [.15, .172]]);
  for (const s of [-1, 1]) {
    const pl = plate(TL, { y0: -.39, y1: -.028, xl: s > 0 ? pecInner : mirror(pecOuter), xr: s > 0 ? pecOuter : mirror(pecInner), th: .028, bev: .02, ns: 26, nt: 26 });
    B.add(pl.geo, M.shell, 'overlay');
    B.add(loopTube(pl.outline), M.trim, 'noWire');
    const cl = plate(TL, { y0: 0, y1: .15, xl: s > 0 ? clavIn : mirror(clavOut), xr: s > 0 ? clavOut : mirror(clavIn), th: .02, bev: .015, ns: 22, nt: 14 });
    B.add(cl.geo, M.shell, 'overlay');
    // lower rib plates
    const ribO = edge([[-.68, .17], [-.56, .25], [-.42, .32]]), ribI = edge([[-.68, .035], [-.42, .1]]);
    const rib = plate(TL, { y0: -.68, y1: -.43, xl: s > 0 ? ribI : mirror(ribO), xr: s > 0 ? ribO : mirror(ribI), th: .016, bev: .014, ns: 18, nt: 14 });
    B.add(rib.geo, M.shell, 'overlay');
    // carbon-hex inlays on the flanks
    const hex = plate(TL, { face: s > 0 ? 'right' : 'left', y0: -.6, y1: -.08, xl: edge([[-.6, -.08], [-.06, -.13]]), xr: edge([[-.6, .08], [-.06, .13]]), lift: .002, th: .005, bev: .008, ns: 14, nt: 22 });
    B.add(hex.geo, M.weave, 'overlay');
  }

  // collar where the neck meets the chest
  B.add(xf(new THREE.TorusGeometry(.15, .034, 12, 48), 0, .162, -.012, HALF_PI, 0, 0, 1, 1, .85), M.metal);

  // abdomen: hex-weave core with three rows of armoured segments; the waist narrows gradually down to the belt
  const AL = new Loft([
    [-1.1, .001, .001, 0, 2], [-1.09, .17, .12, 0, 2.2], [-1.05, .232, .156, 0, 2.6], [-.93, .244, .162, 0, 2.7],
    [-.8, .26, .17, 0, 2.7], [-.7, .27, .172, 0, 2.6], [-.66, .001, .001, 0, 2],
  ]);
  B.add(AL.geometry(48, 22), M.weave);
  [[-.865, -.8], [-.94, -.877], [-1.015, -.952]].forEach(([y0, y1], r) => {
    for (const s of [-1, 1]) {
      const a = .022, b = .205 - r * .014;
      const pl = plate(AL, { y0, y1, xl: s > 0 ? () => a : () => -b, xr: s > 0 ? () => b : () => -a, th: .02, bev: .012, ns: 14, nt: 8 });
      B.add(pl.geo, M.shell, 'overlay');
    }
  });
  proxy(AL.geometry(12, 6), body);

  // pelvis: a narrow frame with a slim belt plate, hip actuators at the thigh roots
  const PL = new Loft([
    [-1.465, .001, .001, 0, 2], [-1.452, .09, .088, 0, 2.4], [-1.42, .148, .128, 0, 2.9], [-1.33, .198, .15, 0, 3.2],
    [-1.2, .222, .158, 0, 3.4], [-1.12, .222, .156, 0, 3.2], [-1.06, .19, .13, 0, 2.6], [-1.035, .001, .001, 0, 2],
  ]);
  B.add(PL.geometry(48, 22), M.shell);
  proxy(PL.geometry(12, 6), body);
  {
    const belt = plate(PL, { y0: -1.165, y1: -1.112, xl: () => -.205, xr: () => .205, th: .012, bev: .008, ns: 36, nt: 8 });
    B.add(belt.geo, M.shell, 'overlay');
    const line = [];
    for (let k = 0; k <= 24; k++) line.push(PL.surf('front', lerp(-.2, .2, k / 24), -1.185, .003));
    B.add(lineTube(line, .0032), M.trim, 'noWire');
  }
  for (const s of [-1, 1]) {     // hip actuators: gunmetal drums with gold bands
    B.add(xf(new THREE.CylinderGeometry(.086, .086, .11, 32), s * .245, -1.3, 0, 0, 0, HALF_PI), M.metal);
    B.add(xf(new THREE.TorusGeometry(.087, .0068, 8, 40), s * .292, -1.3, 0, 0, HALF_PI, 0), M.gold);
    B.add(xf(new THREE.TorusGeometry(.087, .0045, 8, 40), s * .214, -1.3, 0, 0, HALF_PI, 0), M.gold);
    B.add(xf(new THREE.CylinderGeometry(.052, .052, .012, 24), s * .304, -1.3, 0, 0, 0, HALF_PI), M.metal);
  }

  // legs: thighs with a two-piece front plate (a panel break mid-thigh), hex side inlay, knee joint and the top of the shin
  {
    const thighL = new Loft([[-2.36, .001, .001, .01, 2], [-2.34, .086, .092, .012, 2.4], [-2.22, .098, .106, .014, 2.6], [-1.98, .11, .12, .016, 2.6],
      [-1.76, .124, .134, .02, 2.7], [-1.56, .12, .126, .012, 2.6], [-1.44, .1, .1, 0, 2.4], [-1.38, .001, .001, 0, 2]]);
    const shinL = new Loft([[-3.1, .085, .1, .01, 2.5], [-2.7, .096, .112, .014, 2.6], [-2.5, .092, .104, .012, 2.5], [-2.44, .07, .08, .01, 2.3], [-2.42, .001, .001, .01, 2]]);
    const upR = edge([[-1.94, .074], [-1.78, .088], [-1.64, .076], [-1.6, .06]]);
    const loR = edge([[-2.27, .054], [-2.12, .07], [-1.99, .078]]);
    const upP = plate(thighL, { y0: -1.94, y1: -1.6, xl: mirror(upR), xr: upR, th: .014, bev: .012, ns: 14, nt: 14 });
    const loP = plate(thighL, { y0: -2.27, y1: -1.99, xl: mirror(loR), xr: loR, th: .014, bev: .012, ns: 14, nt: 12 });
    const legM = new THREE.Matrix4();
    for (const s of [-1, 1]) {
      legM.makeRotationZ(s * .035).setPosition(s * .155, 0, 0);
      const L = (g) => g.applyMatrix4(legM);
      B.add(L(thighL.geometry(32, 20)), M.shell);
      B.add(L(shinL.geometry(24, 8)), M.shell);
      B.add(L(upP.geo.clone()), M.shell, 'overlay');
      B.add(L(loP.geo.clone()), M.shell, 'overlay');
      B.add(L(loopTube(upP.outline, .003)), M.trim, 'noWire');
      B.add(L(loopTube(ringPts(thighL, -1.965, .003, 40), .0042)), M.gold);
      const hx = plate(thighL, { face: s > 0 ? 'right' : 'left', y0: -1.92, y1: -1.62, xl: edge([[-1.92, -.07], [-1.62, -.075]]), xr: edge([[-1.92, .07], [-1.62, .075]]), lift: .002, th: .005, bev: .008, ns: 12, nt: 16 });
      B.add(L(hx.geo), M.weave, 'overlay');
      B.add(L(xf(new THREE.CylinderGeometry(.07, .07, .2, 28), 0, -2.4, 0, 0, 0, HALF_PI)), M.metal);
      B.add(L(xf(new RoundedBoxGeometry(.13, .13, .05, 2, .02), 0, -2.4, .08, -.15)), M.shell);
      proxy(L(new THREE.CylinderGeometry(.13, .11, 1.1, 10).translate(0, -1.95, 0)), body);
    }
  }

  // the AI core: a recessed reactor with the hexagon "AI" mark, a progress arc that fills as the hologram builds,
  // and a set of counter-rotating gold arcs
  const core = new THREE.Group();
  {
    const cv = TL.vAt(CORE_Y), cp = TL.point(0, cv, new V3()), cn = TL.normal(0, cv, new V3());
    core.position.copy(cp).addScaledVector(cn, .004);
    core.quaternion.setFromUnitVectors(new V3(0, 0, 1), cn);
    core.updateMatrix();
  }
  body.add(core);
  {
    const socket = new THREE.LatheGeometry([[.001, .003], [.074, .003], [.083, .008], [.087, .027], [.104, .037], [.13, .036], [.146, .024], [.152, -.004]].map(([r, h]) => new THREE.Vector2(r, h)), 64);
    socket.rotateX(HALF_PI);
    B.add(socket.applyMatrix4(core.matrix), M.metal);
  }
  const markMat = clip(new THREE.MeshBasicMaterial({ map: markTexture(), color: GOLD.clone(), transparent: true, depthWrite: false, toneMapped: false }));
  const coreMark = mesh(new THREE.PlaneGeometry(.112, .112), markMat, core, 0, 0, .0045);
  coreMark.userData.noWire = true;
  const FILL_SEG = 64;
  const trackMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(.22), toneMapped: false }));
  const coreTrack = mesh(new THREE.RingGeometry(.063, .07, FILL_SEG), trackMat, core, 0, 0, .0042);
  coreTrack.userData.noWire = true;
  const fillMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false, side: THREE.DoubleSide }));
  const coreFill = mesh(new THREE.RingGeometry(.0615, .0715, FILL_SEG, 1, HALF_PI, Math.PI * 2).scale(-1, 1, 1), fillMat, core, 0, 0, .0055);   // runs clockwise from 12 o'clock
  coreFill.userData.noWire = true;
  coreFill.geometry.setDrawRange(0, 0);
  const coreRingB = mesh(mergeGeos(Array.from({ length: 4 }, (_, k) => new THREE.TorusGeometry(.118, .005, 6, 28, .95).rotateZ(k * HALF_PI))), M.gold, core, 0, 0, .043);
  const coreGlow = glow(.3, .36); coreGlow.position.z = .045;
  core.add(coreGlow);

  /* ================================================================ NECK
   * a segmented gunmetal neck: three rings (the middle one gold) with glowing cables in the gaps */
  {
    B.add(new THREE.CylinderGeometry(.074, .082, .3, 24).translate(0, .3, -.012), M.metal);
    const ringGeo = (y, r) => new THREE.LatheGeometry([[.001, -.016], [r - .007, -.016], [r, -.009], [r, .009], [r - .007, .016], [.001, .016]].map(([a, b]) => new THREE.Vector2(a, b)), 40).translate(0, y, -.012);
    B.add(ringGeo(.212, .104), M.metal);
    B.add(ringGeo(.275, .099), M.gold);
    B.add(ringGeo(.338, .094), M.metal);
    for (const a of [-.75, .75, Math.PI]) {
      const p0 = new V3(Math.sin(a) * .115, .175, Math.cos(a) * .1 - .012), p2 = new V3(Math.sin(a) * .08, .41, Math.cos(a) * .075 - .012);
      const p1 = p0.clone().lerp(p2, .5).add(new V3(Math.sin(a) * .03, 0, Math.cos(a) * .03));
      B.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 22, .0068, 6), M.cable, 'noWire');
    }
    proxy(new THREE.CylinderGeometry(.11, .11, .3, 8).translate(0, .3, 0), body);
  }

  /* ================================================================ HEAD */
  const headPivot = new THREE.Group();
  headPivot.position.y = .44;
  body.add(headPivot);
  const HEAD_S = 1.14;
  const head = new THREE.Group();
  head.scale.setScalar(HEAD_S);
  headPivot.add(head);
  const headShell = new THREE.Group(); head.add(headShell);
  const Hb = batch();

  // elongated helmet: narrow jaw, tall swept-back crown
  const HL = new Loft([
    [-.075, .001, .001, .07, 2], [-.066, .05, .045, .074, 2.2], [-.035, .1, .1, .056, 2.4], [.025, .148, .158, .025, 2.6],
    [.1, .18, .2, 0, 2.7], [.2, .198, .222, -.012, 2.8], [.3, .204, .23, -.02, 2.8], [.4, .196, .228, -.03, 2.6],
    [.47, .168, .208, -.04, 2.4], [.52, .118, .17, -.05, 2.2], [.545, .055, .1, -.06, 2], [.553, .001, .001, -.065, 2],
  ]);
  Hb.add(HL.geometry(68, 40), M.shell);
  proxy(HL.geometry(14, 10), headShell);

  // face: a brow plate and a cheek plate frame a recessed glass visor band, ear to ear, that holds the light bar
  const browR = edge([[.334, .2], [.4, .19], [.452, .118]]);
  Hb.add(plate(HL, { y0: .334, y1: .452, xl: mirror(browR), xr: browR, th: .017, bev: .012, ns: 34, nt: 16 }).geo, M.shell, 'overlay');
  const cheekR = edge([[.028, .036], [.12, .128], [.2, .176], [.238, .196]]);
  Hb.add(plate(HL, { y0: .028, y1: .238, xl: mirror(cheekR), xr: cheekR, th: .017, bev: .012, ns: 34, nt: 22 }).geo, M.shell, 'overlay');
  const bandR = edge([[.226, .208], [.346, .212]]);
  Hb.add(plate(HL, { y0: .226, y1: .346, xl: mirror(bandR), xr: bandR, lift: .0015, th: .003, bev: .004, ns: 48, nt: 8 }).geo, M.visor, 'overlay');
  const FACE_TOP = .0015 + .003 + .0012;

  // crown fin, temple and jaw facet lines
  {
    const fin = [];
    for (let j = 0; j <= 40; j++) { const v = lerp(HL.vAt(.47), .9995, j / 40); fin.push(HL.point(0, v, new V3()).addScaledVector(HL.normal(0, v, new V3()), .004)); }
    for (let j = 1; j <= 30; j++) { const v = lerp(.9995, HL.vAt(.16), j / 30); fin.push(HL.point(.5, v, new V3()).addScaledVector(HL.normal(.5, v, new V3()), .004)); }
    Hb.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fin, false, 'centripetal'), 100, .0085, 5, false), M.shell);
    for (const s of [-1, 1]) {
      const temple = [], jaw = [];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20, u = s * lerp(.215, .43, t), v = HL.vAt(lerp(.36, .33, t));
        temple.push(HL.point(u, v, new V3()).addScaledVector(HL.normal(u, v, new V3()), .002));
        const u2 = s * lerp(.235, .2, t), v2 = HL.vAt(lerp(.21, .04, t));
        jaw.push(HL.point(u2, v2, new V3()).addScaledVector(HL.normal(u2, v2, new V3()), .002));
      }
      Hb.add(lineTube(temple, .003), M.trim, 'noWire');
      Hb.add(lineTube(jaw, .003), M.trim, 'noWire');
    }
  }

  // light-bar visor: a row of LED segments across the face; the eyes are bright clusters that slide and blink
  const LEDS = 19, BAR_Y = .286, BAR_X = .172;
  const ledGeo = new RoundedBoxGeometry(.0138, .05, .007, 1, .003);
  const ledMat = clip(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, LEDS);
  leds.userData.noWire = true;
  headShell.add(leds);
  const ledBase = [], ledQuat = [];
  {
    const n = new V3(), X = new V3(), Y = new V3(), m = new THREE.Matrix4();
    for (let i = 0; i < LEDS; i++) {
      const x = lerp(-BAR_X, BAR_X, i / (LEDS - 1));
      const p = HL.surf('front', x, BAR_Y, FACE_TOP + .001);
      const v = HL.vAt(BAR_Y); HL.normal(HL.chartU(HL.at(v), 'front', x), v, n);
      X.crossVectors(new V3(0, 1, 0), n).normalize(); Y.crossVectors(n, X);
      ledBase.push(p); ledQuat.push(new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(X, Y, n)));
      leds.setColorAt(i, new THREE.Color(0, 0, 0));
    }
  }
  const EYE_C = [5, 13];
  const eyes = EYE_C.map((c) => {
    const eye = new THREE.Group();
    eye.position.copy(ledBase[c]).add(new V3(0, 0, .02));
    const g = glow(.4, .5); g.scale.set(.2, .085, 1); eye.add(g);
    eye.userData = { glow: g, c };
    headShell.add(eye);
    return eye;
  });

  // ear modules + antenna
  const EAR_Y = .27, earR = HL.at(HL.vAt(EAR_Y)).w;
  const earMat = lightMat();
  for (const s of [-1, 1]) {
    Hb.add(xf(new THREE.CylinderGeometry(.068, .074, .06, 40), s * (earR + .012), EAR_Y, -.02, 0, 0, HALF_PI), M.metal);
    Hb.add(xf(new THREE.TorusGeometry(.056, .0065, 8, 40), s * (earR + .043), EAR_Y, -.02, 0, HALF_PI, 0), M.gold);
    Hb.add(xf(new THREE.CircleGeometry(.022, 24), s * (earR + .0435), EAR_Y, -.02, 0, s * HALF_PI, 0), earMat, 'noWire');
  }
  const antennaCurve = new THREE.QuadraticBezierCurve3(
    new V3(-(earR + .03), EAR_Y + .05, -.06),
    new V3(-(earR + .08), EAR_Y + .2, -.1),
    new V3(-(earR + .042), EAR_Y + .335, -.19),
  );
  Hb.add(new THREE.TubeGeometry(antennaCurve, 26, .0065, 6), M.metal);
  Hb.emit(headShell);
  const tipMat = lightMat();
  const tip = mesh(new THREE.SphereGeometry(.016, 14, 10), tipMat, headShell);
  tip.position.copy(antennaCurve.getPoint(1));
  tip.userData.noWire = true;
  const tipGlow = glow(.22, .8); tipGlow.position.copy(tip.position);
  headShell.add(tipGlow);

  /* ================================================================ ARMS */
  const L1 = .54, L2 = .48, SHX = .55;
  const deltL = new Loft([
    [-.22, .001, .001, 0, 2], [-.205, .075, .075, 0, 2.2], [-.155, .122, .122, 0, 2.5], [-.06, .148, .145, 0, 2.6],
    [.035, .152, .148, 0, 2.6], [.1, .13, .128, 0, 2.4], [.14, .082, .088, 0, 2.2], [.155, .001, .001, 0, 2],
  ]);
  const deltGeo = deltL.geometry(44, 26);
  const upperL = new Loft([[-.45, .001, .001, 0, 2], [-.44, .055, .057, 0, 2.2], [-.41, .076, .078, 0, 2.6], [-.3, .086, .088, .005, 2.7], [-.18, .088, .09, .005, 2.7], [-.13, .07, .075, 0, 2.4], [-.115, .001, .001, 0, 2]]);
  const upperGeo = upperL.geometry(40, 22);
  const foreL = new Loft([[-.47, .001, .001, 0, 2], [-.464, .048, .046, 0, 2.2], [-.44, .06, .058, 0, 2.6], [-.34, .077, .074, .004, 2.7], [-.19, .092, .088, .008, 2.7], [-.1, .085, .082, .004, 2.6], [-.078, .06, .06, 0, 2.3], [-.07, .001, .001, 0, 2]]);
  const foreGeo = foreL.geometry(40, 24);
  const fpR = edge([[-.4, .026], [-.28, .048], [-.16, .058], [-.12, .04]]);
  const forePlate = plate(foreL, { y0: -.4, y1: -.12, xl: mirror(fpR), xr: fpR, th: .011, bev: .009, ns: 16, nt: 22 });

  /* ---- hand parts shared by both hands: a lofted palm (thick at the heel, domed back), an armoured back plate and a hex palm pad */
  const HS = 1.4;  // hand scale: deliberately generous so the fingers read at hero size
  const palmL = new Loft([
    [-.19, .001, .001, -.004, 2], [-.186, .066, .013, -.004, 2.4], [-.176, .086, .019, -.003, 3.2], [-.13, .09, .023, -.001, 3.4],
    [-.085, .087, .026, .001, 3.4], [-.05, .076, .026, .002, 3], [-.028, .06, .023, .001, 2.6], [-.016, .001, .001, 0, 2],
  ]);
  const palmGeo = palmL.geometry(28, 16);
  const bkR = edge([[-.17, .066], [-.13, .076], [-.08, .072], [-.044, .05]]);
  const BACK = { lift: .0015, th: .011 };
  const backPlate = plate(palmL, { face: 'back', y0: -.17, y1: -.044, xl: mirror(bkR), xr: bkR, lift: BACK.lift, th: BACK.th, bev: .009, ns: 16, nt: 14 });
  const padR = edge([[-.163, .058], [-.11, .064], [-.07, .05]]);
  const PAD = { lift: .0015, th: .0045 };
  const palmPad = plate(palmL, { y0: -.163, y1: -.07, xl: mirror(padR), xr: padR, lift: PAD.lift, th: PAD.th, bev: .006, ns: 10, nt: 10 });
  const FINGERS = [ // x, knuckle y, splay, segment lengths, width
    [.064, -.188, .07, [.082, .056, .044], .034],
    [.021, -.195, .02, [.092, .062, .047], .035],
    [-.021, -.19, -.035, [.085, .058, .045], .033],
    [-.061, -.176, -.09, [.066, .046, .038], .029],
  ];
  const FD = .034;

  function buildHand(s, ledArm) {
    const hand = new THREE.Group();
    const hk = new THREE.Group(); hk.scale.setScalar(HS); hand.add(hk);
    const rootBone = new THREE.Bone(); hk.add(rootBone);
    const bones = [rootBone];
    const G = [[], [], []];   // material groups: black / graphite (vertex colours), gold tips, hex palm pad
    const add = (geo, bone, mi, col) => { if (col !== undefined) tint(geo, col); G[mi].push({ geo, bone }); };

    add(new THREE.SphereGeometry(.036, 14, 9).scale(1.3, .9, .85), rootBone, 0, C.joint);                  // wrist joint
    add(new RoundedBoxGeometry(.1, .04, .05, 1, .012).translate(0, -.022, 0), rootBone, 0, C.chassis);
    add(palmGeo.clone(), rootBone, 0, C.chassis);
    add(backPlate.geo.clone(), rootBone, 0, C.shell);
    add(palmPad.geo.clone(), rootBone, 2);
    // thenar pad under the thumb, a smaller hypothenar pad on the other edge
    add(new THREE.SphereGeometry(.042, 12, 9).scale(.72, 1.25, .5).rotateZ(-s * .45).translate(s * .05, -.082, palmL.zFront(-.082) + .004), rootBone, 0, C.chassis);
    add(new THREE.SphereGeometry(.03, 10, 8).scale(.7, 1.45, .42).rotateZ(s * .12).translate(-s * .062, -.118, palmL.zFront(-.118) + .002), rootBone, 0, C.chassis);
    const chain = (parent, lens, w, d) => {
      const segs = []; let p = parent;
      lens.forEach((len, k) => {
        let j = parent;
        if (k) { j = new THREE.Bone(); j.position.y = -lens[k - 1]; p.add(j); bones.push(j); }
        const wk = w * (1 - k * .06), dk = d * (1 - k * .07);
        const seg = new RoundedBoxGeometry(wk, len - .01, dk, 2, Math.min(wk, dk) * .4).translate(0, -len / 2 - .002, 0);
        if (k === lens.length - 1) add(seg, j, 1);
        else {
          add(seg, j, 0, C.shell);
          add(new THREE.CylinderGeometry(dk * .33, dk * .33, wk * 1.03, 8).rotateZ(HALF_PI).translate(0, -len, 0), j, 0, C.pin);
        }
        segs.push(j); p = j;
      });
      return segs;
    };
    const fingers = FINGERS.map(([x, ky, spl, lens, w], f) => {
      add(new THREE.CylinderGeometry(.016, .016, w * 1.03, 10).rotateZ(HALF_PI).translate(s * x, ky, 0), rootBone, 0, C.pin);                       // knuckle joint
      add(new RoundedBoxGeometry(w + .004, .03, .016, 1, .006).translate(s * x, ky + .013, palmL.zBack(ky + .013) - .011), rootBone, 0, C.shell);    // knuckle guard
      add(new RoundedBoxGeometry(w - .002, .024, .012, 1, .005).translate(s * x, ky + .017, palmL.zFront(ky + .017) - .001), rootBone, 0, C.chassis); // palm-side pad
      const base = new THREE.Bone(); base.position.set(s * x, ky, 0); rootBone.add(base); bones.push(base);
      return { base, segs: chain(base, lens, w, FD), f, spl };
    });
    const thumb = new THREE.Bone(); thumb.position.set(s * .072, -.066, palmL.zFront(-.066) - .004); rootBone.add(thumb); bones.push(thumb);
    const thumbSegs = chain(thumb, [.086, .063, .05], .04, .037);

    // bind: every part follows exactly one bone (rigid skinning), so the whole hand is a couple of draw calls
    const toRoot = new Map(bones.map((b) => {
      const m = new THREE.Matrix4();
      for (let o = b; o !== rootBone; o = o.parent) { o.updateMatrix(); m.premultiply(o.matrix); }
      return [b, m];
    }));
    const geo = skinnedGeo(G, (b) => bones.indexOf(b), (b) => toRoot.get(b));
    const skin = new THREE.SkinnedMesh(geo, [M.hand, M.gold, M.weave]);
    skin.frustumCulled = false;
    hk.add(skin);
    skin.bind(new THREE.Skeleton(bones, bones.map((b) => toRoot.get(b).clone().invert())), new THREE.Matrix4());

    // gold chevron inlay on the back plate and a light ring in the palm (both brighten during the wave)
    const lit = [];
    const bTop = BACK.lift + BACK.th + .0012;
    for (const e of [-1, 1]) { const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(palmL.surf('back', e * lerp(.036, .002, t), lerp(-.082, -.116, t), bTop)); } lit.push(lineTube(pts, .0026)); }
    const ringC = palmL.surf('front', -s * .006, -.114, PAD.lift + PAD.th + .003);
    lit.push(new THREE.RingGeometry(.011, .018, 24).translate(ringC.x, ringC.y, ringC.z));
    const litMesh = mesh(mergeGeos(lit), ledArm, hk); litMesh.userData.noWire = true;
    proxy(new THREE.BoxGeometry(.21, .4, .12).translate(0, -.17, .012), hk);
    return { hand, fingers, thumb, thumbSegs };
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const s = side;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * SHX, -.02, 0);
    body.add(shoulder);
    const upper = new THREE.Group(); shoulder.add(upper);
    const U = batch();
    const faceOut = s > 0 ? 'right' : 'left';

    // layered shoulder armour: joint ball, deltoid shell, bevelled pauldron with light bars, and a glowing hem
    U.add(new THREE.SphereGeometry(.098, 24, 16), M.metal);
    U.add(deltGeo.clone().translate(s * .02, 0, 0), M.shell);
    const paE = edge([[-.12, .05], [-.05, .1], [.12, .1]]);
    const pa = plate(deltL, { face: faceOut, y0: -.13, y1: .13, xl: mirror(paE), xr: paE, th: .018, bev: .014, ns: 22, nt: 22 });
    U.add(pa.geo.translate(s * .02, 0, 0), M.shell, 'overlay');
    U.add(loopTube(pa.outline, .0036).translate(s * .02, 0, 0), M.trim, 'noWire');
    for (let k = 0; k < 3; k++) {     // three short light bars on the pauldron
      const y = -.07 + k * .028, pts = [];
      for (let j = 0; j <= 8; j++) pts.push(deltL.surf(faceOut, lerp(.03, .072, j / 8) * (s > 0 ? -1 : 1), y, .022));
      U.add(lineTube(pts, .0038).translate(s * .02, 0, 0), M.trim, 'noWire');
    }
    U.add(loopTube(ringPts(deltL, -.165, .005, 48), .0075).translate(s * .02, 0, 0), M.shell);      // hem: a dark rolled rim...
    U.add(loopTube(ringPts(deltL, -.181, .0, 48), .0034).translate(s * .02, 0, 0), M.trim, 'noWire'); // ...over a thin line of light

    // upper arm: weave core with an armour sleeve and a gold band
    U.add(new THREE.CylinderGeometry(.058, .052, .44, 20).translate(0, -.31, 0), M.weave);
    U.add(upperGeo, M.limb);
    U.add(xf(new THREE.TorusGeometry(.078, .0042, 8, 40), 0, -.405, 0, HALF_PI), M.gold);

    // elbow: hinge with gold caps
    U.add(new THREE.SphereGeometry(.064, 20, 14).translate(0, -L1, 0), M.metal);
    U.add(xf(new THREE.CylinderGeometry(.054, .054, .13, 24), 0, -L1, 0, 0, 0, HALF_PI), M.metal);
    for (const e of [-1, 1]) U.add(xf(new THREE.TorusGeometry(.044, .005, 8, 32), e * .067, -L1, 0, 0, HALF_PI, 0), M.gold);
    U.emit(upper);
    proxy(new THREE.SphereGeometry(.17, 8, 6).translate(s * .02, 0, 0), upper);
    proxy(new THREE.CylinderGeometry(.1, .09, L1, 8).translate(0, -L1 / 2, 0), upper);
    const elbow = new THREE.Group(); elbow.position.y = -L1; upper.add(elbow);

    // forearm: armoured shell, front plate, LED strip, wrist cuff
    const fore = new THREE.Group(); elbow.add(fore);
    const F = batch();
    F.add(foreGeo, M.limb);
    F.add(forePlate.geo, M.limb, 'overlay');
    F.add(loopTube(forePlate.outline, .0034), M.trim, 'noWire');
    const ledArm = lightMat();
    {
      const pts = [];
      for (let k = 0; k <= 16; k++) pts.push(foreL.surf(faceOut, 0, lerp(-.37, -.15, k / 16), .004));
      F.add(lineTube(pts, .0062), ledArm, 'noWire');
    }
    F.add(xf(new THREE.TorusGeometry(.05, .015, 10, 32), 0, -.465, 0, HALF_PI), M.metal);
    F.add(xf(new THREE.TorusGeometry(.057, .004, 8, 32), 0, -.448, 0, HALF_PI), M.gold);
    F.emit(fore);
    proxy(new THREE.CylinderGeometry(.095, .07, L2, 8).translate(0, -L2 / 2, 0), fore);
    const wrist = new THREE.Group(); wrist.position.y = -L2; fore.add(wrist);

    /* ---- hand: lofted palm with a domed armoured back, thenar pad, hex palm pad, knuckle joints,
       3-segment fingers with gold tips and an opposable 3-segment thumb */
    const H = buildHand(s, ledArm);
    wrist.add(H.hand);
    const thumbRest = orient(new V3(s * .28, -1, .4), new V3(-s * .75, -.1, .65));
    const thumbOpen = orient(new V3(s * .56, -.82, .16), new V3(-s * .35, -.1, 1));   // up and out ~35 degrees from the fingers
    arms.push({ side, shoulder, upper, elbow, fore, wrist, hand: H.hand, fingers: H.fingers, thumb: H.thumb, thumbSegs: H.thumbSegs, thumbRest, thumbOpen, ledMat: ledArm });
  }
  B.emit(body);

  /* ---- poses (local quaternions per joint), blended with slerp at runtime */
  const qArm = (side, U, F, H) => {
    const s = side, qU = orient(new V3(...U[0]).setX(U[0][0] * s), new V3(...U[1]).setX(U[1][0] * s));
    const qFw = orient(new V3(...F[0]).setX(F[0][0] * s), new V3(...F[1]).setX(F[1][0] * s));
    const qHw = orient(new V3(...H[0]).setX(H[0][0] * s), new V3(...H[1]).setX(H[1][0] * s));
    const qF = qU.clone().invert().multiply(qFw), qH = qFw.clone().invert().multiply(qHw);
    return { u: qU, f: qF, h: qH };
  };
  // three keys for the greeting: hanging relaxed -> elbow curls the hand up in front -> arm opens out, palm to the viewer.
  // each key keeps the forearm's twist continuous, so nothing spins on the way.
  // at rest the palms turn in toward the thighs, so the curled fingers read in profile.
  const POSE = {
    rest: (s) => qArm(s, [[.2, -1, .03], [0, 0, 1]], [[.18, -.8, .58], [.5, .5, 1]], [[.12, -.95, .3], [-.87, .05, -.49]]),
    mid: (s) => qArm(s, [[.34, -.88, .34], [0, .3, 1]], [[.12, .22, 1], [.5, .77, -.81]], [[.1, .5, .9], [-.58, -.79, .23]]),
    wave: (s) => qArm(s, [[.62, -.52, .6], [0, .4, 1]], [[-.06, 1, -.06], [.5, 0, -1]], [[-.03, 1, .02], [0, -.1, 1]]),
  };
  arms.forEach((a) => { a.rest = POSE.rest(a.side); a.mid = POSE.mid(a.side); a.wave = POSE.wave(a.side); });

  /* ================================================== ORBIT RING + DATA */
  const HEAD_C = new V3(0, body.position.y + headPivot.position.y + .26 * HEAD_S, 0); // head centre, robot space
  // one thin ring, wide enough to clear the helmet, tilted so its front arc passes under the visor (never across the light bar)
  const halo = new THREE.Group();
  halo.position.copy(HEAD_C).y -= .13;
  robot.add(halo);
  const rings = [];
  {
    const radius = .44, pivot = new THREE.Group();
    pivot.rotation.set(HALF_PI + .82, 0, .06);
    const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .3, toneMapped: false, depthWrite: false });
    pivot.add(new THREE.Mesh(new THREE.TorusGeometry(radius, .0026, 4, 128), ringMat));
    const spinner = new THREE.Group();
    const satMat = new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false });
    spinner.add(new THREE.Mesh(mergeGeos([0, Math.PI].map((a) => new THREE.SphereGeometry(.013, 10, 8).translate(Math.cos(a) * radius, Math.sin(a) * radius, 0))), satMat));
    for (const a of [0, Math.PI]) { const sg = glow(.14, .8); sg.material.clippingPlanes = null; sg.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0); spinner.add(sg); }
    pivot.add(spinner);
    pivot.scale.setScalar(.001);
    halo.add(pivot);
    rings.push({ pivot, spinner, ringMat, speed: .45 });
  }

  const PN = 240;
  const pPos = new Float32Array(PN * 3), pSpeed = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.1 + Math.random() * 1.6;
    pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = -2.2 + Math.random() * 4.2; pPos[i * 3 + 2] = Math.sin(a) * r * .7;
    pSpeed[i] = .08 + Math.random() * .22;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ map: glowTex, color: GOLD, size: .05, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, clippingPlanes: [floorClip] });
  const particles = new THREE.Points(pGeo, pMat);
  robot.add(particles);

  /* the hologram the robot builds is HTML (.holo); this drives it through data attributes */
  const LAYOUTS = [
    { name: 'App', noun: 'app' },
    { name: 'Website', noun: 'website' },
    { name: 'AI video', noun: 'AI video' },
    { name: 'Brand content', noun: 'brand content', planning: 'Planning brand content…' },
  ].map((L) => Object.assign(L, { planning: L.planning || 'Planning the ' + L.noun + '…', done: L.name + ' ✓' }));
  const holoState = { phase: 'idle', t: 0, i: 0 };
  const shown = { phase: '', i: -1 };   // what the page currently shows (avoids reading / building strings every frame)
  const HOLO_BUILD = 2.45;
  const hudLabel = stage.querySelector('.holo__label');
  const hudKicker = stage.querySelector('.holo__kicker');
  let hudK = '', hudL = '';
  function setHud(kicker, label) {
    if (kicker === hudK && label === hudL) return;
    hudK = kicker; hudL = label;
    if (hudKicker) hudKicker.textContent = kicker;
    if (hudLabel) hudLabel.textContent = label;
  }

  /* power aura: segmented hologram ring behind the head and shoulders + click shockwave */
  const AURA_R = 1.56;
  const auraMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const auraHolder = new THREE.Group(); auraHolder.position.set(HEAD_C.x, HEAD_C.y - .15, -.5); auraHolder.scale.setScalar(.385); robot.add(auraHolder);
  const aura = new THREE.Group(); auraHolder.add(aura);
  {
    const parts = [];
    for (let k = 0; k < 36; k++) parts.push(new THREE.RingGeometry(1.5, AURA_R, 4, 1, (k / 36) * Math.PI * 2, (Math.PI * 2 / 36) * .55));
    parts.push(new THREE.RingGeometry(1.38, 1.392, 128));
    aura.add(new THREE.Mesh(mergeGeos(parts), auraMat));
  }
  const auraInner = new THREE.Mesh(mergeGeos([0, 1, 2].map((k) => new THREE.RingGeometry(1.24, 1.27, 48, 1, k * Math.PI * 2 / 3, Math.PI / 3))), auraMat);
  aura.add(auraInner);
  aura.scale.setScalar(.001);
  const shockMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const shock = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 128), shockMat); auraHolder.add(shock);

  /* ================================================ BUILD-IN WIREFRAME */
  const wireMat = new THREE.MeshBasicMaterial({ color: GOLD, wireframe: true, transparent: true, opacity: .07, depthWrite: false, toneMapped: false, clippingPlanes: [wireClip, floorClip] });
  const wires = [];
  const solids = [];
  body.traverse((o) => {
    if (o.isMesh && !o.userData.noWire && !['TubeGeometry', 'CircleGeometry', 'RingGeometry'].includes(o.geometry.type)) solids.push(o);
  });
  solids.forEach((o) => {
    if (o.geometry.userData.overlay) return;
    let w;
    if (o.isSkinnedMesh) { w = new THREE.SkinnedMesh(o.geometry, wireMat); w.bind(o.skeleton, o.bindMatrix); w.frustumCulled = false; }
    else w = new THREE.Mesh(o.geometry, wireMat);
    o.add(w); wires.push(w);
  });
  const scanMat = new THREE.MeshBasicMaterial({ map: lineTexture(), color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(4.2, .55), scanMat);
  scan.position.z = .8;
  robot.add(scan);

  /* ============================================================ STATE */
  const S = {
    w: 1, h: 1, visible: true, running: false,
    started: false, buildT: 0, built: false, lit: 0,
    look: new THREE.Vector2(0, 0), lookTarget: new THREE.Vector2(0, 0),
    pointer: { x: 0, y: 0, inside: false, touchAt: -10, movedAt: -10 }, rect: null,
    nextBlink: 2.5, blinkT: -1, nextScan: 6, scanT: -1,
    greetT: -1, shockT: -1, msg: 0, bubbleTimer: 0,
    scroll: 0, light: root.dataset.theme === 'light', phone: false,
  };

  /* framing. Robot space: the aura tops out at y ~1.51, the antenna at ~1.45; the resting hands hang to ~-1.17.
     Desktop: the view top sits just above the aura, the hands land ~73% down (where the CSS fade has barely begun).
     Phones (stage <= 560px): the bubble sits under the nav at the top of the stage and the hologram card docks at
     the bottom, so the robot is framed lower and a little smaller: its top clears the bubble, its hands clear the card,
     and nothing is drawn behind the card. */
  const holoEl = stage.querySelector('.holo');
  const hasNav = !!document.getElementById('nav');
  const TOP = 1.52, HANDS = -1.17, SHOULDER_W = .73, SHOULDER_Y = .48;   // shoulder: outer edge and top of the pauldrons
  function fit() {
    const r = stage.getBoundingClientRect();
    S.rect = r;
    S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
    S.phone = innerWidth <= 560;   // the CSS phone layout: bubble under the nav, hologram card docked at the bottom
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(S.w, S.h, false);
    camera.aspect = S.w / S.h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // pixels reserved above the robot, and where the resting hands should land
    const dock = S.phone && holoEl && holoEl.offsetParent === stage ? holoEl.offsetTop - 11 : 0;   // card top, less its float and a margin
    const handsPx = dock ? dock - 10 : S.h * (S.phone ? .74 : .73);
    // headroom: where the stage starts close under the nav, leave room above the aura for the speech bubble
    // (two lines, three on phones), less the drop of the aura's arc under the bubble's left edge
    const above = hasNav ? r.top + scrollY - 76 : 1e4, need = (S.phone ? 85 : 65) + 18;
    // the hologram panel, where it sits beside the robot (desktop layouts): the shoulders must pass below it
    const side = !S.phone && holoEl && holoEl.offsetParent === stage;
    const hR = side ? holoEl.offsetLeft + holoEl.offsetWidth : 0, hB = side ? holoEl.offsetTop + holoEl.offsetHeight : 0;
    let topPx = S.h * .015, ppu = 1;
    for (let k = 0; k < 4; k++) {
      ppu = Math.min((handsPx - topPx) / (TOP - HANDS), S.w / (S.phone ? 2.9 : 3.0));   // pixels per world unit, never wider than the stage
      topPx = Math.max(S.h * .015, need - above - .07 * ppu);
      if (side && S.w / 2 - SHOULDER_W * ppu < hR + 12) topPx = Math.max(topPx, hB + 14 - (TOP - SHOULDER_Y) * ppu);
    }
    ppu = Math.min((handsPx - topPx) / (TOP - HANDS), S.w / (S.phone ? 2.9 : 3.0));
    // ...and the aura ring keeps clear of the panel too, shrinking if it must (never inside the orbit ring)
    let auraS = .385;
    if (side) {
      const persp = 1 / (1 + .5 / (S.h / ppu / 2 / t));            // the aura sits .5 behind the robot
      const cx = S.w / 2, cy = topPx + (TOP - auraHolder.position.y) * ppu;
      const d = Math.hypot(cx - clamp(cx, holoEl.offsetLeft, hR), cy - clamp(cy, holoEl.offsetTop, hB));
      auraS = clamp((d - 14) / (AURA_R * ppu * persp), .31, .385);
    }
    auraHolder.scale.setScalar(auraS);
    const viewH = S.h / ppu, viewTop = TOP + topPx / ppu;
    const dist = viewH / 2 / t;
    const cy = viewTop - viewH / 2;
    camera.position.set(0, cy, dist);
    camera.lookAt(0, cy, 0);
    camera.updateProjectionMatrix();
    floorClip.constant = dock ? -(cy + (.5 - dock / S.h) * viewH) : 100;
    if (S.started && !S.running) requestRender();
  }
  fit();
  { const ro = new ResizeObserver(fit); ro.observe(stage); if (holoEl) ro.observe(holoEl); }

  function applyTheme() {
    S.light = root.dataset.theme === 'light';
    const blend = S.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    pMat.blending = blend; pMat.color.set(S.light ? 0x9a7414 : GOLD); pMat.opacity = S.light ? .5 : .75; pMat.needsUpdate = true;
    rings.forEach((r) => { r.ringMat.color.set(S.light ? 0x8a6a12 : GOLD); r.ringMat.opacity = S.light ? .4 : .3; });
    wireMat.color.set(S.light ? 0x6b4f0a : GOLD);
    glows.forEach((g) => { g.material.blending = blend; g.material.color.set(S.light ? 0xb8891e : GOLD); g.userData.k = S.light ? .45 : 1; g.material.opacity = g.userData.baseOpacity * g.userData.k; g.material.needsUpdate = true; });
    scanMat.color.set(S.light ? 0xb8891f : GOLD); scanMat.blending = blend; scanMat.needsUpdate = true;
    auraMat.blending = blend; auraMat.color.set(S.light ? 0x8a6a12 : GOLD); auraMat.opacity = S.light ? .4 : .55; auraMat.needsUpdate = true;
    shockMat.blending = blend; shockMat.color.set(S.light ? 0x8a6a12 : GOLD); shockMat.needsUpdate = true;
    renderer.toneMappingExposure = S.light ? 1.15 : 1.05;
    if (S.started && !S.running) requestRender();
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- pointer: follow the real cursor position, relative to the head on screen */
  const onPointer = (e) => {
    S.pointer.x = e.clientX; S.pointer.y = e.clientY; S.pointer.movedAt = performance.now() / 1000;
    if (e.pointerType === 'touch') S.pointer.touchAt = performance.now() / 1000;
    else S.pointer.inside = true;
    if (reduced) requestRender();
  };
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { S.pointer.inside = false; });
  addEventListener('blur', () => { S.pointer.inside = false; });
  addEventListener('scroll', () => {
    S.scroll = Math.min(scrollY / innerHeight, 1.2);
    S.rect = stage.getBoundingClientRect();
  }, { passive: true });

  new IntersectionObserver(([en]) => { S.visible = en.isIntersecting; kick(); if (S.visible && reduced) requestRender(); }, { threshold: 0 }).observe(stage);
  document.addEventListener('visibilitychange', kick);

  /* ---- speech bubble */
  const MESSAGES = [
    'Hi! I’m the AI half of this AI Builder. 👋',
    'Apps, websites, videos and marketing — built end to end with AI.',
    '8,000+ hours with AI since 2022.',
    'Got an idea? Scroll down and let’s build it.',
  ];
  const touchOnly = matchMedia('(hover: none)').matches;
  function say(i) {
    if (!bubble) return;
    bubble.textContent = i === 0 && touchOnly ? 'Hi! I’m the AI half of this AI Builder. Tap me 👋' : MESSAGES[i % MESSAGES.length];
    bubble.classList.add('is-show');
    placeOverlays();
    clearTimeout(S.bubbleTimer);
    S.bubbleTimer = setTimeout(() => bubble.classList.remove('is-show'), 4200);
  }
  const VISOR_Y = .326;   // visor centre, up from the neck pivot
  function greet() {
    if (!S.built || (S.greetT >= 0 && S.greetT < .6)) return;
    S.msg++; say(S.msg);
    if (reduced) { showStill(holoState.i + 1); requestRender(); return; }
    S.greetT = S.greetT >= 0 ? Math.min(S.greetT, .25) : 0; S.shockT = 0; kick();
    headPivot.getWorldPosition(tmpV); tmpV.y += VISOR_Y; tmpV.z = 0;
    const o = toStage(tmpV, scrA);
    dispatchEvent(new CustomEvent('robot:shock', { detail: { x: S.rect.left + o.x, y: S.rect.top + o.y } }));
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitTargets = proxies;
  function hits(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(hitTargets, false).length > 0;
  }
  canvas.addEventListener('click', (e) => { if (hits(e)) greet(); });
  let hoverQueued = false;
  canvas.addEventListener('pointermove', (e) => {
    if (hoverQueued || e.pointerType === 'touch') return;
    hoverQueued = true;
    requestAnimationFrame(() => { hoverQueued = false; stage.classList.toggle('is-hover', S.built && hits(e)); });
  });
  canvas.addEventListener('pointerleave', () => stage.classList.remove('is-hover'));
  const sayBtn = stage.querySelector('.robot__say');
  if (sayBtn) sayBtn.addEventListener('click', greet);

  /* ---- build sequence */
  const BUILD = 2.6;
  const REVEAL_FROM = -2.45, REVEAL_TO = 1.55;
  function setReveal(c) { solidClip.constant = c; wireClip.constant = -c; scan.position.y = c; }

  function start() {
    if (S.started) return;
    S.started = true;
    stage.classList.add('is-ready');
    if (reduced) finishBuild();
    kick();
  }
  function showStill(i) {     // reduced motion: a finished build, no animation
    holoState.i = i % LAYOUTS.length;
    holoState.phase = 'hold';
    setHud('Built', LAYOUTS[holoState.i].done);
  }
  function finishBuild() {
    aura.scale.setScalar(1);
    if (reduced) showStill(0);
    S.built = true; S.lit = 1;
    setReveal(100);
    wires.forEach((w) => w.parent && w.parent.remove(w));
    scanMat.opacity = 0;
    rings.forEach((r) => r.pivot.scale.setScalar(1));
    setTimeout(() => say(0), reduced ? 0 : 500);
  }
  setReveal(REVEAL_FROM);

  /* ---- loop */
  const clock = new THREE.Clock();
  let raf = 0;
  function kick() {
    const should = S.started && S.visible && !document.hidden && !reduced;
    if (should && !S.running) { S.running = true; clock.getDelta(); raf = requestAnimationFrame(loop); }
    if (!should) { S.running = false; cancelAnimationFrame(raf); }
    if (reduced && S.started) requestRender();
  }
  let pending = false;
  function requestRender() {
    if (pending || !S.visible || document.hidden) return; pending = true;
    requestAnimationFrame(() => { pending = false; update(reduced ? 0 : 1 / 60); renderer.render(scene, camera); placeOverlays(); });
  }
  let acc = 0;
  function loop() {
    if (!S.running) return;
    raf = requestAnimationFrame(loop);
    acc += clock.getDelta();
    if (acc < 1 / 62) return;              // no point drawing faster than 60 fps
    const dt = Math.min(acc, .05); acc = 0;
    update(dt);
    renderer.render(scene, camera);
    placeOverlays();
  }

  const eyeWorld = new THREE.Vector3();
  const headWorld = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpAxis = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const ledPos = new THREE.Vector3(), ledScale = new THREE.Vector3(1, 1, 1), ledM4 = new THREE.Matrix4(), ledCol = new THREE.Color();
  const hudStack = stage.querySelector('.robot__hud--b');
  const sizes = new WeakMap();
  const sizeOf = (el) => sizes.get(el) || [el.offsetWidth, el.offsetHeight];
  const sizeRO = new ResizeObserver((es) => es.forEach((e) => sizes.set(e.target, [e.target.offsetWidth, e.target.offsetHeight])));
  [hudStack, bubble].forEach((el) => el && sizeRO.observe(el));
  const scrA = { x: 0, y: 0 }, scrB = { x: 0, y: 0 };
  const toStage = (v, out) => { v.project(camera); out.x = (v.x + 1) / 2 * S.w; out.y = (1 - v.y) / 2 * S.h; return out; };
  const last = { stack: -1, bx: -1, by: -1 };
  function setTop(el, key, y) {
    if (!el) return;
    const top = Math.round(y - sizeOf(el)[1] / 2);
    if (top !== last[key]) { el.style.top = top + 'px'; el.style.bottom = 'auto'; last[key] = top; }
  }
  function placeOverlays() {
    const docked = innerWidth <= 560; // phones: CSS places the cards
    if (!docked && hudStack) { tmpV.set(0, HANDS - .32, 0); body.localToWorld(tmpV); setTop(hudStack, 'stack', toStage(tmpV, scrA).y + 12 + sizeOf(hudStack)[1] / 2); } // just below the resting hand, clear of both arms
    if (bubble && bubble.classList.contains('is-show')) {
      const [bw, bh] = sizeOf(bubble);
      headPivot.getWorldPosition(tmpV); tmpV.x += .3;
      const bx = Math.round(Math.min(Math.max(toStage(tmpV, scrA).x - 6, 8), S.w - bw - 8));
      // the bubble sits above the crown, and its bottom clears whatever lies under it: the aura ring, the antenna tip
      headPivot.getWorldPosition(tmpV); tmpV.y += .72;
      let top = toStage(tmpV, scrA).y;
      tip.getWorldPosition(tmpV); tmpV.y += .03; toStage(tmpV, scrA);
      if (scrA.x > bx - 10 && scrA.x < bx + bw + 10) top = Math.min(top, scrA.y);
      auraHolder.getWorldPosition(tmpV);
      const c = toStage(tmpV, scrA);
      const R = AURA_R * auraHolder.scale.x * aura.scale.x;
      auraHolder.getWorldPosition(tmpV); tmpV.x += R;
      const rx = toStage(tmpV, scrB).x - c.x;
      auraHolder.getWorldPosition(tmpV); tmpV.y += R;
      const ry = c.y - toStage(tmpV, scrB).y, nx = Math.min(Math.max(c.x, bx), bx + bw), dx = (nx - c.x) / rx;
      if (Math.abs(dx) < 1) top = Math.min(top, c.y - ry * Math.sqrt(1 - dx * dx) - 3);
      const minTop = -Math.max(0, (S.rect ? S.rect.top : 0) - 76); // may rise into the hero padding, never under the nav
      const by = Math.round(Math.max(top - bh - 10, minTop));
      if (bx !== last.bx || by !== last.by) { bubble.style.left = bx + 'px'; bubble.style.right = 'auto'; bubble.style.top = by + 'px'; last.bx = bx; last.by = by; }
    }
  }

  function poseArm(a, wave, t, k) {
    const s = a.side;
    const k2 = wave * 2, A = k2 < 1 ? a.rest : a.mid, B = k2 < 1 ? a.mid : a.wave, q = k2 < 1 ? k2 : k2 - 1;
    a.upper.quaternion.slerpQuaternions(A.u, B.u, q);
    a.fore.quaternion.slerpQuaternions(A.f, B.f, q);
    a.hand.quaternion.slerpQuaternions(A.h, B.h, q);
    if (!reduced) {
      // breathing sway, slightly out of phase per arm
      a.upper.rotateX(Math.sin(t * .9 + k * 1.7) * .02 * (1 - wave));
      a.upper.rotateZ(s * (Math.sin(t * .45) * .012 + .004 * Math.sin(t * 1.5)) * (1 - wave));
    }
    // fingers: relaxed curl at rest, open and spread for the wave
    const relax = reduced ? 0 : Math.sin(t * .7 + k) * .04;
    for (let i = 0; i < 4; i++) {
      const f = a.fingers[i], c = 1 + i * .16;
      f.base.rotation.set(lerp(-.2 * c + relax, -.03, wave), 0, s * f.spl * lerp(1.8, 2.2, wave));
      f.segs[1].rotation.x = lerp(-.3 * c + relax, -.05, wave);
      f.segs[2].rotation.x = lerp(-.22 * c, -.03, wave);
    }
    a.thumb.quaternion.slerpQuaternions(a.thumbRest, a.thumbOpen, wave);
    a.thumbSegs[1].rotation.x = lerp(-.25, -.04, wave);
    a.thumbSegs[2].rotation.x = lerp(-.3, -.04, wave);
  }

  function update(dt) {
    const t = clock.elapsedTime;

    /* build */
    if (!S.built) {
      S.buildT += dt;
      const p = easeInOut(S.buildT / BUILD);
      const c = lerp(REVEAL_FROM, REVEAL_TO, p);
      setReveal(c);
      scanMat.opacity = (S.buildT < .2 ? S.buildT * 5 : (p > .92 ? (1 - p) / .08 : 1)) * (S.light ? .5 : 1);
      wireMat.opacity = (S.light ? .15 : .05) * (1 - Math.max(0, (S.buildT - BUILD) / .4));
      eyes[0].getWorldPosition(eyeWorld);
      S.lit = ease((c - eyeWorld.y) / .3);
      aura.scale.setScalar(Math.max(.001, ease((S.buildT - 2) / .7)));
      for (let k = 0; k < rings.length; k++) rings[k].pivot.scale.setScalar(Math.max(.001, ease((S.buildT - 1.7 - k * .15) / .8)));
      if (S.buildT > BUILD + .45) finishBuild();
    }

    /* look at the cursor: aim from the head's on-screen position, not the page centre */
    const tracking = S.pointer.inside || performance.now() / 1000 - S.pointer.touchAt < 2.5;
    if (tracking && S.rect) {
      headPivot.getWorldPosition(headWorld);
      headWorld.y += VISOR_Y;
      headWorld.project(camera);
      const hx = S.rect.left + (headWorld.x + 1) / 2 * S.rect.width;
      const hy = S.rect.top + (1 - headWorld.y) / 2 * S.rect.height;
      const depth = Math.max(S.rect.height * .7, 320); // how far "out of the screen" the viewer sits
      S.lookTarget.set(
        THREE.MathUtils.clamp(Math.atan2(S.pointer.x - hx, depth), -.9, .9),
        THREE.MathUtils.clamp(Math.atan2(S.pointer.y - hy, depth), -.5, .4),
      );
    } else if (S.built && holoState.phase === 'build') {
      S.lookTarget.set(-.5 + Math.sin(t * .6) * .05, -.14);   // glance at the hologram panel, top left
    } else {
      S.lookTarget.set(Math.sin(t * .45) * .4, Math.sin(t * .31) * .12);
    }
    if (tracking && S.built && performance.now() / 1000 - S.pointer.movedAt > 3 && holoState.phase === 'build') S.lookTarget.set(-.5, -.14);
    S.look.lerp(S.lookTarget, reduced ? 1 : 1 - Math.pow(.0012, dt));
    const yaw = S.look.x, pitch = S.look.y;
    headPivot.rotation.y = yaw * .8;
    headPivot.rotation.x = pitch * .7;
    body.rotation.y = yaw * .16;
    robot.rotation.x = S.scroll * .12;

    /* idle: breathing and a slow weight shift, nothing more */
    if (!reduced) {
      robot.position.y = Math.sin(t * .8) * .018 - S.scroll * .4;
      body.position.y = .32 + Math.sin(t * 1.5) * .006;
      body.rotation.z = Math.sin(t * .45) * .012;     // weight shift, pivoting from the feet (well below frame)
      body.position.x = -body.rotation.z * 2.6;
      headPivot.rotation.z = -body.rotation.z * .8;
    }

    /* greet: head tilt, happy eyes, fast rings, and a wave */
    let happy = 0, tilt = 0;
    if (S.greetT >= 0) {
      S.greetT += dt;
      const g = S.greetT;
      tilt = Math.sin(g * 9) * Math.exp(-g * 2.6) * .16;
      happy = g < 1.6 ? ease(g / .2) : Math.max(0, 1 - (g - 1.6) / .3);
      if (g > 2.6) S.greetT = -1;
    }
    headPivot.rotation.z += tilt;

    /* arms: both hang relaxed; on click the left-hand one (screen right) lifts and waves an open palm, then lowers */
    let wave = 0;
    if (S.greetT >= 0) wave = S.greetT < .45 ? easeInOut(S.greetT / .45) : S.greetT > 2.05 ? easeInOut(1 - (S.greetT - 2.05) / .5) : 1;
    const rest = arms[0], waver = arms[1];
    poseArm(rest, 0, t, 0);
    poseArm(waver, wave, t, 1);
    if (wave > 0 && !reduced) {
      const ph = (S.greetT - .3) * 12.5;
      // swing the forearm side to side about the screen axis through the elbow, and flick the hand at the wrist
      tmpAxis.copy(zAxis).applyQuaternion(tmpQ.copy(waver.upper.quaternion).invert());
      waver.fore.quaternion.premultiply(tmpQ.setFromAxisAngle(tmpAxis, Math.sin(ph) * .17 * wave));
      waver.hand.quaternion.multiply(tmpQ.setFromAxisAngle(zAxis, Math.sin(ph - .8) * .3 * wave));
    }
    for (let k = 0; k < 2; k++) arms[k].ledMat.color.copy(GOLD).multiplyScalar(.55 + .45 * Math.max(0, Math.sin(t * 3 - k * 1.5)) + (k ? wave : 0) * .9);

    /* the HTML hologram: think -> build -> hold -> ship, cycling through what Syed builds */
    const H = holoState;
    if (S.built && !reduced) {
      H.t += dt;
      const L = LAYOUTS[H.i];
      if (H.phase === 'idle') { H.phase = 'think'; H.t = 0; }
      if (H.phase === 'think') {
        setHud('Thinking', L.planning);
        if (H.t < dt * 1.5 && S.scanT < 0) S.scanT = 0;                  // eyes run a loading sweep
        if (H.t > 1.1) { H.phase = 'build'; H.t = 0; }
      } else if (H.phase === 'build') {
        setHud('Now building', L.name);
        if (H.t > HOLO_BUILD) { H.phase = 'hold'; H.t = 0; }
      } else if (H.phase === 'hold') {
        setHud('Built', L.done);
        if (H.t > 1.1) { H.phase = 'ship'; H.t = 0; }
      } else if (H.phase === 'ship') {
        setHud('Shipped', L.done);
        if (H.t > .75) { H.i = (H.i + 1) % LAYOUTS.length; H.phase = 'think'; H.t = 0; }
      }
    }
    if (H.phase !== shown.phase) { stage.dataset.phase = shown.phase = H.phase; }
    if (H.i !== shown.i) { shown.i = H.i; stage.dataset.build = String(H.i); }

    /* the chest reactor mirrors the hologram: a short arc spins while thinking, fills while building, glows when built */
    let fill = 0, spin = 0, fk = 1;
    if (H.phase === 'think') { fill = .2; spin = t * 4.2; fk = .8; }
    else if (H.phase === 'build') fill = clamp(H.t / HOLO_BUILD, 0, 1);
    else if (H.phase === 'hold') { fill = 1; fk = 1.25 + .35 * Math.max(0, 1 - H.t / .6); }
    else if (H.phase === 'ship') { fill = 1; fk = lerp(1.25, .5, clamp(H.t / .75, 0, 1)); }
    coreFill.geometry.setDrawRange(0, 6 * Math.round(FILL_SEG * fill));
    coreFill.rotation.z = -spin;
    fillMat.color.copy(GOLD).multiplyScalar(fk * S.lit);

    /* blink */
    if (t > S.nextBlink && S.blinkT < 0 && S.built) { S.blinkT = 0; S.nextBlink = t + 2.6 + Math.random() * 3.4; }
    let lid = 1;
    if (S.blinkT >= 0) { S.blinkT += dt; lid = Math.max(.08, Math.abs(1 - S.blinkT / .08)); if (S.blinkT > .16) { S.blinkT = -1; lid = 1; } }

    /* scan sweep along the light bar */
    if (t > S.nextScan && S.scanT < 0 && S.built) { S.scanT = 0; S.nextScan = t + 7 + Math.random() * 4; }
    let sweep = -10;
    if (S.scanT >= 0) { S.scanT += dt; sweep = S.scanT / .9 * (LEDS + 4) - 2; if (S.scanT > .9) S.scanT = -1; }

    /* light-bar LEDs: eyes slide toward where the head is looking */
    const shift = clamp(yaw * 2.4, -2.2, 2.2);
    const c0 = EYE_C[0] + shift, c1 = EYE_C[1] + shift;
    for (let i = 0; i < LEDS; i++) {
      const e = Math.max(0, 1 - Math.min(Math.abs(i - c0), Math.abs(i - c1)) / 2.1);
      const eye = e * e * (3 - 2 * e);
      const boost = Math.max(0, 1 - Math.abs(i - sweep) / 1.6);
      const flicker = .94 + Math.sin(t * 7 + i) * .04;
      const k = (lerp(.13, flicker + happy * .35, eye * (lid > .5 ? 1 : .25)) + boost * .9) * S.lit;
      ledCol.copy(GOLD).multiplyScalar(k);
      leds.setColorAt(i, ledCol);
      const d = Math.min(Math.abs(i - c0), Math.abs(i - c1));
      ledPos.copy(ledBase[i]); ledPos.y += happy * eye * (.007 - d * .005) - pitch * .006;
      ledScale.set(1, lerp(.42, 1.25, eye) * lerp(1, lid, eye), 1);
      ledM4.compose(ledPos, ledQuat[i], ledScale);
      leds.setMatrixAt(i, ledM4);
    }
    leds.instanceMatrix.needsUpdate = true; leds.instanceColor.needsUpdate = true;
    for (let k = 0; k < 2; k++) {
      const e = eyes[k], c = (k ? c1 : c0), i0 = Math.max(0, Math.min(LEDS - 2, Math.floor(c)));
      e.position.lerpVectors(ledBase[i0], ledBase[i0 + 1], c - i0); e.position.z += .02;
      e.userData.glow.material.opacity = (.42 + happy * .3) * S.lit * lid * (e.userData.glow.userData.k || 1);
    }

    /* core, seams, cables, leds */
    const beat = Math.pow(Math.sin(t * 2.1) * .5 + .5, 3);
    markMat.color.copy(GOLD).multiplyScalar(.85 + beat * .5);
    coreGlow.scale.setScalar(.24 + beat * .1);
    coreRingB.rotation.z -= dt * (.6 + happy * 3);
    M.trim.color.copy(GOLD).multiplyScalar(.62 + .2 * Math.sin(t * 1.6) + happy * .4);
    M.cable.color.copy(GOLD).multiplyScalar(.42 + .3 * Math.max(0, Math.sin(t * 2.4)) + happy * .5);
    tipMat.color.copy(GOLD).multiplyScalar(Math.sin(t * 3) > .6 ? 1.6 : .45);
    tipGlow.material.opacity = (Math.sin(t * 3) > .6 ? .9 : .25) * (tipGlow.userData.k || 1);
    earMat.color.copy(GOLD).multiplyScalar(.6 + .4 * Math.sin(t * 2));

    /* ring + particles */
    for (let i = 0; i < rings.length; i++) rings[i].spinner.rotation.z += dt * rings[i].speed * (1 + happy * 4);
    aura.rotation.z -= dt * .18 * (1 + happy * 6);
    auraInner.rotation.z += dt * .6 * (1 + happy * 3);
    if (S.built) auraMat.opacity = (S.light ? .4 : .55) * (.75 + .25 * Math.sin(t * 1.6)) + happy * .3;
    if (S.shockT >= 0) {
      S.shockT += dt;
      const k = Math.min(1, S.shockT / .8);
      shock.scale.setScalar(1 + k * .85);
      shockMat.opacity = Math.max(0, .9 * Math.pow(1 - k, 2));
      if (k >= 1) { S.shockT = -1; shockMat.opacity = 0; }
    }
    const pos = pGeo.attributes.position.array;
    for (let i = 0; i < PN; i++) {
      pos[i * 3 + 1] += pSpeed[i] * dt;
      if (pos[i * 3 + 1] > 2.2) pos[i * 3 + 1] = -2.2;
    }
    pGeo.attributes.position.needsUpdate = true;
  }


  /* start once the preloader is gone */
  update(0);
  renderer.render(scene, camera);
  stage.classList.add('is-live');
  if (window.__siteReady) start();
  else addEventListener('site:ready', start, { once: true });
  setTimeout(start, 7000);
}

/* ---------------------------------------------------------------- boot */
if (stage && canvas && hasGL) {
  try { init(); } catch (err) { console.warn('[robot] falling back to poster:', err); stage.classList.add('is-fallback'); }
} else if (stage) {
  stage.classList.add('is-fallback');
  stage.setAttribute('aria-label', 'AI robot illustration');
}
