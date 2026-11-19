/*
 * Hero robot — a glossy black and gold AI unit, built in code with three.js.
 * On load it is "printed" bottom-up out of a gold wireframe by a scan line,
 * then it tracks the cursor, blinks, scans, and reacts when clicked.
 */
import * as THREE from './vendor/three.module.min.js';

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
const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const easeInOut = (t) => { t = Math.min(Math.max(t, 0), 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const lerp = (a, b, t) => a + (b - a) * t;

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

/* Hexagon "tech weave" used as a bump map on the torso. */
function hexTexture() {
  const r = 14, w = Math.sqrt(3) * r;
  const W = Math.round(w * 8), H = r * 3 * 4;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000'; g.lineWidth = 2.4;
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

/* Product-photography studio, used only for reflections. */
function studio() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x020202);
  const panel = (w, h, hex, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(7, 2.2, 0xffffff, 2.4, [0, 6, 1.5]);   // top softbox
  panel(.9, 7, 0xffffff, 3.2, [-5.5, 1, 3]);   // left strip -> long highlight
  panel(1.4, 7, 0xffc65c, 4.2, [5.5, 1, -.5]); // gold strip -> warm edge
  panel(5, 1.2, 0xffae3c, .7, [0, -4.5, 4]);  // warm floor bounce
  panel(3, 3, 0x93a8ff, .55, [-3, 2, -5.5]);   // cool back fill
  return s;
}

/* Build a function y -> radius from a lathe profile with increasing y. */
function radiusAt(points) {
  return (y) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (y >= a.y && y <= b.y) return a.x + (b.x - a.x) * ((y - a.y) / ((b.y - a.y) || 1));
    }
    return 0;
  };
}
const onSurface = (r, y, phi) => new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));

/* Superellipse half-width: 1 in the middle, rounding off to 0 at both ends. */
const roundEnds = (v, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * v - 1), n)), 1 / n);

/*
 * A panel that hugs a lathe surface. hw(v) gives the half-width (in radians)
 * at normalised height v. Returns the mesh geometry and its outline curve.
 */
function surfacePatch(rFn, y0, y1, hw, lift, rows = 44, cols = 56) {
  const pos = [], idx = [];
  for (let i = 0; i <= rows; i++) {
    const v = i / rows, y = lerp(y0, y1, v), w = hw(v);
    for (let j = 0; j <= cols; j++) {
      const p = onSurface(rFn(y) + lift, y, lerp(-w, w, j / cols));
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const edge = [];
  const N = 70, rimLift = lift + .006;
  for (let i = 0; i <= N; i++) { const v = i / N, y = lerp(y0, y1, v); edge.push(onSurface(rFn(y) + rimLift, y, -hw(v))); }
  for (let i = N - 1; i > 0; i--) { const v = i / N, y = lerp(y0, y1, v); edge.push(onSurface(rFn(y) + rimLift, y, hw(v))); }
  return { geo, outline: new THREE.CatmullRomCurve3(edge, true, 'centripetal') };
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
  scene.environment = pmrem.fromScene(studio(), .03).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 4, 5);
  const rimLight = new THREE.DirectionalLight(0xffc35a, 3.2); rimLight.position.set(4, 2.5, -3);
  const rim2 = new THREE.DirectionalLight(0x9db0ff, 1.0); rim2.position.set(-4, 1.5, -3);
  scene.add(key, rimLight, rim2, new THREE.HemisphereLight(0x8890a0, 0x1a1408, .35));

  /* ---- build reveal: solid below the scan plane, wireframe above it */
  const solidClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  const wireClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), -100);
  const clip = (m) => { m.clippingPlanes = [solidClip]; return m; };

  const M = {
    shell: clip(new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: .4, roughness: .17, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25 })),
    visor: clip(new THREE.MeshPhysicalMaterial({ color: 0x010102, metalness: .95, roughness: .05, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.7 })),
    metal: clip(new THREE.MeshStandardMaterial({ color: 0x1b1b1e, metalness: .9, roughness: .32, envMapIntensity: 1 })),
    gold: clip(new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: .22, envMapIntensity: 1.3 })),
    weave: clip(new THREE.MeshStandardMaterial({ color: 0x141416, metalness: .35, roughness: .62, bumpMap: hexTexture(), bumpScale: 2.2, envMapIntensity: .8 })),
    trim: clip(new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(.85), toneMapped: false })),
  };
  M.weave.bumpMap.repeat.set(26, 9);

  const glowTex = radialTexture();
  const glows = [];
  const glow = (scale, opacity = .9) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: GOLD, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: [solidClip] }));
    s.scale.set(scale, scale, 1);
    s.userData.baseOpacity = opacity;
    glows.push(s);
    return s;
  };

  const robot = new THREE.Group();
  scene.add(robot);

  /* ================================================================ BODY */
  const body = new THREE.Group();
  body.position.y = -.5;
  robot.add(body);

  const bodyProf = [
    [.9, -1.85], [.98, -1.3], [1.08, -.8], [1.13, -.5], [1.07, -.28], [.86, -.12], [.5, -.02], [.24, .03], [.001, .05],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bodyR = radiusAt(bodyProf);
  const bodyShell = new THREE.Group(); bodyShell.scale.z = .56; body.add(bodyShell);
  const torso = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(bodyProf).getPoints(60), 96), M.weave);
  bodyShell.add(torso);

  // armoured chest plate: a tapered shield hugging the torso
  const plateP = surfacePatch(bodyR, -1.2, -.14, (v) => lerp(.36, .74, Math.pow(v, .7)) * roundEnds(v, 5), .03);
  bodyShell.add(new THREE.Mesh(plateP.geo, M.shell));
  bodyShell.add(new THREE.Mesh(new THREE.TubeGeometry(plateP.outline, 300, .007, 6, true), M.trim));

  // shoulders
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), M.shell);
    pad.scale.set(.4, .31, .33); pad.position.set(side * .98, -.32, 0);
    body.add(pad);
  }

  // arms: shoulder -> upper arm -> elbow -> forearm -> wrist -> hand with jointed fingers
  const arms = [];
  const L1 = .58, L2 = .52;
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 1.06, -.4, 0);
    body.add(shoulder);
    const upper = new THREE.Group(); shoulder.add(upper);
    const uMesh = new THREE.Mesh(new THREE.CapsuleGeometry(.125, L1 - .2, 8, 28), M.shell);
    uMesh.position.y = -L1 / 2; upper.add(uMesh);
    const uBand = new THREE.Mesh(new THREE.TorusGeometry(.13, .012, 8, 40), M.gold);
    uBand.rotation.x = Math.PI / 2; uBand.position.y = -L1 * .66; upper.add(uBand);
    const elbow = new THREE.Group(); elbow.position.y = -L1; upper.add(elbow);
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(.112, 28, 18), M.metal));
    const eRing = new THREE.Mesh(new THREE.TorusGeometry(.114, .014, 8, 40), M.gold); eRing.rotation.y = Math.PI / 2; elbow.add(eRing);
    const fore = new THREE.Group(); elbow.add(fore);
    const fMesh = new THREE.Mesh(new THREE.CapsuleGeometry(.1, L2 - .18, 8, 28), M.shell);
    fMesh.position.y = -L2 / 2; fore.add(fMesh);
    const ledMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));
    const strip = new THREE.Mesh(new THREE.BoxGeometry(.016, L2 * .46, .012), ledMat);
    strip.position.set(0, -L2 * .5, .1); fore.add(strip);
    const wrist = new THREE.Group(); wrist.position.y = -L2; fore.add(wrist);
    const wRing = new THREE.Mesh(new THREE.TorusGeometry(.08, .016, 8, 32), M.gold); wRing.rotation.x = Math.PI / 2; wrist.add(wRing);
    const hand = new THREE.Group(); hand.scale.setScalar(1.3); wrist.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), M.shell); palm.scale.set(.1, .115, .05); palm.position.y = -.1; hand.add(palm);
    const fingers = [];
    for (let f = 0; f < 4; f++) {
      const base = new THREE.Group(); base.position.set((f - 1.5) * .047, -.195, 0); hand.add(base);
      const s1 = new THREE.Mesh(new THREE.CapsuleGeometry(.02, .045, 4, 10), M.metal); s1.position.y = -.035; base.add(s1);
      const knuckle = new THREE.Group(); knuckle.position.y = -.075; base.add(knuckle);
      const s2 = new THREE.Mesh(new THREE.CapsuleGeometry(.018, .035, 4, 10), M.metal); s2.position.y = -.03; knuckle.add(s2);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.013, 10, 8), ledMat); tip.position.y = -.062; knuckle.add(tip);
      fingers.push({ base, knuckle, f });
    }
    const thumb = new THREE.Group(); thumb.position.set(-side * .085, -.08, .015); hand.add(thumb);
    const tS = new THREE.Mesh(new THREE.CapsuleGeometry(.021, .055, 4, 10), M.metal); tS.position.y = -.045; thumb.add(tS);
    const anchor = new THREE.Object3D(); anchor.position.set(0, -.13, .14); hand.add(anchor); // a point just above the palm
    arms.push({ side, shoulder, upper, elbow, fore, wrist, hand, fingers, thumb, anchor, ledMat });
  }

  // collar + neck
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.25, .055, 16, 64), M.metal);
  collar.rotation.x = Math.PI / 2; collar.scale.set(1, .8, 1); collar.position.y = .03;
  body.add(collar);
  [[.1, .19, .17], [.22, .175, .16], [.34, .165, .15]].forEach(([y, r0, r1]) => {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, .1, 40), M.metal);
    seg.position.y = y; body.add(seg);
  });
  [.16, .28].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.172, .007, 8, 48), M.gold);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; body.add(ring);
  });

  // AI core
  const core = new THREE.Group();
  core.position.set(0, -.52, (bodyR(-.52) + .05) * .56 + .005);
  body.add(core);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(.09, .014, 12, 48), M.gold);
  const coreDiscMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));
  const coreDisc = new THREE.Mesh(new THREE.CircleGeometry(.062, 6), coreDiscMat);
  coreDisc.rotation.z = Math.PI / 2;
  const coreGlow = glow(.7, .85);
  core.add(coreRing, coreDisc, coreGlow);

  /* ================================================================ HEAD */
  const headPivot = new THREE.Group();
  headPivot.position.y = .72;
  body.add(headPivot);
  const head = new THREE.Group();
  head.position.y = -.3;
  head.scale.setScalar(1.12);
  headPivot.add(head);
  const headShell = new THREE.Group(); headShell.scale.z = 1.08; head.add(headShell);

  const headProf = new THREE.SplineCurve([
    [.001, 0], [.3, .03], [.46, .13], [.545, .32], [.57, .55], [.56, .78], [.51, .98], [.4, 1.14], [.22, 1.24], [.001, 1.275],
  ].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(90);
  const headR = radiusAt(headProf);
  headShell.add(new THREE.Mesh(new THREE.LatheGeometry(headProf, 112), M.shell));

  // visor: a rounded mask that wraps the face
  const V = { y0: .38, y1: .97, phi: 1.08 };
  const visorP = surfacePatch(headR, V.y0, V.y1, (v) => V.phi * roundEnds(v, 3.2) * (1 - .1 * v), .012, 48, 72);
  headShell.add(new THREE.Mesh(visorP.geo, M.visor));
  headShell.add(new THREE.Mesh(new THREE.TubeGeometry(visorP.outline, 320, .0055, 6, true), M.trim));

  // crown ridge, front to back over the top
  const ridgePts = [];
  for (let i = 0; i <= 14; i++) { const y = lerp(V.y1 + .02, 1.27, i / 14); ridgePts.push(onSurface(headR(y) + .006, y, 0)); }
  for (let i = 1; i <= 14; i++) { const y = lerp(1.27, .62, i / 14); ridgePts.push(onSurface(headR(y) + .006, y, Math.PI)); }
  headShell.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePts), 120, .011, 8), M.gold));

  // eyes: two rows of light pills, like an LED matrix
  const EYE_Y = .655, DOT = .076, DOTS = 4;
  const eyes = [];
  const dotGeo = new THREE.SphereGeometry(.0165, 16, 12);
  const eyeR = headR(EYE_Y) + .024;
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const dots = [];
    for (let i = 0; i < DOTS; i++) {
      const mat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));
      const dot = new THREE.Mesh(dotGeo, mat);
      const phi = side * .33 + (i - (DOTS - 1) / 2) * DOT;
      dot.position.copy(onSurface(eyeR, 0, phi));
      dot.rotation.set(0, phi, 0); dot.scale.set(1, 1, .45);
      dot.userData = { i, phi, mat };
      eye.add(dot); dots.push(dot);
    }
    const g = glow(.42, .55);
    g.position.copy(onSurface(eyeR + .03, 0, side * .33));
    g.scale.set(.62, .26, 1);
    eye.add(g);
    eye.position.y = EYE_Y;
    eye.userData = { dots, glow: g };
    headShell.add(eye);
    eyes.push(eye);
  }

  // ear pods + antenna
  const earY = .6, earR = headR(earY);
  const earDots = [];
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(.125, .135, .1, 48), M.metal);
    pod.rotation.z = Math.PI / 2; pod.position.set(side * (earR + .03), earY, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.105, .011, 10, 48), M.gold);
    ring.rotation.y = Math.PI / 2; ring.position.set(side * (earR + .082), earY, 0);
    const ledMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));
    const led = new THREE.Mesh(new THREE.CircleGeometry(.032, 24), ledMat);
    led.rotation.y = side * Math.PI / 2; led.position.set(side * (earR + .083), earY, 0);
    headShell.add(pod, ring, led);
    earDots.push(ledMat);
  }
  const antennaCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-(earR + .06), earY + .08, -.02),
    new THREE.Vector3(-(earR + .2), earY + .55, -.05),
    new THREE.Vector3(-(earR + .14), earY + .98, -.2),
  );
  headShell.add(new THREE.Mesh(new THREE.TubeGeometry(antennaCurve, 40, .009, 8), M.metal));
  const tipMat = clip(new THREE.MeshBasicMaterial({ color: GOLD.clone(), toneMapped: false }));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.024, 16, 12), tipMat);
  tip.position.copy(antennaCurve.getPoint(1));
  const tipGlow = glow(.3, .8); tipGlow.position.copy(tip.position);
  headShell.add(tip, tipGlow);

  /* ================================================== HALO RINGS + DATA */
  const halo = new THREE.Group();
  halo.position.set(0, .28, 0);
  robot.add(halo);
  const rings = [];
  [[1.02, .42, .2], [1.18, -.5, -.6]].forEach(([radius, tiltX, tiltZ], k) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(Math.PI / 2 + tiltX, 0, tiltZ);
    const ringMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .42, toneMapped: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .0042, 6, 240), ringMat);
    pivot.add(ring);
    const spinner = new THREE.Group();
    for (let s = 0; s < 2; s++) {
      const a = s * Math.PI + k;
      const sat = new THREE.Mesh(new THREE.SphereGeometry(.024, 12, 10), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
      sat.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      const sg = glow(.26, .9); sg.material.clippingPlanes = null; sg.position.copy(sat.position);
      spinner.add(sat, sg);
    }
    pivot.add(spinner);
    pivot.scale.setScalar(.001);
    halo.add(pivot);
    rings.push({ pivot, spinner, ringMat, speed: k ? -.35 : .5 });
  });

  const P = 240;
  const pPos = new Float32Array(P * 3), pSpeed = new Float32Array(P);
  for (let i = 0; i < P; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.25 + Math.random() * 1.6;
    pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = -2.2 + Math.random() * 4.2; pPos[i * 3 + 2] = Math.sin(a) * r * .7;
    pSpeed[i] = .08 + Math.random() * .22;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ map: glowTex, color: GOLD, size: .06, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const particles = new THREE.Points(pGeo, pMat);
  robot.add(particles);

  /* hologram the robot builds above its palm: app, website, video, brand content */
  const holo = new THREE.Group(); body.add(holo);
  const holoFill = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const holoEdge = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const holoSolid = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const holoBack = new THREE.MeshBasicMaterial({ color: 0x050506, transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false });
  const LAYOUTS = [
    { name: 'App', noun: 'app', scale: 1.55, frame: [.34, .58], blocks: [[0, .24, .28, .04], [0, .12, .28, .14], [-.07, -.02, .14, .05], [0, -.1, .28, .04], [0, -.17, .28, .04], [0, -.25, .28, .05]] },
    { name: 'Website', noun: 'website', scale: 1.25, frame: [.64, .42], blocks: [[0, .17, .6, .04], [-.15, .06, .28, .12], [.15, .06, .26, .12], [-.2, -.09, .17, .1], [0, -.09, .17, .1], [.2, -.09, .17, .1], [0, -.17, .2, .03]] },
    { name: 'AI video', noun: 'AI video', scale: 1.25, frame: [.62, .38], blocks: [[0, .03, .56, .26], [0, -.15, .56, .02], [-.14, -.15, .28, .025]], tri: true },
    { name: 'Brand content', noun: 'brand content', scale: 1.4, frame: [.48, .48], blocks: [[-.15, -.12, .07, .12], [-.05, -.08, .07, .2], [.05, -.03, .07, .3], [.15, .03, .07, .42]], arrow: true },
  ];
  const TH = .008; // edge thickness in world units: crisp at any pixel ratio (WebGL lines are always 1px)
  const seg = (ax, ay, bx, by, th = TH) => {
    const len = Math.hypot(bx - ax, by - ay);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len + th, th), holoEdge);
    m.position.set((ax + bx) / 2, (ay + by) / 2, 0); m.rotation.z = Math.atan2(by - ay, bx - ax);
    return m;
  };
  const rectEdge = (w, h, th = TH) => {
    const g = new THREE.Group();
    g.add(seg(-w / 2, -h / 2, w / 2, -h / 2, th), seg(w / 2, -h / 2, w / 2, h / 2, th), seg(w / 2, h / 2, -w / 2, h / 2, th), seg(-w / 2, h / 2, -w / 2, -h / 2, th));
    return g;
  };
  const builds = LAYOUTS.map((L) => {
    const g = new THREE.Group(); g.visible = false; holo.add(g);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(L.frame[0] + .03, L.frame[1] + .03), holoBack);
    back.position.z = -.012; back.renderOrder = 1; g.add(back);
    const frame = rectEdge(L.frame[0], L.frame[1], TH * 1.4); frame.renderOrder = 2; g.add(frame);
    // corner brackets make the screen read as a hologram
    const cw = .05, fx = L.frame[0] / 2 + .025, fy = L.frame[1] / 2 + .025;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
      frame.add(seg(sx * fx, sy * fy, sx * (fx - cw), sy * fy, TH * 1.6), seg(sx * fx, sy * fy, sx * fx, sy * (fy - cw), TH * 1.6));
    });
    const parts = L.blocks.map(([x, y, w, h]) => {
      const p = new THREE.Group(); p.position.set(x, y, .006);
      p.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), holoFill), rectEdge(w, h));
      p.scale.setScalar(.001); g.add(p); return p;
    });
    if (L.tri) {
      const s = new THREE.Shape(); s.moveTo(-.035, -.045); s.lineTo(.055, 0); s.lineTo(-.035, .045); s.closePath();
      const p = new THREE.Group(); p.position.set(0, .03, .012);
      p.add(new THREE.Mesh(new THREE.ShapeGeometry(s), holoSolid));
      p.scale.setScalar(.001); g.add(p); parts.push(p);
    }
    if (L.arrow) {
      const pts = [[-.2, -.14], [-.08, -.02], [.02, -.06], [.19, .17]];
      const p = new THREE.Group(); p.position.z = .012;
      for (let k = 1; k < pts.length; k++) p.add(seg(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], TH * 1.8));
      const head = new THREE.Shape(); head.moveTo(.19, .17); head.lineTo(.13, .16); head.lineTo(.18, .11); head.closePath();
      p.add(new THREE.Mesh(new THREE.ShapeGeometry(head), holoSolid));
      p.scale.setScalar(.001); g.add(p); parts.push(p);
    }
    return { g, frame, parts, L };
  });
  // 'thinking' loader: a spinning arc and three orbiting nodes where the build will appear
  const loader = new THREE.Group(); loader.visible = false; holo.add(loader);
  loader.add(new THREE.Mesh(new THREE.RingGeometry(.11, .128, 48, 1, 0, Math.PI * 1.4), holoSolid));
  const loaderInner = new THREE.Mesh(new THREE.RingGeometry(.06, .07, 40, 1, 0, Math.PI * .9), holoSolid); loader.add(loaderInner);
  const nodes = [0, 1, 2].map((k) => { const n = new THREE.Mesh(new THREE.CircleGeometry(.018, 16), holoSolid); loader.add(n); return n; });
  const holoGlow = glow(1.2, 0); holoGlow.material.clippingPlanes = null; holo.add(holoGlow);
  const holoScan = new THREE.Mesh(new THREE.PlaneGeometry(1, .014), holoSolid); holoScan.position.z = .02; holoScan.visible = false; holo.add(holoScan);
  // light beam from the palm up to the hologram, a spark in the palm, and a scan line across the build
  const beamTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: GOLD, transparent: true, opacity: .0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.24, .03, 1, 32, 1, true), beamMat); body.add(beam);
  const beamUp = new THREE.Vector3(0, 1, 0), beamDir = new THREE.Vector3(), beamTop = new THREE.Vector3();
  const palmSpark = glow(.36, 0); palmSpark.material.clippingPlanes = null; body.add(palmSpark);
  const shipSpark = glow(.9, 0); shipSpark.material.clippingPlanes = null; body.add(shipSpark);
  holo.traverse((o) => { o.userData.noWire = true; }); beam.userData.noWire = true;
  holoSolid.opacity = .9;
  holo.visible = false; beam.visible = false; palmSpark.visible = false; shipSpark.visible = false; // the hologram is drawn in HTML now
  const holoState = { phase: 'idle', t: 0, i: 0 };
  const hudLabel = stage.querySelector('.holo__label');
  const hudKicker = stage.querySelector('.holo__kicker');
  let hudKey = '';
  function setHud(kicker, label) {
    const key = kicker + '|' + label;
    if (key === hudKey) return;
    hudKey = key;
    if (hudKicker) hudKicker.textContent = kicker;
    if (hudLabel) hudLabel.textContent = label;
  }

  /* power aura: segmented hologram ring behind the head + click shockwave */
  const auraMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Group(); aura.position.set(0, .3, -.7); robot.add(aura);
  {
    const pos = [];
    for (let k = 0; k < 36; k++) pos.push(...new THREE.RingGeometry(1.5, 1.56, 4, 1, (k / 36) * Math.PI * 2, (Math.PI * 2 / 36) * .55).toNonIndexed().attributes.position.array);
    const dashes = new THREE.BufferGeometry(); dashes.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    aura.add(new THREE.Mesh(dashes, auraMat));
  }
  aura.add(new THREE.Mesh(new THREE.RingGeometry(1.38, 1.392, 128), auraMat));
  const auraInner = new THREE.Group(); aura.add(auraInner);
  for (let k = 0; k < 3; k++) auraInner.add(new THREE.Mesh(new THREE.RingGeometry(1.24, 1.27, 48, 1, k * Math.PI * 2 / 3, Math.PI / 3), auraMat));
  aura.scale.setScalar(.001);
  const shockMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const shock = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 128), shockMat); shock.position.copy(aura.position); robot.add(shock);

  /* ================================================ BUILD-IN WIREFRAME */
  const wireMat = new THREE.MeshBasicMaterial({ color: GOLD, wireframe: true, transparent: true, opacity: .07, depthWrite: false, toneMapped: false, clippingPlanes: [wireClip] });
  const wires = [];
  const solids = [];
  body.traverse((o) => {
    if (o.isMesh && !o.userData.mat && !o.userData.noWire && !['TubeGeometry', 'CircleGeometry'].includes(o.geometry.type)) solids.push(o);
  });
  solids.forEach((o) => { const w = new THREE.Mesh(o.geometry, wireMat); o.add(w); wires.push(w); });
  const scanMat = new THREE.MeshBasicMaterial({ map: lineTexture(), color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(4.2, .55), scanMat);
  scan.position.z = .8;
  robot.add(scan);

  /* ============================================================ STATE */
  const S = {
    w: 1, h: 1, visible: true, running: false,
    started: false, buildT: 0, built: false,
    look: new THREE.Vector2(0, 0), lookTarget: new THREE.Vector2(0, 0),
    pointer: { x: 0, y: 0, inside: false, touchAt: -10, movedAt: -10 }, rect: null,
    nextBlink: 2.5, blinkT: -1, nextScan: 6, scanT: -1,
    greetT: -1, shockT: -1, msg: 0, bubbleTimer: 0,
    scroll: 0, light: root.dataset.theme === 'light',
  };

  function fit() {
    const r = stage.getBoundingClientRect();
    S.rect = r;
    S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5));
    renderer.setSize(S.w, S.h, false);
    camera.aspect = S.w / S.h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(2.05 / t, 1.9 / (t * camera.aspect));
    camera.position.set(0, .2, dist);
    camera.lookAt(0, -.05, 0);
    S.halfW = t * camera.aspect * (dist - .6);
    camera.updateProjectionMatrix();
    if (S.started && !S.running) requestRender();
  }
  fit();
  new ResizeObserver(fit).observe(stage);

  function applyTheme() {
    S.light = root.dataset.theme === 'light';
    const blend = S.light ? THREE.NormalBlending : THREE.AdditiveBlending;
    pMat.blending = blend; pMat.color.set(S.light ? 0x9a7414 : GOLD); pMat.opacity = S.light ? .5 : .75; pMat.needsUpdate = true;
    rings.forEach((r) => { r.ringMat.color.set(S.light ? 0x8a6a12 : GOLD); r.ringMat.opacity = S.light ? .55 : .42; });
    wireMat.color.set(S.light ? 0x6b4f0a : GOLD);
    glows.forEach((g) => { g.material.blending = blend; g.material.color.set(S.light ? 0xb8891e : GOLD); g.userData.k = S.light ? .45 : 1; g.material.opacity = g.userData.baseOpacity * g.userData.k; g.material.needsUpdate = true; });
    scanMat.color.set(S.light ? 0xb8891f : GOLD); scanMat.blending = blend; scanMat.needsUpdate = true;
    auraMat.blending = blend; auraMat.color.set(S.light ? 0x8a6a12 : GOLD); auraMat.opacity = S.light ? .4 : .55; auraMat.needsUpdate = true;
    shockMat.blending = blend; shockMat.color.set(S.light ? 0x8a6a12 : GOLD); shockMat.needsUpdate = true;
    [holoFill, holoEdge, holoSolid].forEach((m) => { m.blending = blend; m.color.set(S.light ? 0x6b4f0a : GOLD); m.needsUpdate = true; });
    beamMat.blending = blend; beamMat.color.set(S.light ? 0xb8891e : GOLD); beamMat.needsUpdate = true;
    holoBack.color.set(S.light ? 0xfbf7ee : 0x050506); holoBack.opacity = S.light ? .82 : .62;
    holoFill.opacity = S.light ? .2 : .24;
    if (S.light) { palmSpark.userData.k = .8; shipSpark.userData.k = .8; holoGlow.userData.k = .6; }
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
  function greet() {
    if (!S.built || (S.greetT >= 0 && S.greetT < .6)) return;
    S.msg++; say(S.msg);
    if (reduced) { showStill(holoState.i + 1); requestRender(); return; }
    S.greetT = S.greetT >= 0 ? Math.min(S.greetT, .25) : 0; S.shockT = 0; kick();
    headPivot.getWorldPosition(tmpV); tmpV.y += .3; tmpV.z = 0;
    const o = toStage(tmpV);
    dispatchEvent(new CustomEvent('robot:shock', { detail: { x: S.rect.left + o.x, y: S.rect.top + o.y } }));
    if (reduced) requestRender();
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitTargets = solids;
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
  const REVEAL_FROM = -2.5, REVEAL_TO = 1.7;
  function setReveal(c) { solidClip.constant = c; wireClip.constant = -c; scan.position.y = c; }

  function start() {
    if (S.started) return;
    S.started = true;
    stage.classList.add('is-ready');
    if (reduced) finishBuild();
    kick();
  }
  function showStill(i) {     // reduced motion: a finished hologram, no animation
    holoState.i = i % builds.length;
    builds.forEach((b, k) => { b.g.visible = k === holoState.i; b.g.position.set(0, 0, 0); b.g.scale.setScalar(1); b.frame.scale.set(1, 1, 1); b.parts.forEach((p) => p.scale.set(1, 1, 1)); });
    beamMat.opacity = .3; palmSpark.material.opacity = .6 * (palmSpark.userData.k || 1);
    setHud('Built', builds[holoState.i].L.name + ' ✓');
  }
  function finishBuild() {
    aura.scale.setScalar(1);
    if (reduced) showStill(0);
    S.built = true;
    setReveal(100);
    wires.forEach((w) => w.parent && w.parent.remove(w));
    scanMat.opacity = 0;
    rings.forEach((r) => r.pivot.scale.setScalar(1));
    setTimeout(() => say(0), reduced ? 0 : 500);
  }
  setReveal(REVEAL_FROM);
  eyes.forEach((e) => e.userData.dots.forEach((d) => d.userData.mat.color.setScalar(0)));

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
  const hudCore = null; // narration lives in the HTML hologram panel
  const hudStack = stage.querySelector('.robot__hud--b');
  const sizes = new WeakMap();
  const sizeOf = (el) => sizes.get(el) || [el.offsetWidth, el.offsetHeight];
  const sizeRO = new ResizeObserver((es) => es.forEach((e) => sizes.set(e.target, [e.target.offsetWidth, e.target.offsetHeight])));
  [hudCore, hudStack, bubble].forEach((el) => el && sizeRO.observe(el));
  const toStage = (v) => { v.project(camera); return { x: (v.x + 1) / 2 * S.w, y: (1 - v.y) / 2 * S.h }; };
  const last = { core: -1, stack: -1, bx: -1, by: -1 };
  function setTop(el, key, y) {
    if (!el) return;
    const top = Math.round(y - sizeOf(el)[1] / 2);
    if (top !== last[key]) { el.style.top = top + 'px'; el.style.bottom = 'auto'; last[key] = top; }
  }
  function placeOverlays() {
    const docked = innerWidth <= 560; // phones: CSS docks the narration chip at the bottom of the stage
    if (docked && hudCore && last.core !== 'css') { hudCore.style.left = hudCore.style.top = hudCore.style.bottom = ''; last.core = 'css'; last.hx = null; }
    if (!docked) {
      if (hudCore) {
        holo.getWorldPosition(tmpV); tmpV.y += .42;
        const p = toStage(tmpV);
        const [w, h] = sizeOf(hudCore);
        headPivot.getWorldPosition(tmpV); tmpV.x -= .66; const headL = toStage(tmpV).x;
        const x = Math.round(Math.max(0, Math.min(p.x - w / 2, S.w - w, headL - w - 8))), y = Math.round(p.y - h - 6);
        if (x !== last.hx || y !== last.core) { hudCore.style.left = x + 'px'; hudCore.style.top = y + 'px'; hudCore.style.bottom = 'auto'; last.hx = x; last.core = y; }
      }
      headPivot.getWorldPosition(tmpV); tmpV.y += .85; setTop(hudStack, 'stack', toStage(tmpV).y); // beside the upper head, above the rings
    }
    if (bubble && bubble.classList.contains('is-show')) {
      headPivot.getWorldPosition(tmpV); tmpV.y += 1.2;
      const crown = toStage(tmpV);
      headPivot.getWorldPosition(tmpV); tmpV.x += .55; tmpV.y += .55;
      const side = toStage(tmpV);
      const [bw, bh] = sizeOf(bubble);
      const bx = Math.round(Math.min(Math.max(side.x - 6, 8), S.w - bw - 8));
      const minTop = -Math.max(0, (S.rect ? S.rect.top : 0) - 76); // may rise into the hero padding, never under the nav
      const by = Math.round(Math.max(crown.y - bh - 10, minTop));
      if (bx !== last.bx || by !== last.by) { bubble.style.left = bx + 'px'; bubble.style.right = 'auto'; bubble.style.top = by + 'px'; last.bx = bx; last.by = by; }
    }
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
      wireMat.opacity = (S.light ? .2 : .07) * (1 - Math.max(0, (S.buildT - BUILD) / .4));
      eyes[0].getWorldPosition(eyeWorld);
      const lit = ease((c - eyeWorld.y) / .5);
      eyes.forEach((e) => e.userData.dots.forEach((d) => d.userData.mat.color.copy(GOLD).multiplyScalar(lit)));
      aura.scale.setScalar(Math.max(.001, ease((S.buildT - 2) / .7)));
      rings.forEach((r, k) => r.pivot.scale.setScalar(Math.max(.001, ease((S.buildT - 1.7 - k * .15) / .8))));
      if (S.buildT > BUILD + .45) finishBuild();
    }

    /* look at the cursor: aim from the head's on-screen position, not the page centre */
    const tracking = S.pointer.inside || performance.now() / 1000 - S.pointer.touchAt < 2.5;
    if (tracking && S.rect) {
      headPivot.getWorldPosition(headWorld);
      headWorld.y += .4;                       // centre of the visor
      headWorld.project(camera);
      const hx = S.rect.left + (headWorld.x + 1) / 2 * S.rect.width;
      const hy = S.rect.top + (1 - headWorld.y) / 2 * S.rect.height;
      const depth = Math.max(S.rect.height * .7, 320); // how far "out of the screen" the viewer sits
      S.lookTarget.set(
        THREE.MathUtils.clamp(Math.atan2(S.pointer.x - hx, depth), -.9, .9),
        THREE.MathUtils.clamp(Math.atan2(S.pointer.y - hy, depth), -.5, .4),
      );
    } else if (S.built && holoState.phase === 'build') {
      S.lookTarget.set(-.45 + Math.sin(t * .6) * .05, .18);   // look at the hologram in its hand
    } else {
      S.lookTarget.set(Math.sin(t * .45) * .4, Math.sin(t * .31) * .12);
    }
    if (tracking && S.built && performance.now() / 1000 - S.pointer.movedAt > 3 && holoState.phase === 'build') S.lookTarget.set(-.45, .18);
    S.look.lerp(S.lookTarget, reduced ? 1 : 1 - Math.pow(.0012, dt));
    const yaw = S.look.x, pitch = S.look.y;
    headPivot.rotation.y = yaw * .8;
    headPivot.rotation.x = pitch * .9;
    body.rotation.y = yaw * .2;
    robot.rotation.x = S.scroll * .12;
    eyes.forEach((e) => { e.rotation.y = yaw * .1; e.position.y = EYE_Y - pitch * .03; });

    /* breathing + float */
    if (!reduced) {
      robot.position.y = Math.sin(t * .8) * .035 - S.scroll * .4;
      body.position.y = -.5 + Math.sin(t * 1.5) * .008;
    }

    /* greet: head tilt, happy eyes, fast rings */
    let happy = 0, tilt = 0;
    if (S.greetT >= 0) {
      S.greetT += dt;
      const g = S.greetT;
      tilt = Math.sin(g * 9) * Math.exp(-g * 2.6) * .22;
      happy = g < 1.6 ? ease(g / .2) : Math.max(0, 1 - (g - 1.6) / .3);
      if (g > 2.2) S.greetT = -1;
    }
    headPivot.rotation.z = tilt;

    /* arms: the left hand holds the hologram, the right one rests (and waves on click) */
    const [build, rest] = arms;
    const idleSway = reduced ? 0 : Math.sin(t * 1.3) * .03;
    build.upper.rotation.set(-.2 + idleSway, 0, -.3);
    build.fore.rotation.set(-1.2 + idleSway, 0, -.1);
    build.hand.rotation.set(-.2, 0, 0);
    const busy = holoState.phase === 'build' ? 1 : 0;
    build.fingers.forEach((f) => {
      const tap = busy ? Math.max(0, Math.sin(t * 16 + f.f * 1.7)) * .35 : 0;
      f.base.rotation.x = -.35 - tap; f.knuckle.rotation.x = -.45 - tap * .6;
    });
    build.thumb.rotation.set(-.3, 0, build.side * -.9);
    let wave = 0;
    if (S.greetT >= 0) wave = S.greetT < .25 ? ease(S.greetT / .25) : S.greetT > 1.9 ? Math.max(0, 1 - (S.greetT - 1.9) / .3) : 1;
    const wig = Math.sin((S.greetT >= 0 ? S.greetT : 0) * 14) * .4 * wave;
    build.hand.visible = false;            // clean silhouette: hands only appear for the wave
    rest.hand.visible = wave > .05;
    const arc = Math.sin(wave * Math.PI);
    rest.upper.rotation.set(lerp(-.2, -.25, wave) - arc * .9, 0, lerp(.3, 2.55, wave));
    rest.fore.rotation.set(lerp(-1.2, -.1, wave) - Math.sin(wave * Math.PI) * 1.6, 0, lerp(.1, .5, wave) + wig);
    rest.hand.rotation.set(lerp(-.2, 0, wave), lerp(0, -.4, wave), 0);
    rest.fingers.forEach((f) => { f.base.rotation.x = lerp(-.5, -.05, wave); f.knuckle.rotation.x = lerp(-.6, -.1, wave); });
    rest.thumb.rotation.set(-.2, 0, rest.side * lerp(-.6, -1.1, wave));
    arms.forEach((a, k) => a.ledMat.color.copy(GOLD).multiplyScalar(.6 + .5 * Math.max(0, Math.sin(t * 3 - k * 1.5)) + (k === 0 ? busy * .6 : wave * .8)));

    /* hologram above the palm: think -> build -> ship, cycling through what Syed builds */
    build.anchor.getWorldPosition(tmpV); body.worldToLocal(tmpV);
    palmSpark.position.copy(tmpV);
    const HB = builds[holoState.i];
    const hs = HB ? HB.L.scale : 1.3;
    holo.position.set(tmpV.x + .34, tmpV.y + .26 + (HB ? HB.L.frame[1] / 2 * hs : .35), tmpV.z + .05);
    if (HB && S.halfW) holo.position.x = Math.max(holo.position.x, -S.halfW + .08 + HB.L.frame[0] / 2 * hs);
    holo.scale.setScalar(hs);
    beamTop.set(holo.position.x, holo.position.y - (HB ? HB.L.frame[1] / 2 * hs : .3), holo.position.z);
    beamDir.subVectors(beamTop, tmpV);
    const beamLen = Math.max(.05, beamDir.length());
    beam.position.copy(tmpV).addScaledVector(beamDir, .5);
    beam.quaternion.setFromUnitVectors(beamUp, beamDir.normalize());
    beam.scale.set(1, beamLen, 1);
    holo.rotation.set(0, .32 + Math.sin(t * .7) * .08, 0);
    if (S.built && !reduced) {
      const H = holoState; H.t += dt;
      const B = builds[H.i];
      if (H.phase === 'idle') { H.phase = 'think'; H.t = 0; }
      if (H.phase === 'think') {
        setHud('Thinking', 'Planning the ' + B.L.noun + '…');
        loader.visible = true; loader.rotation.z -= dt * 6; loaderInner.rotation.z += dt * 9;
        nodes.forEach((n, k) => { const a = t * 3 + k * 2.094; n.position.set(Math.cos(a) * .19, Math.sin(a) * .19, .01); });
        holoSolid.opacity = .55 + .35 * Math.sin(t * 8);
        holoGlow.material.opacity = (.18 + .12 * Math.sin(t * 6)) * (holoGlow.userData.k || 1);
        if (H.t < dt * 1.5 && S.scanT < 0) S.scanT = 0;                  // eyes run a loading sweep
        palmSpark.material.opacity = (.4 + .5 * Math.abs(Math.sin(t * 9))) * (palmSpark.userData.k || 1);
        beamMat.opacity = 0;
        if (H.t > 1.1) { H.phase = 'build'; H.t = 0; builds.forEach((b) => { b.g.visible = false; }); B.g.visible = true; B.g.scale.setScalar(1); B.g.position.set(0, 0, 0); holoEdge.opacity = .95; holoSolid.opacity = .9; holoBack.opacity = S.light ? .82 : .62; holoFill.opacity = S.light ? .2 : .24; loader.visible = false; B.parts.forEach((p) => p.scale.setScalar(.001)); }
      } else if (H.phase === 'build') {
        setHud('Now building', B.L.name);
        beamMat.opacity = Math.min(.5, H.t * 2) * (S.light ? .9 : 1);
        holoGlow.material.opacity = Math.min(.35, H.t) * (holoGlow.userData.k || 1);
        palmSpark.material.opacity = .9 * (palmSpark.userData.k || 1);
        B.frame.scale.set(1, Math.min(1, H.t / .35), 1);
        holoScan.visible = true; holoScan.scale.x = B.L.frame[0] + .04;
        holoScan.position.y = B.L.frame[1] / 2 - ((H.t * .9) % 1) * B.L.frame[1];
        const per = 1.9 / B.parts.length;
        B.parts.forEach((p, k) => { const s = ease((H.t - .35 - k * per) / .28); p.scale.set(Math.max(.001, s), Math.max(.001, s), 1); });
        if (H.t > 2.45) { H.phase = 'hold'; H.t = 0; holoScan.visible = false; }
      } else if (H.phase === 'hold') {
        setHud('Built', B.L.name + ' ✓');
        holoEdge.opacity = .7 + .3 * Math.sin(H.t * 12);
        beamMat.opacity = Math.max(0, .5 - H.t * .5) * (S.light ? .9 : 1);
        holoGlow.material.opacity = (.3 + .15 * Math.sin(H.t * 12)) * (holoGlow.userData.k || 1);
        if (H.t > 1.1) { H.phase = 'ship'; H.t = 0; }
      } else if (H.phase === 'ship') {
        setHud('Shipped', B.L.name + ' ✓');
        if (hudCore) hudCore.classList.toggle('is-shipping', H.t < .7);
        const k = ease(H.t / .7);
        B.g.position.set(0, k * .45, k * .2); B.g.scale.setScalar(1 - k * .3);
        holoEdge.opacity = .95 * (1 - k); holoSolid.opacity = .9 * (1 - k); holoBack.opacity = (S.light ? .82 : .62) * (1 - k); holoFill.opacity = (S.light ? .2 : .24) * (1 - k);
        holoGlow.material.opacity = .35 * (1 - k) * (holoGlow.userData.k || 1);
        B.g.getWorldPosition(tmpV); body.worldToLocal(tmpV); shipSpark.position.copy(tmpV);
        shipSpark.material.opacity = Math.sin(Math.min(1, H.t / .7) * Math.PI) * .9 * (shipSpark.userData.k || 1);
        palmSpark.material.opacity = (1 - k) * .6 * (palmSpark.userData.k || 1);
        beamMat.opacity = 0;
        if (H.t > .75) { if (hudCore) hudCore.classList.remove('is-shipping'); B.g.visible = false; shipSpark.material.opacity = 0; H.i = (H.i + 1) % builds.length; H.phase = 'think'; H.t = 0; }
      }
    }

    if (stage.dataset.phase !== holoState.phase) stage.dataset.phase = holoState.phase;
    if (stage.dataset.build !== String(holoState.i)) stage.dataset.build = String(holoState.i);

    /* blink */
    if (t > S.nextBlink && S.blinkT < 0 && S.built) { S.blinkT = 0; S.nextBlink = t + 2.6 + Math.random() * 3.4; }
    let lid = 1;
    if (S.blinkT >= 0) { S.blinkT += dt; lid = Math.max(.08, Math.abs(1 - S.blinkT / .08)); if (S.blinkT > .16) { S.blinkT = -1; lid = 1; } }

    /* scan sweep across the eye dots */
    if (t > S.nextScan && S.scanT < 0 && S.built) { S.scanT = 0; S.nextScan = t + 7 + Math.random() * 4; }
    let sweep = -10;
    if (S.scanT >= 0) { S.scanT += dt; sweep = S.scanT / .9 * (DOTS * 2 + 3) - 1; if (S.scanT > .9) S.scanT = -1; }

    if (S.built) {
      eyes.forEach((e, side) => {
        e.scale.y = lid;
        e.userData.dots.forEach((d) => {
          const i = d.userData.i;
          const idx = side * (DOTS + 1) + i;
          const boost = Math.max(0, 1 - Math.abs(idx - sweep) / 1.4);
          const flicker = .92 + Math.sin(t * 7 + idx) * .04;
          d.userData.mat.color.copy(GOLD).multiplyScalar(flicker + boost * .9 + happy * .4);
          d.position.y = happy * (.022 - Math.abs(i - (DOTS - 1) / 2) * .014);
        });
        e.userData.glow.material.opacity = (.45 + happy * .3) * (e.userData.glow.userData.k || 1);
      });
    }

    /* core + leds */
    const beat = Math.pow(Math.sin(t * 2.1) * .5 + .5, 3);
    coreDiscMat.color.copy(GOLD).multiplyScalar(.75 + beat * .55);
    coreGlow.scale.setScalar(.6 + beat * .22);
    coreDisc.rotation.z = Math.PI / 2 + t * .4;
    tipMat.color.copy(GOLD).multiplyScalar(Math.sin(t * 3) > .6 ? 1.6 : .45);
    tipGlow.material.opacity = (Math.sin(t * 3) > .6 ? .9 : .25) * (tipGlow.userData.k || 1);
    earDots.forEach((m, i) => m.color.copy(GOLD).multiplyScalar(.6 + .4 * Math.sin(t * 2 + i * 1.6)));

    /* rings + particles */
    rings.forEach((r) => { r.spinner.rotation.z += dt * r.speed * (1 + happy * 4); });
    halo.rotation.y = t * .08;
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
    for (let i = 0; i < P; i++) {
      pos[i * 3 + 1] += pSpeed[i] * dt;
      if (pos[i * 3 + 1] > 2.2) pos[i * 3 + 1] = -2.2;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  /* start once the preloader is gone */
  renderer.render(scene, camera);
  stage.classList.add('is-live');
  if (window.__siteReady) start();
  else addEventListener('site:ready', start, { once: true });
  setTimeout(start, 7000);
  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------- boot */
if (stage && canvas && hasGL) {
  try { init(); } catch (err) { console.warn('[robot] falling back to poster:', err); stage.classList.add('is-fallback'); }
} else if (stage) {
  stage.classList.add('is-fallback');
  stage.setAttribute('aria-label', 'AI robot illustration');
}
