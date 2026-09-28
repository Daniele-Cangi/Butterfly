"use client";
import { useEffect, useState } from "react";
import { useClient } from "sanity";
import dynamic from "next/dynamic";
import { fromDraftDocument } from "./adapter";
import { applyPatch, type World } from "../world/model";
import { formatTime, simulate } from "../engine/simulate";
import { WORLD_ID } from "./read";
const Diorama=dynamic(()=>import("../scene/Diorama"),{ssr:false});
export default function Director(){const client=useClient({apiVersion:"2025-02-19"});const [world,setWorld]=useState<World|null>(null),[error,setError]=useState<string|null>(null),[time,setTime]=useState(50),[closed,setClosed]=useState(false);
  useEffect(()=>{let active=true;Promise.all([client.getDocument(`drafts.butterfly.world.${WORLD_ID}`),client.getDocument(`butterfly.world.${WORLD_ID}`)]).then(([draft,published])=>{if(active){const doc=draft??published;if(!doc)throw new Error("Seed the Butterfly draft first");setWorld(fromDraftDocument(doc));}}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e))});return()=>{active=false}},[client]);
  if(error)return <div style={{padding:30}}>Director cannot validate this draft: {error}</div>;if(!world)return <div style={{padding:30}}>Loading Butterfly draft…</div>;
  const original=simulate(world),variant=simulate(closed?applyPatch(world,{worldId:world.id,baseRevision:world.baseRevision,operations:[{type:"setConnectionEnd",connectionId:world.visitorClosure.connectionId,value:world.visitorClosure.end}]}):world);
  return <div style={{padding:18,height:"90vh",display:"grid",gridTemplateRows:"auto 1fr auto",gap:12,background:"#f4f1e8"}}><div><h1 style={{margin:0}}>Director · {world.title}</h1><p style={{margin:"4px 0"}}>Draft data through the same validator, engine and scene. Publishing requires the authorized CLI.</p></div><div style={{position:"relative",minHeight:400}}><Diorama world={world} original={original} variant={variant} time={time} compare={true} preview={false} selected={null} onSelect={()=>{}}/></div><div><button onClick={()=>setClosed(x=>!x)}>{closed?"Restore bridge":`Close bridge at ${formatTime(world.visitorClosure.end,world.originMinute)}`}</button> <input aria-label="Director time" type="range" min="0" max={world.horizon} value={time} onChange={e=>setTime(Number(e.target.value))}/> {formatTime(time,world.originMinute)} · Photo: {variant.events.find(e=>e.id==="photo")?.status}</div></div>;
}
