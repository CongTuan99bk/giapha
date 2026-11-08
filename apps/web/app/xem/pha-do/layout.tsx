import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Phả đồ" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
