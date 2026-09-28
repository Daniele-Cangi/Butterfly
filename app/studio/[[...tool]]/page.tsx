"use client";
import { NextStudio } from "next-sanity/studio";
import config from "@/sanity.config";
export default function StudioPage(){if(!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID)return <main style={{padding:40}}>Configure a dedicated Sanity project to open Butterfly Studio.</main>;return <NextStudio config={config}/>;}
