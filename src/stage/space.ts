import * as THREE from "three";

/* ============================================================
   SPACE BACKDROP  ·  LOW-POLY TOY EDITION
   A dark, deep-space scene rendered behind the avatar when the "space" backdrop
   is selected. Every body is genuinely modelled low-poly geometry — faceted
   icospheres whose vertices are pushed into lumps/craters and whose facets are
   flat-shaded from a candy palette (the classic low-poly-planet look), a chunky
   low-poly torus ring, and craggy displaced asteroids. No photo textures, no
   decals. Bodies sit in one horizontal row anchored to the camera frustum so
   they never stack vertically; narrow viewports just clip the outer ones.
   ============================================================ */

// --- small canvas helper (for the sky gradient + soft sprites) ---------------
function paint(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft round glow sprite for planet halos / star sparkles
function glowTexture(color: string): THREE.Texture {
  return paint(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.4, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  });
}

// a 4-point sparkle for the foreground stars
function sparkleTexture(): THREE.Texture {
  return paint(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 10);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(32, 32, 10, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = "rgba(255,255,255,0.9)";
    x.lineWidth = 3;
    x.lineCap = "round";
    for (const [dx, dy] of [[0, -28], [0, 28], [-28, 0], [28, 0]] as const) {
      x.beginPath();
      x.moveTo(32, 32);
      x.lineTo(32 + dx, 32 + dy);
      x.stroke();
    }
  });
}

// a random unit vector (continent / crater seed direction)
function randDir(): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const th = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(th) * s, Math.sin(th) * s, u);
}

// ============================================================
// LOW-POLY BODY: a faceted icosphere displaced into terrain, each triangle
// flat-coloured from a low→high palette ramp. This is real geometry, not a
// textured ball — the silhouette is lumpy and every facet reads individually.
// ============================================================
interface BodySpec {
  radius: number;
  detail: number; // icosphere subdivisions (0 chunky … 3 smooth)
  bump: number; // displacement as a fraction of radius
  lobes: number; // number of continent/crater centres (0 = smooth)
  ramp: string[]; // low → high colour ramp
  bands?: boolean; // colour by latitude (gas giants) instead of terrain height
  jitter?: number; // per-facet brightness variation
}

function makeLowPolyBody(spec: BodySpec): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(spec.radius, spec.detail).toNonIndexed();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const ramp = spec.ramp.map((h) => new THREE.Color(h));
  const centers = Array.from({ length: spec.lobes }, () => ({ dir: randDir(), amp: Math.random() * 2 - 1 }));

  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const heights = new Float32Array(pos.count);

  // push each vertex out (mountains) or in (craters) by smooth blobs
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    dir.copy(v).normalize();
    let h = 0;
    for (const c of centers) h += c.amp * Math.exp(-5 * (1 - dir.dot(c.dir)));
    heights[i] = h;
    v.copy(dir).multiplyScalar(spec.radius * (1 + spec.bump * h));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // flat per-facet colour straight from the ramp (non-indexed → 3 verts/facet)
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const jit = spec.jitter ?? 0.1;
  for (let f = 0; f < pos.count; f += 3) {
    let m: number;
    if (spec.bands) {
      let y = 0;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, f + k);
        y += v.y;
      }
      y /= 3 * spec.radius;
      m = THREE.MathUtils.clamp((y + 1) / 2 + (Math.random() - 0.5) * 0.06, 0, 1);
    } else {
      const h = (heights[f] + heights[f + 1] + heights[f + 2]) / 3;
      m = THREE.MathUtils.clamp(h + 0.5, 0, 1);
    }
    const idx = Math.min(ramp.length - 1, Math.floor(m * ramp.length));
    col.copy(ramp[idx]);
    const j = 1 - jit / 2 + Math.random() * jit;
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = col.r * j;
      colors[(f + k) * 3 + 1] = col.g * j;
      colors[(f + k) * 3 + 2] = col.b * j;
    }
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  // non-indexed + per-facet normals → genuine flat low-poly shading. Lambert
  // gives smooth, continuous brightness across the facet as the body spins, so
  // facets no longer "pop" between discrete toon bands during rotation.
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// chunky low-poly toy hoop (pentagon-section torus, candy-striped facets)
function makeRing(): THREE.Mesh {
  const geo = new THREE.TorusGeometry(1.95, 0.16, 5, 30).toNonIndexed();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const cols = ["#ffd36e", "#ff9ec4", "#a6e3ff", "#fff3c4"].map((h) => new THREE.Color(h));
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.y, v.x) / (Math.PI * 2) + 0.5; // 0..1 around the hoop
    const c = cols[Math.floor(a * cols.length) % cols.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals(); // flat facets on the hoop
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

// a glossy back-side rim shell that gives each toy planet a soft cartoon halo
function rimShell(radius: number, color: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.14, 24, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
}

function haloSprite(radius: number, color: string): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(color),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.4,
    }),
  );
  s.scale.setScalar(radius * 3.0);
  return s;
}

// A spinning body we rotate every frame.
interface Spinner {
  obj: THREE.Object3D;
  speed: number;
}
// A drifting, tumbling asteroid.
interface Rock {
  mesh: THREE.Mesh;
  spin: THREE.Vector3;
  phase: number;
  speed: number;
  y: number;
  z: number;
}

export interface Space {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  setAspect(aspect: number): void;
  update(t: number, dt: number): void;
}

export function createSpace(): Space {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
  // looks down -z from the origin; planets live out at z ≈ -26.

  // ---- deep, dark space gradient (near-black night sky) ----
  scene.background = paint(16, 256, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, "#0b1730");
    g.addColorStop(0.5, "#070d1c");
    g.addColorStop(1.0, "#04060e");
    x.fillStyle = g;
    x.fillRect(0, 0, 16, 256);
  });

  // ---- lighting: crisp key keeps the facets glossy, low cool fill stays dark -
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.7);
  sun.position.set(8, 6, 5);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x3a3458, 0.85));
  const fill = new THREE.DirectionalLight(0x4a78ff, 0.6); // bright-blue rim fill
  fill.position.set(-6, -2, 4);
  scene.add(fill);

  // ---- starfield: tiny pastel dots far away + chunky sparkles up close ----
  function makeStars(count: number, radius: number, size: number, color: number, opacity: number, sprite?: THREE.Texture) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = radius * (0.7 + Math.random() * 0.3);
      pos[i * 3] = Math.cos(th) * s * r;
      pos[i * 3 + 1] = Math.sin(th) * s * r;
      pos[i * 3 + 2] = u * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      map: sprite,
      alphaMap: sprite,
      blending: sprite ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    return new THREE.Points(geo, mat);
  }
  const sparkle = sparkleTexture();
  const starsFar = makeStars(1100, 240, 1.0, 0xcfe0ff, 0.8); // cool faint blue-white
  const starsNear = makeStars(110, 150, 5.5, 0xffffff, 0.95, sparkle);
  scene.add(starsFar, starsNear);

  const spinners: Spinner[] = [];
  const groups: Record<string, THREE.Group> = {};

  // assemble a planet: low-poly body + soft rim halo + glow sprite
  function makePlanet(spec: BodySpec, rim: number, halo: string, spin: number) {
    const group = new THREE.Group();
    const ball = makeLowPolyBody(spec);
    group.add(ball, rimShell(spec.radius, rim), haloSprite(spec.radius, halo));
    scene.add(group);
    spinners.push({ obj: ball, speed: spin });
    return { group, ball };
  }

  // ---- "Happy Earth": blue oceans, sandy coasts, green low-poly continents --
  const earth = makePlanet(
    { radius: 2.0, detail: 3, bump: 0.11, lobes: 7, ramp: ["#1f5cc4", "#2f8cf0", "#5fd0ff", "#ffe6a3", "#5fe08a", "#33a766"] },
    0x9fe6ff,
    "rgba(150,225,255,0.9)",
    0.06,
  );
  earth.ball.rotation.z = 0.3; // axial tilt
  groups.earth = earth.group;

  // ---- "Bubblegum giant": faceted pastel latitude bands ----
  const giant = makePlanet(
    {
      radius: 1.5,
      detail: 3,
      bump: 0.03,
      lobes: 0,
      bands: true,
      jitter: 0.08,
      ramp: ["#ff9ec4", "#ffc2dd", "#fff1c9", "#ffd36e", "#ffb6e0", "#ff86b8"],
    },
    0xffc7e3,
    "rgba(255,180,225,0.9)",
    0.07,
  );
  groups.giant = giant.group;

  // ---- "Ringworld": peach banded body inside a chunky candy hoop ----
  const saturnGroup = new THREE.Group();
  const saturnTilt = new THREE.Group();
  saturnTilt.rotation.set(0.5, 0, 0.16); // jaunty toy tilt
  saturnGroup.add(saturnTilt);
  const saturnBall = makeLowPolyBody({
    radius: 1.05,
    detail: 3,
    bump: 0.03,
    lobes: 0,
    bands: true,
    jitter: 0.08,
    ramp: ["#ffcf87", "#ffe7b0", "#ffb86b", "#fff0cf", "#ffd99a"],
  });
  saturnTilt.add(saturnBall, rimShell(1.05, 0xffe0a8), haloSprite(1.05, "rgba(255,210,150,0.9)"), makeRing());
  scene.add(saturnGroup);
  groups.saturn = saturnGroup;
  spinners.push({ obj: saturnBall, speed: 0.05 });

  // ---- "Lil' Red": craggy coral-red low-poly world ----
  const mars = makePlanet(
    { radius: 0.7, detail: 2, bump: 0.16, lobes: 6, ramp: ["#a8301f", "#e6492f", "#ff6a45", "#ff9166", "#ffb98a"] },
    0xffb59c,
    "rgba(255,150,120,0.9)",
    0.09,
  );
  groups.mars = mars.group;

  // ---- "Mint Moon": pale mint with low-poly craters ----
  const moon = makePlanet(
    { radius: 0.5, detail: 2, bump: 0.16, lobes: 7, ramp: ["#7fc9b6", "#a6e9d6", "#cffaee", "#e8fff9", "#bff0e2"] },
    0xd8fff0,
    "rgba(200,255,240,0.9)",
    0.04,
  );
  groups.moon = moon.group;

  // ---- asteroids: chunky, lumpy stones built from a mix of low-poly solids,
  // each facet individually shaded from a stony palette so the rocks read as
  // pitted boulders rather than smooth candy balls ----
  const rockStone = ["#6b6f7a", "#7d7468", "#8a8b95", "#5c5650", "#9a8f7e", "#746b78"];
  const rockGeoms: ((s: number) => THREE.BufferGeometry)[] = [
    (s) => new THREE.DodecahedronGeometry(s, 0),
    (s) => new THREE.IcosahedronGeometry(s, 1),
    (s) => new THREE.OctahedronGeometry(s, 1),
    (s) => new THREE.TetrahedronGeometry(s, 1),
  ];
  function makeRock(size: number, kind: number): THREE.Mesh {
    const geo = rockGeoms[kind % rockGeoms.length](size).toNonIndexed();
    const p = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    // shove each vertex out/in along a few random axes for a craggy boulder
    const knobs = Array.from({ length: 3 }, () => ({ dir: randDir(), amp: 0.25 + Math.random() * 0.45 }));
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const d = v.clone().normalize();
      let m = 0.78 + Math.random() * 0.18;
      for (const kn of knobs) m += kn.amp * Math.max(0, d.dot(kn.dir)) ** 2;
      v.multiplyScalar(m);
      p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    // per-facet stone colour with brightness jitter → pitted, rocky look
    const colors = new Float32Array(p.count * 3);
    const col = new THREE.Color();
    const base = new THREE.Color(rockStone[Math.floor(Math.random() * rockStone.length)]);
    for (let f = 0; f < p.count; f += 3) {
      col.copy(base);
      const j = 0.72 + Math.random() * 0.5;
      for (let k = 0; k < 3; k++) {
        colors[(f + k) * 3] = col.r * j;
        colors[(f + k) * 3 + 1] = col.g * j;
        colors[(f + k) * 3 + 2] = col.b * j;
      }
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  }

  const rocks: Rock[] = [];
  for (let i = 0; i < 16; i++) {
    const size = 0.08 + Math.random() * 0.2;
    const mesh = makeRock(size, i);
    scene.add(mesh);
    rocks.push({
      mesh,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9),
      phase: Math.random() * Math.PI * 2,
      speed: 0.04 + Math.random() * 0.1,
      y: 0,
      z: -26,
    });
  }

  // Distance the planet cluster sits back from the camera.
  const D = 26;
  const halfHeight = () => Math.tan((cam.fov * Math.PI) / 360) * D;

  // Planets sit in a single horizontal row near the top, positioned as fractions
  // of the frustum half-HEIGHT (constant regardless of aspect). Wide screens show
  // the whole row; narrow / portrait ones just clip the outer planets off the
  // sides. They never stack vertically.
  interface PlanetLayout {
    g: THREE.Group;
    x: number; // horizontal slot, in half-height units (− left … + right)
    y: number; // height in the upper band, in half-height units
    z: number;
  }
  // Biased to the upper-right corner (positive x) so the cluster sits off to the
  // side of the centred avatar rather than directly behind it.
  const planetLayout: PlanetLayout[] = [
    { g: groups.giant, x: 0.45, y: 0.72, z: -D - 4 },
    { g: groups.saturn, x: 1.0, y: 0.5, z: -D - 5 },
    { g: groups.earth, x: 1.45, y: 0.74, z: -D },
    { g: groups.mars, x: 0.85, y: 0.2, z: -D + 3 },
    { g: groups.moon, x: 1.35, y: 0.12, z: -D + 2 },
  ];

  function layout(): void {
    const halfH = halfHeight();
    for (const p of planetLayout) {
      p.g.position.set(halfH * p.x, halfH * p.y, p.z);
    }
    for (const r of rocks) {
      r.y = halfH * (Math.random() * 1.1 - 0.2);
      r.z = -D + (Math.random() * 10 - 4);
    }
  }

  function setAspect(aspect: number): void {
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    layout();
  }

  function update(t: number, dt: number): void {
    for (const s of spinners) s.obj.rotation.y = t * s.speed;
    starsFar.rotation.y = t * 0.004;
    starsNear.rotation.y = -t * 0.007;
    (starsNear.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 2.2) * 0.25;

    const halfH = halfHeight();
    const halfW = halfH * cam.aspect;
    const span = halfW * 2.7;
    for (const r of rocks) {
      r.mesh.position.set(halfW * 1.35 - (((t * r.speed + r.phase) * halfW) % span), r.y, r.z);
      r.mesh.rotation.x += r.spin.x * dt;
      r.mesh.rotation.y += r.spin.y * dt;
      r.mesh.rotation.z += r.spin.z * dt;
    }
  }

  return { scene, cam, setAspect, update };
}
