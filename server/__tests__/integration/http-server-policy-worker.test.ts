import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

const originalEnv = { ...process.env };

describe("Server startup policy worker integration", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, POLICY_WORKER_MODE: "external", NODE_ENV: "test" };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("skips inline scheduler when configured for external worker", async () => {
    const logMock = jest.fn();
    const startSchedulerMock = jest.fn();
    const parseModeMock = jest.fn().mockReturnValue("external");
    const shouldRunInlineMock = jest.fn().mockReturnValue(false);

    jest.doMock("../../vite", () => ({
      log: logMock,
    }));

    jest.doMock(
      "../../worker/scheduler",
      () => ({
        startPolicyUpdateScheduler: startSchedulerMock,
        parsePolicyWorkerMode: parseModeMock,
        shouldRunInlinePolicyWorker: shouldRunInlineMock,
      }),
      { virtual: true },
    );

    jest.doMock(
      "../../services/encounterRecovery.js",
      () => ({
        encounterRecovery: {
          loadQuarantineState: jest.fn(async () => undefined),
        },
      }),
      { virtual: true },
    );

    const { handleServerStarted } = await import("../../startup");

    await handleServerStarted(5000);

    expect(parseModeMock).toHaveBeenCalledWith("external");
    expect(shouldRunInlineMock).toHaveBeenCalledWith("external");
    expect(startSchedulerMock).not.toHaveBeenCalled();
    expect(logMock).toHaveBeenCalledWith("serving on port 5000");
    expect(logMock).toHaveBeenCalledWith(
      expect.stringContaining("Policy update scheduler not started inline"),
    );
  });
});
