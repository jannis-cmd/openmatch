import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenMatch",
  description: "A transparent nonprofit introduction service prototype.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
