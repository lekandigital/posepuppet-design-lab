import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { Rig } from "../rig/vrm";
import { createSpace, type Space } from "./space";
import type { Theme } from "../theme";

/* ============================================================
   LIVE VRM STAGE  (real three.js + @pixiv/three-vrm — same stack as the repo)
   A moving avatar on a reflective frosted-glass floor, tinted live by the theme
   engine. When the "space" backdrop is active, a deep-space scene is rendered
   behind it; otherwise the WebGL canvas is cleared transparent so the frosted
   CSS frame (studio / graphite / tinted) shows through.
   ============================================================ */

const arr2col = (a: number[]) => new THREE.Color(a[0] / 255, a[1] / 255, a[2] / 255);
// "#rrggbb" → [r,g,b] 0..255 (theme tokens that aren't kept as arrays)
function hexArr(h: string): number[] {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface Stage {
  applyTheme(theme: Theme, dark: boolean): void;
  setFloor(on: boolean): void;
  setSpaceEnabled(on: boolean): void;
  setExaggeration(v: number): void;
  wave(): void;
}

export function createStage(): Stage {
  const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement;
  const frame = canvas.closest(".stage-frame") as HTMLElement;
  const loadingEl = document.getElementById("stage-loading") as HTMLElement;

  // ---- renderer: transparent so the CSS frosted-glass cyclorama shows through
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false; // we paint the space backdrop, then the avatar on top

  const scene = new THREE.Scene();

  const cam3d = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  cam3d.position.set(0, 1.25, 3.1);

  // ---- lights (ported from src/stage/scene.ts; rim follows the accent) ----
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1.6, 3.2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -2;
  key.shadow.camera.right = 2;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 6;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x4cc2ff, 1.5);
  rim.position.set(-2.4, 2.0, -2.4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-1.5, 1.0, 2.5);
  scene.add(fill);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  // ============================================================
  // FROSTED-GLASS REFLECTIVE FLOOR — a vast plane
  // A real planar Reflector gives the avatar a true mirror image; a soft
  // ShadowMaterial plane grounds it. The plane recedes past the frame to a
  // horizon, so the avatar stands on a seamless reflective glass floor.
  // ============================================================
  const FLOOR_SIZE = 120;

  const reflector = new Reflector(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), {
    textureWidth: 2048,
    textureHeight: 2048,
    color: 0xb9c0d0, // reflection tint; themed below
    clipBias: 0.0032,
  });
  reflector.rotation.x = -Math.PI / 2;

  // A Reflector over a transparent canvas reflects "nothing" as black, which
  // swallows dark parts of the avatar. Patch the fragment so empty floor reads
  // as a pale frosted-GLASS base and the avatar's reflection only paints through
  // where it's bright; a soft distance fade melts the far plane into the bg.
  const refMat = reflector.material as THREE.ShaderMaterial;
  const refU = refMat.uniforms as Record<string, { value: unknown }>;
  refU.uGlass = { value: new THREE.Color(0xdfe3ee) };
  refU.uReflStrength = { value: 2.4 };
  refMat.fragmentShader = refMat.fragmentShader
    .replace(
      "uniform vec3 color;",
      "uniform vec3 color;\nuniform vec3 uGlass;\nuniform float uReflStrength;\nvarying vec3 vWorld;",
    )
    .replace(
      "void main() {",
      "void main() {\n\t\tfloat _fade = 1.0 - smoothstep( 6.0, 26.0, length( vWorld.xz ) );",
    )
    .replace(
      "gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );",
      "float _l = dot( base.rgb, vec3( 0.299, 0.587, 0.114 ) );\n\t\tgl_FragColor = vec4( mix( uGlass, blendOverlay( base.rgb, color ), clamp( _l * uReflStrength, 0.0, 1.0 ) ), _fade );",
    );
  refMat.vertexShader = refMat.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
    .replace(
      "#include <project_vertex>",
      "#include <project_vertex>\nvWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;",
    );
  refMat.transparent = true; // let the far plane fade out
  refMat.needsUpdate = true;
  scene.add(reflector);

  // soft contact shadow on the glass (transparent except where the avatar shades it)
  const shadowFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.ShadowMaterial({ opacity: 0.3 }),
  );
  shadowFloor.rotation.x = -Math.PI / 2;
  shadowFloor.position.y = 0.002;
  shadowFloor.receiveShadow = true;
  shadowFloor.renderOrder = 1;
  scene.add(shadowFloor);

  // ---- avatar + space backdrop ----
  const rig = new Rig(scene, loadingEl);
  rig.load();
  const space: Space = createSpace();
  let spaceEnabled = false;

  // ============================================================
  // theme → 3D: retint rim + floor + ambient to the live palette / mode
  // ============================================================
  function applyTheme(T: Theme, dark: boolean): void {
    const accent = arr2col(T.accent2Arr || T.accentArr);
    rim.color.copy(accent);
    rim.intensity = dark ? 2.4 : 1.5;
    ambient.intensity = dark ? 0.35 : 0.55;
    key.intensity = dark ? 1.8 : 2.2;
    // reflection tint (multiplies the mirrored avatar)
    (refU.color.value as THREE.Color).set(dark ? 0x9aa2b6 : 0xc7cedd);
    // the empty-floor glass: a pale cool wash of the accent in light mode, a
    // deep tinted glass in dark mode — so the legs always read against it.
    const base = dark
      ? arr2col(T.page2 ? hexArr(T.page2) : [22, 24, 34])
      : accent.clone().lerp(new THREE.Color(0xffffff), 0.82);
    (refU.uGlass.value as THREE.Color).copy(base);
    refU.uReflStrength.value = dark ? 3.0 : 2.4;
  }

  function setFloor(on: boolean): void {
    reflector.visible = on;
    shadowFloor.visible = on;
  }

  function setSpaceEnabled(on: boolean): void {
    spaceEnabled = on;
  }

  // ============================================================
  // resize + render loop
  // ============================================================
  function resize(): void {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam3d.aspect = w / h;
    cam3d.updateProjectionMatrix();
    space.setAspect(w / h);
  }
  new ResizeObserver(resize).observe(frame);
  resize();

  const clock = new THREE.Clock();
  function tick(): void {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();

    // slow, elegant orbit so the avatar + its reflection read in 3D
    const a = Math.sin(t * 0.12) * 0.45;
    cam3d.position.set(Math.sin(a) * rig.camDist, rig.camY + Math.sin(t * 0.5) * 0.02, Math.cos(a) * rig.camDist);
    cam3d.lookAt(0, rig.lookY, 0);

    rig.update(t, dt);
    if (spaceEnabled) space.update(t, dt);

    renderer.clear();
    if (spaceEnabled) {
      // space behind, then the avatar + glass floor on top (depth cleared between)
      renderer.render(space.scene, space.cam);
      renderer.clearDepth();
    }
    renderer.render(scene, cam3d);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    applyTheme,
    setFloor,
    setSpaceEnabled,
    setExaggeration: (v) => rig.setExaggeration(v),
    wave: () => rig.wave(),
  };
}
