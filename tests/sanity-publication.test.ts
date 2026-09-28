import { describe, expect, it } from "vitest";
import type { getCliClient } from "sanity/cli";
import { sampleWorld } from "../fixtures/harbor";
import { pointerId } from "../src/sanity/read";
import { publishWorldSnapshot } from "../src/sanity/publishWorld";
import { toDraftDocument } from "../src/sanity/adapter";

function fakePublisher(concurrentUpdate = false) {
  const activeId = "butterfly.revision.r0";
  const pointer = { _id: pointerId, _rev: "pointer-rev-a", worldId: sampleWorld.id, activeRevisionId: activeId };
  const documents = new Map<string, Record<string, unknown>>([
    ["butterfly.world." + sampleWorld.id, toDraftDocument(sampleWorld) as unknown as Record<string, unknown>],
    [pointerId, pointer],
    [activeId, { _id: activeId, revisionId: activeId, worldId: sampleWorld.id }],
  ]);
  let pendingRevision: Record<string, unknown> | undefined;
  let expectedRevision: string | undefined;
  let patchedPointerId: string | undefined;
  const transaction = {
    create(document: Record<string, unknown>) { pendingRevision = document; return transaction; },
    patch(documentId: string, build: (patch: unknown) => unknown) {
      patchedPointerId = documentId;
      build({ ifRevisionId: (revision: string) => { expectedRevision = revision; return { set: () => undefined }; } });
      return transaction;
    },
    async commit() {
      if (concurrentUpdate) {
        pointer._rev = "pointer-rev-concurrent";
        pointer.activeRevisionId = "butterfly.revision.concurrent";
      }
      if (pointer._rev !== expectedRevision) throw new Error("409 Conflict: pointer revision changed");
      if (!pendingRevision || patchedPointerId !== pointerId) throw new Error("Incomplete publication transaction");
      documents.set(String(pendingRevision._id), pendingRevision);
      pointer._rev = "pointer-rev-b";
      pointer.activeRevisionId = String(pendingRevision._id);
      return { transactionId: "fake-transaction" };
    },
  };
  const client = {
    getDocument: async (id: string) => documents.get(id) ?? null,
    transaction: () => transaction,
  } as unknown as ReturnType<typeof getCliClient>;
  return { client, pointer, documents };
}

describe("Sanity frozen publication", () => {
  it("publishes a complete simulated snapshot and atomically moves the pointer", async () => {
    const fake = fakePublisher();
    const revisionId = await publishWorldSnapshot(fake.client, "pointer-rev-a");
    const revision = fake.documents.get(revisionId)!;
    const snapshot = JSON.parse(String(revision.snapshotJson)) as { id: string; baseRevision: string };

    expect(revision).toMatchObject({ _id: revisionId, revisionId, worldId: sampleWorld.id });
    expect(snapshot).toMatchObject({ id: sampleWorld.id, baseRevision: revisionId });
    expect(fake.pointer.activeRevisionId).toBe(revisionId);
  });

  it("rejects a concurrent pointer update without replacing its active revision", async () => {
    const fake = fakePublisher(true);
    await expect(publishWorldSnapshot(fake.client, "pointer-rev-a")).rejects.toThrow("409 Conflict");
    expect(fake.pointer.activeRevisionId).toBe("butterfly.revision.concurrent");
    expect([...fake.documents.keys()].filter(id => id.startsWith("butterfly.revision.")).sort()).toEqual(["butterfly.revision.r0"]);
  });
});
