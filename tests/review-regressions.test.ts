/** Behavioral regression cases derived from an external review of Butterfly. */
import { describe, expect, it } from "vitest";
import { sampleWorld } from "../fixtures/harbor";
import { validateWorld, type World, type Event, type Requirement } from "../src/world/model";
import { getEvent, simulate } from "../src/engine/simulate";

function copy(): World {
  return structuredClone(sampleWorld);
}

function checkEvent(id: string, at: number, requirements: Requirement[]): Event {
  return {
    id,
    worldId: sampleWorld.id,
    kind: "fixed",
    name: "State checkpoint",
    at,
    requirements,
    actorIds: [],
    effects: [],
  };
}

describe("review: temporal state must not depend on lexical event IDs", () => {
  it("finds an entity at its actual location even when the checkpoint sorts before its completed trip", () => {
    function statusFor(id: string) {
      const world = copy();
      world.events.push(checkEvent(id, 80, [
        { type: "entityAt", entityId: "courier", placeId: "plaza" },
      ]));
      return getEvent(simulate(validateWorld(world)), id).status;
    }

    // The delivery has arrived at minute 30; both checks occur at minute 80.
    // Only the checkpoint's ID changes, not its time or requirements.
    expect({ earlyId: statusFor("a-location-check"), lateId: statusFor("z-location-check") })
      .toEqual({ earlyId: "possible", lateId: "possible" });
  });

  it("resolves a fact produced before the checkpoint without requiring a redundant eventOccurred condition", () => {
    function statusFor(id: string) {
      const world = copy();
      world.events.push(checkEvent(id, 80, [
        { type: "factEquals", key: "setupReady", value: true },
      ]));
      return getEvent(simulate(validateWorld(world)), id).status;
    }

    // setupReady is produced at minute 40 and remains true at minute 80.
    expect({ earlyId: statusFor("a-fact-check"), lateId: statusFor("z-fact-check") })
      .toEqual({ earlyId: "possible", lateId: "possible" });
  });

  it("uses the latest completed trip rather than the first trip when resolving location", () => {
    const world = copy();
    world.connections.push({
      id: "return-road",
      worldId: world.id,
      from: "plaza",
      to: "depot",
      modes: ["van"],
      duration: 10,
      windows: [{ start: 0, end: 120 }],
      enabled: true,
      path: [[4, 1], [1, -1], [-1, -1], [-3, -1], [-5, -1]],
    });
    world.events.push({
      id: "return-trip",
      worldId: world.id,
      kind: "transport",
      name: "Courier returns after the ceremony",
      at: 80,
      requirements: [
        { type: "eventOccurred", eventId: "delivery" },
        { type: "entityAt", entityId: "courier", placeId: "plaza" },
      ],
      actorIds: ["courier"],
      from: "plaza",
      to: "depot",
      mode: "van",
      effects: [],
    });
    world.events.push(checkEvent("z-after-return-check", 100, [
      { type: "eventOccurred", eventId: "return-trip" },
      { type: "entityAt", entityId: "courier", placeId: "depot" },
    ]));

    const result = simulate(validateWorld(world));
    expect(getEvent(result, "return-trip").status).toBe("possible");
    expect(getEvent(result, "return-trip").time).toBe(90);
    expect(getEvent(result, "z-after-return-check").status).toBe("possible");
  });

  it("does not resolve a future restock as a dependency of an earlier fact read", () => {
    function outcome(restockId: string) {
      const world = copy();
      world.events.push(checkEvent("stock-check", 80, [
        { type: "factEquals", key: "stockAvailable", value: true },
      ]));
      world.events.push({
        id: restockId,
        worldId: world.id,
        kind: "fixed",
        name: "Future restock",
        at: 90,
        requirements: [{ type: "eventOccurred", eventId: "stock-check" }],
        actorIds: [],
        effects: [{ key: "stockAvailable", value: true }],
      });

      const result = simulate(validateWorld(world));
      return {
        check: getEvent(result, "stock-check"),
        restockStatus: getEvent(result, restockId).status,
      };
    }

    const earlyRestockId = outcome("a-restock");
    const lateRestockId = outcome("z-restock");

    expect(earlyRestockId.check).toEqual(lateRestockId.check);
    expect(earlyRestockId.check.status).toBe("unknown");
    expect(earlyRestockId.restockStatus).toBe("unknown");
    expect(lateRestockId.restockStatus).toBe("unknown");
  });

  it("still rejects a fact requirement produced by the same event", () => {
    const world = copy();
    const selfRestock = checkEvent("self-restock", 80, [
      { type: "factEquals", key: "stockAvailable", value: true },
    ]);
    selfRestock.effects.push({ key: "stockAvailable", value: true });
    world.events.push(selfRestock);

    expect(() => simulate(validateWorld(world))).toThrow(/Cyclic dependency: self-restock/);
  });
});
