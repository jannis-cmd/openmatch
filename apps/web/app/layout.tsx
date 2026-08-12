import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenMatch — Made to help you leave",
  description:
    "A nonprofit, open-source introduction service with transparent matching and no infinite feed.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
