import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhyMatch",
    short_name: "WhyMatch",
    description:
      "You know why you match. A nonprofit, open-source introduction service with transparent matching.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#173f32",
    orientation: "portrait",
    categories: ["social", "lifestyle"],
    icons: [
      {
        src: "/openmatch-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/openmatch-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/openmatch-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/openmatch-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
