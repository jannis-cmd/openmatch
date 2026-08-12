import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OpenMatch",
    short_name: "OpenMatch",
    description:
      "A nonprofit, open-source introduction service with transparent matching and no infinite feed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#173f32",
    orientation: "portrait",
    categories: ["social", "lifestyle"],
    icons: [
      {
        src: "/openmatch-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
