import {
  createDefaultState,
  durationMs,
  getRemainingMs,
  normalizeDay,
  reconcileExpired,
  startFocus,
  validateSettings,
  type TimerMode,
  type TimerState
} from "./core";

import type {
  TimerCommand,
  TimerResponse
} from "./messages";

const STORAGE_KEY = "pomodo.timerState";
const END_ALARM = "pomodo.timer.end";
const BADGE_ALARM = "pomodo.badge.refresh";
const NOTIFICATION_ICON_URL = chrome.runtime.getURL("icons/icon128.png");

let mutationQueue = Promise.resolve();

const badgeColors: Record<TimerMode, string> = {
  focus: "#dc4c4c",
  shortBreak: "#2f8f65",
  longBreak: "#3977c3"
};

async function loadState(): Promise<TimerState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as TimerState | undefined;

  return normalizeDay(raw ?? createDefaultState());
}

async function saveState(
    state: TimerState
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state
  });
}

function queueMutation<T>(
    operation: () => Promise<T>
): Promise<T> {
  const result = mutationQueue.then(
      operation,
      operation
  );

  mutationQueue = result.then(
      () => undefined,
      () => undefined
  );

  return result;
}

function badgeText(
    state: TimerState,
    now = Date.now()
): string {
  if (state.status === "idle") {
    return "";
  }

  const remaining = getRemainingMs(state, now);

  if (remaining <= 0) {
    return "";
  }

  if (remaining < 60_000) {
    return "‹1";
  }

  return String(Math.ceil(remaining / 60_000));
}

async function syncBadge(
    state: TimerState
): Promise<void> {
  await chrome.action.setBadgeText({
    text: badgeText(state)
  });

  await chrome.action.setBadgeBackgroundColor({
    color:
        state.status === "paused"
            ? "#737987"
            : badgeColors[state.mode]
  });
}

async function scheduleAlarms(
    state: TimerState
): Promise<void> {
  await Promise.all([
    chrome.alarms.clear(END_ALARM),
    chrome.alarms.clear(BADGE_ALARM)
  ]);

  if (
      state.status !== "running" ||
      state.endAt === null
  ) {
    return;
  }

  chrome.alarms.create(END_ALARM, {
    when: state.endAt
  });

  const remaining = state.endAt - Date.now();

  if (remaining > 0) {
    chrome.alarms.create(BADGE_ALARM, {
      when: Date.now() + Math.min(60_000, remaining)
    });
  }
}

async function notifyCompletion(
    mode: TimerMode
): Promise<void> {
  const isFocus = mode === "focus";

  await chrome.notifications.create({
    type: "basic",
    iconUrl: NOTIFICATION_ICON_URL,
    title: isFocus
        ? "Фокус завершён"
        : "Перерыв завершён",
    message: isFocus
        ? "Отличная работа. Перерыв готов — запустите его, когда будете готовы."
        : "Можно возвращаться к фокусу. Запустите новую сессию.",
    priority: 1
  });
}

async function notifyTest(): Promise<void> {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: NOTIFICATION_ICON_URL,
    title: "Pomodo: проверка уведомлений",
    message: "Уведомления Chrome работают корректно.",
    priority: 1
  });
}

async function reconcileState(
    notify: boolean
): Promise<TimerState> {
  let state = await loadState();
  const completed = reconcileExpired(state);

  state = completed.state;

  if (completed.completedMode !== null) {
    await saveState(state);
    await scheduleAlarms(state);

    if (notify) {
      await notifyCompletion(completed.completedMode);
    }
  }

  await syncBadge(state);

  return state;
}

async function handleCommand(
    command: TimerCommand
): Promise<TimerState> {
  let state = await reconcileState(true);

  switch (command.type) {
    case "GET_STATE":
      return state;

    case "START": {
      if (state.status === "running") {
        return state;
      }

      const remaining = Math.max(
          1_000,
          state.remainingMs ||
          durationMs(state.mode, state.settings)
      );

      state = {
        ...state,
        status: "running",
        endAt: Date.now() + remaining,
        remainingMs: remaining
      };

      break;
    }

    case "START_FOCUS":
      state = startFocus(state);
      break;

    case "PAUSE": {
      if (state.status !== "running") {
        return state;
      }

      state = {
        ...state,
        status: "paused",
        remainingMs: getRemainingMs(state),
        endAt: null
      };

      break;
    }

    case "RESET":
      state = {
        ...state,
        status: "idle",
        endAt: null,
        remainingMs: durationMs(
            state.mode,
            state.settings
        )
      };

      break;

    case "TEST_NOTIFICATION":
      await notifyTest();
      return state;

    case "SAVE_SETTINGS": {
      if (state.status !== "idle") {
        throw new Error(
            "Настройки можно менять только при остановленном таймере"
        );
      }

      const settings = validateSettings(
          command.settings
      );

      state = {
        ...state,
        settings,
        remainingMs: durationMs(
            state.mode,
            settings
        )
      };

      break;
    }
  }

  await saveState(state);
  await scheduleAlarms(state);
  await syncBadge(state);

  return state;
}

chrome.runtime.onMessage.addListener(
    (
        command: TimerCommand,
        _sender,
        sendResponse: (response: TimerResponse) => void
    ) => {
      queueMutation(() => handleCommand(command))
          .then((state) => {
            sendResponse({
              ok: true,
              state
            });
          })
          .catch((error: unknown) => {
            sendResponse({
              ok: false,
              error:
                  error instanceof Error
                      ? error.message
                      : "Неизвестная ошибка"
            });
          });

      return true;
    }
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (
      alarm.name === END_ALARM ||
      alarm.name === BADGE_ALARM
  ) {
    void queueMutation(async () => {
      // Alarm обновления badge может совпасть с alarm
      // завершения. Первое событие должно иметь право
      // отправить единственное уведомление.
      const state = await reconcileState(true);

      await scheduleAlarms(state);

      return state;
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void queueMutation(async () => {
    const state = await loadState();

    await saveState(state);
    await scheduleAlarms(state);
    await syncBadge(state);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void queueMutation(() =>
      reconcileState(true).then(async (state) => {
        await scheduleAlarms(state);
      })
  );
});
