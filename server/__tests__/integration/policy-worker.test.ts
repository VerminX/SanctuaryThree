import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import type { SchedulerHandle } from "../../worker/scheduler";

jest.mock("../../services/policyUpdater", () => ({
  scheduledPolicyUpdate: jest.fn(async () => undefined),
}));

jest.mock("../../vite", () => ({
  log: jest.fn(),
  setupVite: jest.fn(),
  serveStatic: jest.fn(),
}));

describe("Policy worker execution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, POLICY_WORKER_MODE: "external" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("executes a scheduled policy update when run in external mode", async () => {
    const callbacks: Array<() => Promise<void> | void> = [];

    const scheduleTimeout = jest.fn((callback: () => Promise<void> | void, _ms: number) => {
      callbacks.push(callback);
      return {
        ref: jest.fn(),
        unref: jest.fn(),
      } as unknown as ReturnType<typeof setTimeout>;
    });

    const { runPolicyWorker } = await import("../../worker/scheduler");
    const { scheduledPolicyUpdate } = await import("../../services/policyUpdater");

    const handle: SchedulerHandle | undefined = runPolicyWorker({
      now: new Date("2024-01-01T01:00:00Z"),
      scheduleTimeout,
      maxRuns: 1,
    });

    expect(handle).toBeDefined();
    expect(scheduleTimeout).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(1);

    const [callback] = callbacks;
    await callback();

    expect((scheduledPolicyUpdate as jest.Mock)).toHaveBeenCalledTimes(1);

    handle?.stop();
  });
});
