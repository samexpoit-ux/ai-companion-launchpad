import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_PROMPT_KEY,
  queuePendingPrompt,
  takePendingPrompt,
  wasConsumed,
  __resetConsumedTokens,
} from "./pending-prompt";

/** Minimal sessionStorage stub — the module only needs get/set/remove. */
function installStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("window", { sessionStorage: storage, localStorage: storage });
  return store;
}

describe("pending prompt hand-off", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = installStorage();
    __resetConsumedTokens();
  });

  it("hands the queued prompt to the workspace exactly once", () => {
    const token = queuePendingPrompt("build me a pricing page", "Build");
    expect(token).toBeTruthy();

    const first = takePendingPrompt();
    expect(first?.prompt).toBe("build me a pricing page");
    expect(first?.mode).toBe("Build");
    expect(wasConsumed(first!.token)).toBe(true);

    // Storage is cleared, so a second effect pass gets nothing.
    expect(takePendingPrompt()).toBeNull();
  });

  it("ignores a replayed token (idempotent)", () => {
    const token = queuePendingPrompt("hello there", "Chat")!;
    const raw = JSON.stringify({ token, prompt: "hello there", mode: "Chat", createdAt: Date.now() });

    expect(takePendingPrompt()?.token).toBe(token);

    // Simulate the same payload being written back (double navigation / restore).
    store.set(PENDING_PROMPT_KEY, raw);
    expect(takePendingPrompt()).toBeNull();
  });

  it("drops an expired prompt", () => {
    store.set(
      PENDING_PROMPT_KEY,
      JSON.stringify({
        token: "p_old",
        prompt: "stale prompt",
        mode: "Build",
        createdAt: Date.now() - 10 * 60 * 1000,
      }),
    );
    expect(takePendingPrompt()).toBeNull();
  });

  it("never queues an empty prompt", () => {
    expect(queuePendingPrompt("   ")).toBeNull();
    expect(takePendingPrompt()).toBeNull();
  });

  it("still accepts the legacy bare-string payload", () => {
    store.set(PENDING_PROMPT_KEY, JSON.stringify("legacy prompt"));
    expect(takePendingPrompt()?.prompt).toBe("legacy prompt");
  });
});
