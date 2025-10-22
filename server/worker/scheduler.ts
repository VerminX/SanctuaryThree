import { scheduledPolicyUpdate } from "../services/policyUpdater";
import { log } from "../vite";

export type PolicyWorkerMode = "inline" | "external" | "disabled";

export interface SchedulerOptions {
  now?: Date;
  scheduleTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  maxRuns?: number;
}

export interface SchedulerHandle {
  stop: () => void;
}

export function parsePolicyWorkerMode(value: string | undefined): PolicyWorkerMode {
  const normalized = (value ?? "inline").toLowerCase();

  if (normalized === "external") {
    return "external";
  }

  if (normalized === "disabled") {
    return "disabled";
  }

  return "inline";
}

export function shouldRunInlinePolicyWorker(modeOrValue: PolicyWorkerMode | string | undefined): boolean {
  const mode = typeof modeOrValue === "string" ? parsePolicyWorkerMode(modeOrValue) : modeOrValue;
  return mode === "inline";
}

export function shouldRunExternalPolicyWorker(modeOrValue: PolicyWorkerMode | string | undefined): boolean {
  const mode = typeof modeOrValue === "string" ? parsePolicyWorkerMode(modeOrValue) : modeOrValue;
  return mode === "external";
}

export function startPolicyUpdateScheduler(options: SchedulerOptions = {}): SchedulerHandle {
  const { scheduleTimeout = setTimeout, maxRuns } = options;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let runs = 0;

  const getCurrentTime = () => {
    if (runs === 0 && options.now) {
      return new Date(options.now);
    }

    return new Date();
  };

  const scheduleNextUpdate = () => {
    const now = getCurrentTime();
    const nextRun = new Date(now);
    nextRun.setDate(now.getDate() + 1);
    nextRun.setHours(2, 0, 0, 0);

    const msUntilNextRun = nextRun.getTime() - now.getTime();

    log(`Next policy update scheduled for: ${nextRun.toISOString()}`);

    timeoutHandle = scheduleTimeout(async () => {
      runs += 1;
      try {
        log("Starting scheduled policy update...");
        await scheduledPolicyUpdate();
        log("Scheduled policy update completed successfully");
      } catch (error) {
        log(`Scheduled policy update failed: ${error}`);
      }

      if (maxRuns === undefined || runs < maxRuns) {
        scheduleNextUpdate();
      }
    }, msUntilNextRun);
  };

  scheduleNextUpdate();

  return {
    stop: () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    },
  };
}

export function runPolicyWorker(options?: SchedulerOptions): SchedulerHandle | undefined {
  const mode = parsePolicyWorkerMode(process.env.POLICY_WORKER_MODE);

  if (!shouldRunExternalPolicyWorker(mode)) {
    log(`Policy update worker skipped because mode "${mode}" does not require an external worker.`);
    return undefined;
  }

  log("Policy update worker started");
  return startPolicyUpdateScheduler(options);
}
