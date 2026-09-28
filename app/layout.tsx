import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = { title: "BUTTERFLY — Keep this moment", description: "Change the world. Keep the moment." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
