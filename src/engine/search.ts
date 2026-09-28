import { applyPatch, type Operation, type RealityPatch, type World } from "../world/model";
import { compare, getEvent, simulate, type Simulation } from "./simulate";

export type Goal = { eventId: string; time: number; placeId: string; requiredTypes: string[] };
export type Alternative = { id: string; operations: Operation[]; result: Simulation; differences: ReturnType<typeof compare>; shiftMinutes: number };
export type SearchResult = { status: "already-satisfied" | "found" | "exhausted" | "limit-reached" | "indeterminate"; alternatives: Alternative[]; meaningfulCount: number; groupedCount: number; examined: number; domainSize: number; maxCandidates: number; maxInterventions: number };
export type SearchConstraints = { departureNotBefore?: { eventId: string; minute: number } };
export type SearchOptions = { maxCandidates?: number; maxInterventions?: number; constraints?: SearchConstraints };

function outcomeSignature(result: Simulation): string {
  return JSON.stringify({
    events: result.events.map(event => [event.id, event.status, event.time, event.route?.connectionIds]),
    artifacts: result.artifacts.map(artifact => [artifact.id, artifact.compatibility]),
  });
}

export function keepThisMoment(world: World, currentPatch: RealityPatch, goal: Goal, options: SearchOptions = {}): SearchResult {
  const variant = applyPatch(world, currentPatch);
  const baseline = simulate(variant);
  const target = variant.events.find(e => e.id === goal.eventId);
  if (!target || target.kind !== "fixed" || target.at !== goal.time || !target.requirements.some(r=>r.type==="entityAt"&&r.placeId===goal.placeId) || !goal.requiredTypes.every(type => target.requirements.some(r => r.type === type))) throw new Error("Goal does not match the anchored event");
  const departure = options.constraints?.departureNotBefore;
  if (departure && (!Number.isInteger(departure.minute) || departure.minute < 0 || departure.minute > variant.horizon || !variant.events.some(event => event.id === departure.eventId && event.kind === "transport"))) throw new Error("Invalid departure constraint");
  if (departure && (variant.events.find(event => event.id === departure.eventId)?.at ?? -1) < departure.minute) throw new Error("Current variant violates the departure constraint");
  const bounds = { examined: 0, domainSize: 0, maxCandidates: options.maxCandidates ?? 30, maxInterventions: options.maxInterventions ?? 2 };
  if (!Number.isInteger(bounds.maxCandidates) || bounds.maxCandidates < 0 || !Number.isInteger(bounds.maxInterventions) || bounds.maxInterventions < 1) throw new Error("Invalid search limit");
  if (getEvent(baseline, goal.eventId).status === "possible") return { status: "already-satisfied", alternatives: [], meaningfulCount: 0, groupedCount: 0, ...bounds };
  const operations: Operation[] = [];
  for (const i of variant.interventions) {
    if (i.type === "setEventTime") for (const value of i.values) if (value !== variant.events.find(e => e.id === i.eventId)?.at && (i.eventId !== departure?.eventId || value >= departure.minute)) operations.push({ type: "setEventTime", eventId: i.eventId, value });
    if (i.type === "enableConnection") for (const value of i.values) if (value !== variant.connections.find(c => c.id === i.connectionId)?.enabled) operations.push({ type: "enableConnection", connectionId: i.connectionId, value });
  }
  const candidates: Operation[][] = [];
  for (const op of operations) candidates.push([op]);
  if (bounds.maxInterventions >= 2) for (let a = 0; a < operations.length; a++) for (let b = a + 1; b < operations.length; b++) { const first=operations[a], second=operations[b]; if (first.type === "setEventTime" && second.type === "setEventTime" && first.eventId === second.eventId) continue; candidates.push([first,second]); }
  bounds.domainSize = candidates.length;
  const alternatives: Alternative[] = [];
  let unknown = getEvent(baseline, goal.eventId).status === "unknown";
  for (const ops of candidates) {
    if (bounds.examined >= bounds.maxCandidates) break;
    bounds.examined++;
    let tested: World;
    try { tested = applyPatch(variant, { worldId: world.id, baseRevision: world.baseRevision, operations: ops }, currentPatch.operations); } catch { continue; }
    const result = simulate(tested), event = getEvent(result, goal.eventId);
    if (event.status === "unknown") unknown = true;
    if (event.status !== "possible" || event.time !== goal.time || tested.events.find(e => e.id === goal.eventId)?.at !== goal.time) continue;
    const difference = compare(baseline, result);
    const shiftMinutes = difference.reduce((sum, d) => sum + (d.original.time === null || d.variant.time === null ? 0 : Math.abs(d.original.time - d.variant.time)), 0);
    alternatives.push({ id: ops.map(op => JSON.stringify(op)).join("+"), operations: ops, result, differences: difference, shiftMinutes });
  }
  alternatives.sort((a,b) => a.operations.length - b.operations.length || a.shiftMinutes - b.shiftMinutes || a.id.localeCompare(b.id));
  const meaningful: Alternative[] = [];
  let groupedCount = 0;
  for (const alternative of alternatives) {
    const signature = outcomeSignature(alternative.result);
    const redundant = meaningful.some(prior => outcomeSignature(prior.result) === signature && prior.operations.every(operation => alternative.operations.some(candidate => JSON.stringify(candidate) === JSON.stringify(operation))));
    if (redundant) groupedCount++;
    else meaningful.push(alternative);
  }
  return { status: bounds.examined < bounds.domainSize ? "limit-reached" : meaningful.length ? "found" : unknown ? "indeterminate" : "exhausted", alternatives: meaningful.slice(0, 3), meaningfulCount: meaningful.length, groupedCount, ...bounds };
}

export function applyAlternative(world: World, patch: RealityPatch, goal: Goal, chosen: Alternative, options: SearchOptions = {}): RealityPatch {
  const fresh = keepThisMoment(world, patch, goal, options);
  const valid = fresh.alternatives.find(a => a.id === chosen.id);
  if (!valid) throw new Error("Alternative is stale; search again");
  return { worldId: world.id, baseRevision: world.baseRevision, operations: [...patch.operations, ...valid.operations] };
}
