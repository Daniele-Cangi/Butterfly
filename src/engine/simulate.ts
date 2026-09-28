import { validateWorld, type Connection, type Event, type Requirement, type World } from "../world/model";

export type Feasibility = "possible" | "impossible" | "unknown";
export type Reason = { requirement: Requirement | { type: "route" }; observed: string; status: Feasibility; involved: string[]; causes: string[] };
export type Route = { connectionIds: string[]; depart: number; arrive: number; path: [number, number][] };
export type EventResult = { id: string; name: string; time: number | null; status: Feasibility; route?: Route; reasons: Reason[] };
export type ArtifactResult = { id: string; title: string; compatibility: "supported" | "unsupported" | "unknown"; causes: string[] };
export type Simulation = { worldId: string; revision: string; events: EventResult[]; artifacts: ArtifactResult[]; derivedFacts: {key:string;value:string|number|boolean;source:"derived";eventId:string;interval:{start:number;end:number}}[] };

const ordered = <T extends { id: string }>(items: T[]) => [...items].sort((a,b) => a.id.localeCompare(b.id));

function traverse(connection: Connection, earliest: number): { depart: number; arrive: number } | undefined {
  if (!connection.enabled) return;
  const options = connection.windows.map(w => ({ depart: Math.max(earliest, w.start), arrive: Math.max(earliest, w.start) + connection.duration })).filter((t,i) => t.depart < connection.windows[i].end && t.arrive <= connection.windows[i].end);
  // The end is exclusive for starting, inclusive for completing a traversal.
  return options.sort((a,b) => a.arrive - b.arrive || a.depart - b.depart)[0];
}

export function findRoute(world: World, from: string, to: string, mode: string, start: number): Route | undefined {
  const best = new Map<string, { time: number; depart: number; ids: string[]; path: [number,number][] }>([[from, { time: start, depart: start, ids: [], path: [] }]]);
  const queue = [from];
  while (queue.length) {
    queue.sort((a,b) => (best.get(a)!.time - best.get(b)!.time) || a.localeCompare(b));
    const current = queue.shift()!, state = best.get(current)!;
    for (const c of ordered(world.connections).filter(x => x.from === current && x.modes.includes(mode))) {
      const t = traverse(c, state.time); if (!t) continue;
      const ids = [...state.ids, c.id], path = [...state.path, ...c.path];
      const previous = best.get(c.to);
      if (!previous || t.arrive < previous.time || (t.arrive === previous.time && ids.join("/") < previous.ids.join("/"))) { best.set(c.to, { time: t.arrive, depart: state.ids.length ? state.depart : t.depart, ids, path }); if (!queue.includes(c.to)) queue.push(c.to); }
    }
  }
  const found = best.get(to); return found ? { connectionIds: found.ids, depart: found.depart, arrive: found.time, path: found.path } : undefined;
}

function earliestPossibleCompletion(world: World, event: Event): number | undefined {
  if (event.kind === "dependent") {
    const parent = world.events.find(candidate => candidate.id === event.afterEventId);
    if (!parent) return undefined;
    const parentTime = earliestPossibleCompletion(world, parent);
    return parentTime === undefined ? undefined : parentTime + event.delay!;
  }
  if (event.kind === "transport") {
    return findRoute(world, event.from!, event.to!, event.mode!, event.at!)?.arrive;
  }
  return event.at;
}

export function simulate(input: World): Simulation {
  const world = validateWorld(input);
  const results = new Map<string, EventResult>();
  const events = ordered(world.events);
  const visiting = new Set<string>();
  function resolve(event: Event): EventResult {
    if (results.has(event.id)) return results.get(event.id)!;
    if (visiting.has(event.id)) throw new Error(`Cyclic dependency: ${event.id}`);
    visiting.add(event.id);
    if (event.afterEventId) resolve(world.events.find(x => x.id === event.afterEventId)!);
    for (const r of event.requirements) if (r.type === "eventOccurred") resolve(world.events.find(x => x.id === r.eventId)!);
    const parent = event.afterEventId ? results.get(event.afterEventId) : undefined;
    const time = event.kind === "dependent" ? (parent?.time !== null && parent?.status === "possible" ? parent!.time! + event.delay! : null) : event.at!;
    const at = time ?? 0;
    const reasons: Reason[] = [];
    if (time === null) reasons.push({ requirement: { type: "route" }, observed: "Preceding event has no completion time", status: parent?.status ?? "unknown", involved: [event.afterEventId!], causes: [event.afterEventId!] });
    for (const r of time === null ? [] : event.requirements) {
      if (r.type === "eventOccurred") {
        const prior = results.get(r.eventId)!;
        const status: Feasibility = prior.status === "possible" ? (prior.time! <= at ? "possible" : "impossible") : prior.status;
        reasons.push({ requirement: r, observed: prior.time === null ? prior.status : `${prior.status} at ${formatTime(prior.time,world.originMinute)}`, status, involved: [r.eventId], causes: [r.eventId] });
      } else if (r.type === "entityAt") {
        const entity = world.entities.find(x => x.id === r.entityId)!;
        // Resolve every transport that could have started by this instant before
        // reading location. Event IDs are identities, not temporal ordering.
        for (const candidate of ordered(world.events).filter(candidate =>
          candidate.id !== event.id &&
          !visiting.has(candidate.id) &&
          candidate.kind === "transport" &&
          candidate.at! <= at &&
          candidate.actorIds.includes(r.entityId)
        )) resolve(candidate);
        const movement = [...results.values()]
          .filter(result => {
            const candidate = world.events.find(x => x.id === result.id);
            return result.status === "possible" && result.route !== undefined &&
              result.route.depart <= at && candidate?.actorIds.includes(r.entityId);
          })
          .sort((a, b) => a.route!.depart - b.route!.depart || a.route!.arrive - b.route!.arrive || a.id.localeCompare(b.id))
          .at(-1);
        const place = movement?.route
          ? (at >= movement.route.arrive ? world.events.find(e => e.id === movement.id)!.to! : "in transit")
          : entity.initialPlaceId;
        const status = place === r.placeId ? "possible" : place ? "impossible" : "unknown";
        reasons.push({ requirement: r, observed: place ?? "unknown", status, involved: [r.entityId, r.placeId], causes: movement ? [movement.id] : [] });
      } else {
        // Only producers that could have completed by this instant can affect
        // the read. A future event is not a dependency of the current event.
        // If a relevant producer is already being resolved, keep cycle detection
        // active: that is a real causal cycle, unlike a future scheduling entry.
        for (const producer of ordered(world.events).filter(candidate =>
          candidate.effects.some(effect => effect.key === r.key)
        )) {
          const earliest = earliestPossibleCompletion(world, producer);
          if (earliest !== undefined && earliest <= at) resolve(producer);
        }
        const derived = [...results.values()]
          .filter(result => result.status === "possible" && result.time !== null && result.time <= at)
          .flatMap(result => world.events.find(e => e.id === result.id)!.effects.map(effect => ({ ...effect, eventId: result.id, time: result.time! })))
          .filter(effect => effect.key === r.key)
          .sort((a, b) => a.time - b.time || a.eventId.localeCompare(b.eventId))
          .at(-1);
        const declared = world.facts.find(x => x.key === r.key && x.interval.start <= at && at < x.interval.end);
        const actual = derived?.value ?? declared?.value;
        const status = actual === undefined ? "unknown" : actual === r.value ? "possible" : "impossible";
        reasons.push({ requirement: r, observed: actual === undefined ? "missing at this time" : String(actual), status, involved: [r.key], causes: derived ? [derived.eventId] : declared ? [declared.id] : [] });
      }
    }
    let route: Route | undefined;
    if (event.kind === "transport" && time !== null && reasons.every(r => r.status === "possible")) {
      route = findRoute(world, event.from!, event.to!, event.mode!, time);
      if (!route) reasons.push({ requirement: { type: "route" }, observed: world.networkComplete ? "No available path" : "Network incomplete", status: world.networkComplete ? "impossible" : "unknown", involved: [event.from!, event.to!], causes: ordered(world.connections).map(c => c.id) });
    }
    const status: Feasibility = reasons.some(r => r.status === "impossible") ? "impossible" : reasons.some(r => r.status === "unknown") ? "unknown" : "possible";
    const result: EventResult = { id: event.id, name: event.name, time: status === "possible" ? (route?.arrive ?? time) : time, status, ...(route ? { route } : {}), reasons };
    results.set(event.id, result); visiting.delete(event.id); return result;
  }
  for (const e of events) resolve(e);
  const artifacts = ordered(world.artifacts).map(a => {
    const checks = a.claims.map(c => { const r = results.get(c.eventId)!; return { id: c.eventId, status: r.status === "unknown" ? "unknown" : (r.status === "possible") === c.occurred ? "supported" : "unsupported" }; });
    return { id: a.id, title: a.title, compatibility: checks.some(c => c.status === "unsupported") ? "unsupported" : checks.some(c => c.status === "unknown") ? "unknown" : "supported", causes: checks.filter(c => c.status !== "supported").map(c => c.id) } as ArtifactResult;
  });
  const derivedFacts=[...results.values()].filter(r=>r.status==="possible"&&r.time!==null).flatMap(r=>world.events.find(e=>e.id===r.id)!.effects.map(effect=>({key:effect.key,value:effect.value,source:"derived" as const,eventId:r.id,interval:{start:r.time!,end:world.horizon}})));
  return { worldId: world.id, revision: world.baseRevision, events: [...results.values()].sort((a,b) => a.id.localeCompare(b.id)), artifacts, derivedFacts };
}

export function getEvent(result: Simulation, id: string): EventResult { const event = result.events.find(x => x.id === id); if (!event) throw new Error(`Missing event ${id}`); return event; }
export function formatTime(minute: number | null, originMinute=960): string { if (minute === null) return "—"; const total = originMinute + minute; return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`; }
export function compare(original: Simulation, variant: Simulation) { return variant.events.map(v => { const o = getEvent(original, v.id); return { id: v.id, original: o, variant: v, timing: v.time === o.time ? "unchanged" : v.time === null || o.time === null ? "indeterminate" : v.time > o.time ? "later" : "earlier" }; }); }
