import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./src/sanity/schema";
import Director from "./src/sanity/Director";
export default defineConfig({name:"butterfly",title:"BUTTERFLY Studio",basePath:"/studio",projectId:process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||"missing",dataset:process.env.NEXT_PUBLIC_SANITY_DATASET||"butterfly",plugins:[structureTool()],tools:[{name:"director",title:"Director",component:Director}],schema:{types:schemaTypes}});
