import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";

// Primary: the app's bundled astronaut (served from /public). When opened over
// file:// the browser blocks the local fetch, so we fall back to a public VRM
// that serves with permissive CORS — the stage always shows a moving model.
const VRM_SOURCES = [
  "/astronaut.vrm",
  "https://cdn.jsdelivr.net/gh/pixiv/three-vrm@v3.5.3/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm",
];

/**
 * Loads a VRM and drives a hand-authored idle (breathing, weight-shift,
 * head/arm sway, plus a calibration wave). Mirrors the production rig in
 * src/rig/vrm.ts where it matters: we drive the NORMALIZED humanoid (canonical
 * T-pose axes) and let vrm.update() copy it to the raw bones.
 */
export class Rig {
  vrm: VRM | null = null;
  exaggeration = 1; // faithful (0) → cartoon (1): idle-motion amplitude
  // camera framing, filled from the model's geometry after load.
  camDist = 3.1;
  camY = 1.2;
  lookY = 1.0;

  private blinkClock = 0;
  private nextBlink = 2 + Math.random() * 3;
  private canBlink = false;
  private waveUntil = 0;
  private lastT = 0;
  private groundPending = false;
  private N: (name: string) => THREE.Object3D | null = () => null;

  constructor(
    private scene: THREE.Scene,
    private loadingEl: HTMLElement,
  ) {}

  async load(): Promise<void> {
    for (const url of VRM_SOURCES) {
      try {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(url);
        const v: VRM | undefined = gltf.userData.vrm;
        if (!v) throw new Error("no VRM extension");

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(v); // VRM0 faces away by default — turn to camera

        v.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            // skinned meshes keep their bind-pose bounds, so a moving avatar can
            // wrongly cull (vanishing limbs) — opt them out of frustum culling.
            mesh.frustumCulled = false;
          }
        });

        this.N = (name) => v.humanoid.getNormalizedBoneNode(name as never);
        this.canBlink = Boolean(v.expressionManager?.getExpressionTrackName("blink"));

        this.scene.add(v.scene);
        this.vrm = v;
        // The model only reaches its true standing height once vrm.update()
        // copies the normalized humanoid onto the raw bones, so grounding/
        // framing happen on the first posed frame (groundAndFrame, in update()).
        this.groundPending = true;
        return;
      } catch (e) {
        console.warn("[mock-vrm] failed to load", url, e);
      }
    }
    this.loadingEl.innerHTML =
      'VRM failed to load — run <strong style="margin:0 .35em">npm run dev</strong> here, then reload';
  }

  /** Trigger a ~1.8 s overhead wave (used by the calibrate button). */
  wave(): void {
    this.waveUntil = this.lastT + 1.8;
  }

  setExaggeration(v: number): void {
    this.exaggeration = v;
  }

  /** Called every frame from the stage tick. */
  update(t: number, dt: number): void {
    if (!this.vrm) return;
    this.lastT = t;
    this.poseIdle(t);
    this.updateBlink(dt);
    this.vrm.update(dt); // springbones (hair/cloth) + expressions, as in vrm.ts
    if (this.groundPending) {
      this.groundAndFrame();
      this.groundPending = false;
    }
  }

  private poseIdle(t: number): void {
    const set = (name: string, x: number, y: number, z: number) => {
      const b = this.N(name);
      if (b) b.rotation.set(x, y, z);
    };
    const k = 0.45 + this.exaggeration * 1.25; // expression → amplitude
    const breathe = Math.sin(t * 1.5);
    const swayA = Math.sin(t * 0.6);
    const swayB = Math.sin(t * 0.45 + 1.0);
    const look = Math.sin(t * 0.5);

    // spine / chest: breathing + gentle counter-rotation
    set("spine", breathe * 0.025 * k, swayA * 0.03 * k, 0);
    set("chest", breathe * 0.035 * k, swayB * 0.025 * k, 0);
    // hips: weight shift
    const hips = this.N("hips");
    if (hips) {
      hips.rotation.set(0, 0, swayA * 0.02 * k);
      hips.position.x = swayB * 0.015 * k;
      hips.position.y = Math.abs(breathe) * 0.006 * k;
    }
    // neck / head: idle look-around
    set("neck", breathe * 0.03 * k, look * 0.12 * k, 0);
    set("head", Math.sin(t * 0.7) * 0.05 * k, look * 0.18 * k, Math.sin(t * 0.4) * 0.04 * k);

    // arms: rest down out of T-pose (normalized axes: +z lowers the left arm,
    // -z lowers the right), plus a small living sway.
    const sway = Math.sin(t * 0.8);
    set("leftUpperArm", 0, 0, 1.18 + sway * 0.05 * k);
    set("leftLowerArm", 0, -0.18, 0.12);
    set("leftHand", 0, 0, 0);

    // right arm: idle, or mid-wave when calibrate was pressed
    if (t < this.waveUntil) {
      const w = this.waveUntil - t; // seconds remaining
      const env = Math.min(1, w) * Math.min(1, 1.8 - w); // ease in/out
      set("rightUpperArm", 0, 0, 1.95); // raised overhead
      set("rightLowerArm", 0, 0, -0.9 - Math.sin(t * 13) * 0.5 * env);
      set("rightHand", 0, 0, Math.sin(t * 13) * 0.3 * env);
    } else {
      set("rightUpperArm", 0, 0, -1.18 - Math.sin(t * 0.8 + 0.6) * 0.05 * k);
      set("rightLowerArm", 0, 0.18, -0.12);
      set("rightHand", 0, 0, 0);
    }
  }

  private updateBlink(dt: number): void {
    if (!this.canBlink || !this.vrm) return;
    this.blinkClock += dt;
    const tt = this.blinkClock - this.nextBlink;
    if (tt > 0) {
      const v = tt < 0.08 ? tt / 0.08 : tt < 0.16 ? 1 - (tt - 0.08) / 0.08 : 0;
      this.vrm.expressionManager?.setValue("blink", Math.max(0, v));
      if (tt >= 0.16) {
        this.blinkClock = 0;
        this.nextBlink = 2 + Math.random() * 3.5;
      }
    }
  }

  // Ground + frame the avatar on its first fully-posed frame. Sampling the
  // actual skinned vertices (bone transform applied) gives the true lowest/
  // highest Y — Box3.setFromObject only sees a skinned mesh's bind-pose bounds.
  private groundAndFrame(): void {
    const vrm = this.vrm;
    if (!vrm) return;
    vrm.scene.updateMatrixWorld(true);
    let minY = Infinity;
    let maxY = -Infinity;
    const tmp = new THREE.Vector3();
    vrm.scene.traverse((o) => {
      const sm = o as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh) return;
      sm.skeleton.update();
      const pos = sm.geometry.getAttribute("position");
      const step = Math.max(1, Math.floor(pos.count / 3000)); // sample, don't crawl
      for (let i = 0; i < pos.count; i += step) {
        tmp.fromBufferAttribute(pos, i);
        sm.applyBoneTransform(i, tmp); // skin the vertex to its posed position
        sm.localToWorld(tmp);
        if (tmp.y < minY) minY = tmp.y;
        if (tmp.y > maxY) maxY = tmp.y;
      }
    });
    if (isFinite(minY)) vrm.scene.position.y -= minY; // soles → y = 0
    const height = isFinite(minY) ? maxY - minY : 1.4;

    // near-eye-level camera so the whole figure stands clear of the floor, with
    // a little downtilt so the vast plane + reflection read.
    this.camDist = Math.max(2.4, height * 2.9 + 1.3);
    this.camY = height * 0.52;
    this.lookY = height * 0.46;
    this.loadingEl.classList.add("hidden");
  }
}
