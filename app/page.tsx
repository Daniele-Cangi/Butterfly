import Experience from "@/src/ui/Experience";
import { loadActiveWorld } from "@/src/sanity/read";
export const dynamic = "force-dynamic";
export default async function Home() { const loaded = await loadActiveWorld(); return <Experience initialWorld={loaded.world} source={loaded.source} error={loaded.error}/>; }
