import type { MetadataRoute } from "next";

// PWA manifest — makes Athar installable to the iOS/Android home screen and run
// full-screen ("standalone") like a native app. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Athar — أثر",
    short_name: "Athar",
    description:
      "Submit, review, and evaluate nonprofit project applications with AI assistance.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0b100d",
    theme_color: "#006c35",
    dir: "auto",
    lang: "ar",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
