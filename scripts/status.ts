import { pointerId, WORLD_ID } from "../src/sanity/read";
import { loadLocalEnv } from "./loadLocalEnv";
import { createAuthorizedSanityClient } from "./sanityClient";
loadLocalEnv();
const client = createAuthorizedSanityClient();
const pointer=await client.getDocument<{_id:string;worldId:string;_rev:string;activeRevisionId:string}>(pointerId);
if(!pointer||pointer.worldId!==WORLD_ID)throw new Error("Butterfly pointer missing or world mismatch");
if(pointer.activeRevisionId){const revision=await client.getDocument<{_id:string;revisionId:string;worldId:string;snapshotJson:string}>(pointer.activeRevisionId);if(!revision||revision._id!==pointer.activeRevisionId||revision.revisionId!==pointer.activeRevisionId||revision.worldId!==WORLD_ID)throw new Error("Active pointer does not identify a matching frozen revision");}
console.log(JSON.stringify({pointerId,_rev:pointer._rev,worldId:pointer.worldId,activeRevisionId:pointer.activeRevisionId||null},null,2));
