import { createClient } from "@sanity/client";
import { sampleWorld } from "../../fixtures/harbor";
import { validateWorld, type World } from "../world/model";
export const WORLD_ID="butterfly-harbor";
export const pointerId=`butterfly.pointer.${WORLD_ID}`;
export function publicClient(){const projectId=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET;if(!projectId||!dataset)throw new Error("Sanity project and dataset are not configured");return createClient({projectId,dataset,apiVersion:"2025-02-19",perspective:"published",useCdn:false});}
export async function loadActiveWorld():Promise<{world:World;source:string;error?:string}>{
  if(!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||!process.env.NEXT_PUBLIC_SANITY_DATASET)return {world:sampleWorld,source:"Local sample"};
  try{
    const client=publicClient();
    const pointer=await client.getDocument<{_id:string;worldId:string;activeRevisionId:string}>(pointerId);
    if(!pointer||pointer._id!==pointerId||pointer.worldId!==WORLD_ID||!pointer.activeRevisionId)throw new Error("Active Butterfly revision is not available for this world");
    const revision=await client.getDocument<{_id:string;revisionId:string;worldId:string;snapshotJson:string}>(pointer.activeRevisionId);
    if(!revision||revision._id!==pointer.activeRevisionId||revision.revisionId!==pointer.activeRevisionId||revision.worldId!==WORLD_ID)throw new Error("Active pointer does not identify a matching frozen Butterfly revision");
    const world=validateWorld(JSON.parse(revision.snapshotJson));
    if(world.id!==WORLD_ID||world.baseRevision!==revision.revisionId)throw new Error("Frozen snapshot identity does not match its active revision");
    return {world,source:"Live Sanity"};
  }catch(e){return {world:sampleWorld,source:"Local sample (live unavailable)",error:e instanceof Error?e.message:String(e)};}
}
