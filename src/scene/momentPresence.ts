import { getEvent, sampleEntity, type Simulation } from "../engine/simulate";
import type { World } from "../world/model";

export type MomentPresence =
  | { kind: "present"; position: [number, number] }
  | { kind: "absent"; placeId?: string }
  | { kind: "uncertain"; position?: [number, number]; lastKnownPlaceId?: string };

export function getMomentMarkerPosition(presence: MomentPresence): [number, number] | undefined {
  return presence.kind === "absent" ? undefined : presence.position;
}

/** Composition coordinates are staging positions, never evidence of presence. */
export function selectMomentEntityPresence(world: World, result: Simulation, entityId: string, minute: number): MomentPresence {
  const sample = sampleEntity(world, result, entityId, minute);
  if (sample.status === "unknown") {
    return { kind: "uncertain", ...(sample.position ? { position: sample.position } : {}), ...(sample.placeId ? { lastKnownPlaceId: sample.placeId } : {}) };
  }
  if (sample.status === "moving" || sample.placeId !== world.featuredMoment.placeId) {
    return { kind: "absent", ...(sample.placeId ? { placeId: sample.placeId } : {}) };
  }

  const composition = world.featuredMoment.composition;
  const position = entityId === world.featuredMoment.photographerEntityId
    ? composition.photographerPosition
    : composition.subjectPositions.find(item => item.entityId === entityId)?.position
      ?? composition.propPositions.find(item => item.entityId === entityId)?.position;
  return position ? { kind: "present", position } : { kind: "uncertain" };
}

/** A completed setup remains visible only while its prop is still at the moment's place. */
export function isArrangementVisibleAt(world: World, result: Simulation, minute: number, entityId: string): boolean {
  const setup = getEvent(result, world.featuredMoment.arrangementEventId);
  return setup.status === "possible"
    && setup.time !== null
    && setup.time <= minute
    && selectMomentEntityPresence(world, result, entityId, minute).kind === "present";
}
