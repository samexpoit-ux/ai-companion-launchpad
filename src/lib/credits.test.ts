import { describe, expect, it } from "vitest";
import { clampChainToCeiling, CODING_PRIMARY, CHEAP_CHAT, TIER_CHAINS } from "./model-tiers";
import { estimateCost, actionForMode } from "./credits";

describe("plan-aware routing", () => {
  it("free/cheap ceiling never reaches the premium coding models", () => {
    const chain = clampChainToCeiling(TIER_CHAINS.code, "cheap");
    expect(chain).not.toContain(CODING_PRIMARY);
    expect(chain[0]).toBe(CHEAP_CHAT);
  });

  it("premium ceiling keeps the full chain", () => {
    expect(clampChainToCeiling(TIER_CHAINS.code, "premium")[0]).toBe(CODING_PRIMARY);
  });

  it("free ceiling still returns a runnable model", () => {
    expect(clampChainToCeiling(TIER_CHAINS.code, "free").length).toBeGreaterThan(0);
  });
});

describe("credit rules", () => {
  it("charges coding more than chat", () => {
    expect(estimateCost("code")).toBeGreaterThan(estimateCost("chat"));
  });

  it("scales with input size", () => {
    expect(estimateCost("code", 4000)).toBeGreaterThan(estimateCost("code", 0));
  });

  it("maps composer modes to actions", () => {
    expect(actionForMode("Plan")).toBe("plan");
    expect(actionForMode("Chat")).toBe("chat");
    expect(actionForMode("Build")).toBe("code");
  });
});
