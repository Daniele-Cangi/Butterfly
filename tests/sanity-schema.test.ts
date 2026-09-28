import { describe, expect, it } from "vitest";
import { sampleWorld } from "../fixtures/harbor";
import { simulate } from "../src/engine/simulate";
import { fromDraftDocument, toDraftDocument } from "../src/sanity/adapter";
import { schemaTypes } from "../src/sanity/schema";
import { validateWorld } from "../src/world/model";

type FieldDefinition = {
  name: string;
  hidden?: boolean | ((context: { parent?: Record<string, unknown> }) => boolean);
  validation?: (rule: unknown, context?: unknown) => unknown;
};
type ObjectDefinition = { name: string; fields?: FieldDefinition[] };

function getField(typeName: string, fieldName: string): FieldDefinition {
  const type = schemaTypes.find(candidate => candidate.name === typeName) as ObjectDefinition | undefined;
  const field = type?.fields?.find(candidate => candidate.name === fieldName);
  if (!field) throw new Error(`Missing Sanity field ${typeName}.${fieldName}`);
  return field;
}

function isHidden(typeName: string, fieldName: string, parent: Record<string, unknown>): boolean {
  const hidden = getField(typeName, fieldName).hidden;
  if (typeof hidden !== "function") throw new Error(`Expected conditional visibility for ${typeName}.${fieldName}`);
  return hidden({ parent });
}

describe("Sanity authoring conditionals", () => {
  it("shows only event fields relevant to the selected event rule", () => {
    expect(isHidden("butterflyEvent", "at", { kind: "transport" })).toBe(false);
    expect(isHidden("butterflyEvent", "from", { kind: "transport" })).toBe(false);
    expect(isHidden("butterflyEvent", "mode", { kind: "transport" })).toBe(false);
    expect(isHidden("butterflyEvent", "afterEventId", { kind: "transport" })).toBe(true);
    expect(isHidden("butterflyEvent", "afterEventId", { kind: "dependent" })).toBe(false);
    expect(isHidden("butterflyEvent", "delay", { kind: "dependent" })).toBe(false);
    expect(isHidden("butterflyEvent", "from", { kind: "fixed" })).toBe(true);
  });

  it("shows only requirement and intervention fields relevant to their discriminators", () => {
    expect(isHidden("butterflyRequirement", "eventId", { operator: "eventOccurred" })).toBe(false);
    expect(isHidden("butterflyRequirement", "entityId", { operator: "eventOccurred" })).toBe(true);
    expect(isHidden("butterflyRequirement", "entityId", { operator: "entityAt" })).toBe(false);
    expect(isHidden("butterflyRequirement", "key", { operator: "entityAt" })).toBe(true);
    expect(isHidden("butterflyRequirement", "key", { operator: "factEquals" })).toBe(false);
    expect(isHidden("butterflyIntervention", "eventId", { kind: "setEventTime" })).toBe(false);
    expect(isHidden("butterflyIntervention", "connectionId", { kind: "setEventTime" })).toBe(true);
    expect(isHidden("butterflyIntervention", "connectionId", { kind: "enableConnection" })).toBe(false);
  });

  it("keeps place entities optional for initial location in both visibility and validation", () => {
    const place = getField("butterflyEntity", "initialPlaceId");
    expect(isHidden("butterflyEntity", "initialPlaceId", { kind: "place" })).toBe(true);
    expect(isHidden("butterflyEntity", "initialPlaceId", { kind: "person" })).toBe(false);
    expect(isHidden("butterflyEntity", "initialPlaceId", { kind: "object" })).toBe(false);

    let skipped = false;
    const validation = place.validation;
    if (!validation) throw new Error("Expected initialPlaceId validation");
    validation({ skip: () => { skipped = true; return "skipped"; }, required: () => "required" }, { hidden: true });
    expect(skipped).toBe(true);
  });

  it("allows the seeded pointer to have no active revision before first publication", () => {
    expect(getField("butterflyWorldPointer", "activeRevisionId").validation).toBeUndefined();
  });

  it("strips stale hidden time-dependency fields when adapting an edited Sanity draft", () => {
    const draft = structuredClone(toDraftDocument(sampleWorld)) as unknown as { events: Record<string, unknown>[] };
    const photograph = draft.events.find(event => event.id === sampleWorld.featuredMoment.eventId)!;
    photograph.afterEventId = sampleWorld.presentation.roles.deliveryEventId;
    photograph.delay = 5;

    const world = fromDraftDocument(draft);
    const adapted = world.events.find(event => event.id === sampleWorld.featuredMoment.eventId)!;
    expect(adapted).not.toHaveProperty("afterEventId");
    expect(adapted).not.toHaveProperty("delay");
    expect(simulate(world).events.find(event => event.id === sampleWorld.featuredMoment.eventId)?.status).toBe("possible");
  });

  it("rejects irrelevant dependency fields in direct world input", () => {
    const world = structuredClone(sampleWorld);
    world.events.find(event => event.id === world.featuredMoment.eventId)!.afterEventId = world.presentation.roles.deliveryEventId;
    expect(() => validateWorld(world)).toThrow("Field afterEventId is not valid for fixed events.");
  });
});
