import { describe, expect, it } from "vitest";
import { sampleWorld } from "../fixtures/harbor";
import { keepThisMoment, type Goal } from "../src/engine/search";
import { findRoute, formatTime, getEvent, sampleEntity, sampleRoute, simulate } from "../src/engine/simulate";
import { applyPatch, validateWorld, type RealityPatch, type World } from "../src/world/model";

const closeBridge = (): RealityPatch => ({
  worldId: sampleWorld.id,
  baseRevision: sampleWorld.baseRevision,
  operations: [{ type: "setConnectionEnd", connectionId: sampleWorld.visitorClosure.connectionId, value: sampleWorld.visitorClosure.end }],
});

const featuredGoal = (world: World): Goal => {
  const event = world.events.find(candidate => candidate.id === world.featuredMoment.eventId)!;
  return { eventId: event.id, time: event.at!, placeId: world.featuredMoment.placeId, requiredTypes: [...new Set(event.requirements.map(item => item.type))] };
};

describe("timed route sampling", () => {
  it("formats fractional playhead minutes to HH:mm using nearest-minute display rounding", () => {
    expect(formatTime(20.05, 960)).toBe("16:20");
    expect(formatTime(20.5, 960)).toBe("16:21");
  });

  it("samples explicit road, bridge and road leg times by distance, independent of seek order", () => {
    const result = simulate(sampleWorld);
    const route = getEvent(result, sampleWorld.presentation.roles.deliveryEventId).route!;
    expect(route.plannedDepart).toBe(20);
    expect(route.depart).toBe(20);
    expect(route.arrive).toBe(30);
    expect(route.itinerary[0]).toMatchObject({ kind: "movement", start: 20, end: 30 });
    if (route.itinerary[0].kind !== "movement") throw new Error("Expected a movement leg");
    expect(route.itinerary[0].geometry.map(({ role, start, end }) => [role, start, end])).toEqual([
      ["road", 20, 23], ["bridge", 23, 27], ["road", 27, 30],
    ]);
    const atBridgeMidpoint = sampleRoute(route, 25);
    expect(atBridgeMidpoint).toMatchObject({ status: "moving", role: "bridge" });
    expect(atBridgeMidpoint.position).toEqual([0, -1]);
    sampleRoute(route, 29);
    expect(sampleRoute(route, 25)).toEqual(atBridgeMidpoint);
  });

  it("records an intermediate wait and resumes along a multi-leg trip", () => {
    const world = structuredClone(sampleWorld);
    const relay = { id: "relay", worldId: world.id, kind: "place" as const, name: "Relay square", visual: { kind: "place", color: "#d5c1a1", position: [-1, 0] as [number, number] } };
    world.entities.push(relay);
    world.connections.forEach(connection => { connection.enabled = false; });
    world.connections = [
      ...world.connections,
      { id: "first-leg", worldId: world.id, from: "depot", to: "relay", modes: ["van"], duration: 5, windows: [{ start: 0, end: 60 }], enabled: true, path: [[-5, -1], [-1, 0]] },
      { id: "second-leg", worldId: world.id, from: "relay", to: "plaza", modes: ["van"], duration: 10, windows: [{ start: 30, end: 60 }], enabled: true, path: [[-1, 0], [4, 1]] },
    ];
    const result = simulate(validateWorld(world));
    const route = getEvent(result, world.presentation.roles.deliveryEventId).route!;
    expect(route.arrive).toBe(40);
    expect(route.itinerary.map(step => step.kind)).toEqual(["movement", "wait", "movement"]);
    expect(sampleRoute(route, 27)).toMatchObject({ status: "waiting", placeId: "relay", position: [-1, 0] });
    expect(sampleRoute(route, 32)).toMatchObject({ status: "moving", connectionId: "second-leg" });
    expect(getEvent(result, world.presentation.roles.setupEventId).time).toBe(50);
    expect(getEvent(result, world.featuredMoment.eventId).status).toBe("possible");
  });

  it("uses the same depot and intermediate-stop locations for requirements and sampling", () => {
    const world = structuredClone(sampleWorld);
    world.connections.find(connection => connection.id === "bridge")!.enabled = false;
    world.connections.find(connection => connection.id === "land")!.enabled = false;
    world.connections.find(connection => connection.id === "ferry")!.enabled = true;
    world.events.push({
      id: "pier-presence-check",
      worldId: world.id,
      kind: "fixed",
      name: "Pier presence check",
      at: 29,
      requirements: [{ type: "entityAt", entityId: world.presentation.roles.courierEntityId, placeId: world.presentation.roles.pierPlaceId }],
      actorIds: [],
      effects: [],
    });
    const checked = validateWorld(world);
    const result = simulate(checked);
    const route = getEvent(result, checked.presentation.roles.deliveryEventId).route!;

    expect(sampleRoute(route, 19)).toMatchObject({ status: "waiting", placeId: "depot", position: [-5, -1] });
    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 19)).toMatchObject({ status: "at-place", placeId: "depot", position: [-5, -1] });
    expect(getEvent(result, "pier-presence-check").status).toBe("possible");
    expect(getEvent(result, "pier-presence-check").reasons[0].observed).toBe("pier");
    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 29)).toMatchObject({ status: "waiting", placeId: "pier", position: [-2.7, 2.5] });
    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 33)).toMatchObject({ status: "moving", role: "ferry" });
    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 33).placeId).toBeUndefined();
  });

  it("keeps a known intermediate wait place during an initial connection wait", () => {
    const world = structuredClone(sampleWorld);
    world.connections.find(connection => connection.id === "bridge")!.windows = [{ start: 30, end: 60 }];
    world.connections.find(connection => connection.id === "land")!.enabled = false;
    world.events.push({
      id: "depot-wait-check",
      worldId: world.id,
      kind: "fixed",
      name: "Depot wait check",
      at: 25,
      requirements: [{ type: "entityAt", entityId: "courier", placeId: "depot" }],
      actorIds: [],
      effects: [],
    });
    const checked = validateWorld(world);
    const result = simulate(checked);
    expect(getEvent(result, "depot-wait-check").status).toBe("possible");
    expect(sampleEntity(checked, result, "courier", 25)).toMatchObject({ status: "waiting", placeId: "depot", position: [-5, -1] });
  });

  it("keeps boundary arrival exact and samples the ferry only during its ferry segment", () => {
    const boundary = simulate(applyPatch(sampleWorld, { ...closeBridge(), operations: [{ type: "setConnectionEnd", connectionId: "bridge", value: 30 }] }));
    expect(sampleEntity(sampleWorld, boundary, sampleWorld.presentation.roles.courierEntityId, 29.99).status).toBe("moving");
    expect(sampleEntity(sampleWorld, boundary, sampleWorld.presentation.roles.courierEntityId, 30)).toMatchObject({ status: "at-place", placeId: "plaza", position: [4, 1] });

    const closure = closeBridge();
    const recovery = keepThisMoment(sampleWorld, closure, featuredGoal(sampleWorld));
    const ferry = recovery.alternatives.find(alternative => alternative.operations.some(operation => operation.type === "enableConnection"))!;
    const replay = applyPatch(sampleWorld, { ...closure, operations: [...closure.operations, ...ferry.operations] }, closure.operations);
    const ferryResult = simulate(replay);
    expect(getEvent(ferryResult, replay.presentation.roles.deliveryEventId).time).toBe(40);
    expect(getEvent(ferryResult, replay.presentation.roles.setupEventId).time).toBe(50);
    expect(getEvent(ferryResult, replay.presentation.eventOrder[2]).status).toBe("possible");
    expect(sampleEntity(replay, ferryResult, replay.presentation.roles.courierEntityId, 29)).toMatchObject({ status: "waiting", placeId: "pier", position: [-2.7, 2.5] });
    expect(sampleEntity(replay, ferryResult, replay.presentation.roles.vehicleEntityId, 30)).toMatchObject({ status: "moving", role: "ferry" });
  });

  it("leaves an actor unknown when a scheduled transport is unresolved", () => {
    const world = structuredClone(sampleWorld);
    world.facts.find(fact => fact.id === "cargo-ready")!.interval.start = 21;
    const result = simulate(world);
    expect(sampleEntity(world, result, world.presentation.roles.courierEntityId, 50).status).toBe("unknown");
    expect(result.artifacts.find(artifact => artifact.id === world.presentation.roles.storyArtifactId)?.compatibility).toBe("unknown");
  });

  it("keeps semantic places known when optional visual coordinates are absent", () => {
    const world = structuredClone(sampleWorld);
    for (const entity of world.entities) delete entity.visual.position;
    const checked = validateWorld(world);
    const result = simulate(checked);

    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 0)).toEqual({ status: "at-place", placeId: "depot" });
    expect(sampleEntity(checked, result, checked.presentation.roles.courierEntityId, 30)).toEqual({ status: "at-place", placeId: "plaza" });
    expect(getEvent(result, checked.featuredMoment.eventId).status).toBe("possible");
    expect(result.artifacts.find(artifact => artifact.id === checked.presentation.roles.storyArtifactId)?.compatibility).toBe("supported");
  });

  it("does not produce NaN for a positive-duration route with coincident geometry", () => {
    const world = structuredClone(sampleWorld);
    world.entities.push({ id: "nearby", worldId: world.id, kind: "place", name: "Nearby", visual: { kind: "place", color: "#c4b69c", position: [-5, -1] } });
    world.connections.push({ id: "coincident", worldId: world.id, from: "depot", to: "nearby", modes: ["walker"], duration: 4, windows: [{ start: 0, end: 20 }], enabled: true, path: [[-5, -1], [-5, -1]] });
    const route = findRoute(validateWorld(world), "depot", "nearby", "walker", 2)!;
    for (const time of [2, 3, 4, 5, 6]) {
      const sample = sampleRoute(route, time);
      expect(sample.position?.every(Number.isFinite)).toBe(true);
    }
  });

  it("keeps an authored target time data-driven through the recovery search", () => {
    const world = structuredClone(sampleWorld);
    const photo = world.events.find(event => event.id === world.featuredMoment.eventId)!;
    photo.at = 55;
    const goal = featuredGoal(validateWorld(world));
    const search = keepThisMoment(world, closeBridge(), goal);
    expect(goal.time).toBe(55);
    expect(search.status).toBe("found");
    expect(search.alternatives.some(alternative => getEvent(alternative.result, goal.eventId).time === goal.time)).toBe(true);
  });
});

describe("story identifier independence", () => {
  it("renames bound event IDs without changing the authored outcome", () => {
    const world = structuredClone(sampleWorld);
    const renamed: Record<string, string> = { delivery: "courier-run-01", setup: "flower-arrangement-01", photo: "portrait-01", ceremony: "gathering-01" };
    for (const event of world.events) {
      event.id = renamed[event.id] ?? event.id;
      if (event.afterEventId) event.afterEventId = renamed[event.afterEventId] ?? event.afterEventId;
      for (const requirement of event.requirements) if (requirement.type === "eventOccurred") requirement.eventId = renamed[requirement.eventId] ?? requirement.eventId;
    }
    world.presentation.eventOrder = world.presentation.eventOrder.map(id => renamed[id] ?? id);
    world.presentation.roles.deliveryEventId = renamed[world.presentation.roles.deliveryEventId];
    world.presentation.roles.setupEventId = renamed[world.presentation.roles.setupEventId];
    world.presentation.roles.ceremonyEventId = renamed[world.presentation.roles.ceremonyEventId];
    world.featuredMoment.eventId = renamed[world.featuredMoment.eventId];
    world.featuredMoment.arrangementEventId = renamed[world.featuredMoment.arrangementEventId];
    for (const artifact of world.artifacts) for (const claim of artifact.claims) claim.eventId = renamed[claim.eventId] ?? claim.eventId;
    for (const intervention of world.interventions) if (intervention.type === "setEventTime") intervention.eventId = renamed[intervention.eventId];

    const validation = validateWorld(world);
    const original = simulate(sampleWorld);
    const renamedResult = simulate(validation);
    expect(validation.presentation.eventOrder).toEqual(["courier-run-01", "flower-arrangement-01", "portrait-01", "gathering-01"]);
    expect(getEvent(renamedResult, validation.presentation.roles.deliveryEventId).time).toBe(getEvent(original, sampleWorld.presentation.roles.deliveryEventId).time);
    expect(getEvent(renamedResult, validation.featuredMoment.eventId).status).toBe(getEvent(original, sampleWorld.featuredMoment.eventId).status);
    expect(renamedResult.artifacts.map(artifact => artifact.compatibility)).toEqual(original.artifacts.map(artifact => artifact.compatibility));
  });
});
