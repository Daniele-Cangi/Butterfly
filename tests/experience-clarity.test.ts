import { describe, expect, it } from "vitest";
import { sampleWorld } from "../fixtures/harbor";
import { applyPatch, validateWorld, type RealityPatch } from "../src/world/model";
import { getEvent, simulate } from "../src/engine/simulate";
import { applyAlternative, keepThisMoment } from "../src/engine/search";
import { explainDay, explainIntervention } from "../src/ui/story";
import { fromDraftDocument, toDraftDocument } from "../src/sanity/adapter";

const goal = { eventId: "photo", time: 50, placeId: "plaza", requiredTypes: ["eventOccurred", "entityAt", "factEquals"] };
const closed: RealityPatch = { worldId: sampleWorld.id, baseRevision: sampleWorld.baseRevision, operations: [{ type: "setConnectionEnd", connectionId: "bridge", value: 15 }] };
const departureLimit = { constraints: { departureNotBefore: { eventId: "delivery", minute: 20 } } };
const lateFerry: RealityPatch = { ...closed, operations: [...closed.operations, { type: "setConnectionStart", connectionId: "ferry", value: 35 }] };

describe("a clearer recovery domain", () => {
  it("shows distinct outcomes instead of redundant combinations", () => {
    const search = keepThisMoment(sampleWorld, closed, goal);
    expect(search.status).toBe("found");
    expect(search.examined).toBe(search.domainSize);
    expect(search.alternatives).toHaveLength(2);
    expect(search.groupedCount).toBe(2);
    expect(search.alternatives.every(alternative => alternative.operations.length === 1)).toBe(true);
    expect(search.alternatives.map(alternative => getEvent(alternative.result, "delivery").route?.connectionIds)).toEqual([["land-to-pier", "ferry", "landing-road"], ["bridge"]]);
  });

  it("honors a departure limit and recomputes a later ferry opening", () => {
    const limited = keepThisMoment(sampleWorld, closed, goal, departureLimit);
    expect(limited.alternatives).toHaveLength(1);
    expect(limited.alternatives[0].operations).toEqual([{ type: "enableConnection", connectionId: "ferry", value: true }]);
    const delayedWorld = applyPatch(sampleWorld, lateFerry);
    const ferryWorld = applyPatch(delayedWorld, { worldId: sampleWorld.id, baseRevision: sampleWorld.baseRevision, operations: limited.alternatives[0].operations }, lateFerry.operations);
    const delayed = simulate(ferryWorld);
    expect(getEvent(delayed, "delivery").time).toBe(45);
    expect(getEvent(delayed, "setup").time).toBe(55);
    expect(getEvent(delayed, "photo").status).toBe("impossible");
    expect(keepThisMoment(sampleWorld, lateFerry, goal, departureLimit)).toMatchObject({ status: "exhausted", examined: 1, domainSize: 1 });
    expect(keepThisMoment(sampleWorld, lateFerry, goal).alternatives.some(alternative => alternative.operations.some(operation => operation.type === "setEventTime" && operation.value === 0))).toBe(true);
  });

  it("rechecks the selected option under current constraints and rejects invalid schedule edits", () => {
    const early = keepThisMoment(sampleWorld, closed, goal).alternatives.find(alternative => alternative.operations.some(operation => operation.type === "setEventTime"))!;
    expect(() => applyAlternative(sampleWorld, closed, goal, early, departureLimit)).toThrow(/stale/i);
    expect(() => keepThisMoment(sampleWorld, { ...closed, operations: [...closed.operations, ...early.operations] }, goal, departureLimit)).toThrow(/violates the departure constraint/);
    expect(() => applyPatch(sampleWorld, { ...closed, operations: [{ type: "setConnectionStart", connectionId: "bridge", value: 35 }] })).toThrow(/not allowed/i);
    expect(() => applyPatch(sampleWorld, { ...closed, operations: [{ type: "setConnectionStart", connectionId: "ferry", value: 40 }] })).toThrow(/not allowed/i);
    expect(() => applyPatch(applyPatch(sampleWorld, lateFerry), { ...closed, operations: [{ type: "setConnectionStart", connectionId: "ferry", value: 30 }] }, lateFerry.operations)).toThrow(/Locked/);
    const otherVisitor = simulate(applyPatch(sampleWorld, closed));
    expect(getEvent(otherVisitor, "delivery").time).toBe(55);
    expect(sampleWorld.connections.find(connection => connection.id === "ferry")?.windows[0].start).toBe(30);
  });

  it("uses authored data for narrative timing and round-trips the ferry control through Sanity", () => {
    const world = validateWorld(structuredClone(sampleWorld));
    expect(fromDraftDocument(toDraftDocument(world))).toEqual(world);
    const result = simulate(applyPatch(world, closed));
    expect(explainDay(applyPatch(world, closed), result)).toContain("16:55");
    expect(explainDay(applyPatch(world, closed), result)).toContain("17:05");
    world.connections.find(connection => connection.id === "land")!.label = "Hillside lane";
    expect(explainDay(applyPatch(world, closed), simulate(applyPatch(world, closed)))).toContain("Hillside lane");
    const ferry = keepThisMoment(sampleWorld, closed, goal).alternatives.find(alternative => alternative.operations.some(operation => operation.type === "enableConnection"))!;
    expect(explainIntervention(applyPatch(sampleWorld, closed), ferry.result, ferry.operations)).toContain("16:40");
  });
});
