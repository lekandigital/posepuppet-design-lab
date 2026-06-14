import { state } from "../state";

/* ============================================================
   2D AMBIENT LAYER
   The turntable light-pool / ripple rings painted behind the live WebGL layer
   (visible in the studio / graphite / tinted backdrops, hidden under the opaque
   space scene), plus the stylised camera-preview drawing. Both read the live
   theme from state.theme.
   ============================================================ */

const stage = document.getElementById("stage-fx") as HTMLCanvasElement;
const stageCtx = stage.getContext("2d")!;
const camera = document.getElementById("camera-canvas") as HTMLCanvasElement;
const cameraCtx = camera.getContext("2d")!;

// A stand-in "webcam feed" still image, used to eyeball how a real frame reads
// through the translucent glass camera card. Redraws once it has loaded.
const camImg = new Image();
camImg.src = "/webcam-test.png";
camImg.onload = () => drawCamera();

function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(rect.width * dpr));
  const H = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawStage(now: number): void {
  const T = state.theme;
  resizeCanvas(stage, stageCtx);
  const w = stage.clientWidth;
  const h = stage.clientHeight;

  stageCtx.clearRect(0, 0, w, h);
  const ac = (a: number | string) => "rgba(" + T.accentRgb + ", " + a + ")";

  const cx = w / 2;
  const FIG = 1.5; // hero scale — the model is the subject, not chrome
  const base = h * 0.72; // model origin (torso/head reference)
  const floorY = base + 60 * FIG; // turntable plane, level with the feet

  const t = (now || 0) * 0.001;
  const G = T.glow;
  const padR = Math.min(w * 0.3, 300); // turntable radius (across)
  const padRy = padR * 0.3; // flattened for perspective
  const breathe = 0.5 + 0.5 * Math.sin(t * 0.5); // slow 0..1

  const disc = (rx: number, ry: number) => {
    stageCtx.beginPath();
    stageCtx.ellipse(cx, floorY, rx, ry, 0, 0, Math.PI * 2);
  };

  // glassy pool of light resting on the disc (clipped to the ellipse)
  stageCtx.save();
  disc(padR, padRy);
  stageCtx.clip();

  const sheen = stageCtx.createRadialGradient(cx, floorY, 2, cx, floorY, padR);
  sheen.addColorStop(0, "rgba(255, 255, 255, " + (0.1 * G).toFixed(3) + ")");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  stageCtx.fillStyle = sheen;
  stageCtx.fillRect(0, 0, w, h);

  const bloom = stageCtx.createRadialGradient(cx, floorY, 2, cx, floorY, padR);
  bloom.addColorStop(0, ac(((0.05 + 0.03 * breathe) * G).toFixed(3)));
  bloom.addColorStop(0.55, ac((0.02 * G).toFixed(3)));
  bloom.addColorStop(1, ac(0));
  stageCtx.fillStyle = bloom;
  stageCtx.fillRect(0, 0, w, h);

  // a couple of faint static rings give the disc some texture
  stageCtx.lineWidth = 1;
  for (let r = 0.34; r < 1; r += 0.33) {
    stageCtx.strokeStyle = ac((0.03 * G).toFixed(3));
    disc(padR * r, padRy * r);
    stageCtx.stroke();
  }
  stageCtx.restore();

  // ripple rings expanding outward from the centre, fading in and out
  const period = 5.5;
  for (let p = 0; p < 3; p++) {
    const phase = (t / period + p / 3) % 1; // 0 (centre) -> 1 (rim)
    const env = Math.sin(Math.PI * phase); // soft fade at both ends
    stageCtx.strokeStyle = ac((0.1 * env * G).toFixed(3));
    stageCtx.lineWidth = 1.5;
    stageCtx.shadowColor = ac((0.3 * G).toFixed(3));
    stageCtx.shadowBlur = 12 * env;
    disc(padR * phase, padRy * phase);
    stageCtx.stroke();
  }
  stageCtx.shadowBlur = 0;

  // turntable rim — a soft breathing outline
  stageCtx.strokeStyle = ac(((0.1 + 0.06 * breathe) * G).toFixed(3));
  stageCtx.lineWidth = 1.5;
  disc(padR, padRy);
  stageCtx.stroke();

  // Caption sits on the ambient layer, beneath the live 3D avatar.
  stageCtx.shadowColor = "transparent";
  stageCtx.fillStyle = T.muted;
  stageCtx.font = '800 12px "Avenir Next", "Nunito", ui-sans-serif, system-ui';
  stageCtx.fillText("live vrm · idle motion · reflective glass floor", 24, h - 24);
}

export function drawCamera(): void {
  const T = state.theme;
  resizeCanvas(camera, cameraCtx);
  const w = camera.clientWidth;
  const h = camera.clientHeight;

  cameraCtx.clearRect(0, 0, w, h);

  // Stand-in webcam frame: drawn cover-fit so the card's translucency can be
  // judged against a real image. Falls back to the stylised figure below until
  // the PNG has loaded.
  if (camImg.complete && camImg.naturalWidth > 0) {
    const ir = camImg.naturalWidth / camImg.naturalHeight;
    const cr = w / h;
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;
    if (ir > cr) {
      dh = h;
      dw = h * ir;
      dx = (w - dw) / 2;
    } else {
      dw = w;
      dh = w / ir;
      dy = (h - dh) / 2;
    }
    // Draw the "feed" itself at reduced alpha so it behaves like a transparent
    // overlay — the stage scene behind the card shows through the image.
    cameraCtx.globalAlpha = 0.45;
    cameraCtx.drawImage(camImg, dx, dy, dw, dh);
    cameraCtx.globalAlpha = 1;
    return;
  }

  const ac = (a: number) => "rgba(" + T.accentRgb + ", " + a + ")";
  // translucent cool feed — the card glass + space behind read through it
  const camBg = cameraCtx.createLinearGradient(0, 0, 0, h);
  camBg.addColorStop(0, "rgba(20, 46, 68, 0.55)");
  camBg.addColorStop(1, "rgba(10, 26, 42, 0.66)");
  cameraCtx.fillStyle = camBg;
  cameraCtx.fillRect(0, 0, w, h);

  cameraCtx.strokeStyle = ac(0.16);
  for (let x = 0; x < w; x += 40) {
    cameraCtx.beginPath();
    cameraCtx.moveTo(x, 0);
    cameraCtx.lineTo(x, h);
    cameraCtx.stroke();
  }

  const cx = w / 2;
  const cy = h * 0.58;

  cameraCtx.fillStyle = T.tint1;
  cameraCtx.strokeStyle = T.accent;
  cameraCtx.lineWidth = 1;

  cameraCtx.beginPath();
  cameraCtx.arc(cx, cy - 45, 22, 0, Math.PI * 2);
  cameraCtx.fill();
  cameraCtx.stroke();

  cameraCtx.fillRect(cx - 34, cy - 18, 68, 48);
  cameraCtx.strokeRect(cx - 34, cy - 18, 68, 48);

  cameraCtx.strokeStyle = T.accent;
  cameraCtx.beginPath();
  cameraCtx.moveTo(cx - 34, cy);
  cameraCtx.lineTo(cx - 80, cy + 4);
  cameraCtx.moveTo(cx + 34, cy);
  cameraCtx.lineTo(cx + 80, cy + 4);
  cameraCtx.moveTo(cx - 16, cy + 30);
  cameraCtx.lineTo(cx - 26, cy + 82);
  cameraCtx.moveTo(cx + 16, cy + 30);
  cameraCtx.lineTo(cx + 26, cy + 82);
  cameraCtx.stroke();

  cameraCtx.fillStyle = T.white;
  const pts = [[cx, cy - 45], [cx - 34, cy], [cx + 34, cy], [cx - 80, cy + 4], [cx + 80, cy + 4]];
  for (const p of pts) {
    cameraCtx.beginPath();
    cameraCtx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    cameraCtx.fill();
    cameraCtx.stroke();
  }
}

/** Show/hide the 2D ambient turntable (toggled with the floor). */
export function setAmbientVisible(on: boolean): void {
  stage.style.display = on ? "" : "none";
}

/** Start the 2D ambient backdrop RAF loop and keep the camera preview in sync. */
export function startAmbient(): void {
  const loop = (now: number) => {
    drawStage(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("resize", drawCamera);
}
