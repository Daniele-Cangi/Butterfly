import { describe, expect, it } from "vitest";
import { sampleWorld } from "../fixtures/harbor";
import { getEvent, simulate } from "../src/engine/simulate";
import { getMomentMarkerPosition, isArrangementVisibleAt, selectMomentEntityPresence } from "../src/scene/momentPresence";
import { validateWorld, type World } from "../src/world/model";

const copy = (): World => structuredClone(sampleWorld);

describe("MomentFrame presence follows the active simulation", () => {
  it("does not stage a photographer who is still at the depot", () => {
    const world = copy();
    const photographer = world.entities.find(entity => entity.id === world.featuredMoment.photographerEntityId)!;
    photographer.initialPlaceId = "depot";
    photographer.visual.position = [-5, -1];
    const checked = validateWorld(world);
    const result = simulate(checked);

    expect(getEvent(result, checked.featuredMoment.eventId).status).toBe("impossible");
    expect(selectMomentEntityPresence(checked, result, photographer.id, 50)).toEqual({ kind: "absent", placeId: "depot" });
  });

  it("does not stage a participant who leaves before the photograph", () => {
    const world = copy();
    world.connections.push({
      id: "plaza-to-hall",
      worldId: world.id,
      from: "plaza",
      to: "townhall",
      modes: ["walk"],
      duration: 5,
      windows: [{ start: 0, end: 120 }],
      enabled: true,
      path: [[4, 1], [4.7, -2.3]],
    });
    world.events.push({
      id: "couple-leaves",
      worldId: world.id,
      kind: "transport",
      name: "The couple leaves the plaza",
      at: 40,
      requirements: [{ type: "entityAt", entityId: "couple", placeId: "plaza" }],
      actorIds: ["couple"],
      from: "plaza",
      to: "townhall",
      mode: "walk",
      effects: [],
    });
    const checked = validateWorld(world);
    const result = simulate(checked);

    expect(getEvent(result, checked.featuredMoment.eventId).status).toBe("impossible");
    expect(selectMomentEntityPresence(checked, result, "couple", 50)).toEqual({ kind: "absent", placeId: "townhall" });
  });

  it("marks unresolved presence as uncertain at the last known coordinates, never the stage position", () => {
    const world = copy();
    world.facts.find(fact => fact.id === "cargo-ready")!.interval.start = 21;
    const checked = validateWorld(world);
    const result = simulate(checked);
    const presence = selectMomentEntityPresence(checked, result, "flowers", 50);

    expect(presence.kind).toBe("uncertain");
    if (presence.kind !== "uncertain") throw new Error("Expected uncertain flower presence");
    expect(presence).toMatchObject({ position: [-5, -1], lastKnownPlaceId: "depot" });
    expect(presence.position).not.toEqual(checked.featuredMoment.composition.propPositions[0].position);
  });

  it("omits an uncertain moment marker when no position was sampled", () => {
    const world = copy();
    const photographer = world.entities.find(entity => entity.id === world.featuredMoment.photographerEntityId)!;
    photographer.initialPlaceId = "depot";
    delete photographer.visual.position;
    delete world.entities.find(entity => entity.id === "depot")!.visual.position;
    world.facts.find(fact => fact.key === "cargoAvailable")!.interval.start = 60;
    world.events.push({
      id: "photographer-trip",
      worldId: world.id,
      kind: "transport",
      name: "Photographer's uncertain trip",
      at: 40,
      requirements: [{ type: "factEquals", key: "cargoAvailable", value: true }],
      actorIds: [photographer.id],
      from: "depot",
      to: "plaza",
      mode: "van",
      effects: [],
    });
    const checked = validateWorld(world);
    const result = simulate(checked);
    const presence = selectMomentEntityPresence(checked, result, photographer.id, 50);

    expect(presence).toEqual({ kind: "uncertain", lastKnownPlaceId: "depot" });
    expect(getMomentMarkerPosition(presence)).toBeUndefined();
  });

  it("shows the arrangement only after setup while its prop remains at the plaza", () => {
    const original = simulate(sampleWorld);
    expect(isArrangementVisibleAt(sampleWorld, original, 39, "flowers")).toBe(false);
    expect(isArrangementVisibleAt(sampleWorld, original, 40, "flowers")).toBe(true);

    const world = copy();
    world.connections.push({
      id: "plaza-to-depot",
      worldId: world.id,
      from: "plaza",
      to: "depot",
      modes: ["van"],
      duration: 5,
      windows: [{ start: 0, end: 120 }],
      enabled: true,
      path: [[4, 1], [0, 2], [-5, -1]],
    });
    world.events.push({
      id: "flowers-return",
      worldId: world.id,
      kind: "transport",
      name: "Flowers return to the depot",
      at: 45,
      requirements: [
        { type: "eventOccurred", eventId: "setup" },
        { type: "entityAt", entityId: "flowers", placeId: "plaza" },
      ],
      actorIds: ["flowers"],
      from: "plaza",
      to: "depot",
      mode: "van",
      effects: [],
    });
    const checked = validateWorld(world);
    const result = simulate(checked);
    expect(selectMomentEntityPresence(checked, result, "flowers", 50)).toMatchObject({ kind: "absent", placeId: "depot" });
    expect(isArrangementVisibleAt(checked, result, 50, "flowers")).toBe(false);
  });
});
