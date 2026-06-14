import * as THREE from "three";

/* ============================================================
   SPACE BACKDROP
   A self-contained deep-space scene with its own fixed camera, rendered behind
   the avatar when the "space" stage backdrop is selected. Real planet textures
   (Earth + clouds + normal, Moon, Mars, Saturn + ring) live in /public/textures
   so there's no network fetch; a starfield and a drift of little asteroids
   round it out. Planets are parked in the upper-right of the view, anchored via
   the camera frustum so the corner placement survives any stage aspect.
   ============================================================ */

const TEX = "/textures/";
const loader = new THREE.TextureLoader();

function tex(file: string, srgb = true): THREE.Texture {
  const t = loader.load(TEX + file);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A spinning body we rotate every frame.
interface Spinner {
  obj: THREE.Object3D;
  speed: number;
}
// A drifting asteroid.
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

  // deep-space vertical gradient as the scene background
  scene.background = (() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, "#0b1730");
    g.addColorStop(0.5, "#070d1c");
    g.addColorStop(1.0, "#04060e");
    x.fillStyle = g;
    x.fillRect(0, 0, 16, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // a warm "sun" raking the planets from the upper right + cool ambient fill
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.8);
  sun.position.set(8, 6, 5);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x24304a, 1.1));

  // ---- starfield: two shells of points (faint blue + bright white) ----
  function makeStars(count: number, radius: number, size: number, color: number, opacity: number) {
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
      color, size, sizeAttenuation: true, transparent: true, opacity, depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }
  const starsFar = makeStars(1500, 240, 0.7, 0xa9c4ff, 0.7);
  const starsNear = makeStars(420, 150, 1.5, 0xffffff, 0.95);
  scene.add(starsFar, starsNear);

  const spinners: Spinner[] = [];
  const groups: Record<string, THREE.Group> = {};

  // ---- Earth: textured globe + drifting cloud shell + atmosphere glow ----
  const earthGroup = new THREE.Group();
  earthGroup.rotation.z = 0.36; // axial tilt
  const earthBall = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 64, 64),
    new THREE.MeshStandardMaterial({
      map: tex("earth_atmos_2048.jpg"),
      normalMap: tex("earth_normal_2048.jpg", false),
      roughness: 0.86,
      metalness: 0.0,
    }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(2.04, 48, 48),
    new THREE.MeshStandardMaterial({
      map: tex("earth_clouds_1024.png"),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4ea8ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  earthGroup.add(earthBall, clouds, atmosphere);
  scene.add(earthGroup);
  groups.earth = earthGroup;
  spinners.push({ obj: earthBall, speed: 0.05 }, { obj: clouds, speed: 0.065 });

  // ---- Moon ----
  const moonGroup = new THREE.Group();
  const moonBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 48, 48),
    new THREE.MeshStandardMaterial({ map: tex("moon_1024.jpg"), roughness: 1, metalness: 0 }),
  );
  moonGroup.add(moonBall);
  scene.add(moonGroup);
  groups.moon = moonGroup;
  spinners.push({ obj: moonBall, speed: 0.03 });

  // ---- Saturn + ring ----
  const saturnGroup = new THREE.Group();
  saturnGroup.rotation.set(0.5, 0, 0.12); // tilt the whole system
  const saturnBall = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 64, 64),
    new THREE.MeshStandardMaterial({ map: tex("2k_saturn.jpg"), roughness: 0.9, metalness: 0 }),
  );
  saturnGroup.add(saturnBall);
  // ring: remap RingGeometry UVs so the strip texture runs along the radius.
  const ringGeo = new THREE.RingGeometry(1.5, 2.6, 96, 1);
  {
    const pos = ringGeo.attributes.position;
    const uv = ringGeo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      const u = (r - 1.5) / (2.6 - 1.5);
      uv.setXY(i, u, 0.5);
    }
  }
  const ringTex = tex("2k_saturn_ring_alpha.png");
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      map: ringTex,
      alphaMap: ringTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0.95,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  saturnGroup.add(ring);
  scene.add(saturnGroup);
  groups.saturn = saturnGroup;
  spinners.push({ obj: saturnBall, speed: 0.04 });

  // ---- Mars ----
  const marsGroup = new THREE.Group();
  const marsBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 48, 48),
    new THREE.MeshStandardMaterial({ map: tex("2k_mars.jpg"), roughness: 1, metalness: 0 }),
  );
  marsGroup.add(marsBall);
  scene.add(marsGroup);
  groups.mars = marsGroup;
  spinners.push({ obj: marsBall, speed: 0.08 });

  // ---- asteroids: little flat-shaded rocks drifting across the field ----
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8a8577, roughness: 1, metalness: 0, flatShading: true,
  });
  const rocks: Rock[] = [];
  for (let i = 0; i < 16; i++) {
    const geo = new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.18, 0);
    const p = geo.attributes.position;
    for (let k = 0; k < p.count; k++) {
      p.setXYZ(
        k,
        p.getX(k) * (0.7 + Math.random() * 0.6),
        p.getY(k) * (0.7 + Math.random() * 0.6),
        p.getZ(k) * (0.7 + Math.random() * 0.6),
      );
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, rockMat);
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

  // Park planets in the upper-right of the view and seed asteroid lanes.
  function layout(): void {
    const halfH = halfHeight();
    const halfW = halfH * cam.aspect;
    groups.earth.position.set(halfW * 0.6, halfH * 0.52, -D);
    groups.moon.position.set(halfW * 0.88, halfH * 0.78, -D + 2);
    groups.saturn.position.set(halfW * 0.24, halfH * 0.92, -D - 5);
    groups.mars.position.set(halfW * 0.97, halfH * 0.22, -D + 3);
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
