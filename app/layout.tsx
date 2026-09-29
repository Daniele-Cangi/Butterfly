import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "BUTTERFLY — Keep this moment",
  description:
    "An interactive 3D story where one changed condition reshapes an afternoon, and verified interventions preserve a moment without undoing the change.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
