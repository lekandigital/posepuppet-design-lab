/* ============================================================
   CONTROLS
   Wires the topbar buttons, side-panel sliders, and debug panel to the app.
   DOM-only: behaviour that touches the live theme / 3D stage is delegated to
   the handlers passed in from app.ts.
   ============================================================ */

export interface ControlHandlers {
  themeNext(): void;
  darkToggle(): void;
  stageBgNext(): void;
  floorToggle(): void;
  avatarSet(name: string): void;
  avatarNext(): void;
  expression(value: number): void;
  calibrate(): void;
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

export function initControls(h: ControlHandlers): void {
  // ---- avatars ----
  document.querySelectorAll<HTMLElement>(".avatar-card").forEach((card) => {
    card.addEventListener("click", () => h.avatarSet(card.dataset.avatar || ""));
  });
  $("avatar-btn").addEventListener("click", () => h.avatarNext());

  // ---- record (cosmetic toggle) ----
  let recording = false;
  const recordBtn = $("record-btn");
  recordBtn.addEventListener("click", () => {
    recording = !recording;
    recordBtn.classList.toggle("recording", recording);
    recordBtn.textContent = recording ? "■ 4s" : "● rec 15s";
    $("rec-status").textContent = recording ? "rec 4s" : "rec —";
  });

  // ---- video / camera (cosmetic toggle) ----
  let videoMode = false;
  const videoBtn = $("video-file-btn");
  videoBtn.addEventListener("click", () => {
    videoMode = !videoMode;
    videoBtn.textContent = videoMode ? "↩ camera" : "load video";
    $("camera-live-label").textContent = videoMode ? "file" : "● live";
  });

  // ---- debug panel ----
  $("panel-toggle").addEventListener("click", () => {
    $("panel").classList.toggle("hidden");
  });
  document.querySelectorAll<HTMLInputElement>(".panel-slider input").forEach((input) => {
    input.addEventListener("input", () => {
      const em = input.parentElement?.querySelector("em");
      if (em) em.textContent = input.value;
    });
  });

  // ---- expression slider ----
  $("expression-slider").addEventListener("input", (event) => {
    const v = Number((event.target as HTMLInputElement).value);
    $("expression-value").textContent = v.toFixed(1);
    h.expression(v);
  });

  // ---- experimental display menu (theme / dark / backdrop / floor) ----
  const expToggle = $("exp-toggle");
  const expPanel = $("exp-panel");
  const setExpOpen = (open: boolean) => {
    expPanel.classList.toggle("open", open);
    expToggle.setAttribute("aria-expanded", String(open));
  };
  expToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setExpOpen(!expPanel.classList.contains("open"));
  });
  // close when clicking outside the menu or pressing Escape
  document.addEventListener("click", (event) => {
    if (!expPanel.contains(event.target as Node)) setExpOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setExpOpen(false);
  });

  // ---- theme / dark / backdrop / floor ----
  $("theme-btn").addEventListener("click", () => h.themeNext());
  $("dark-btn").addEventListener("click", () => h.darkToggle());
  $("stage-bg-btn").addEventListener("click", () => h.stageBgNext());
  $("floor-toggle-btn").addEventListener("click", () => h.floorToggle());

  // ---- calibrate ----
  $("calibrate-btn").addEventListener("click", () => h.calibrate());
}
