import { z } from "zod";

const id = z.string().min(1);
const minute = z.number().int().min(0).max(1440);
const interval = z.object({ start: minute, end: minute });
const point = z.tuple([z.number(), z.number()]);
export const entitySchema = z.object({ id, worldId: id, kind: z.enum(["person", "place", "object"]), name: z.string(), initialPlaceId: id.optional(), visual: z.object({ kind: z.string(), color: z.string(), position: point.optional() }) });
export const connectionSchema = z.object({ id, worldId: id, from: id, to: id, modes: z.array(z.string()).min(1), duration: minute.positive(), windows: z.array(interval).min(1), enabled: z.boolean(), path: z.array(point).min(2) });
export const factSchema = z.object({ id, worldId: id, key: id, value: z.union([z.string(), z.number(), z.boolean()]), interval, source: z.literal("input") });
export const requirementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("eventOccurred"), eventId: id }),
  z.object({ type: z.literal("entityAt"), entityId: id, placeId: id }),
  z.object({ type: z.literal("factEquals"), key: id, value: z.union([z.string(), z.number(), z.boolean()]) })
]);
export const eventSchema = z.object({ id, worldId: id, kind: z.enum(["transport", "dependent", "fixed"]), name: z.string(), at: minute.optional(), afterEventId: id.optional(), delay: minute.optional(), requirements: z.array(requirementSchema), actorIds: z.array(id), from: id.optional(), to: id.optional(), mode: z.string().optional(), effects: z.array(z.object({ key: id, value: z.union([z.string(), z.number(), z.boolean()]) })) });
export const artifactSchema = z.object({ id, worldId: id, title: z.string(), body: z.string(), claims: z.array(z.object({ eventId: id, occurred: z.boolean() })) });
export const interventionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setEventTime"), eventId: id, values: z.array(minute), precondition: z.object({ minAvailableAt: minute }) }),
  z.object({ type: z.literal("enableConnection"), connectionId: id, values: z.array(z.boolean()), precondition: z.object({ requiredMode: z.string() }) })
]);
export const worldSchema = z.object({
  id, baseRevision: id, title: z.string(), origin: z.string(), originMinute: minute, horizon: minute,
  networkComplete: z.boolean(), closureEditableConnectionIds: z.array(id), visitorClosure:z.object({connectionId:id,end:minute}),featuredMoment:z.object({eventId:id,placeId:id}),entities: z.array(entitySchema), connections: z.array(connectionSchema), facts: z.array(factSchema), events: z.array(eventSchema), artifacts: z.array(artifactSchema), interventions: z.array(interventionSchema)
});
export type World = z.infer<typeof worldSchema>;
export type Event = World["events"][number];
export type Requirement = Event["requirements"][number];
export type Connection = World["connections"][number];
export type Operation = { type: "setEventTime"; eventId: string; value: number } | { type: "enableConnection"; connectionId: string; value: boolean } | { type: "setConnectionEnd"; connectionId: string; value: number };
export type RealityPatch = { worldId: string; baseRevision: string; operations: Operation[] };

export function validateWorld(input: unknown): World {
  const world = worldSchema.parse(input);
  const unique = (items: { id: string; worldId: string }[], label: string) => {
    const ids = new Set<string>();
    for (const item of items) { if (item.worldId !== world.id) throw new Error(`${label} ${item.id} belongs to another world`); if (ids.has(item.id)) throw new Error(`Duplicate ${label} ${item.id}`); ids.add(item.id); }
    return ids;
  };
  const entities = unique(world.entities, "entity"), connections = unique(world.connections, "connection"), events = unique(world.events, "event");
  unique(world.facts, "fact"); unique(world.artifacts, "artifact");
  const places = new Set(world.entities.filter(e => e.kind === "place").map(e => e.id));
  for (const e of world.entities) if (e.initialPlaceId && !places.has(e.initialPlaceId)) throw new Error(`Missing place ${e.initialPlaceId}`);
  for (const c of world.connections) {
    if (!places.has(c.from) || !places.has(c.to)) throw new Error(`Connection ${c.id} has a missing endpoint`);
    for (const w of c.windows) if (w.start >= w.end) throw new Error(`Connection ${c.id} has an invalid window`);
  }
  for (const closureId of world.closureEditableConnectionIds) if (!connections.has(closureId)) throw new Error(`Missing editable closure ${closureId}`);
  if(!world.closureEditableConnectionIds.includes(world.visitorClosure.connectionId))throw new Error("Visitor closure is not editable");
  if(!events.has(world.featuredMoment.eventId)||!places.has(world.featuredMoment.placeId))throw new Error("Featured moment reference missing");
  for (const f of world.facts) if (f.interval.start >= f.interval.end) throw new Error(`Fact ${f.id} has an invalid interval`);
  for (let a=0;a<world.facts.length;a++)for(let b=a+1;b<world.facts.length;b++){const x=world.facts[a],y=world.facts[b];if(x.key===y.key&&x.value!==y.value&&x.interval.start<y.interval.end&&y.interval.start<x.interval.end)throw new Error(`Contradictory facts for ${x.key}`)}
  for (const e of world.events) {
    if (e.kind === "dependent" && (!e.afterEventId || e.delay === undefined)) throw new Error(`Dependent event ${e.id} needs a temporal rule`);
    if (e.kind !== "dependent" && e.at === undefined) throw new Error(`Event ${e.id} needs a time`);
    if (e.kind === "transport" && (!e.from || !e.to || !e.mode || !places.has(e.from) || !places.has(e.to))) throw new Error(`Transport ${e.id} is incomplete`);
    if (e.afterEventId && !events.has(e.afterEventId)) throw new Error(`Missing preceding event ${e.afterEventId}`);
    for (const a of e.actorIds) if (!entities.has(a)) throw new Error(`Missing actor ${a}`);
    for (const r of e.requirements) {
      if (r.type === "eventOccurred" && !events.has(r.eventId)) throw new Error(`Missing required event ${r.eventId}`);
      if (r.type === "entityAt" && (!entities.has(r.entityId) || !places.has(r.placeId))) throw new Error(`Missing entity or place in ${e.id}`);
    }
  }
  const effectValues=new Map<string,string>();
  for(const e of world.events)for(const effect of e.effects){const value=JSON.stringify(effect.value),previous=effectValues.get(effect.key);if(previous!==undefined&&previous!==value)throw new Error(`Contradictory effects for ${effect.key}`);effectValues.set(effect.key,value)}
  for (const a of world.artifacts) for (const c of a.claims) if (!events.has(c.eventId)) throw new Error(`Missing claimed event ${c.eventId}`);
  for (const i of world.interventions) {
    if (i.type === "setEventTime" && !events.has(i.eventId)) throw new Error(`Missing intervention event ${i.eventId}`);
    if (i.type === "enableConnection" && !connections.has(i.connectionId)) throw new Error(`Missing intervention connection ${i.connectionId}`);
  }
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (eventId: string) => { if (visiting.has(eventId)) throw new Error(`Cyclic event dependency at ${eventId}`); if (done.has(eventId)) return; visiting.add(eventId); const e = world.events.find(x => x.id === eventId)!; for (const r of e.requirements) if (r.type === "eventOccurred") visit(r.eventId); if (e.afterEventId) visit(e.afterEventId); visiting.delete(eventId); done.add(eventId); };
  for (const e of world.events) visit(e.id);
  return world;
}

export function applyPatch(world: World, patch: RealityPatch, locks: Operation[] = []): World {
  if (patch.worldId !== world.id) throw new Error("Patch world mismatch");
  if (patch.baseRevision !== world.baseRevision) throw new Error("Stale base revision");
  const copy: World = structuredClone(world);
  for (const op of patch.operations) {
    if (locks.some(lock => lock.type === op.type && JSON.stringify(lock) !== JSON.stringify(op) && (("connectionId" in lock && "connectionId" in op && lock.connectionId === op.connectionId) || ("eventId" in lock && "eventId" in op && lock.eventId === op.eventId)))) throw new Error("Locked operation changed");
    if (op.type === "setConnectionEnd") { const c = copy.connections.find(x => x.id === op.connectionId); if (!c || !copy.closureEditableConnectionIds.includes(c.id)) throw new Error("Closure patch not allowed"); if (!Number.isInteger(op.value)||op.value <= c.windows[0].start||op.value>copy.horizon) throw new Error("Invalid closure time"); c.windows[0].end = op.value; }
    else if (op.type === "setEventTime") { const rule = copy.interventions.find((x): x is Extract<World["interventions"][number],{type:"setEventTime"}> => x.type === "setEventTime" && x.eventId === op.eventId); if (!rule || !rule.values.includes(op.value)) throw new Error("Event time intervention not allowed"); const e = copy.events.find(x => x.id === op.eventId)!; if (e.kind !== "transport" || op.value < rule.precondition.minAvailableAt) throw new Error("Departure precondition failed"); e.at = op.value; }
    else { const rule = copy.interventions.find((x): x is Extract<World["interventions"][number],{type:"enableConnection"}> => x.type === "enableConnection" && x.connectionId === op.connectionId); const c = copy.connections.find(x => x.id === op.connectionId); if (!rule || !c || !rule.values.includes(op.value) || !c.modes.includes(rule.precondition.requiredMode)) throw new Error("Connection intervention not allowed"); c.enabled = op.value; }
  }
  return validateWorld(copy);
}
