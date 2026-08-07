import "./styles.css";
import { durationMs, getRemainingMs, type TimerMode, type TimerState } from "./core";
import type { TimerCommand, TimerResponse } from "./messages";

const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;

const timerView = $("#timer-view");
const settingsView = $("#settings-view");
const timeElement = $("#time");
const modeLabel = $("#mode-label");
const statusLabel = $("#status-label");
const timerRing = $("#timer-ring");
const toggleButton = $("#toggle-timer") as HTMLButtonElement;
const resetButton = $("#reset-timer") as HTMLButtonElement;
const startFocusButton = $("#start-focus") as HTMLButtonElement;
const todayCount = $("#today-count");
const cycleDots = $("#cycle-dots");
const timerError = $("#timer-error");
const settingsError = $("#settings-error");
let state: TimerState | null = null;

const modeNames: Record<TimerMode, string> = {
  focus: "Фокус",
  shortBreak: "Перерыв",
  longBreak: "Длинный перерыв"
};

const statusNames = {
  idle: "Готов к запуску",
  running: "Сосредоточьтесь",
  paused: "На паузе"
};

async function send(command: TimerCommand): Promise<TimerState> {
  const response = (await chrome.runtime.sendMessage(command)) as TimerResponse;
  if (!response.ok || !response.state) {
    throw new Error(response.error ?? "Не удалось обновить таймер");
  }
  return response.state;
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function render(): void {
  if (!state) return;
  const remaining = getRemainingMs(state);
  const total = durationMs(state.mode, state.settings);
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  timeElement.textContent = formatTime(remaining);
  modeLabel.textContent = modeNames[state.mode];
  statusLabel.textContent = statusNames[state.status];
  toggleButton.textContent = state.status === "running" ? "Пауза" : state.status === "paused" ? "Продолжить" : "Начать";
  startFocusButton.hidden = state.mode === "focus";
  todayCount.textContent = String(state.todayCount);
  timerRing.style.setProperty("--progress", `${progress * 360}deg`);
  document.body.dataset.mode = state.mode;

  cycleDots.replaceChildren();
  for (let index = 0; index < state.settings.sessionsBeforeLongBreak; index += 1) {
    const dot = document.createElement("span");
    dot.className = index < state.cycleFocusCount ? "cycle-dot complete" : "cycle-dot";
    cycleDots.append(dot);
  }
}

async function refreshState(): Promise<void> {
  try {
    const next = await send({ type: "GET_STATE" });
    const intervalCompleted = state?.status === "running" && next.status === "idle";
    state = next;
    render();
    if (intervalCompleted) statusLabel.textContent = "Интервал завершён";
  } catch (error) {
    timerError.textContent = error instanceof Error ? error.message : "Ошибка";
  }
}

toggleButton.addEventListener("click", async () => {
  if (!state) return;
  timerError.textContent = "";
  toggleButton.disabled = true;
  try {
    state = await send({ type: state.status === "running" ? "PAUSE" : "START" });
    render();
  } catch (error) {
    timerError.textContent = error instanceof Error ? error.message : "Ошибка";
  } finally {
    toggleButton.disabled = false;
  }
});

resetButton.addEventListener("click", async () => {
  timerError.textContent = "";
  state = await send({ type: "RESET" });
  render();
});

startFocusButton.addEventListener("click", async () => {
  timerError.textContent = "";
  startFocusButton.disabled = true;
  try {
    state = await send({ type: "START_FOCUS" });
    render();
  } catch (error) {
    timerError.textContent = error instanceof Error ? error.message : "Ошибка";
  } finally {
    startFocusButton.disabled = false;
  }
});

$("#open-settings").addEventListener("click", () => {
  if (!state) return;
  timerView.hidden = true;
  settingsView.hidden = false;
  ($("#focus-minutes") as HTMLInputElement).value = String(state.settings.focusMinutes);
  ($("#short-minutes") as HTMLInputElement).value = String(state.settings.shortBreakMinutes);
  ($("#long-minutes") as HTMLInputElement).value = String(state.settings.longBreakMinutes);
  ($("#sessions-count") as HTMLInputElement).value = String(state.settings.sessionsBeforeLongBreak);
  const inputs = settingsView.querySelectorAll<HTMLInputElement>("input");
  inputs.forEach((input) => { input.disabled = state?.status !== "idle"; });
  (settingsView.querySelector("button[type=submit]") as HTMLButtonElement).disabled = state.status !== "idle";
});

$("#close-settings").addEventListener("click", () => {
  settingsView.hidden = true;
  timerView.hidden = false;
  settingsError.textContent = "";
});

/*$("#test-notification").addEventListener("click", async () => {
  settingsError.textContent = "";

  try {
    await send({ type: "TEST_NOTIFICATION" });
  } catch (error) {
    settingsError.textContent = error instanceof Error ? error.message : "Ошибка";
  }
});*/

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsError.textContent = "";
  try {
    state = await send({
      type: "SAVE_SETTINGS",
      settings: {
        focusMinutes: Number(($(
          "#focus-minutes"
        ) as HTMLInputElement).value),
        shortBreakMinutes: Number(($(
          "#short-minutes"
        ) as HTMLInputElement).value),
        longBreakMinutes: Number(($(
          "#long-minutes"
        ) as HTMLInputElement).value),
        sessionsBeforeLongBreak: Number(($(
          "#sessions-count"
        ) as HTMLInputElement).value)
      }
    });
    render();
    settingsView.hidden = true;
    timerView.hidden = false;
  } catch (error) {
    settingsError.textContent = error instanceof Error ? error.message : "Ошибка";
  }
});

void refreshState();
setInterval(() => {
  render();
  if (state?.status === "running" && getRemainingMs(state) <= 0) {
    void refreshState();
  }
}, 250);
