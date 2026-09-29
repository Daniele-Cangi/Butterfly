import { NextResponse } from "next/server";
import { pointerId, sanityReadClient } from "@/src/sanity/read";
const pointerQuery='*[_id == $id][0]{activeRevisionId}';
export async function GET(){try{const pointer=await sanityReadClient().fetch<{activeRevisionId:string}|null>(pointerQuery,{id:pointerId});return NextResponse.json({revisionId:pointer?.activeRevisionId??null});}catch{return NextResponse.json({error:"Live version unavailable"},{status:503});}}
