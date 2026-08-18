"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track, bindBehavior } from "@/lib/tracking";

/** Mounts once in the root layout; emits a pageview on first load and on every
 *  client-side route change, and binds delegated click/behaviour capture. */
export function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    bindBehavior();
  }, []);
  useEffect(() => {
    track("pageview");
  }, [pathname]);
  return null;
}
