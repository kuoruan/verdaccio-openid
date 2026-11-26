import { describe, expect, it, vi } from "vitest";
import { abortAfter, sleep, startDelay } from "@/timers";

describe("sleep", () => {
  it("resolves after the delay", async () => {
    await expect(sleep(10)).resolves.toBeUndefined();
  });

  it("rejects with an AbortError when aborted", async () => {
    // Documented timers/promises semantics: the rejection is an AbortError,
    // not the signal's reason. Callers that care read `signal.reason`
    // themselves — the CLI timeout branch only checks `signal.aborted`.
    const controller = new AbortController();
    const pending = sleep(10_000, controller.signal);
    controller.abort(new Error("gone"));

    await expect(pending).rejects.toThrow(/abort/i);
  });
});

describe("startDelay", () => {
  it("settles the wait when cancelled", async () => {
    const { finished, cancel } = startDelay(10_000);
    const assertion = expect(finished).rejects.toThrow(/abort/i);
    cancel();

    await assertion;
  });

  it("resolves on time when left alone", async () => {
    const { finished, cancel } = startDelay(10);
    await expect(finished).resolves.toBeUndefined();
    cancel();
  });
});

describe("abortAfter", () => {
  it("aborts after the delay unless cancelled", async () => {
    vi.useFakeTimers({ fakeNodeBuiltins: true });
    try {
      const { signal, cancel } = abortAfter(1_000);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(signal.aborted).toBe(true);
      cancel();
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the signal clean when cancelled", async () => {
    const { signal, cancel } = abortAfter(1_000);
    cancel();
    await sleep(10);

    expect(signal.aborted).toBe(false);
  });

  it("stays quiet when cancelled first", async () => {
    vi.useFakeTimers({ fakeNodeBuiltins: true });
    try {
      const { signal, cancel } = abortAfter(1_000);
      cancel();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(signal.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
