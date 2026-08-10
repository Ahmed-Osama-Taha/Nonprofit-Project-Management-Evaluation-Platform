"""Test fixtures.

These integration tests require a PostgreSQL database with the pgvector
extension available (the `CREATE EXTENSION vector` in init_db must succeed).
Point TEST_DATABASE_URL at one, or rely on the default below which matches the
`db` service in docker-compose.

S3/MinIO calls are mocked with `moto`, and AI is left unconfigured so the
analysis pipeline exercises its failure path without external calls.
"""

import os

os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://nppm:nppm@localhost:5432/nppm",
    ),
)
os.environ["OPENAI_API_KEY"] = ""
os.environ["S3_ENDPOINT_URL"] = "https://s3.us-east-1.amazonaws.com"
os.environ["S3_PUBLIC_ENDPOINT_URL"] = "https://s3.us-east-1.amazonaws.com"
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.main import app


@pytest.fixture(scope="session")
def client():
    with mock_aws():
        with TestClient(app) as c:
            yield c


def _auth(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def org_headers(client):
    return _auth(client, "org@demo.org", "Org123!")


@pytest.fixture
def reviewer_headers(client):
    return _auth(client, "reviewer@demo.org", "Reviewer123!")


@pytest.fixture
def admin_headers(client):
    return _auth(client, "admin@demo.org", "Admin123!")
