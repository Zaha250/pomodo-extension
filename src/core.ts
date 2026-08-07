export type TimerMode = "focus" | "shortBreak" | "longBreak";
export type TimerStatus = "idle" | "running" | "paused";

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
}

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  endAt: number | null;
  remainingMs: number;
  cycleFocusCount: number;
  todayCount: number;
  statsDate: string;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function durationMs(
    mode: TimerMode,
    settings: Settings
): number {
  const minutes = {
    focus: settings.focusMinutes,
    shortBreak: settings.shortBreakMinutes,
    longBreak: settings.longBreakMinutes
  }[mode];

  return minutes * 60_000;
}

export function createDefaultState(
    now = new Date()
): TimerState {
  return {
    mode: "focus",
    status: "idle",
    endAt: null,
    remainingMs: durationMs("focus", DEFAULT_SETTINGS),
    cycleFocusCount: 0,
    todayCount: 0,
    statsDate: localDateKey(now),
    settings: { ...DEFAULT_SETTINGS }
  };
}

export function normalizeDay(
    state: TimerState,
    now = new Date()
): TimerState {
  const today = localDateKey(now);

  return state.statsDate === today
      ? state
      : {
        ...state,
        statsDate: today,
        todayCount: 0
      };
}

export function getRemainingMs(
    state: TimerState,
    now = Date.now()
): number {
  if (state.status === "running" && state.endAt !== null) {
    return Math.max(0, state.endAt - now);
  }

  return Math.max(0, state.remainingMs);
}

export function completeInterval(
    input: TimerState,
    now = new Date()
): {
  state: TimerState;
  completedMode: TimerMode;
} {
  const state = normalizeDay(input, now);
  const completedMode = state.mode;

  let nextMode: TimerMode = "focus";
  let cycleFocusCount = state.cycleFocusCount;
  let todayCount = state.todayCount;

  if (completedMode === "focus") {
    cycleFocusCount += 1;
    todayCount += 1;

    nextMode =
        cycleFocusCount >= state.settings.sessionsBeforeLongBreak
            ? "longBreak"
            : "shortBreak";

    if (nextMode === "longBreak") {
      cycleFocusCount = 0;
    }
  }

  return {
    completedMode,
    state: {
      ...state,
      mode: nextMode,
      status: "idle",
      endAt: null,
      remainingMs: durationMs(nextMode, state.settings),
      cycleFocusCount,
      todayCount
    }
  };
}

export function reconcileExpired(
    state: TimerState,
    now = new Date()
): {
  state: TimerState;
  completedMode: TimerMode | null;
} {
  const normalized = normalizeDay(state, now);

  if (
      normalized.status !== "running" ||
      normalized.endAt === null ||
      normalized.endAt > now.getTime()
  ) {
    return {
      state: normalized,
      completedMode: null
    };
  }

  return completeInterval(normalized, now);
}

export function validateSettings(
    settings: Settings
): Settings {
  const integer = (
      value: number,
      min: number,
      max: number
  ) => {
    if (!Number.isFinite(value)) {
      throw new Error("Некорректное значение");
    }

    return Math.min(max, Math.max(min, Math.round(value)));
  };

  return {
    focusMinutes: integer(settings.focusMinutes, 1, 180),
    shortBreakMinutes: integer(
        settings.shortBreakMinutes,
        1,
        60
    ),
    longBreakMinutes: integer(
        settings.longBreakMinutes,
        1,
        120
    ),
    sessionsBeforeLongBreak: integer(
        settings.sessionsBeforeLongBreak,
        1,
        12
    )
  };
}