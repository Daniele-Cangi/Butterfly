import { NextResponse } from "next/server";
import { pointerId, publicClient } from "@/src/sanity/read";
export async function GET(){try{const pointer=await publicClient().getDocument<{activeRevisionId:string}>(pointerId);return NextResponse.json({revisionId:pointer?.activeRevisionId??null});}catch{return NextResponse.json({error:"Live version unavailable"},{status:503});}}
