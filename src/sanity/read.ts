import { createClient } from "@sanity/client";
import { sampleWorld } from "../../fixtures/harbor";
import { validateWorld, type World } from "../world/model";
export const WORLD_ID="butterfly-harbor";
export const pointerId=`butterfly.pointer.${WORLD_ID}`;
export function publicClient(){const projectId=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET;if(!projectId||!dataset)throw new Error("Sanity project and dataset are not configured");return createClient({projectId,dataset,apiVersion:"2025-02-19",useCdn:false});}
export async function loadActiveWorld():Promise<{world:World;source:string;error?:string}>{
  if(!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||!process.env.NEXT_PUBLIC_SANITY_DATASET)return {world:sampleWorld,source:"Local sample"};
  try{const client=publicClient();const pointer=await client.getDocument<{worldId:string;activeRevisionId:string}>(pointerId);if(!pointer||pointer.worldId!==WORLD_ID)throw new Error("Active Butterfly pointer is missing or belongs to another world");const revision=await client.getDocument<{worldId:string;snapshotJson:string}>(pointer.activeRevisionId);if(!revision||revision.worldId!==WORLD_ID)throw new Error("Frozen Butterfly revision is missing");const world=validateWorld(JSON.parse(revision.snapshotJson));if(world.id!==WORLD_ID)throw new Error("Snapshot world mismatch");return {world,source:"Live Sanity"};}catch(e){return {world:sampleWorld,source:"Local sample (live unavailable)",error:e instanceof Error?e.message:String(e)};}
}
