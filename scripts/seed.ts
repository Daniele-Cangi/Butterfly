import { sampleWorld } from "../fixtures/harbor";
import { toDraftDocument } from "../src/sanity/adapter";
import { pointerId } from "../src/sanity/read";
import { loadLocalEnv } from "./loadLocalEnv";
import { createAuthorizedSanityClient } from "./sanityClient";
loadLocalEnv();
const client = createAuthorizedSanityClient();
try {
  await client.createIfNotExists(toDraftDocument(sampleWorld));
  await client.createIfNotExists({_id:pointerId,_type:"butterflyWorldPointer",worldId:sampleWorld.id,activeRevisionId:""});
  console.log("Butterfly authoring document and pointer exist. Existing editorial content was preserved.");
} catch (error) {
  const failure = error as { statusCode?: number; details?: { description?: string }; message?: string };
  const status = failure.statusCode ? ` (${failure.statusCode})` : "";
  const message = failure.details?.description ?? failure.message ?? "Unknown Content Lake error";
  throw new Error(`Sanity seed failed${status}: ${message}`);
}
