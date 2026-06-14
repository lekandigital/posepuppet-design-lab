import { THEMES, type Theme } from "./theme";

// Studio backdrops cycled by the "bg" button. "space" is the new deep-space
// scene; the others redress the frosted CSS frame (see styles.css).
export const STAGE_BGS = ["studio", "graphite", "tinted", "space"] as const;
export type StageBg = (typeof STAGE_BGS)[number];

export interface AppState {
  avatar: string;
  recording: boolean;
  videoMode: boolean;
  mirror: boolean;
  dark: boolean;
  themeIdx: number;
  stageBg: StageBg;
  floorOn: boolean;
  /** the live (light- or dark-resolved) theme the canvases read from */
  theme: Theme;
}

export const state: AppState = {
  avatar: "astronaut",
  recording: false,
  videoMode: false,
  mirror: true,
  dark: false,
  themeIdx: 0,
  stageBg: "studio",
  floorOn: true,
  theme: THEMES[0].theme,
};
