import type { Settings, TimerState } from "./core";

export type TimerCommand =
  | { type: "GET_STATE" }
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESET" }
  | { type: "SAVE_SETTINGS"; settings: Settings };

export interface TimerResponse {
  ok: boolean;
  state?: TimerState;
  error?: string;
}
