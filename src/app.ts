/* ============================================================
   APP CONTROLLER
   Boots the stage, wires the controls, and owns the theme/backdrop/floor
   orchestration so the palette, the CSS surfaces, and the 3D stage stay in sync.
   ============================================================ */

import { state, STAGE_BGS } from "./state";
import { THEMES, toDark, applyThemeVars } from "./theme";
import { createStage, type Stage } from "./stage/scene";
import { drawCamera, startAmbient, setAmbientVisible } from "./stage/ambient";
import { initControls } from "./ui/controls";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

let stage: Stage;

// Resolve the active palette (light or dark), push it to the CSS variables, and
// retint the 2D camera preview + the 3D stage.
function paintTheme(): void {
  const entry = THEMES[state.themeIdx];
  state.theme = state.dark ? toDark(entry.theme) : entry.theme;
  applyThemeVars(state.theme);
  $("theme-btn").textContent = "theme · " + entry.name;
  drawCamera();
  stage.applyTheme(state.theme, state.dark);
}

function setAvatar(name: string): void {
  if (!name) return;
  state.avatar = name;
  $("stage-avatar-label").textContent = name;
  $("avatar-btn").textContent = "avatar: " + name;
  document.querySelectorAll<HTMLElement>(".avatar-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.avatar === name);
  });
}

export function boot(): void {
  // initial document flags the CSS keys off
  const root = document.documentElement;
  root.setAttribute("data-stage-bg", state.stageBg);
  root.setAttribute("data-floor", state.floorOn ? "on" : "off");

  // reflect the initial dark setting (may be on via the OS preference)
  root.setAttribute("data-mode", state.dark ? "dark" : "light");
  const darkBtn = $("dark-btn");
  darkBtn.setAttribute("aria-pressed", String(state.dark));
  darkBtn.textContent = "dark: " + (state.dark ? "on" : "off");

  stage = createStage();

  // reflect the initial state into the 3D stage + control labels
  stage.setSpaceEnabled(state.stageBg === "space");
  stage.setFloor(state.floorOn);
  setAmbientVisible(state.floorOn);
  $("stage-bg-btn").textContent = "bg: " + state.stageBg;
  const floorBtn = $("floor-toggle-btn");
  floorBtn.textContent = "floor: " + (state.floorOn ? "on" : "off");
  floorBtn.setAttribute("aria-pressed", String(!state.floorOn));

  initControls({
    themeNext: () => {
      state.themeIdx = (state.themeIdx + 1) % THEMES.length;
      paintTheme();
    },
    darkToggle: () => {
      state.dark = !state.dark;
      root.setAttribute("data-mode", state.dark ? "dark" : "light");
      const btn = $("dark-btn");
      btn.setAttribute("aria-pressed", String(state.dark));
      btn.textContent = "dark: " + (state.dark ? "on" : "off");
      paintTheme();
    },
    stageBgNext: () => {
      const idx = (STAGE_BGS.indexOf(state.stageBg) + 1) % STAGE_BGS.length;
      state.stageBg = STAGE_BGS[idx];
      root.setAttribute("data-stage-bg", state.stageBg);
      $("stage-bg-btn").textContent = "bg: " + state.stageBg;
      stage.setSpaceEnabled(state.stageBg === "space");
    },
    floorToggle: () => {
      state.floorOn = !state.floorOn;
      stage.setFloor(state.floorOn);
      setAmbientVisible(state.floorOn);
      root.setAttribute("data-floor", state.floorOn ? "on" : "off");
      const btn = $("floor-toggle-btn");
      btn.setAttribute("aria-pressed", String(!state.floorOn));
      btn.textContent = "floor: " + (state.floorOn ? "on" : "off");
    },
    avatarSet: setAvatar,
    avatarNext: () => {
      const order = ["robot", "astronaut", "woody"];
      setAvatar(order[(order.indexOf(state.avatar) + 1) % order.length]);
    },
    expression: (v) => stage.setExaggeration(v),
    calibrate: () => {
      $("coach-stage").textContent = "calibrating";
      $("coach-copy").textContent = "3… 2… 1… neutral pose captured. Keep your full body visible.";
      stage.wave();
      setTimeout(() => {
        $("coach-stage").textContent = "tracking";
        $("coach-copy").textContent =
          "Move slowly first, then test waves, leaning, wrists, and face-touch alignment.";
      }, 900);
    },
  });

  // boot: paint the initial theme (now that the 3D stage exists), then start the
  // 2D backdrop + camera preview loops.
  paintTheme();
  drawCamera();
  startAmbient();
}
