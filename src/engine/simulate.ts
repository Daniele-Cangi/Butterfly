import { validateWorld, type Connection, type Event, type Requirement, type World } from "../world/model";

export type Feasibility = "possible" | "impossible" | "unknown";
export type Reason = { requirement: Requirement | { type: "route" }; observed: string; status: Feasibility; involved: string[]; causes: string[] };
export type TravelRole = "road" | "bridge" | "ferry";
export type TimedGeometry = { role: TravelRole; start: number; end: number; path: [number, number][] };
export type RouteStep =
  | { kind: "wait"; placeId: string; start: number; end: number; position?: [number, number] }
  | { kind: "movement"; connectionId: string; from: string; to: string; start: number; end: number; geometry: TimedGeometry[] };
export type Route = { from: string; to: string; fromPosition?: [number, number]; toPosition?: [number, number]; connectionIds: string[]; plannedDepart: number; depart: number; arrive: number; path: [number, number][]; itinerary: RouteStep[] };
export type EventResult = { id: string; name: string; time: number | null; status: Feasibility; route?: Route; reasons: Reason[] };
export type ArtifactResult = { id: string; title: string; compatibility: "supported" | "unsupported" | "unknown"; causes: string[] };
export type Simulation = { worldId: string; revision: string; events: EventResult[]; artifacts: ArtifactResult[]; derivedFacts: {key:string;value:string|number|boolean;source:"derived";eventId:string;interval:{start:number;end:number}}[] };
export type PositionSample = { status: "at-place" | "waiting" | "moving" | "unknown"; position?: [number, number]; placeId?: string; connectionId?: string; role?: TravelRole };
type ResolvedPosition = { sample: PositionSample; causes: string[] };

const ordered = <T extends { id: string }>(items: T[]) => [...items].sort((a,b) => a.id.localeCompare(b.id));
const geometryOf = (connection: Connection) => connection.segments ?? [{ role: "road" as const, duration: connection.duration, path: connection.path }];
const concatenate = (segments: {path:[number,number][]}[]) => segments.flatMap((segment, index) => index ? segment.path.slice(1) : segment.path);

function traverse(connection: Connection, earliest: number): { depart: number; arrive: number } | undefined {
  if (!connection.enabled) return;
  const options = connection.windows.map(window => ({ depart: Math.max(earliest, window.start), arrive: Math.max(earliest, window.start) + connection.duration }))
    .filter((travel, index) => travel.depart < connection.windows[index].end && travel.arrive <= connection.windows[index].end);
  // A traversal may finish exactly at the inclusive availability deadline.
  return options.sort((a,b) => a.arrive - b.arrive || a.depart - b.depart)[0];
}

export function findRoute(world: World, from: string, to: string, mode: string, start: number): Route | undefined {
  type State = { time: number; depart: number; ids: string[]; path: [number,number][]; itinerary: RouteStep[] };
  type Place = typeof world.entities[number];
  const origin = world.entities.find((entity: Place) => entity.id === from)?.visual.position;
  const initial: State = { time: start, depart: start, ids: [], path: [], itinerary: [] };
  const best = new Map<string, State>([[from, initial]]);
  const queue = [from];
  while (queue.length) {
    queue.sort((a,b) => (best.get(a)!.time - best.get(b)!.time) || a.localeCompare(b));
    const current = queue.shift()!, state = best.get(current)!;
    if (current === to) break;
    for (const connection of ordered(world.connections).filter(item => item.from === current && item.modes.includes(mode))) {
      const timing = traverse(connection, state.time);
      if (!timing) continue;
      const connectionGeometry = geometryOf(connection);
      const nextIds = [...state.ids, connection.id];
      const geometryPath = concatenate(connectionGeometry);
      const nextPath = [...state.path, ...geometryPath.slice(state.path.length ? 1 : 0)];
      const nextSteps: RouteStep[] = [...state.itinerary];
      if (timing.depart > state.time) {
        const position = state.path.at(-1) ?? world.entities.find(entity => entity.id === current)?.visual.position ?? geometryPath[0];
        nextSteps.push({ kind: "wait", placeId: current, start: state.time, end: timing.depart, ...(position ? { position } : {}) });
      }
      let segmentTime = timing.depart;
      const timedGeometry = connectionGeometry.map(segment => {
        const value = { role: segment.role, start: segmentTime, end: segmentTime + segment.duration, path: segment.path };
        segmentTime += segment.duration;
        return value;
      });
      nextSteps.push({ kind: "movement", connectionId: connection.id, from: connection.from, to: connection.to, start: timing.depart, end: timing.arrive, geometry: timedGeometry });
      const candidate: State = { time: timing.arrive, depart: state.ids.length ? state.depart : timing.depart, ids: nextIds, path: nextPath, itinerary: nextSteps };
      const previous = best.get(connection.to);
      if (!previous || candidate.time < previous.time || (candidate.time === previous.time && nextIds.join("/") < previous.ids.join("/"))) {
        best.set(connection.to, candidate);
        if (!queue.includes(connection.to)) queue.push(connection.to);
      }
    }
  }
  const found = best.get(to);
  if (!found) return undefined;
  const routeOrigin = found.path[0];
  const routeDestination = found.path.at(-1);
  const destination = world.entities.find((entity: Place) => entity.id === to)?.visual.position;
  const fromPosition = origin ?? routeOrigin;
  const toPosition = destination ?? routeDestination;
  return {
    from,
    to,
    ...(fromPosition ? { fromPosition } : {}),
    ...(toPosition ? { toPosition } : {}),
    connectionIds: found.ids,
    plannedDepart: start,
    depart: found.ids.length ? found.depart : start,
    arrive: found.time,
    path: found.path,
    itinerary: found.itinerary,
  };
}

function earliestPossibleCompletion(world: World, event: Event): number | undefined {
  if (event.kind === "dependent") {
    const parent = world.events.find(candidate => candidate.id === event.afterEventId);
    if (!parent) return undefined;
    const parentTime = earliestPossibleCompletion(world, parent);
    return parentTime === undefined ? undefined : parentTime + event.delay!;
  }
  if (event.kind === "transport") return findRoute(world, event.from!, event.to!, event.mode!, event.at!)?.arrive;
  return event.at;
}

export function simulate(input: World): Simulation {
  const world = validateWorld(input);
  const results = new Map<string, EventResult>();
  const events = ordered(world.events);
  const visiting = new Set<string>();
  function resolve(event: Event): EventResult {
    if (results.has(event.id)) return results.get(event.id)!;
    if (visiting.has(event.id)) throw new Error("Cyclic dependency: " + event.id);
    visiting.add(event.id);
    if (event.afterEventId) resolve(world.events.find(candidate => candidate.id === event.afterEventId)!);
    for (const requirement of event.requirements) if (requirement.type === "eventOccurred") resolve(world.events.find(candidate => candidate.id === requirement.eventId)!);
    const parent = event.afterEventId ? results.get(event.afterEventId) : undefined;
    const time = event.kind === "dependent" ? (parent?.time !== null && parent?.status === "possible" ? parent!.time! + event.delay! : null) : event.at!;
    const at = time ?? 0;
    const reasons: Reason[] = [];
    if (time === null) reasons.push({ requirement: { type: "route" }, observed: "Preceding event has no completion time", status: parent?.status ?? "unknown", involved: [event.afterEventId!], causes: [event.afterEventId!] });
    for (const requirement of time === null ? [] : event.requirements) {
      if (requirement.type === "eventOccurred") {
        const prior = results.get(requirement.eventId)!;
        const status: Feasibility = prior.status === "possible" ? (prior.time! <= at ? "possible" : "impossible") : prior.status;
        reasons.push({ requirement, observed: prior.time === null ? prior.status : formatTime(prior.time,world.originMinute), status, involved: [requirement.eventId], causes: [requirement.eventId] });
      } else if (requirement.type === "entityAt") {
        // Only already-scheduled movements can affect a location read. The event
        // currently being resolved has not happened yet, so its own route must
        // never become a prerequisite for its preconditions.
        for (const candidate of ordered(world.events).filter(candidate => candidate.id !== event.id && !visiting.has(candidate.id) && candidate.kind === "transport" && candidate.at! <= at && candidate.actorIds.includes(requirement.entityId))) resolve(candidate);
        const inProgressEarlierTrip = ordered(world.events).find(candidate => candidate.id !== event.id && visiting.has(candidate.id) && candidate.kind === "transport" && candidate.at! < at && candidate.actorIds.includes(requirement.entityId));
        if (inProgressEarlierTrip) throw new Error(`Cyclic temporal location dependency: ${inProgressEarlierTrip.id}`);
        const position = resolveEntityPosition(world, results, requirement.entityId, at, visiting);
        const place = position.sample.placeId;
        const status: Feasibility = position.sample.status === "unknown" || !place
          ? "unknown"
          : place === requirement.placeId ? "possible" : "impossible";
        const observed = position.sample.status === "moving" ? "in transit" : place ?? "unknown";
        reasons.push({ requirement, observed, status, involved: [requirement.entityId, requirement.placeId], causes: position.causes });
      } else {
        // Only effects which could already have completed are causal inputs to this read.
        for (const producer of ordered(world.events).filter(candidate => candidate.effects.some(effect => effect.key === requirement.key))) {
          const earliest = earliestPossibleCompletion(world, producer);
          if (earliest !== undefined && earliest <= at) resolve(producer);
        }
        const derived = [...results.values()].filter(result => result.status === "possible" && result.time !== null && result.time <= at)
          .flatMap(result => world.events.find(candidate => candidate.id === result.id)!.effects.map(effect => ({ ...effect, eventId: result.id, time: result.time! })))
          .filter(effect => effect.key === requirement.key).sort((a,b) => a.time - b.time || a.eventId.localeCompare(b.eventId)).at(-1);
        const declared = world.facts.find(fact => fact.key === requirement.key && fact.interval.start <= at && at < fact.interval.end);
        const actual = derived?.value ?? declared?.value;
        const status: Feasibility = actual === undefined ? "unknown" : actual === requirement.value ? "possible" : "impossible";
        reasons.push({ requirement, observed: actual === undefined ? "missing at this time" : String(actual), status, involved: [requirement.key], causes: derived ? [derived.eventId] : declared ? [declared.id] : [] });
      }
    }
    let route: Route | undefined;
    if (event.kind === "transport" && time !== null && reasons.every(reason => reason.status === "possible")) {
      route = findRoute(world, event.from!, event.to!, event.mode!, time);
      if (!route) reasons.push({ requirement: { type: "route" }, observed: world.networkComplete ? "No available path" : "Network incomplete", status: world.networkComplete ? "impossible" : "unknown", involved: [event.from!, event.to!], causes: ordered(world.connections).map(connection => connection.id) });
    }
    const status: Feasibility = reasons.some(reason => reason.status === "impossible") ? "impossible" : reasons.some(reason => reason.status === "unknown") ? "unknown" : "possible";
    const result: EventResult = { id: event.id, name: event.name, time: status === "possible" ? (route?.arrive ?? time) : time, status, ...(route ? { route } : {}), reasons };
    results.set(event.id, result); visiting.delete(event.id); return result;
  }
  for (const event of events) resolve(event);
  const artifacts = ordered(world.artifacts).map(artifact => {
    const checks = artifact.claims.map(claim => {
      const result = results.get(claim.eventId)!;
      return { id: claim.eventId, status: result.status === "unknown" ? "unknown" : result.status === "possible" === claim.occurred ? "supported" : "unsupported" };
    });
    return { id: artifact.id, title: artifact.title, compatibility: checks.some(check => check.status === "unsupported") ? "unsupported" : checks.some(check => check.status === "unknown") ? "unknown" : "supported", causes: checks.filter(check => check.status !== "supported").map(check => check.id) } as ArtifactResult;
  });
  const derivedFacts = [...results.values()].filter(result => result.status === "possible" && result.time !== null).flatMap(result => world.events.find(event => event.id === result.id)!.effects.map(effect => ({ key: effect.key, value: effect.value, source: "derived" as const, eventId: result.id, interval: { start: result.time!, end: world.horizon } })));
  return { worldId: world.id, revision: world.baseRevision, events: [...results.values()].sort((a,b) => a.id.localeCompare(b.id)), artifacts, derivedFacts };
}

function pointAlongPath(path: [number, number][], progress: number): [number, number] {
  if (!path.length) return [0, 0];
  if (path.length === 1) return path[0];
  const lengths = path.slice(1).map((point, index) => Math.hypot(point[0] - path[index][0], point[1] - path[index][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= Number.EPSILON) return path[0];
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const ratio = length <= Number.EPSILON ? 0 : Math.max(0, Math.min(1, remaining / length));
      return [path[index][0] + (path[index + 1][0] - path[index][0]) * ratio, path[index][1] + (path[index + 1][1] - path[index][1]) * ratio];
    }
    remaining -= length;
  }
  return path.at(-1)!;
}

export function sampleRoute(route: Route, minute: number): PositionSample {
  if (minute < route.plannedDepart) return { status: "waiting", ...(route.fromPosition ? { position: route.fromPosition } : {}), placeId: route.from };
  for (const step of route.itinerary) {
    if (step.kind === "wait" && minute >= step.start && minute < step.end) return { status: "waiting", ...(step.position ? { position: step.position } : {}), placeId: step.placeId };
    if (step.kind === "movement" && minute >= step.start && minute < step.end) {
      const geometry = step.geometry.find(segment => minute >= segment.start && minute < segment.end) ?? step.geometry.at(-1);
      if (!geometry) return { status: "moving", position: pointAlongPath(route.path, (minute - step.start) / Math.max(step.end - step.start, 1)), connectionId: step.connectionId };
      return { status: "moving", position: pointAlongPath(geometry.path, (minute - geometry.start) / Math.max(geometry.end - geometry.start, 1)), connectionId: step.connectionId, role: geometry.role };
    }
  }
  const position = route.path.length ? pointAlongPath(route.path, 1) : route.toPosition;
  return { status: "at-place", ...(position ? { position } : {}), placeId: route.to };
}

export function sampleEntity(world: World, simulation: Simulation, entityId: string, minute: number): PositionSample {
  return resolveEntityPosition(world, new Map(simulation.events.map(result => [result.id, result])), entityId, minute).sample;
}

function resolveEntityPosition(world: World, results: ReadonlyMap<string, EventResult>, entityId: string, minute: number, excludedEvents: ReadonlySet<string> = new Set()): ResolvedPosition {
  const entity = world.entities.find(candidate => candidate.id === entityId);
  if (!entity) return { sample: { status: "unknown" }, causes: [] };
  const transports = world.events.filter(event => event.kind === "transport" && event.actorIds.includes(entityId)).sort((a,b) => a.at! - b.at! || a.id.localeCompare(b.id));
  let placeId = entity.initialPlaceId;
  let position = entity.visual.position ?? (placeId ? world.entities.find(candidate => candidate.id === placeId)?.visual.position : undefined);
  let lastMovement: string | undefined;
  const unresolvedTransports: string[] = [];
  for (const event of transports) {
    if (event.at! > minute) break;
    if (excludedEvents.has(event.id)) continue;
    const result = results.get(event.id);
    if (!result || result.status === "unknown") {
      unresolvedTransports.push(event.id);
      continue;
    }
    if (result.status !== "possible" || !result.route) continue;
    if (minute < result.route.arrive) return { sample: sampleRoute(result.route, minute), causes: [event.id] };
    placeId = event.to;
    position = world.entities.find(candidate => candidate.id === placeId)?.visual.position ?? result.route.toPosition ?? position;
    lastMovement = event.id;
    unresolvedTransports.length = 0;
  }
  if (unresolvedTransports.length) return { sample: { status: "unknown", ...(position ? { position } : {}), ...(placeId ? { placeId } : {}) }, causes: unresolvedTransports };
  return placeId
    ? { sample: { status: "at-place", ...(position ? { position } : {}), placeId }, causes: lastMovement ? [lastMovement] : [] }
    : { sample: { status: "unknown", ...(position ? { position } : {}), ...(placeId ? { placeId } : {}) }, causes: [] };
}

export function getEvent(result: Simulation, id: string): EventResult { const event = result.events.find(candidate => candidate.id === id); if (!event) throw new Error("Missing event " + id); return event; }
export function formatTime(minute: number | null, originMinute=960): string { if (minute === null) return "—"; const total = Math.round(originMinute + minute); return String(Math.floor(total / 60)).padStart(2,"0") + ":" + String(total % 60).padStart(2,"0"); }
export function compare(original: Simulation, variant: Simulation) { return variant.events.map(current => { const before = getEvent(original, current.id); return { id: current.id, original: before, variant: current, timing: current.time === before.time ? "unchanged" : current.time === null || before.time === null ? "indeterminate" : current.time > before.time ? "later" : "earlier" }; }); }
