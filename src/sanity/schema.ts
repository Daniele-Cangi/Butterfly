import { defineField, defineType } from "sanity";
import { ZodError } from "zod";
import { fromDraftDocument } from "./adapter";

const requirementOperators = [
  { title: "Event occurred", value: "eventOccurred" },
  { title: "Entity is at a place", value: "entityAt" },
  { title: "Fact equals value", value: "factEquals" },
];
const eventKinds = [
  { title: "Transport", value: "transport" },
  { title: "Fixed time", value: "fixed" },
  { title: "After another event", value: "dependent" },
];
const routeRoles = ["road", "bridge", "ferry"].map(value => ({ title: value[0].toUpperCase() + value.slice(1), value }));
const entityKinds = ["person", "place", "object"].map(value => ({ title: value[0].toUpperCase() + value.slice(1), value }));

function hiddenUnless(field: string, values: string[]) {
  return ({ parent }: { parent?: Record<string, unknown> }) => !values.includes(String(parent?.[field] ?? ""));
}

function integerField(name: string, title = name, minimum = 0, hidden?: ReturnType<typeof hiddenUnless>) {
  return defineField({
    name,
    title,
    type: "number",
    ...(hidden ? { hidden } : {}),
    validation: (rule, context) => {
      if (context?.hidden) return rule.skip();
      return rule.required().integer().min(minimum);
    },
  });
}

function requiredString(name: string, title = name, hidden?: ReturnType<typeof hiddenUnless>) {
  return defineField({
    name,
    title,
    type: "string",
    ...(hidden ? { hidden } : {}),
    validation: (rule, context) => context?.hidden ? rule.skip() : rule.required(),
  });
}

function primitiveJsonField(name: string, title: string) {
  return defineField({
    name,
    title,
    type: "string",
    validation: rule => rule.required().custom(value => {
      if (typeof value !== "string") return "Enter a JSON string, number, or boolean.";
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean"
          ? true
          : "Use a JSON string, number, or boolean.";
      } catch {
        return "Enter valid JSON for a string, number, or boolean.";
      }
    }),
  });
}

function arrayField(name: string, of: string, title = name) {
  return defineField({ name, title, type: "array", of: [{ type: of }] });
}

function validateAuthoringDocument(value: unknown): true | string {
  try {
    fromDraftDocument(value);
    return true;
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const path = issue.path.map(String).join(".");
      return `Invalid Butterfly world${path ? ` at ${path}` : ""}: ${issue.message}`;
    }
    return error instanceof Error ? `Invalid Butterfly world: ${error.message}` : "Invalid Butterfly world data.";
  }
}

const interval = defineType({
  name: "butterflyInterval",
  title: "Availability interval",
  type: "object",
  fields: [integerField("start", "Start minute"), integerField("end", "End minute")],
  validation: rule => rule.custom(value => {
    if (!value) return true;
    const intervalValue = value as { start?: unknown; end?: unknown };
    return typeof intervalValue.start === "number" && typeof intervalValue.end === "number" && intervalValue.start < intervalValue.end
      || "End minute must be later than start minute.";
  }),
});

const point = defineType({
  name: "butterflyPoint",
  title: "Map point",
  type: "object",
  fields: [defineField({ name: "x", type: "number", validation: rule => rule.required() }), defineField({ name: "z", type: "number", validation: rule => rule.required() })],
});

const visual = defineType({
  name: "butterflyVisual",
  title: "Visual",
  type: "object",
  fields: [requiredString("kind"), requiredString("color"), defineField({ name: "position", type: "butterflyPoint" })],
});

const entity = defineType({
  name: "butterflyEntity",
  title: "Entity",
  type: "object",
  fields: [
    requiredString("id"), requiredString("worldId"),
    defineField({ name: "kind", title: "Kind", type: "string", options: { list: entityKinds }, validation: rule => rule.required() }),
    requiredString("name"), requiredString("initialPlaceId", "Initial place", hiddenUnless("kind", ["person", "object"])),
    defineField({ name: "visual", type: "butterflyVisual", validation: rule => rule.required() }),
  ],
});

const segment = defineType({
  name: "butterflyRouteSegment",
  title: "Timed visual route segment",
  type: "object",
  fields: [
    defineField({ name: "role", type: "string", options: { list: routeRoles }, validation: rule => rule.required() }),
    integerField("duration", "Duration in minutes", 1),
    arrayField("path", "butterflyPoint", "Path points"),
  ],
  validation: rule => rule.custom(value => {
    if (!value) return true;
    const segmentValue = value as { path?: unknown };
    return Array.isArray(segmentValue.path) && segmentValue.path.length >= 2 || "A route segment needs at least two points.";
  }),
});

const connection = defineType({
  name: "butterflyConnection",
  title: "Connection",
  type: "object",
  fields: [
    requiredString("id"), requiredString("worldId"), requiredString("label", "Display label"),
    requiredString("from", "Origin place"), requiredString("to", "Destination place"),
    arrayField("modes", "string", "Allowed transport modes"),
    integerField("duration", "Total duration in minutes", 1),
    arrayField("windows", "butterflyInterval", "Availability windows"),
    defineField({ name: "enabled", type: "boolean", validation: rule => rule.required() }),
    arrayField("path", "butterflyPoint", "Visual path"),
    arrayField("segments", "butterflyRouteSegment", "Timed visual segments"),
  ],
  validation: rule => rule.custom(value => {
    if (!value) return true;
    const segments = value.segments as { duration: number }[] | undefined;
    if (segments?.length && segments.reduce((sum, item) => sum + item.duration, 0) !== value.duration) return "Timed segment durations must add up to the connection duration.";
    const windows = Array.isArray(value.windows) ? value.windows as { start: number; end: number }[] : [];
    return windows.length > 0 && windows.every(window => window.start < window.end) || "Add an availability window whose end is later than its start.";
  }),
});

const fact = defineType({
  name: "butterflyFact",
  title: "Input fact",
  type: "object",
  fields: [requiredString("id"), requiredString("worldId"), requiredString("key"), primitiveJsonField("valueJson", "JSON primitive value"), defineField({ name: "interval", type: "butterflyInterval", validation: rule => rule.required() })],
});

const requirement = defineType({
  name: "butterflyRequirement",
  title: "Typed requirement",
  type: "object",
  fields: [
    defineField({ name: "operator", title: "Requirement", type: "string", options: { list: requirementOperators }, validation: rule => rule.required() }),
    requiredString("eventId", "Required event", hiddenUnless("operator", ["eventOccurred"])),
    requiredString("entityId", "Entity", hiddenUnless("operator", ["entityAt"])),
    requiredString("placeId", "Required place", hiddenUnless("operator", ["entityAt"])),
    requiredString("key", "Fact key", hiddenUnless("operator", ["factEquals"])),
    defineField({ name: "valueJson", title: "Expected JSON primitive", type: "string", hidden: ({ parent }) => parent?.operator !== "factEquals", validation: (rule, context) => context?.hidden ? rule.skip() : rule.required().custom(value => {
      if (typeof value !== "string") return "Enter a JSON string, number, or boolean.";
      try { const parsed: unknown = JSON.parse(value); return typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean" ? true : "Use a JSON string, number, or boolean."; }
      catch { return "Enter valid JSON for a string, number, or boolean."; }
    }) }),
  ],
});

const effect = defineType({ name: "butterflyEffect", title: "Derived effect", type: "object", fields: [requiredString("key"), primitiveJsonField("valueJson", "JSON primitive value")] });

const event = defineType({
  name: "butterflyEvent",
  title: "Event",
  type: "object",
  fields: [
    requiredString("id"), requiredString("worldId"), requiredString("name"),
    defineField({ name: "kind", title: "Event rule", type: "string", options: { list: eventKinds }, validation: rule => rule.required() }),
    integerField("at", "Scheduled minute", 0, hiddenUnless("kind", ["fixed", "transport"])),
    requiredString("afterEventId", "Preceding event", hiddenUnless("kind", ["dependent"])),
    integerField("delay", "Delay in minutes", 0, hiddenUnless("kind", ["dependent"])),
    arrayField("requirements", "butterflyRequirement", "Typed requirements"),
    arrayField("actorIds", "string", "Actors and resources"),
    requiredString("from", "Origin place", hiddenUnless("kind", ["transport"])),
    requiredString("to", "Destination place", hiddenUnless("kind", ["transport"])),
    requiredString("mode", "Transport mode", hiddenUnless("kind", ["transport"])),
    arrayField("effects", "butterflyEffect", "Effects (only on success)"),
  ],
});

const claim = defineType({ name: "butterflyClaim", title: "Story claim", type: "object", fields: [requiredString("eventId", "Claimed event"), defineField({ name: "occurred", type: "boolean", validation: rule => rule.required() })] });
const artifact = defineType({ name: "butterflyArtifact", title: "Story artifact", type: "object", fields: [requiredString("id"), requiredString("worldId"), requiredString("title"), defineField({ name: "body", type: "text", validation: rule => rule.required() }), arrayField("claims", "butterflyClaim", "Structured claims")] });

const intervention = defineType({
  name: "butterflyIntervention",
  title: "Allowed intervention",
  type: "object",
  fields: [
    defineField({ name: "kind", title: "Intervention", type: "string", options: { list: [{ title: "Set event time", value: "setEventTime" }, { title: "Enable connection", value: "enableConnection" }] }, validation: rule => rule.required() }),
    requiredString("eventId", "Event", hiddenUnless("kind", ["setEventTime"])),
    defineField({ name: "timeValues", title: "Allowed minutes", type: "array", hidden: ({ parent }) => parent?.kind !== "setEventTime", of: [{ type: "number" }], validation: (rule, context) => context?.hidden ? rule.skip() : rule.required().min(1) }),
    integerField("minAvailableAt", "Minimum availability minute", 0, hiddenUnless("kind", ["setEventTime"])),
    requiredString("connectionId", "Existing connection", hiddenUnless("kind", ["enableConnection"])),
    defineField({ name: "booleanValues", title: "Allowed enabled states", type: "array", hidden: ({ parent }) => parent?.kind !== "enableConnection", of: [{ type: "boolean" }], validation: (rule, context) => context?.hidden ? rule.skip() : rule.required().min(1) }),
    requiredString("requiredMode", "Required transport mode", hiddenUnless("kind", ["enableConnection"])),
  ],
});

const closure = defineType({ name: "butterflyVisitorClosure", title: "Visitor closure", type: "object", fields: [requiredString("connectionId"), integerField("end", "Closing minute", 1)] });
const compositionEntity = defineType({ name: "butterflyCompositionEntity", title: "Framed actor or prop", type: "object", fields: [requiredString("entityId"), defineField({ name: "position", type: "butterflyPoint", validation: rule => rule.required() })] });
const composition = defineType({ name: "butterflyMomentComposition", title: "Moment frame composition", type: "object", fields: [defineField({ name: "photographerPosition", type: "butterflyPoint", validation: rule => rule.required() }), arrayField("subjectPositions", "butterflyCompositionEntity"), arrayField("propPositions", "butterflyCompositionEntity")] });
const moment = defineType({ name: "butterflyFeaturedMoment", title: "Featured moment and composition", type: "object", fields: [requiredString("eventId"), requiredString("placeId"), requiredString("arrangementEventId"), requiredString("photographerEntityId"), arrayField("subjectEntityIds", "string"), arrayField("propEntityIds", "string"), defineField({ name: "composition", type: "butterflyMomentComposition", validation: rule => rule.required() })] });
const roles = defineType({ name: "butterflyPresentationRoles", title: "Scene and story bindings", type: "object", fields: ["deliveryEventId", "setupEventId", "ceremonyEventId", "courierEntityId", "vehicleEntityId", "floralEntityId", "depotPlaceId", "plazaPlaceId", "pierPlaceId", "landingPlaceId", "storyArtifactId"].map(name => requiredString(name)) });
const presentation = defineType({ name: "butterflyPresentation", title: "Presentation order and roles", type: "object", fields: [arrayField("eventOrder", "string"), defineField({ name: "roles", type: "butterflyPresentationRoles", validation: rule => rule.required() })] });

const draft = defineType({
  name: "butterflyWorldDraft",
  title: "Butterfly world authoring",
  type: "document",
  validation: rule => rule.custom(validateAuthoringDocument),
  fields: [
    requiredString("worldId"), requiredString("baseRevision"), requiredString("title"), requiredString("origin"),
    integerField("originMinute", "Origin minute", 0), integerField("horizon", "Scenario horizon", 1),
    defineField({ name: "networkComplete", type: "boolean", validation: rule => rule.required() }),
    arrayField("closureEditableConnectionIds", "string", "Visitor-editable connections"),
    defineField({ name: "visitorClosure", type: "butterflyVisitorClosure", validation: rule => rule.required() }),
    defineField({ name: "featuredMoment", type: "butterflyFeaturedMoment", validation: rule => rule.required() }),
    defineField({ name: "presentation", type: "butterflyPresentation", validation: rule => rule.required() }),
    arrayField("entities", "butterflyEntity"), arrayField("connections", "butterflyConnection"),
    arrayField("facts", "butterflyFact"), arrayField("events", "butterflyEvent"),
    arrayField("artifacts", "butterflyArtifact"), arrayField("interventions", "butterflyIntervention"),
  ],
});

const revision = defineType({ name: "butterflyWorldRevision", title: "Frozen Butterfly revision", type: "document", fields: [requiredString("worldId"), requiredString("revisionId"), defineField({ name: "snapshotJson", type: "text", readOnly: true }), defineField({ name: "createdAt", type: "datetime", readOnly: true })] });
const pointer = defineType({ name: "butterflyWorldPointer", title: "Active Butterfly world", type: "document", fields: [requiredString("worldId"), requiredString("activeRevisionId")] });

export const schemaTypes = [interval, point, visual, entity, segment, connection, fact, requirement, effect, event, claim, artifact, intervention, closure, compositionEntity, composition, moment, roles, presentation, draft, revision, pointer];
