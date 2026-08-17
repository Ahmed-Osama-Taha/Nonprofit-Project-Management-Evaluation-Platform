"""Unit tests for login-session helpers that need no database."""

from types import SimpleNamespace

from app.services import sessions


def _req(headers=None, client_host="203.0.113.7"):
    return SimpleNamespace(
        headers=headers or {},
        client=SimpleNamespace(host=client_host) if client_host else None,
    )


def test_parse_device_common_browsers():
    ua_win_chrome = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
    assert sessions.parse_device(ua_win_chrome) == "Chrome (Windows)"

    ua_edge = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0"
    )
    assert sessions.parse_device(ua_edge) == "Edge (Windows)"

    ua_ios_safari = (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    )
    assert sessions.parse_device(ua_ios_safari) == "Safari (iOS)"

    assert sessions.parse_device("Claude/1.0 (Macintosh; macOS)") == "Claude (macOS)"


def test_parse_device_unknown_and_empty():
    assert sessions.parse_device(None) == "Unknown device"
    assert sessions.parse_device("") == "Unknown device"
    assert sessions.parse_device("something-weird/1.0") == "Unknown device"


def test_client_ip_prefers_forwarded_header():
    r = _req(headers={"x-forwarded-for": "198.51.100.9, 10.0.0.1"})
    assert sessions.client_ip(r) == "198.51.100.9"

    r2 = _req(headers={"x-real-ip": "198.51.100.22"})
    assert sessions.client_ip(r2) == "198.51.100.22"

    r3 = _req(headers={})
    assert sessions.client_ip(r3) == "203.0.113.7"

    r4 = _req(headers={}, client_host=None)
    assert sessions.client_ip(r4) is None


def test_lookup_location_private_and_public():
    assert sessions.lookup_location("127.0.0.1") == "Local network"
    assert sessions.lookup_location("10.1.2.3") == "Local network"
    assert sessions.lookup_location("192.168.0.5") == "Local network"
    # Public IP with no GeoIP DB configured -> unknown (no external calls).
    assert sessions.lookup_location("8.8.8.8") is None
    assert sessions.lookup_location(None) is None
    assert sessions.lookup_location("not-an-ip") is None
