"""Unit tests for the ClamAV client that need no daemon."""

import pytest

from app.services import antivirus


def test_disabled_is_noop_clean():
    # No clamav_host configured in tests -> scanning disabled, always "clean".
    assert antivirus.av_enabled() is False
    assert antivirus.scan_bytes(b"anything") == (True, None)


def test_interpret_clean():
    assert antivirus._interpret("stream: OK") == (True, None)


def test_interpret_infected():
    clean, sig = antivirus._interpret("stream: Eicar-Test-Signature FOUND")
    assert clean is False
    assert sig == "Eicar-Test-Signature"


def test_interpret_unexpected_raises():
    with pytest.raises(antivirus.AVUnavailable):
        antivirus._interpret("stream: ERROR something went wrong")
