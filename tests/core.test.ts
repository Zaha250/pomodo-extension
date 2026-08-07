import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeInterval,
  createDefaultState,
  durationMs,
  getRemainingMs,
  normalizeDay,
  reconcileExpired,
  startFocus,
  validateSettings
} from "../src/core.ts";

describe("timer core", () => {
  it("creates the classic 25 minute focus timer", () => {
    const state = createDefaultState(
        new Date(2026, 7, 7)
    );

    assert.equal(state.mode, "focus");
    assert.equal(state.remainingMs, 25 * 60_000);
    assert.equal(state.statsDate, "2026-08-07");
  });

  it("calculates remaining time from the absolute deadline", () => {
    const state = {
      ...createDefaultState(),
      status: "running" as const,
      endAt: 50_000
    };

    assert.equal(
        getRemainingMs(state, 20_000),
        30_000
    );

    assert.equal(
        getRemainingMs(state, 60_000),
        0
    );
  });

  it("offers a long break after the configured focus count", () => {
    const state = {
      ...createDefaultState(),
      cycleFocusCount: 3
    };

    const result = completeInterval(
        state,
        new Date()
    );

    assert.equal(result.state.mode, "longBreak");
    assert.equal(result.state.cycleFocusCount, 0);
    assert.equal(result.state.todayCount, 1);
  });

  it("returns to focus after a break without incrementing stats", () => {
    const initial = createDefaultState();

    const state = {
      ...initial,
      mode: "shortBreak" as const,
      todayCount: 2
    };

    const result = completeInterval(state);

    assert.equal(result.state.mode, "focus");
    assert.equal(result.state.todayCount, 2);
  });

  it("starts a new focus session while keeping completed-session counters", () => {
    const settings = {
      ...createDefaultState().settings,
      focusMinutes: 30
    };
    const breakState = {
      ...createDefaultState(),
      mode: "shortBreak" as const,
      status: "running" as const,
      endAt: 1_000,
      remainingMs: 30_000,
      cycleFocusCount: 2,
      todayCount: 2,
      settings
    };

    const result = startFocus(breakState, 10_000);

    assert.equal(result.mode, "focus");
    assert.equal(result.status, "running");
    assert.equal(result.remainingMs, 30 * 60_000);
    assert.equal(result.endAt, 10_000 + 30 * 60_000);
    assert.equal(result.cycleFocusCount, 2);
    assert.equal(result.todayCount, 2);
  });

  it("resets only the daily counter on a new local date", () => {
    const state = {
      ...createDefaultState(new Date(2026, 7, 7)),
      todayCount: 5,
      cycleFocusCount: 2
    };

    const normalized = normalizeDay(
        state,
        new Date(2026, 7, 8)
    );

    assert.equal(normalized.todayCount, 0);
    assert.equal(normalized.cycleFocusCount, 2);
  });

  it("clamps settings and uses them for durations", () => {
    const settings = validateSettings({
      focusMinutes: 999,
      shortBreakMinutes: 0,
      longBreakMinutes: 40.4,
      sessionsBeforeLongBreak: 7.7
    });

    assert.deepEqual(settings, {
      focusMinutes: 180,
      shortBreakMinutes: 1,
      longBreakMinutes: 40,
      sessionsBeforeLongBreak: 8
    });

    assert.equal(
        durationMs("longBreak", settings),
        40 * 60_000
    );
  });

  it("reconciles an expired timer only once", () => {
    const now = new Date(
        2026,
        7,
        7,
        12,
        0,
        0
    );

    const running = {
      ...createDefaultState(now),
      status: "running" as const,
      endAt: now.getTime() - 1_000
    };

    const first = reconcileExpired(running, now);
    const second = reconcileExpired(
        first.state,
        now
    );

    assert.equal(first.completedMode, "focus");
    assert.equal(first.state.todayCount, 1);
    assert.equal(second.completedMode, null);
    assert.equal(second.state.todayCount, 1);
  });
});
