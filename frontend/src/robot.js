import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Clario robot — procedural Three.js model + reaction engine */
/* ------------------------------------------------------------------ */

const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();

const C = {
  ivory: 0xf1e7d3,
  ivoryLight: 0xf8f1e0,
  rim: 0xe9a24a,
  irisTop: 0xf6a04a,
  irisRim: 0xe0741a,
  pupil: 0x2a1408,
  chrome: 0xd9dadd,
  gunmetal: 0x43464c,
  dark: 0x1b1c1f,
  mouth: 0xb9bcc0,
};

function spring(stiff = 90, damp = 11) {
  return {
    x: 0,
    v: 0,
    t: 0,
    s: stiff,
    d: damp,
    imp(i) {
      this.v += i;
    },
    step(dt) {
      const a = (this.t - this.x) * this.s - this.v * this.d;
      this.v += a * dt;
      this.x += this.v * dt;
      return this.x;
    },
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const horiz = (v) => Math.sqrt(v.x * v.x + v.z * v.z);

/* rounded-rect shape for visor / mouth */
function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;

  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);

  return s;
}

function canvasTexture(size, draw) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d"), size);

  const t = new THREE.CanvasTexture(cv);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;

  return t;
}

/* radial iris gradient */
function irisTexture() {
  return canvasTexture(256, (g, s) => {
    const grd = g.createRadialGradient(
      s * 0.5,
      s * 0.38,
      s * 0.05,
      s * 0.5,
      s * 0.5,
      s * 0.5
    );

    grd.addColorStop(0, "#f6a04a");
    grd.addColorStop(0.55, "#ef8c30");
    grd.addColorStop(1, "#e0741a");

    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);

    const sh = g.createLinearGradient(0, 0, 0, s * 0.5);
    sh.addColorStop(0, "rgba(255,235,205,0.5)");
    sh.addColorStop(1, "rgba(255,235,205,0)");

    g.fillStyle = sh;
    g.fillRect(0, 0, s, s * 0.5);
  });
}

/* mouth grille */
function mouthTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = "#b9bcc0";
    g.fillRect(0, 0, s, s);

    g.fillStyle = "#2c2e33";
    const n = 14;

    for (let i = 1; i < n; i += 2) {
      const x = (s / n) * i;
      g.fillRect(x - s * 0.012, s * 0.12, s * 0.024, s * 0.76);
    }
  });
}

function softShadowTexture() {
  return canvasTexture(256, (g, s) => {
    const grd = g.createRadialGradient(
      s / 2,
      s / 2,
      s * 0.05,
      s / 2,
      s / 2,
      s / 2
    );

    grd.addColorStop(0, "rgba(35,26,16,0.42)");
    grd.addColorStop(0.6, "rgba(35,26,16,0.18)");
    grd.addColorStop(1, "rgba(35,26,16,0)");

    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

/* capsule substitute */
function capsule(r, len, mat) {
  const g = new THREE.Group();

  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 20),
    mat
  );

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 14),
    mat
  );

  const bot = top.clone();

  top.position.y = len / 2;
  bot.position.y = -len / 2;

  g.add(cyl, top, bot);

  return g;
}

export function createRobotScene(container) {
  const RM =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* renderer / scene / camera */

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    console.warn("[robot] WebGL unavailable:", err);
    const note = document.createElement("div");
    note.className = "robot-fallback";
    note.textContent = "3D agent preview needs WebGL.";
    container.appendChild(note);
    return fallbackController(note);
  }
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "Animated AI analyst robot that follows your cursor");

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);

  const CAM_TARGET = new THREE.Vector3(0, 1.2, 0);
  const CAM_AZIM = 0.1;
  const CAM_ELEV = 0.1;

  /* procedural studio environment */

  {
    const env = new THREE.Scene();

    const room = new THREE.Mesh(
      new THREE.BoxGeometry(14, 14, 14),
      new THREE.MeshBasicMaterial({
        color: srgb(0x9a9083),
        side: THREE.BackSide,
      })
    );

    env.add(room);

    const softbox = (w, h, col, pos) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: col })
      );

      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };

    softbox(5, 4, new THREE.Color(6.5, 5.8, 4.9), new THREE.Vector3(4, 4, 3));
    softbox(6, 5, new THREE.Color(2.1, 2.3, 2.7), new THREE.Vector3(-5, 2, -2));
    softbox(7, 3, new THREE.Color(4.5, 4.0, 3.3), new THREE.Vector3(0, 6, 0));
    softbox(3, 5, new THREE.Color(5.0, 4.4, 3.6), new THREE.Vector3(-2, 3, -5));

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
  }

  /* lights */

  const key = new THREE.DirectionalLight(0xffe3bd, 1.15);
  key.position.set(3.5, 4.5, 2.5);

  const fill = new THREE.DirectionalLight(0xc9d6e6, 0.4);
  fill.position.set(-4, 2, -1);

  const rim = new THREE.DirectionalLight(0xfff0dc, 0.55);
  rim.position.set(-2, 3.5, -4);

  scene.add(
    key,
    fill,
    rim,
    new THREE.HemisphereLight(0xf4ead8, 0x6b5f50, 0.35)
  );

  /* materials */

  const shell = new THREE.MeshPhysicalMaterial({
    color: srgb(C.ivory),
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
  });

  const shellLight = new THREE.MeshPhysicalMaterial({
    color: srgb(C.ivoryLight),
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });

  const chrome = new THREE.MeshPhysicalMaterial({
    color: srgb(C.chrome),
    metalness: 1,
    roughness: 0.09,
  });

  const gunmetal = new THREE.MeshPhysicalMaterial({
    color: srgb(C.gunmetal),
    metalness: 1,
    roughness: 0.32,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: srgb(C.dark),
    roughness: 0.5,
  });

  const rimMat = new THREE.MeshPhysicalMaterial({
    color: srgb(C.rim),
    metalness: 0.4,
    roughness: 0.35,
    clearcoat: 0.6,
  });

  const earGlowMat = new THREE.MeshStandardMaterial({
    color: srgb(0xffd9ac),
    emissive: srgb(0xff9a3c),
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });

  const palmGlowMat = new THREE.MeshStandardMaterial({
    color: srgb(0xffffff),
    emissive: srgb(0xbfe4ff),
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });

  const pickMeshes = [];

  const tag = (mesh, part) => {
    mesh.userData.part = part;
    pickMeshes.push(mesh);
    return mesh;
  };

  /* ROBOT */

  const root = new THREE.Group();
  root.rotation.y = 0.5;
  scene.add(root);

  /* legs + feet */

  const makeLeg = (side) => {
    const g = new THREE.Group();
    const x = 0.17 * side;

    const hip = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 20, 14),
      chrome
    );
    hip.position.set(x, 0.5, 0);

    const up = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.04, 0.18, 16),
      chrome
    );
    up.position.set(x, 0.41, 0);

    const knee = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 18, 12),
      gunmetal
    );
    knee.position.set(x, 0.31, 0);

    const lo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.034, 0.15, 16),
      chrome
    );
    lo.position.set(x, 0.225, 0);

    const ankle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.06, 0.05, 18),
      chrome
    );
    ankle.position.set(x, 0.145, 0);

    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 26, 18),
      shell
    );

    foot.scale.set(1, 0.62, 1.32);
    foot.position.set(x, 0.095, 0.03);

    g.add(hip, up, knee, lo, ankle, tag(foot, "other"));

    return g;
  };

  root.add(makeLeg(1), makeLeg(-1));

  /* hips pivot */

  const hips = new THREE.Group();
  hips.position.y = 0.55;
  root.add(hips);

  const hipJoint = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.23, 0.12, 24),
    chrome
  );

  hipJoint.position.y = -0.02;
  hips.add(hipJoint);

  /* torso */

  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.28;
  hips.add(torsoGroup);

  const torso = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 40, 28),
    shell
  );

  torso.scale.set(1.3, 1.25, 0.98);
  tag(torso, "belly");

  const waist = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.034, 14, 36),
    chrome
  );

  waist.rotation.x = Math.PI / 2;
  waist.scale.set(1.3, 0.98, 1);
  waist.position.y = -0.27;

  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.006, 8, 40),
    darkMat
  );

  seam.rotation.x = Math.PI / 2;
  seam.scale.set(1.3, 0.98, 1);
  seam.position.y = 0.02;

  const chestSlot = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.022, 0.02),
    darkMat
  );

  chestSlot.position.set(0, 0.14, 0.295);
  torsoGroup.add(torso, waist, seam, chestSlot);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.16, 0.1, 22),
    chrome
  );

  neck.position.y = 0.4;

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.155, 0.03, 12, 32),
    chrome
  );

  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.37;

  torsoGroup.add(neck, collar);

  /* head */

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.44;
  torsoGroup.add(headPivot);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.46;
  headPivot.add(headGroup);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 48, 36),
    shell
  );

  dome.scale.set(1, 0.72, 0.6);
  dome.position.z = -0.02;
  tag(dome, "head");
  headGroup.add(dome);

  /* visor rim + visor panel */

  const rimShape = new THREE.ExtrudeGeometry(
    roundedRect(1.44, 0.74, 0.3),
    {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    }
  );

  const visorRim = new THREE.Mesh(rimShape, rimMat);
  visorRim.position.set(0, 0.02, 0.5);

  const visorShape = new THREE.ExtrudeGeometry(
    roundedRect(1.34, 0.64, 0.26),
    {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    }
  );

  const visor = new THREE.Mesh(visorShape, shellLight);
  visor.position.set(0, 0.02, 0.525);
  tag(visor, "head");

  headGroup.add(visorRim, visor);
    /* eyes */

  const eyeGroup = new THREE.Group();
  eyeGroup.position.set(0, 0.02, 0.61);
  headGroup.add(eyeGroup);

  const eyeWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.15,
    clearcoat: 1,
  });

  const irisMat = new THREE.MeshStandardMaterial({
    map: irisTexture(),
    roughness: 0.3,
  });

  const pupilMat = new THREE.MeshStandardMaterial({
    color: 0x241408,
    roughness: 0.18,
  });

  const eyeParts = [];

  const makeEye = (side) => {
    const eye = new THREE.Group();
    eye.position.set(0.34 * side, 0.02, 0.025);

    const white = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 32, 24),
      eyeWhiteMat
    );

    white.scale.set(1, 1.12, 0.35);

    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(0.105, 32),
      irisMat
    );

    iris.position.z = 0.069;

    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.054, 32),
      pupilMat
    );

    pupil.position.z = 0.074;

    const shine = new THREE.Mesh(
      new THREE.CircleGeometry(0.025, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );

    shine.position.set(-0.026, 0.034, 0.078);

    const shineSmall = new THREE.Mesh(
      new THREE.CircleGeometry(0.012, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );

    shineSmall.position.set(0.034, -0.03, 0.078);

    eye.add(white, iris, pupil, shine, shineSmall);

    eyeParts.push({ eye, iris, pupil, shine, white });

    eyeGroup.add(eye);
  };

  makeEye(-1);
  makeEye(1);

  /* cute pink cheeks */

  const cheekMat = new THREE.MeshBasicMaterial({
    color: 0xff9da9,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });

  const cheekGeometry = new THREE.CircleGeometry(0.105, 32);

  const leftCheek = new THREE.Mesh(cheekGeometry, cheekMat);
  leftCheek.position.set(-0.56, -0.19, 0.625);
  leftCheek.scale.set(1.15, 0.65, 1);

  const rightCheek = leftCheek.clone();
  rightCheek.position.x = 0.56;

  headGroup.add(leftCheek, rightCheek);

  /* eyebrows */

  const browMat = new THREE.MeshStandardMaterial({
    color: 0x8b705b,
    roughness: 0.7,
  });

  const brows = [];

  [-1, 1].forEach((side) => {
    const brow = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.018, 8, 20, Math.PI),
      browMat
    );

    brow.position.set(0.34 * side, 0.22, 0.62);
    brow.rotation.z = 0;

    headGroup.add(brow);
    brows.push(brow);
  });

  /* mouth */

  const mouthMat = new THREE.MeshStandardMaterial({
    map: mouthTexture(),
    roughness: 0.6,
  });

  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.045),
    mouthMat
  );

  mouth.position.set(0, -0.25, 0.625);
  headGroup.add(mouth);

  /* mouth expressions */

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.012, 8, 24, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x9b6655 })
  );

  smile.position.set(0, -0.25, 0.635);
  smile.rotation.z = Math.PI;
  smile.visible = false;
  headGroup.add(smile);

  /* ear modules */

  const ears = [];

  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(0.91 * side, 0, 0);

    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.13, 28),
      rimMat
    );

    outer.rotation.z = Math.PI / 2;

    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.14, 28),
      chrome
    );

    inner.rotation.z = Math.PI / 2;

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 24, 18),
      earGlowMat
    );

    glow.position.x = 0.09 * side;

    tag(outer, "ear");
    tag(inner, "ear");
    ear.add(outer, inner, glow);
    headGroup.add(ear);

    ears.push({ ear, glow });
  });

  /* antenna */

  const antenna = new THREE.Group();
  antenna.position.set(0, 0.72, 0);

  const antennaStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, 0.18, 12),
    chrome
  );

  antennaStem.position.y = 0.09;

  const antennaBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 24, 18),
    earGlowMat
  );

  antennaBall.position.y = 0.19;

  tag(antennaBall, "antenna");
  antenna.add(antennaStem, antennaBall);
  headGroup.add(antenna);

  /* arms */

  const arms = [];

  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.34 * side, 0.3, 0);

    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 18),
      chrome
    );

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.06, 0.23, 18),
      shell
    );

    upper.position.y = -0.14;

    const elbow = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 20, 16),
      gunmetal
    );

    elbow.position.y = -0.27;

    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.052, 0.19, 18),
      shellLight
    );

    forearm.position.y = -0.39;

    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 20, 16),
      shell
    );

    hand.scale.set(0.8, 1.1, 0.75);
    hand.position.y = -0.5;

    const palmGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 16, 12),
      palmGlowMat
    );

    palmGlow.position.set(0, -0.5, 0.05);

    tag(upper, "arm");
    tag(forearm, "arm");
    tag(hand, "arm");
    pivot.add(shoulder, upper, elbow, forearm, hand, palmGlow);
    torsoGroup.add(pivot);

    arms.push({
      pivot,
      shoulder,
      upper,
      elbow,
      forearm,
      hand,
      palmGlow,
      side,
    });
  };

  makeArm(-1);
  makeArm(1);

  /* floor shadow */

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({
      map: softShadowTexture(),
      transparent: true,
      depthWrite: false,
    })
  );

  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(shadow);

  /* floor ring */

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.012, 10, 80),
    new THREE.MeshBasicMaterial({
      color: 0xf6ead2,
      transparent: true,
      opacity: 0.75,
    })
  );

  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.015;
  scene.add(ring);

  /* ------------------------------------------------------------------ */
  /* ANIMATION ENGINE                                                   */
  /* idle · cursor awareness · hover · THINK / DECIDE / ACT · success   */
  /* ------------------------------------------------------------------ */

  const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

  const motionQuery = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  let reduced = !!RM;
  const onMotionPref = (e) => {
    reduced = e.matches;
  };
  motionQuery?.addEventListener?.("change", onMotionPref);

  /* extra bits: glowing iris + expanding "thinking" ring */

  irisMat.emissive = new THREE.Color(0xffffff);
  irisMat.emissiveMap = irisMat.map;
  irisMat.emissiveIntensity = 0;

  const pulse = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.01, 8, 80),
    new THREE.MeshBasicMaterial({
      color: 0xf0a04a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );
  pulse.rotation.x = Math.PI / 2;
  pulse.position.y = 0.02;
  scene.add(pulse);

  /* floating "z" sprites used by the sleep action */

  const zTex = canvasTexture(64, (g, sz) => {
    g.font = `bold ${sz * 0.8}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff6e4";
    g.shadowColor = "rgba(60,40,20,0.6)";
    g.shadowBlur = 6;
    g.fillText("z", sz / 2, sz / 2);
  });
  const zSprites = [0, 1, 2].map(() => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false })
    );
    sp.scale.setScalar(0.2);
    scene.add(sp);
    return sp;
  });

  /* remember rest positions */

  eyeParts.forEach((p) => {
    p.base = {
      iris: p.iris.position.clone(),
      pupil: p.pupil.position.clone(),
      shine: p.shine.position.clone(),
    };
  });

  const browBaseY = brows.map((b) => b.position.y);
  const BASE_YAW = 0.2;
  const REST_ARM = 0.27;
  root.rotation.y = BASE_YAW;

  /* facial expressions (targets are smoothed, never snapped) */

  const EXPR = {
    normal: { cheek: 0.55, liftL: 0, liftR: 0, tiltL: 0, tiltR: 0, open: 1, glow: 0, mouth: "flat" },
    happy: { cheek: 0.85, liftL: 0.02, liftR: 0.02, tiltL: 0, tiltR: 0, open: 0.9, glow: 0.3, mouth: "smile" },
    curious: { cheek: 0.55, liftL: 0.004, liftR: 0.03, tiltL: 0.03, tiltR: -0.14, open: 1.03, glow: 0.1, mouth: "flat" },
    sleepy: { cheek: 0.5, liftL: -0.01, liftR: -0.01, tiltL: 0.08, tiltR: -0.08, open: 1, glow: -0.3, mouth: "flat" },
    surprised: { cheek: 0.6, liftL: 0.05, liftR: 0.05, tiltL: 0, tiltR: 0, open: 1.12, glow: 0.35, mouth: "flat" },
    concerned: { cheek: 0.35, liftL: 0.012, liftR: 0.012, tiltL: 0.26, tiltR: -0.26, open: 0.96, glow: -0.15, mouth: "frown" },
  };
  const X = { ...EXPR.normal };

  const S = {
    time: 0,
    visible: true,
    disposed: false,

    mode: "idle", // idle | thinking | success | error
    modeT: 0,
    stage: 0, // 0 THINK · 1 DECIDE · 2 ACT

    expr: "normal",
    exprT: 0,
    act: null, // { type, t, dur }
    pokes: 0,

    // pointer
    px: 0,
    py: 0,
    pointerSeen: false,
    lastPointerAt: -99,
    pointerDirty: false,
    tx: 0,
    ty: 0,
    nearT: 0,
    hoverT: 0,

    // smoothed
    gx: 0,
    gy: 0,
    hx: 0,
    hy: 0,
    near: 0,
    hov: 0,
    glow: 0,
    flash: 0,
    lean: 0,
    roll: 0,

    // blink + idle fidgets
    blinkT: -1,
    nextBlink: 2.2,
    queueBlink: false,
    adj: null,
    adjIn: 6,
    idleFor: 0,
    speed: 0,
    lastPx: 0,
    lastPy: 0,
    lastMoveAt: 0,
    flinchAt: -99,
    greeted: false,
    waveBackAt: -99,
    typeAt: -99,
    pressT: -1,
    press: 0,
    pressedLong: false,
    hoverPart: null,
    squash: 0,
    idleActIn: 18,
  };

  const hop = spring(140, 11);
  const armCur = arms.map(() => ({ z: REST_ARM, x: 0 }));

  const setExpr = (name, dur = 0) => {
    S.expr = name;
    S.exprT = dur;
  };
  const startAct = (type, dur) => {
    S.act = { type, t: 0, dur };
    S.idleFor = 0;
  };

  /* every one-shot action: [duration, expression, expression-time] */
  const ACTIONS = {
    nod: [1.0],
    shake: [0.9],
    poke: [0.9],
    wave: [2.0],
    celebrate: [2.2, "happy", 2.4],
    spin: [1.3, "happy", 1.3],
    dance: [4.0, "happy", 4.0],
    shrug: [1.5, "curious", 1.5],
    salute: [1.8],
    bow: [1.9, "happy", 1.9],
    point: [2.2, "curious", 2.2],
    lookAround: [3.2, "curious", 3.2],
    flex: [2.2, "happy", 2.2],
    clap: [2.4, "happy", 2.4],
    yawn: [2.6, "sleepy", 2.6],
    sleep: [6.0, "sleepy", 6.0],
    backflip: [1.25, "surprised", 1.4],
    jump: [0.9, "surprised", 0.9],
    ponder: [2.6, "curious", 2.6],
  };
  const play = (name) => {
    const def = ACTIONS[name];
    if (!def) return false;
    startAct(name, def[0]);
    if (def[1]) setExpr(def[1], def[2] ?? def[0]);
    if (name === "celebrate" || name === "flex") S.flash = 1;
    if (name === "jump" || name === "backflip") hop.imp(name === "jump" ? 1.2 : 0.6);
    return true;
  };

  /* ---------------- pointer: window level so the robot sees the cursor everywhere ---------------- */

  const tmpV = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();

  const onPointerMove = (ev) => {
    if (S.act && S.act.type === "sleep" && S.act.t > 1.2) S.act.dur = Math.min(S.act.dur, S.act.t + 0.6);
    const dx = ev.clientX - (S.lastPx || ev.clientX);
    const dy = ev.clientY - (S.lastPy || ev.clientY);
    S.speed = Math.max(S.speed, Math.hypot(dx, dy));
    S.lastPx = ev.clientX;
    S.lastPy = ev.clientY;
    S.lastMoveAt = S.time;
    S.px = ev.clientX;
    S.py = ev.clientY;
    S.pointerSeen = true;
    S.lastPointerAt = S.time;
    S.pointerDirty = true;
  };
  const onPointerLeaveWindow = () => {
    if (!S.act && S.mode === "idle" && S.time - S.flinchAt > 3) play("lookAround");
    S.pointerSeen = false;
    S.nearT = 0;
    S.hoverT = 0;
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onPointerLeaveWindow);

  function resolvePointer() {
    S.pointerDirty = false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    headGroup.getWorldPosition(tmpV);
    tmpV.project(camera);
    const cx = rect.left + (tmpV.x * 0.5 + 0.5) * rect.width;
    const cy = rect.top + (-tmpV.y * 0.5 + 0.5) * rect.height;

    const R = Math.max(240, Math.min(window.innerWidth, 1000) * 0.4);
    S.tx = Math.tanh(((S.px - cx) / R) * 1.1);
    S.ty = Math.tanh(((cy - S.py) / R) * 1.1) * 0.9;

    const bodyY = cy + rect.height * 0.12;
    const dist = Math.hypot(S.px - cx, S.py - bodyY);
    S.nearT = clamp(1 - dist / (Math.min(rect.width, rect.height) * 0.8), 0, 1);

    const inside =
      S.px >= rect.left && S.px <= rect.right && S.py >= rect.top && S.py <= rect.bottom;
    let over = false;
    if (inside) {
      ndc.set(
        ((S.px - rect.left) / rect.width) * 2 - 1,
        -(((S.py - rect.top) / rect.height) * 2 - 1)
      );
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickMeshes, false);
      over = hits.length > 0;
      S.hoverPart = over ? hits[0].object.userData.part : null;
    } else S.hoverPart = null;
    const next = over ? 1 : 0;
    if (next === 1 && S.hoverT === 0 && !reduced) hop.imp(0.7);
    S.hoverT = next;
  }

  const pickAt = (ev) => {
    if (!ev || ev.clientX === undefined) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.part : null;
  };

  /* clicking different parts gives different reactions */
  const onClick = (ev) => {
    if (S.pressedLong) {
      S.pressedLong = false;
      return;
    }
    S.pokes += 1;
    hop.imp(0.9);
    S.squash = 1;
    const part = pickAt(ev);
    if (S.act && S.act.type === "sleep") {
      S.act = null;
      play("jump");
      return;
    }
    if (part === "head" || part === "antenna") {
      setExpr("happy", 1.3);
      startAct(S.pokes % 4 === 0 ? "nod" : "poke", 0.9);
      S.flash = 0.8;
    } else if (part === "belly") {
      setExpr("happy", 1.5);
      play(S.pokes % 2 ? "jump" : "dance");
    } else if (part === "ear") {
      setExpr("surprised", 1.2);
      startAct("shake", 0.9);
    } else if (part === "arm") {
      play("wave");
    } else {
      const pool = ["wave", "spin", "clap", "flex", "salute", "jump"];
      play(S.pokes % 3 === 0 ? pool[Math.floor(Math.random() * pool.length)] : "poke");
    }
  };
  const onDblClick = () => {
    S.pressedLong = false;
    play(Math.random() < 0.5 ? "backflip" : "spin");
  };
  const onPressDown = () => {
    S.pressT = 0;
    S.pressedLong = false;
  };
  const onPressUp = () => {
    S.pressT = -1;
  };
  const onTabVisibility = () => {
    if (!document.hidden) {
      play("wave");
      S.lastPointerAt = -99;
    }
  };
  const onKeyDown = (ev) => {
    const el = ev.target;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    if (!typing) return;
    if (ev.key === "Enter") {
      S.typeAt = S.time;
      return;
    }
    if (S.time - S.typeAt > 2.2 && !S.act && S.mode === "idle") {
      S.typeAt = S.time;
      startAct("nod", 0.7);
    }
    S.glow = Math.max(S.glow, 0.25);
  };
  renderer.domElement.addEventListener("pointerdown", onPressDown);
  window.addEventListener("pointerup", onPressUp);
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onTabVisibility);
  renderer.domElement.addEventListener("dblclick", onDblClick);
  renderer.domElement.addEventListener("click", onClick);

  /* ---------------- per-frame update ---------------- */

  function update(dt) {
    S.time += dt;
    const t = S.time;
    const m = reduced ? 0 : 1; // motion amount

    /* timers */
    if (S.modeT > 0) {
      S.modeT -= dt;
      if (S.modeT <= 0 && (S.mode === "success" || S.mode === "error")) S.mode = "idle";
    }
    if (S.exprT > 0) S.exprT -= dt;
    if (S.act) {
      S.act.t += dt;
      if (S.act.t >= S.act.dur) S.act = null;
    }
    S.flash = Math.max(0, S.flash - dt * 0.9);

    if (S.pointerDirty) resolvePointer();

    /* ---- cursor-driven reactions ---- */
    S.speed = damp(S.speed, 0, 6, dt);
    S.squash = Math.max(0, S.squash - dt * 3.2);
    const calm = !S.act && S.mode === "idle";
    if (calm && S.near > 0.55 && S.speed > 38 && t - S.flinchAt > 3.5) {
      // cursor whipped right past: startled flinch
      S.flinchAt = t;
      setExpr("surprised", 1.0);
      hop.imp(0.7);
      startAct("shake", 0.7);
    }
    if (calm && S.hoverT === 1 && !S.greeted && t - S.waveBackAt > 8) {
      // first time the cursor lands on the robot: say hi
      S.greeted = true;
      S.waveBackAt = t;
      play("wave");
    }
    if (S.hoverT === 0 && S.near < 0.2) S.greeted = false;
    if (calm && S.near > 0.6 && S.pointerSeen && t - S.lastMoveAt > 4 && t - S.waveBackAt > 10) {
      // cursor parked next to it for a while: curious, then ponder
      S.waveBackAt = t;
      play("ponder");
    }
    if (S.pressT >= 0) {
      S.pressT += dt;
      if (S.pressT > 0.7 && !S.pressedLong) {
        S.pressedLong = true;
        play("dance");
      }
    }
    S.press = damp(S.press, S.pressT >= 0 ? 1 : 0, 14, dt);

    /* one-shot actions ------------------------------------------- */
    const A = { nod: 0, yaw: 0, roll: 0, hop: 0, spin: 0, flip: 0, lift: 0, lean: 0, sway: 0, twist: 0, close: 0, gazeX: null, gazeY: null, mouthOpen: 0, pulse: 0, antenna: 0 };
    let waveEnv = 0;
    let celebEnv = 0;
    let armPose = null; // { ang: [l, r], fwd: [l, r], w } — blended over the normal arm motion
    const pose = (ang, fwd, w) => {
      armPose = { ang, fwd, w };
    };
    const ease = (x) => x * x * (3 - 2 * x);
    if (S.act && !reduced) {
      const at = S.act.t;
      const p = at / S.act.dur;
      const env = Math.min(1, p * 6, (1 - p) * 6);
      switch (S.act.type) {
        case "nod":
          A.nod = Math.sin(p * Math.PI * 4) * 0.13 * (1 - p);
          break;
        case "shake":
          A.yaw = Math.sin(p * Math.PI * 4) * 0.1 * (1 - p);
          break;
        case "poke":
          A.roll = Math.sin(p * Math.PI * 3) * 0.08 * (1 - p);
          break;
        case "wave":
          waveEnv = env;
          A.roll = -0.04 * env;
          break;
        case "celebrate":
          celebEnv = env;
          A.hop = Math.abs(Math.sin(S.act.t * 7.5)) * 0.07 * env;
          A.nod = Math.sin(p * Math.PI * 4) * 0.06 * (1 - p);
          break;

        case "spin": {
          A.spin = ease(p) * Math.PI * 2;
          A.hop = Math.sin(p * Math.PI) * 0.1;
          pose([1.0, 1.0], [0, 0], Math.min(1, p * 8, (1 - p) * 8));
          break;
        }
        case "dance": {
          const b = at * 6.2;
          A.hop = Math.abs(Math.sin(b)) * 0.06 * env;
          A.sway = Math.sin(b) * 0.14 * env;
          A.twist = Math.sin(b * 0.5) * 0.3 * env;
          A.roll = Math.sin(b) * 0.1 * env;
          A.nod = Math.abs(Math.sin(b)) * 0.08 * env;
          A.antenna = Math.sin(b * 1.5) * 0.25 * env;
          pose([1.35 + Math.sin(b) * 0.85, 1.35 + Math.sin(b + Math.PI) * 0.85], [0.1, 0.1], env);
          break;
        }
        case "shrug": {
          const k = Math.sin(Math.min(1, p * 1.15) * Math.PI);
          pose([0.95, 0.95], [0.35, 0.35], k);
          A.roll = 0.1 * k;
          A.nod = -0.05 * k;
          A.lift = 0.012 * k;
          break;
        }
        case "salute": {
          pose([0.3, 2.05], [0, 0.85], env);
          A.nod = -0.04 * env;
          A.gazeX = 0;
          A.gazeY = 0.15;
          break;
        }
        case "bow": {
          const k = Math.sin(Math.min(1, p) * Math.PI);
          const hold = Math.min(1, k * 1.8);
          A.lean = 0.75 * hold;
          A.nod = 0.22 * hold;
          pose([0.2, 0.2], [0.5, 0.5], hold);
          break;
        }
        case "point": {
          pose([0.25, 1.5], [0, 0.25], env);
          A.gazeX = 0.9 * env + S.gx * (1 - env);
          A.gazeY = 0.05;
          A.yaw = 0.05 * env;
          break;
        }
        case "lookAround": {
          A.gazeX = Math.sin(p * Math.PI * 3.2) * 0.95 * env;
          A.gazeY = (0.15 + Math.sin(p * Math.PI * 1.6) * 0.2) * env;
          A.roll = Math.sin(p * Math.PI * 3.2) * -0.05 * env;
          pose([0.5, 0.5], [0.15, 0.15], env * 0.5);
          break;
        }
        case "flex": {
          const g = Math.sin(at * 14) * 0.5 + 0.5;
          pose([1.25, 1.25], [0.2, 0.2], env);
          A.lean = -0.08 * env;
          A.hop = 0.015 * g * env;
          A.pulse = (0.6 + g * 0.6) * env;
          A.nod = -0.06 * env;
          break;
        }
        case "clap": {
          const c = (Math.sin(at * 16) * 0.5 + 0.5);
          pose([-0.12 + c * 0.38, -0.12 + c * 0.38], [1.35, 1.35], env);
          A.nod = Math.abs(Math.sin(at * 8)) * 0.04 * env;
          A.hop = Math.abs(Math.sin(at * 8)) * 0.012 * env;
          A.pulse = (1 - c) * 0.5 * env;
          break;
        }
        case "yawn": {
          const k = Math.sin(Math.min(1, p) * Math.PI);
          A.nod = -0.2 * k;
          A.mouthOpen = k;
          A.close = Math.min(1, k * 1.6) * 0.85;
          pose([0.4, 1.9], [0, 1.0], k * 0.9);
          break;
        }
        case "sleep": {
          const k = Math.min(1, at / 1.0, (S.act.dur - at) / 0.7);
          A.close = Math.max(0, k);
          A.nod = 0.28 * k + Math.sin(at * 1.3) * 0.03 * k;
          A.lean = 0.1 * k;
          A.antenna = -0.35 * k;
          A.gazeX = 0;
          A.gazeY = -0.4;
          pose([0.18, 0.18], [0, 0], k * 0.8);
          break;
        }
        case "backflip": {
          const e = ease(Math.min(1, Math.max(0, (p - 0.12) / 0.76)));
          A.flip = -e * Math.PI * 2;
          pose([1.2, 1.2], [0, 0], Math.min(1, p * 8, (1 - p) * 8));
          break;
        }
        case "jump": {
          A.hop = Math.sin(p * Math.PI) * 0.28;
          pose([0.9, 0.9], [0, 0], Math.sin(p * Math.PI));
          A.nod = -0.08 * Math.sin(p * Math.PI);
          break;
        }
        case "ponder": {
          // hand to chin, slow head tilt, eyes drifting up
          pose([0.35, 1.5], [0, 1.35], env);
          A.roll = 0.09 * env;
          A.gazeX = -0.5 * env;
          A.gazeY = 0.45 * env;
          A.nod = Math.sin(at * 2.2) * 0.03 * env;
          break;
        }
      }
    }

    /* gaze target ------------------------------------------------ */
    const cursorFresh = S.pointerSeen && t - S.lastPointerAt < 6;
    const gain = reduced ? 0.6 : 1;
    let gx = cursorFresh ? S.tx * gain : (Math.sin(t * 0.37) * 0.3 + Math.sin(t * 0.83) * 0.1) * m;
    let gy = cursorFresh ? S.ty * gain : Math.sin(t * 0.29 + 1.3) * 0.15 * m;
    let roll = 0;
    let lean = 0;
    let scan = 0.6;
    const thinking = S.mode === "thinking";

    if (thinking) {
      let sx = 0;
      let sy = 0;
      if (S.stage === 0) {
        sx = Math.sin(t * 1.7);
        sy = 0.3 + Math.sin(t * 1.1) * 0.12;
        roll = 0.06;
      } else if (S.stage === 1) {
        sx = Math.sin(t * 0.9) * 0.35;
        sy = -0.12;
        roll = -0.04;
      } else {
        sx = Math.sin(t * 3.2) * 0.55;
        sy = 0.05;
        lean = 0.07;
      }
      const w = 0.75 * m;
      gx = gx * (1 - w) + sx * 0.8 * w;
      gy = gy * (1 - w) + sy * w;
      if (!reduced) scan = 0.5 + 0.5 * Math.sin(t * (S.stage === 2 ? 7 : 4));
    }

    if (A.gazeX !== null) gx = A.gazeX;
    if (A.gazeY !== null) gy = A.gazeY;

    S.gx = damp(S.gx, gx, 10, dt);
    S.gy = damp(S.gy, gy, 10, dt);
    S.hx = damp(S.hx, gx, 4, dt);
    S.hy = damp(S.hy, gy, 4, dt);
    S.near = damp(S.near, S.nearT, 5, dt);
    S.hov = damp(S.hov, S.hoverT, 7, dt);

    /* expression ------------------------------------------------- */
    const exprName = S.exprT > 0 ? S.expr : thinking ? "curious" : "normal";
    const E = EXPR[exprName];
    X.cheek = damp(X.cheek, E.cheek, 8, dt);
    X.liftL = damp(X.liftL, E.liftL, 8, dt);
    X.liftR = damp(X.liftR, E.liftR, 8, dt);
    X.tiltL = damp(X.tiltL, E.tiltL, 8, dt);
    X.tiltR = damp(X.tiltR, E.tiltR, 8, dt);
    X.open = damp(X.open, E.open, 8, dt);
    X.glow = damp(X.glow, E.glow, 8, dt);

    mouth.visible = E.mouth === "flat";
    smile.visible = E.mouth !== "flat";
    smile.rotation.z = E.mouth === "smile" ? Math.PI : 0;
    smile.position.y = E.mouth === "frown" ? -0.285 : -0.235;
    smile.scale.setScalar(E.mouth === "frown" ? 0.7 : 1);
    mouth.scale.x = damp(mouth.scale.x, thinking ? 0.8 : 1, 6, dt);
    mouth.scale.y = damp(mouth.scale.y, 1 + A.mouthOpen * 3.2, 10, dt);

    /* one-shot actions ------------------------------------------- */
    /* idle: breathing + float ------------------------------------ */
    const br = Math.sin((t / 3.4) * Math.PI * 2) * m;
    const fl = Math.sin((t / 5.2) * Math.PI * 2) * m;
    hop.step(dt);
    const hopY = reduced ? 0 : Math.max(0, hop.x) + A.hop + A.lift;

    const FLIP_C = 0.9;
    const flipLift = A.flip ? FLIP_C * (1 - Math.cos(A.flip)) * 0.55 : 0;
    root.position.y = 0.02 * fl + hopY + flipLift;
    root.position.z = A.flip ? -FLIP_C * Math.sin(A.flip) * 0.6 : 0;
    root.rotation.x = A.flip;
    const sq = (S.press * 0.07 + Math.sin(S.squash * Math.PI) * 0.08) * (reduced ? 0 : 1);
    torso.scale.set(1.3 * (1 + 0.006 * br + sq * 0.6), 1.25 * (1 + 0.018 * br - sq), 0.98 * (1 + 0.008 * br + sq * 0.6));
    headPivot.position.y = 0.44 + 0.007 * br;

    /* head ------------------------------------------------------- */
    const hf = reduced ? 0 : 1;
    if (S.mode === "error") roll += 0.09;
    S.roll = damp(S.roll, roll, 6, dt);
    S.lean = damp(S.lean, lean, 5, dt);
    const hoverRoll = -S.hov * 0.07 * clamp(S.hx * 2, -1, 1) * hf;

    headPivot.rotation.y = S.hx * 0.28 * hf + A.yaw;
    headPivot.rotation.x = -S.hy * 0.12 * hf + A.nod + (S.mode === "error" ? 0.04 * hf : 0);
    headPivot.rotation.z = -S.hx * 0.035 * hf + S.roll * hf + A.roll + hoverRoll;

    root.rotation.y = BASE_YAW + S.hx * 0.06 * hf + A.spin;
    hips.rotation.z = A.sway;
    hips.rotation.y = A.twist;
    torsoGroup.rotation.x = (S.lean + A.lean) * hf;
    torsoGroup.rotation.z = Math.sin(t * 0.6) * 0.008 * m;
    antenna.rotation.z = Math.sin(t * 1.9) * 0.06 * m + S.hx * -0.05 * hf + A.antenna;

    /* arms ------------------------------------------------------- */
    const ang = [REST_ARM + 0.02 * br, REST_ARM + 0.02 * br];
    const fwd = [0, 0];

    if (m && !S.adj) {
      S.adjIn -= dt;
      if (S.adjIn <= 0) {
        S.adj = { i: Math.random() < 0.5 ? 0 : 1, t: 0 };
        S.adjIn = 8 + Math.random() * 6;
      }
    }
    if (S.adj) {
      S.adj.t += dt / 1.5;
      if (S.adj.t >= 1) S.adj = null;
      else {
        const k = Math.sin(Math.PI * S.adj.t);
        ang[S.adj.i] += k * k * 0.18;
        fwd[S.adj.i] += k * k * 0.12;
      }
    }

    const nearArm = S.tx >= 0 ? 1 : 0;
    ang[nearArm] += (S.hov * 0.3 + Math.sin(t * 5) * 0.025 * S.hov * m) * hf;
    fwd[nearArm] += S.hov * 0.25 * hf;

    if (thinking && !reduced) {
      if (S.stage === 1) {
        ang[1] = 0.1;
        fwd[1] += 1.0 + Math.sin(t * 5) * 0.04;
      } else if (S.stage === 2) {
        fwd[0] += 0.45 + Math.sin(t * 9) * 0.06;
        fwd[1] += 0.45 + Math.sin(t * 9 + Math.PI) * 0.06;
      }
    }
    if (waveEnv > 0) ang[1] = lerp(ang[1], 2.3 + Math.sin(t * 11) * 0.2, waveEnv);
    if (celebEnv > 0) {
      const up = 2.45 + Math.sin(t * 9) * 0.12;
      ang[0] = lerp(ang[0], up, celebEnv);
      ang[1] = lerp(ang[1], up, celebEnv);
    }

    if (armPose) {
      for (let i = 0; i < 2; i++) {
        ang[i] = lerp(ang[i], armPose.ang[i], armPose.w);
        fwd[i] = lerp(fwd[i], armPose.fwd[i], armPose.w);
      }
    }

    arms.forEach((a, i) => {
      armCur[i].z = damp(armCur[i].z, ang[i], 9, dt);
      armCur[i].x = damp(armCur[i].x, fwd[i], 9, dt);
      a.pivot.rotation.z = a.side * armCur[i].z;
      a.pivot.rotation.x = -armCur[i].x;
    });

    /* blink ------------------------------------------------------ */
    if (m) {
      S.nextBlink -= dt;
      if (S.blinkT < 0 && S.nextBlink <= 0) {
        S.blinkT = 0;
        S.nextBlink = 2.4 + Math.random() * 3.2;
        S.queueBlink = Math.random() < 0.2;
      }
    }
    let blink = 0;
    if (S.blinkT >= 0) {
      S.blinkT += dt / 0.17;
      if (S.blinkT >= 1) {
        S.blinkT = -1;
        if (S.queueBlink) {
          S.nextBlink = 0.14;
          S.queueBlink = false;
        }
      } else blink = Math.sin(Math.PI * S.blinkT);
    }

    /* eyes ------------------------------------------------------- */
    const open = X.open * (1 + 0.04 * S.near);
    const eyeScaleY = Math.max(0.05, open * (1 - 0.94 * Math.max(blink, A.close)));
    const ox = S.gx * 0.052;
    const oy = S.gy * 0.04;
    const dilate = 1 + 0.08 * S.near + 0.06 * S.hov;

    eyeParts.forEach((p) => {
      p.eye.scale.y = eyeScaleY;
      p.iris.position.set(p.base.iris.x + ox, p.base.iris.y + oy, p.base.iris.z);
      p.pupil.position.set(p.base.pupil.x + ox * 1.08, p.base.pupil.y + oy * 1.08, p.base.pupil.z);
      p.shine.position.set(p.base.shine.x + ox * 0.5, p.base.shine.y + oy * 0.5, p.base.shine.z);
      p.pupil.scale.setScalar(dilate);
    });

    const glowTarget =
      X.glow + 0.14 * S.near + 0.26 * S.hov + (thinking ? 0.28 + 0.16 * scan : 0) + S.flash * 0.5;
    S.glow = damp(S.glow, glowTarget, 8, dt);
    irisMat.emissiveIntensity = Math.max(0, S.glow);
    irisMat.color.setScalar(1 - clamp(-S.glow, 0, 0.4) * 0.5);

    earGlowMat.emissiveIntensity = (S.hoverPart === "ear" || S.hoverPart === "antenna" ? 0.8 : 0) + 1.1 + (thinking ? 0.7 * scan : 0) + S.flash * 0.8 + 0.3 * S.hov + A.pulse * 1.2;
    palmGlowMat.emissiveIntensity = 1.4 + A.pulse * 2.2;

    /* brows / cheeks -------------------------------------------- */
    brows[0].position.y = browBaseY[0] + X.liftL;
    brows[1].position.y = browBaseY[1] + X.liftR;
    brows[0].rotation.z = X.tiltL;
    brows[1].rotation.z = X.tiltR;
    cheekMat.opacity = clamp(X.cheek + 0.12 * S.hov, 0, 1);

    /* sleeping z's drift up from the head */
    const sleeping = S.act && S.act.type === "sleep" && !reduced;
    headGroup.getWorldPosition(tmpV);
    zSprites.forEach((sp, i) => {
      if (sleeping) {
        const ph = (t * 0.45 + i / 3) % 1;
        sp.position.set(tmpV.x + 0.55 + ph * 0.25, tmpV.y + 0.45 + ph * 0.7, tmpV.z + 0.2);
        sp.scale.setScalar(0.14 + ph * 0.16);
        sp.material.opacity = Math.sin(ph * Math.PI) * 0.9;
      } else sp.material.opacity = damp(sp.material.opacity, 0, 10, dt);
    });

    /* occasional idle fidgets so the robot never looks frozen */
    if (!S.act && S.mode === "idle" && !reduced) {
      S.idleFor += dt;
      S.idleActIn -= dt;
      if (S.idleActIn <= 0) {
        const pick = ["lookAround", "shrug", "yawn", "ponder", "nod"];
        play(pick[Math.floor(Math.random() * pick.length)]);
        S.idleActIn = 16 + Math.random() * 14;
      }
    } else if (S.mode !== "idle") S.idleActIn = Math.max(S.idleActIn, 12);

    /* floor: shadow follows the hop, ring pulses while thinking -- */
    shadow.material.opacity = clamp(1 - hopY * 3, 0.5, 1);
    shadow.scale.setScalar(1 - hopY * 0.8);
    ring.material.opacity = 0.75 + (thinking ? 0.2 * scan : 0);

    if (thinking) {
      if (reduced) {
        pulse.scale.setScalar(1);
        pulse.material.opacity = 0.25;
      } else {
        const p = (t * (S.stage === 2 ? 1.1 : 0.75)) % 1;
        pulse.scale.setScalar(1 + p * 0.9);
        pulse.material.opacity = (1 - p) * 0.35;
      }
    } else {
      pulse.material.opacity = damp(pulse.material.opacity, 0, 8, dt);
    }
  }

  /* ---------------- sizing / camera ---------------- */

  function resize() {
    if (S.disposed) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const distH = (h < 520 ? 3.85 : 3.3) / 2 / tanHalf; // extra headroom on short (mobile) stages
    const distW = 3.0 / 2 / (tanHalf * camera.aspect);
    const dist = Math.max(distH, distW);

    const look = CAM_TARGET.clone();
    if (h < 520) look.y += 0.28; // short (mobile) stage: sit the robot lower, clear of the brand pill
    camera.position.set(
      look.x + dist * Math.sin(CAM_AZIM) * Math.cos(CAM_ELEV),
      look.y + dist * Math.sin(CAM_ELEV),
      look.z + dist * Math.cos(CAM_AZIM) * Math.cos(CAM_ELEV)
    );
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    S.pointerDirty = S.pointerSeen;
    renderer.render(scene, camera);
  }

  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(container);
  else window.addEventListener("resize", resize);

  const visObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          S.visible = entries[entries.length - 1].isIntersecting;
        })
      : null;
  visObserver?.observe(container);

  /* ---------------- loop ---------------- */

  const clock = new THREE.Clock();
  let raf = 0;

  function frame() {
    if (S.disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!S.visible) return;
    update(dt);
    renderer.render(scene, camera);
  }

  resize();
  frame();

  /* ---------------- public controller ---------------- */

  function setStage(n) {
    S.mode = "thinking";
    S.modeT = 0;
    S.stage = clamp(Math.round(n), 0, 2);
    if (S.exprT > 0 && S.expr !== "curious") S.exprT = 0;
  }

  const controller = {
    /** AI is working: n = 0 THINK, 1 DECIDE, 2 ACT */
    setStage,
    /** back-compat: true → thinking, false → idle */
    setPointing(on) {
      if (on) {
        if (S.mode !== "thinking") setStage(0);
      } else if (S.mode === "thinking") {
        S.mode = "idle";
      }
    },
    success() {
      S.mode = "success";
      S.modeT = 2;
      setExpr("happy", 2);
      S.flash = 1;
      startAct("nod", 1.0);
      hop.imp(0.8);
    },
    error() {
      S.mode = "error";
      S.modeT = 3;
      setExpr("concerned", 3);
      startAct("shake", 0.9);
    },
    reset() {
      S.mode = "idle";
      S.exprT = 0;
      S.act = null;
    },
    wave() {
      play("wave");
    },
    nod() {
      play("nod");
    },
    celebrate() {
      play("celebrate");
    },
    poke: () => onClick(),
    /** play any named one-shot action; returns false for unknown names */
    play,
    spin: () => play("spin"),
    dance: () => play("dance"),
    shrug: () => play("shrug"),
    salute: () => play("salute"),
    bow: () => play("bow"),
    point: () => play("point"),
    lookAround: () => play("lookAround"),
    flex: () => play("flex"),
    clap: () => play("clap"),
    yawn: () => play("yawn"),
    sleep: () => play("sleep"),
    backflip: () => play("backflip"),
    jump: () => play("jump"),
    ponder: () => play("ponder"),
    actions: Object.keys(ACTIONS),

    dispose() {
      if (S.disposed) return;
      S.disposed = true;
      cancelAnimationFrame(raf);

      resizeObserver?.disconnect();
      visObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onPointerLeaveWindow);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("dblclick", onDblClick);
      renderer.domElement.removeEventListener("pointerdown", onPressDown);
      window.removeEventListener("pointerup", onPressUp);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onTabVisibility);
      motionQuery?.removeEventListener?.("change", onMotionPref);

      scene.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((mt) => {
          Object.values(mt).forEach((v) => v && v.isTexture && v.dispose());
          mt.dispose();
        });
      });
      scene.environment?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };

  return controller;
}

/** Used when WebGL is unavailable so the rest of the app keeps working. */
function fallbackController(el) {
  const noop = () => {};
  return {
    setStage: noop,
    setPointing: noop,
    success: noop,
    error: noop,
    reset: noop,
    wave: noop,
    nod: noop,
    celebrate: noop,
    poke: noop,
    play: () => false,
    spin: noop, dance: noop, shrug: noop, salute: noop, bow: noop, point: noop,
    lookAround: noop, flex: noop, clap: noop, yawn: noop, sleep: noop,
    backflip: noop, jump: noop, ponder: noop,
    actions: [],
    dispose() {
      el.remove();
    },
  };
}
