/**
 * Small timer helpers for the server and the CLI.
 *
 * Node-side only: `node:timers/promises` has no browser equivalent, and
 * `src/utils.ts` is shared with the browser bundle, so these live here.
 * The internal alias is `delay`, never the bare `setTimeout`: the global
 * one stays untouched for the tests' fake clock except where Vitest is told
 * to fake the Node builtins too.
 */
import { setTimeout as delay } from "node:timers/promises";

/**
 * Wait `ms`; an aborted signal rejects with an `AbortError`.
 *
 * This is the promisified `setTimeout` with the signal wired through, so an
 * abort ends the wait at once instead of waiting out the delay.
 *
 * @param ms how long to wait
 * @param signal aborts the wait; without one this is a plain delay
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return delay(ms, undefined, signal ? { signal } : undefined);
}

/**
 * Start a delay that can be cancelled, without touching any other signal.
 *
 * Rejecting with an `AbortError` on cancel is the documented
 * `timers/promises` semantics; nobody awaits the rejection here.
 *
 * @param ms how long to wait unless cancelled first
 * @returns the pending wait and a cancel for settling it early
 */
export function startDelay(ms: number): { finished: Promise<void>; cancel: () => void } {
  const canceller = new AbortController();
  const finished = delay(ms, undefined, { signal: canceller.signal });
  finished.catch(() => {});

  return { finished, cancel: () => canceller.abort() };
}

/**
 * Abort after `ms` unless cancelled first: a deadline for one operation.
 *
 * Cancelling only stops the timer — the signal stays clean, so a settled
 * operation never looks aborted.
 *
 * @param ms how long before the signal aborts
 * @returns the signal and a cancel for when the operation settles first
 */
export function abortAfter(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = startDelay(ms);
  // The rejection on cancel is expected; only the abort itself matters here.
  void timer.finished.then(() => controller.abort()).catch(() => {});

  return { signal: controller.signal, cancel: timer.cancel };
}
