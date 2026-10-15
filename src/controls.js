// Agent controls, written to be read. Everything here runs OUTSIDE any model: a model (mocked in the tests) may
// propose an action, but these functions decide whether it happens. No network calls, no dependencies.
// Illustrative code for learning, not a production library.
import { createHmac, timingSafeEqual } from "node:crypto";

// ---------- Autonomy levels and the policy that enforces them ----------
export const LEVELS = ["L0", "L1", "L2", "L3", "L4"]; // observe, recommend, prepare, execute approved, bounded autonomy
// The lowest level at which each kind of action is allowed at all.
export const MIN_LEVEL = { read: "L0", recommend: "L1", draft: "L2", execute: "L3" };
const rank = (lvl) => LEVELS.indexOf(lvl);

// Decide whether an action may run. Deterministic, deny by default, and fail closed:
// if the policy cannot be evaluated, a state-changing action is refused (reads still work).
export function decide({ level, action, approvalValid }, { policyAvailable = true } = {}) {
  const kind = action.kind; // "read" | "recommend" | "draft" | "execute"
  if (!(kind in MIN_LEVEL)) return { allow: false, reason: "unknown action kind" };
  if (kind === "read") return { allow: true, reason: "read-only" }; // safe even when the policy service is down
  if (!policyAvailable) return { allow: false, reason: "policy unavailable: failing closed" };
  if (rank(level) < rank(MIN_LEVEL[kind])) return { allow: false, reason: `needs ${MIN_LEVEL[kind]}, agent is ${level}` };
  if (kind === "execute" && level !== "L4" && !approvalValid) return { allow: false, reason: "no valid approval for this exact action" };
  return { allow: true, reason: "allowed" };
}

// ---------- Approval bound to the exact action ----------
// The token covers the fields that matter. Change any of them and the approval no longer verifies.
const canon = (a) => JSON.stringify({ type: a.type, amount: a.amount, payee: a.payee });
export function approve(action, secret) {
  return createHmac("sha256", secret).update(canon(action)).digest("hex");
}
export function approvalValid(action, token, secret) {
  if (!token) return false;
  const want = Buffer.from(approve(action, secret), "hex");
  const got = Buffer.from(String(token), "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---------- Idempotent execution ----------
// A fake payment service. It can "time out" AFTER committing, which is the dangerous case for retries.
export function createPaymentService({ timeoutAfterCommitOnce = false } = {}) {
  const committed = new Map(); // idempotency key -> action
  let timedOut = false;
  return {
    committed,
    async pay(action, key) {
      if (!committed.has(key)) committed.set(key, action);
      if (timeoutAfterCommitOnce && !timedOut) { timedOut = true; throw new Error("timeout"); }
      return { ok: true, key };
    },
    async status(key) { return committed.has(key); },
    // Counts real money movements. With a key, duplicates collapse; without one, every call counts.
    get count() { return committed.size; },
  };
}
// Safe retry: after a timeout, ask whether the action already happened before trying again.
export async function safePay(service, action, key, { retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try { return await service.pay(action, key); }
    catch (e) { if (await service.status(key)) return { ok: true, key, recovered: true }; }
  }
  throw new Error("payment failed");
}

// ---------- Budgets ----------
// Hard limits on steps and spend, so a loop that never converges still stops.
export function runWithBudget(step, { maxSteps = 20, maxCost = Infinity } = {}) {
  let steps = 0, cost = 0;
  while (steps < maxSteps) {
    const r = step(steps);
    steps++; cost += r.cost ?? 0;
    if (r.done) return { steps, cost, stoppedBy: "done" };
    if (cost >= maxCost) return { steps, cost, stoppedBy: "cost budget" };
  }
  return { steps, cost, stoppedBy: "step budget" };
}

// ---------- Release gate ----------
// Any critical failure blocks, whatever the average says. Non-critical tests need a pass rate set in advance.
export function releaseGate(results, { minPassRate = 0.9 } = {}) {
  const critical = results.filter((r) => r.critical && !r.passed);
  const passRate = results.filter((r) => r.passed).length / results.length;
  if (critical.length) return { allowed: false, reason: `critical failure: ${critical.map((r) => r.name).join(", ")}`, passRate };
  if (passRate < minPassRate) return { allowed: false, reason: `pass rate ${passRate.toFixed(2)} below ${minPassRate}`, passRate };
  return { allowed: true, reason: "no blockers", passRate };
}
// Freedom is taken back the same way it is given: a blocked gate drops the agent one level.
export function levelAfterGate(level, gate) {
  if (gate.allowed) return level;
  return LEVELS[Math.max(0, rank(level) - 1)];
}

// ---------- How much does "zero failures" prove? ----------
// With n clean trials, the 95% upper bound on the true failure rate is 1 - 0.05^(1/n), about 3/n ("rule of three").
export const upperBoundNoFailures = (n) => 1 - Math.pow(0.05, 1 / n);
