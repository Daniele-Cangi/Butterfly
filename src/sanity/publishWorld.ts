import { randomUUID } from "node:crypto";
import type { getCliClient } from "sanity/cli";
import { simulate } from "../engine/simulate";
import { fromDraftDocument } from "./adapter";
import { pointerId, WORLD_ID } from "./read";

type WorldPointer = { _id: string; _rev: string; worldId: string; activeRevisionId: string };
type WorldRevision = { _id: string; revisionId: string; worldId: string };

/** Rebuilds and verifies the frozen snapshot from authoritative Studio data before one optimistic transaction. */
export async function publishWorldSnapshot(client: ReturnType<typeof getCliClient>, expectedPointerRevision: string): Promise<string> {
  if (!expectedPointerRevision) throw new Error("An expected pointer revision is required");
  const [draft, published, pointer] = await Promise.all([
    client.getDocument(`drafts.butterfly.world.${WORLD_ID}`),
    client.getDocument(`butterfly.world.${WORLD_ID}`),
    client.getDocument<WorldPointer>(pointerId),
  ]);
  if (!draft && !published) throw new Error("Butterfly authoring document is missing");
  if (!pointer || pointer.worldId !== WORLD_ID || pointer._id !== pointerId) throw new Error("Butterfly pointer is missing or belongs to another world");
  if (pointer._rev !== expectedPointerRevision) throw new Error("Active pointer changed; review and evaluate again");

  if (pointer.activeRevisionId) {
    const active = await client.getDocument<WorldRevision>(pointer.activeRevisionId);
    if (!active || active._id !== pointer.activeRevisionId || active.revisionId !== pointer.activeRevisionId || active.worldId !== WORLD_ID) {
      throw new Error("Active pointer does not identify a frozen revision of this Butterfly world");
    }
  }

  const world = fromDraftDocument(draft ?? published);
  if (world.id !== WORLD_ID) throw new Error("Authoring document world mismatch");
  simulate(world);

  const revisionId = `butterfly.revision.${randomUUID()}`;
  const snapshot = { ...world, baseRevision: revisionId };
  simulate(snapshot);
  await client.transaction()
    .create({ _id: revisionId, _type: "butterflyWorldRevision", worldId: WORLD_ID, revisionId, snapshotJson: JSON.stringify(snapshot), createdAt: new Date().toISOString() })
    .patch(pointerId, patch => patch.ifRevisionId(expectedPointerRevision).set({ activeRevisionId: revisionId }))
    .commit();
  return revisionId;
}
