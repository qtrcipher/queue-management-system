import { describe, expect, it } from "vitest";
import { canTransition, estimateWaitMinutes, formatTicketCode } from "./index.js";

describe("domain helpers", () => {
  it("formats ticket codes with service prefixes", () => {
    expect(formatTicketCode("a", 7)).toBe("A-007");
  });

  it("allows expected queue state transitions", () => {
    expect(canTransition("WAITING", "CALLED")).toBe(true);
    expect(canTransition("COMPLETED", "WAITING")).toBe(false);
  });

  it("estimates wait time from line length, service time, and counters", () => {
    expect(estimateWaitMinutes(6, 5, 2)).toBe(15);
    expect(estimateWaitMinutes(0, 5, 2)).toBe(0);
  });
});

