import { log } from "./vite";
import {
  parsePolicyWorkerMode,
  shouldRunInlinePolicyWorker,
  startPolicyUpdateScheduler,
} from "./worker/scheduler";

export async function handleServerStarted(port: number): Promise<void> {
  log(`serving on port ${port}`);

  try {
    const { encounterRecovery } = await import("./services/encounterRecovery.js");
    await encounterRecovery.loadQuarantineState();
  } catch (error) {
    log(`Failed to load quarantine state: ${error}`);
  }

  const policyWorkerMode = parsePolicyWorkerMode(process.env.POLICY_WORKER_MODE);

  if (shouldRunInlinePolicyWorker(policyWorkerMode)) {
    startPolicyUpdateScheduler();
  } else {
    log(`Policy update scheduler not started inline (mode: "${policyWorkerMode}")`);
  }
}
