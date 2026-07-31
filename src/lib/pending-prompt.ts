export const PENDING_PROMPT_KEY = "nexusx.pendingPrompt";

/** Max age of a queued prompt — anything older is treated as stale and dropped. */
const MAX_AGE_MS = 5 * 60 * 1000;

export type PendingPrompt = {
  token: string;
  prompt: string;
  mode: string;
  createdAt: number;
};

/** Tokens already handed to a workspace in this browsing session (guards double effects). */
const consumed = new Set<string>();

/** Flip on with `localStorage.setItem("nexura.debug.handoff", "1")` to trace hand-offs. */
function debugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("nexura.debug.handoff") === "1";
  } catch {
    return false;
  }
}

function log(event: string, detail?: Record<string, unknown>) {
  if (!debugEnabled()) return;
  console.info(`[handoff] ${event}`, detail ?? {});
}

/** Test helper: forget which tokens were consumed. */
export function __resetConsumedTokens() {
  consumed.clear();
}

/** True when this token has already been handed to a workspace. */
export function wasConsumed(token: string) {
  return consumed.has(token);
}

function newToken() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Store a prompt for the workspace to pick up, returning its one-time token. */
export function queuePendingPrompt(prompt: string, mode = "Build"): string | null {
  const value = prompt.trim();
  if (!value || typeof window === "undefined") return null;
  const payload: PendingPrompt = { token: newToken(), prompt: value, mode, createdAt: Date.now() };
  try {
    window.sessionStorage.setItem(PENDING_PROMPT_KEY, JSON.stringify(payload));
    log("queued", { token: payload.token, mode, chars: value.length });
    return payload.token;
  } catch {
    return null;
  }
}

/**
 * Atomically read and clear the queued prompt. Returns null when there is nothing
 * pending, when the payload is stale, or when the same token was already consumed.
 */
export function takePendingPrompt(): PendingPrompt | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (raw) window.sessionStorage.removeItem(PENDING_PROMPT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingPrompt> | string;

    // Legacy shape: a bare prompt string.
    if (typeof parsed === "string") {
      const prompt = parsed.trim();
      return prompt ? { token: newToken(), prompt, mode: "Build", createdAt: Date.now() } : null;
    }

    const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
    const token = typeof parsed.token === "string" ? parsed.token : newToken();
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now();
    if (!prompt) return null;
    if (Date.now() - createdAt > MAX_AGE_MS) {
      log("expired", { token, ageMs: Date.now() - createdAt });
      return null;
    }
    if (consumed.has(token)) {
      log("duplicate-ignored", { token });
      return null;
    }
    consumed.add(token);
    log("consumed", { token, chars: prompt.length });
    return { token, prompt, mode: typeof parsed.mode === "string" ? parsed.mode : "Build", createdAt };
  } catch {
    // Not JSON — treat the raw value as the prompt itself.
    const prompt = raw.trim();
    return prompt ? { token: newToken(), prompt, mode: "Build", createdAt: Date.now() } : null;
  }
}
