"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/tracking";

/** Mounts once in the root layout; emits a pageview on first load and on every
 *  client-side route change. */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("pageview");
  }, [pathname]);
  return null;
}
