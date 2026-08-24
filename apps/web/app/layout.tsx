import "./styles.css";
import type { Metadata } from "next";
import { LocaleProvider } from "../lib/locale";

export const metadata: Metadata = {
  title: "WhyMatch — You know why you match",
  description:
    "You know why you match. A nonprofit, open-source introduction service with transparent matching and no infinite feed.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/openmatch-icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WhyMatch",
  },
};

export const viewport = {
  themeColor: "#173f32",
  colorScheme: "light",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
