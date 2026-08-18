"""Rule-based identity risk scoring (Okta-ThreatInsight / Entra-style, but
simple and dependency-free).

Given an identity's devices, login sessions, and recent events, derive a
Low / Medium / High risk level plus the human-readable signals that produced it.
This is intentionally rule-based (not ML): cheap, explainable, and enough for an
MVP security posture.
"""

from __future__ import annotations

from datetime import timedelta


def _country(loc: str | None) -> str | None:
    if not loc or loc == "Local network":
        return None
    return loc.split(",")[-1].strip() or None


def compute_risk(devices, sessions, events) -> tuple[str, list[str]]:
    """Return (level, signals). ``devices`` = Visitor rows, ``sessions`` =
    UserSession rows, ``events`` = VisitorEvent rows."""
    signals: list[str] = []
    high = False
    medium = False

    # Bot device present.
    if any(getattr(d, "is_bot", False) for d in devices):
        signals.append("bot_device")
        medium = True

    # New-device logins (fingerprint never seen before for this user).
    nd = sum(1 for e in events if getattr(e, "new_device", False))
    if nd:
        signals.append(f"new_device_logins:{nd}")
        medium = True

    # Many devices for one identity (possible account sharing).
    if len(devices) >= 4:
        signals.append(f"many_devices:{len(devices)}")
        medium = True

    # Multiple distinct countries across sessions/devices.
    locs = [getattr(s, "location", None) for s in sessions]
    locs += [getattr(d, "location", None) for d in devices]
    countries = {c for c in (_country(x) for x in locs) if c}
    if len(countries) > 1:
        signals.append("multiple_countries:" + ",".join(sorted(countries)))
        high = True

    # Impossible travel: two consecutive sessions from different locations
    # within a short window (no realistic way to travel between them).
    timed = sorted(
        [
            (s.last_seen_at or s.created_at, _country(getattr(s, "location", None)))
            for s in sessions
            if (s.last_seen_at or s.created_at)
        ],
        key=lambda x: x[0],
    )
    for (t1, c1), (t2, c2) in zip(timed, timed[1:]):
        if c1 and c2 and c1 != c2 and (t2 - t1) < timedelta(hours=2):
            signals.append(f"impossible_travel:{c1}->{c2}")
            high = True
            break

    # Login velocity: many sessions created in a short window.
    created = sorted([s.created_at for s in sessions if s.created_at])
    for i in range(len(created)):
        window = [t for t in created[i:] if t - created[i] <= timedelta(minutes=10)]
        if len(window) >= 5:
            signals.append(f"high_velocity:{len(window)}/10min")
            medium = True
            break

    level = "high" if high else "medium" if medium else "low"
    if not signals:
        signals.append("no_anomalies")
    return level, signals
