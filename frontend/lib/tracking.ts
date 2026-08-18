"use client";

// Visitor intelligence SDK — device fingerprint + signals + behaviour, sent to
// the first-party /api/collect endpoint. Fully client-side; the fingerprint is
// computed locally (FingerprintJS OSS) with no external calls.
//
// NOTE: this collects data. Using it for analytics/marketing requires consent
// (PDPL) before production — collection is gated by the backend `tracking_enabled`
// and each visitor carries a `consent` state for the future banner.

const KEY = "ath_vid";
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "v-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Stable first-party visitor id, mirrored across cookie + localStorage so it
 *  survives one of them being cleared. */
function visitorKey(): string {
  let v: string | null = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (!v) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + KEY + "=([^;]*)"));
    v = m ? decodeURIComponent(m[1]) : null;
  }
  if (!v) v = uuid();
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
  // 2-year first-party cookie.
  document.cookie = `${KEY}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 24 * 730}; SameSite=Lax`;
  return v;
}

function readConsent(): string {
  try {
    return localStorage.getItem("ath_consent") || "none";
  } catch {
    return "none";
  }
}

function collectSignals() {
  const n = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };
  return {
    userAgent: n.userAgent,
    languages: (n.languages || [n.language]).join(","),
    platform: n.platform,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    colorDepth: screen.colorDepth,
    pixelRatio: window.devicePixelRatio,
    hardwareConcurrency: n.hardwareConcurrency,
    deviceMemory: n.deviceMemory ?? null,
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    cookiesEnabled: navigator.cookieEnabled,
    dnt: navigator.doNotTrack,
    connection: n.connection
      ? { type: n.connection.effectiveType, downlink: n.connection.downlink, rtt: n.connection.rtt }
      : null,
  };
}

function utmParams(): Record<string, string> | null {
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = q.get(k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

let fpPromise: Promise<{ visitorId: string; components: unknown }> | null = null;
async function fingerprint() {
  // Loaded only in the browser (dynamic import) so it never runs during SSR /
  // static prerender, and computed fully client-side (no external calls).
  if (!fpPromise) {
    fpPromise = import("@fingerprintjs/fingerprintjs")
      .then((m) => m.default.load())
      .then((fp) => fp.get()) as Promise<{ visitorId: string; components: unknown }>;
  }
  return fpPromise;
}

let started = false;

/** Send one event. `type` defaults to "pageview". */
export async function track(type = "pageview", payload?: Record<string, unknown>) {
  try {
    const key = visitorKey();
    const fp = await fingerprint().catch(() => null);
    const body = {
      visitor_key: key,
      fingerprint_hash: fp?.visitorId ?? null,
      fingerprint_components: fp?.components ?? null,
      signals: collectSignals(),
      type,
      url: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      utm: utmParams(),
      consent: readConsent(),
      payload: payload ?? null,
    };
    await fetch(`${API}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify(body),
      credentials: "include", // so the backend can link the logged-in user
      keepalive: true,
    });
  } catch {
    /* tracking must never surface an error to the user */
  }
}

/** Idempotent init — safe to call on every render; only the first wins. */
export function initTracking() {
  if (started || typeof window === "undefined") return;
  started = true;
  track("pageview");
}
