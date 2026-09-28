import { validateWorld, type World } from "../world/model";

type RecordValue = Record<string, unknown>;
const record = (value: unknown) => value as RecordValue;
const list = (value: unknown) => value as RecordValue[];
const keyed = <T extends object>(items: T[]) => items.map((item, index) => ({ _key: String(index), ...item }));
const json = (value: string | number | boolean) => JSON.stringify(value);
const parsed = (value: unknown) => JSON.parse(String(value)) as string | number | boolean;

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "_key" && key !== "_type").map(([key, child]) => [key, clean(child)]));
  return value;
}

const toSanityPoint = ([x,z]: [number,number]) => ({ _type: "butterflyPoint", x, z });
const fromSanityPoint = (value: unknown): [number,number] => [Number(record(value).x), Number(record(value).z)];

export function toDraftDocument(world: World) {
  return {
    _id: "butterfly.world." + world.id,
    _type: "butterflyWorldDraft",
    worldId: world.id,
    baseRevision: world.baseRevision,
    title: world.title,
    origin: world.origin,
    originMinute: world.originMinute,
    horizon: world.horizon,
    networkComplete: world.networkComplete,
    closureEditableConnectionIds: world.closureEditableConnectionIds,
    visitorClosure: { ...world.visitorClosure, _type: "butterflyVisitorClosure" },
    visitorFerryOpening: world.visitorFerryOpening ? { ...world.visitorFerryOpening, _type: "butterflyVisitorFerryOpening" } : undefined,
    featuredMoment: {
      ...world.featuredMoment,
      _type: "butterflyFeaturedMoment",
      composition: {
        _type: "butterflyMomentComposition",
        photographerPosition: toSanityPoint(world.featuredMoment.composition.photographerPosition),
        subjectPositions: keyed(world.featuredMoment.composition.subjectPositions.map(item => ({ ...item, _type: "butterflyCompositionEntity", position: toSanityPoint(item.position) }))),
        propPositions: keyed(world.featuredMoment.composition.propPositions.map(item => ({ ...item, _type: "butterflyCompositionEntity", position: toSanityPoint(item.position) }))),
      },
    },
    presentation: {
      _type: "butterflyPresentation",
      eventOrder: world.presentation.eventOrder,
      roles: { ...world.presentation.roles, _type: "butterflyPresentationRoles" },
    },
    entities: keyed(world.entities.map(entity => ({
      ...entity,
      _type: "butterflyEntity",
      visual: { ...entity.visual, _type: "butterflyVisual", position: entity.visual.position ? toSanityPoint(entity.visual.position) : undefined },
    }))),
    connections: keyed(world.connections.map(connection => ({
      ...connection,
      _type: "butterflyConnection",
      windows: keyed(connection.windows.map(window => ({ ...window, _type: "butterflyInterval" }))),
      path: keyed(connection.path.map(toSanityPoint)),
      segments: connection.segments ? keyed(connection.segments.map(segment => ({ ...segment, _type: "butterflyRouteSegment", path: keyed(segment.path.map(toSanityPoint)) }))) : undefined,
    }))),
    facts: keyed(world.facts.map(fact => ({ id: fact.id, worldId: fact.worldId, key: fact.key, valueJson: json(fact.value), interval: { ...fact.interval, _type: "butterflyInterval" }, _type: "butterflyFact" }))),
    events: keyed(world.events.map(event => ({
      id: event.id, worldId: event.worldId, kind: event.kind, name: event.name, at: event.at,
      afterEventId: event.afterEventId, delay: event.delay, actorIds: event.actorIds, from: event.from, to: event.to, mode: event.mode,
      _type: "butterflyEvent",
      requirements: keyed(event.requirements.map(requirement => ({
        ...requirement,
        operator: requirement.type,
        type: undefined,
        valueJson: requirement.type === "factEquals" ? json(requirement.value) : undefined,
        _type: "butterflyRequirement",
      }))),
      effects: keyed(event.effects.map(effect => ({ key: effect.key, valueJson: json(effect.value), _type: "butterflyEffect" }))),
    }))),
    artifacts: keyed(world.artifacts.map(artifact => ({ ...artifact, _type: "butterflyArtifact", claims: keyed(artifact.claims.map(claim => ({ ...claim, _type: "butterflyClaim" }))) }))),
    interventions: keyed(world.interventions.map(intervention => intervention.type === "setEventTime"
      ? { _type: "butterflyIntervention", kind: intervention.type, eventId: intervention.eventId, timeValues: intervention.values, minAvailableAt: intervention.precondition.minAvailableAt }
      : { _type: "butterflyIntervention", kind: intervention.type, connectionId: intervention.connectionId, booleanValues: intervention.values, requiredMode: intervention.precondition.requiredMode })),
  };
}

export function fromDraftDocument(raw: unknown): World {
  const draft = record(clean(raw));
  return validateWorld({
    id: draft.worldId,
    baseRevision: draft.baseRevision,
    title: draft.title,
    origin: draft.origin,
    originMinute: draft.originMinute,
    horizon: draft.horizon,
    networkComplete: draft.networkComplete,
    closureEditableConnectionIds: draft.closureEditableConnectionIds,
    visitorClosure: draft.visitorClosure,
    visitorFerryOpening: draft.visitorFerryOpening,
    featuredMoment: {
      ...record(draft.featuredMoment),
      composition: {
        ...record(record(draft.featuredMoment).composition),
        photographerPosition: fromSanityPoint(record(record(draft.featuredMoment).composition).photographerPosition),
        subjectPositions: list(record(record(draft.featuredMoment).composition).subjectPositions).map(item => ({ entityId: item.entityId, position: fromSanityPoint(item.position) })),
        propPositions: list(record(record(draft.featuredMoment).composition).propPositions).map(item => ({ entityId: item.entityId, position: fromSanityPoint(item.position) })),
      },
    },
    presentation: draft.presentation,
    entities: list(draft.entities).map(entity => {
      const visual = record(entity.visual);
      return { ...entity, visual: { ...visual, position: visual.position ? fromSanityPoint(visual.position) : undefined } };
    }),
    connections: list(draft.connections).map(connection => ({
      ...connection,
      path: list(connection.path).map(fromSanityPoint),
      segments: connection.segments ? list(connection.segments).map(segment => ({ ...segment, path: list(segment.path).map(fromSanityPoint) })) : undefined,
    })),
    facts: list(draft.facts).map(fact => ({ id: fact.id, worldId: fact.worldId, key: fact.key, value: parsed(fact.valueJson), interval: fact.interval, source: "input" })),
    events: list(draft.events).map(event => {
      const base = {
        id: event.id,
        worldId: event.worldId,
        name: event.name,
        requirements: list(event.requirements).map(requirement => {
        const operator = requirement.operator;
        if (operator === "factEquals") return { type: operator, key: requirement.key, value: parsed(requirement.valueJson) };
        if (operator === "entityAt") return { type: operator, entityId: requirement.entityId, placeId: requirement.placeId };
        if (operator === "eventOccurred") return { type: operator, eventId: requirement.eventId };
        throw new Error("Unknown requirement operator " + String(operator));
        }),
        actorIds: event.actorIds,
        effects: list(event.effects).map(effect => ({ key: effect.key, value: parsed(effect.valueJson) })),
      };
      if (event.kind === "transport") return { ...base, kind: event.kind, at: event.at, from: event.from, to: event.to, mode: event.mode };
      if (event.kind === "dependent") return { ...base, kind: event.kind, afterEventId: event.afterEventId, delay: event.delay };
      if (event.kind === "fixed") return { ...base, kind: event.kind, at: event.at };
      throw new Error("Unknown event kind " + String(event.kind));
    }),
    artifacts: list(draft.artifacts),
    interventions: list(draft.interventions).map(intervention => intervention.kind === "setEventTime"
      ? { type: intervention.kind, eventId: intervention.eventId, values: intervention.timeValues, precondition: { minAvailableAt: intervention.minAvailableAt } }
      : { type: intervention.kind, connectionId: intervention.connectionId, values: intervention.booleanValues, precondition: { requiredMode: intervention.requiredMode } }),
  });
}
