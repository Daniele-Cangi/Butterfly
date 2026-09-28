import { publishWorldSnapshot } from "../src/sanity/publishWorld";
import { loadLocalEnv } from "./loadLocalEnv";
import { createAuthorizedSanityClient } from "./sanityClient";
loadLocalEnv();
const expected=process.argv.find(x=>x.startsWith("--expected-rev="))?.slice("--expected-rev=".length);
if(!expected)throw new Error("Pass --expected-rev=<pointer _rev> after reviewing the current pointer");
const revisionId=await publishWorldSnapshot(createAuthorizedSanityClient(),expected);
console.log(`Published frozen Butterfly revision ${revisionId}`);
