import { createClient } from "@sanity/client";
import { getCliClient } from "sanity/cli";

export function createAuthorizedSanityClient() {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
  const token = process.env.SANITY_API_TOKEN;
  if (!projectId || !dataset) throw new Error("Set the Butterfly project ID and dataset before using the Sanity CLI scripts");
  const config = { projectId, dataset, useCdn: false, apiVersion: "2025-02-19" } as const;
  return token ? createClient({ ...config, token }) as unknown as ReturnType<typeof getCliClient> : getCliClient(config);
}
