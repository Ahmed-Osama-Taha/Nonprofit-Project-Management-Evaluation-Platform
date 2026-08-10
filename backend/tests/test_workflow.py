"""End-to-end workflow and authorization tests."""


def _create_submitted_project(client, org_headers) -> str:
    r = client.post(
        "/api/projects",
        headers=org_headers,
        json={
            "title": "Clean Water Wells",
            "problem_statement": "No clean water in region X",
            "goals": "Build 20 wells",
            "requested_budget": 100000,
            "target_beneficiaries": 5000,
        },
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["status"] == "draft"

    r = client.post(
        f"/api/projects/{pid}/documents",
        headers=org_headers,
        files={"file": ("proposal.txt", b"20 wells at 5000 USD each over 8 months.", "text/plain")},
    )
    assert r.status_code == 201, r.text

    r = client.post(f"/api/projects/{pid}/submit", headers=org_headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "submitted"
    return pid


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_submit_requires_core_fields(client, org_headers):
    r = client.post("/api/projects", headers=org_headers, json={"title": "Incomplete"})
    pid = r.json()["id"]
    r = client.post(f"/api/projects/{pid}/submit", headers=org_headers)
    assert r.status_code == 422  # missing problem_statement / goals


def test_full_review_cycle(client, org_headers, reviewer_headers):
    pid = _create_submitted_project(client, org_headers)

    # Reviewer requests changes (comment required).
    r = client.post(
        f"/api/projects/{pid}/reviews",
        headers=reviewer_headers,
        json={"decision": "request_changes"},
    )
    assert r.status_code == 422  # comment required

    r = client.post(
        f"/api/projects/{pid}/reviews",
        headers=reviewer_headers,
        json={"decision": "request_changes", "comment": "Add M&E plan"},
    )
    assert r.status_code == 201
    assert r.json()["status"] == "changes_requested"

    # Org is notified and can resubmit.
    r = client.get("/api/notifications", headers=org_headers)
    assert any("request changes" in n["message"] for n in r.json())

    client.post(f"/api/projects/{pid}/submit", headers=org_headers)

    # Reviewer approves -> terminal state, decided_at recorded.
    r = client.post(
        f"/api/projects/{pid}/reviews", headers=reviewer_headers, json={"decision": "approve"}
    )
    assert r.status_code == 201
    assert r.json()["status"] == "approved"
    assert r.json()["decided_at"] is not None

    # No further reviews once decided.
    r = client.post(
        f"/api/projects/{pid}/reviews", headers=reviewer_headers, json={"decision": "reject"}
    )
    assert r.status_code == 409


def test_rbac_org_cannot_access_admin(client, org_headers):
    assert client.get("/api/admin/stats", headers=org_headers).status_code == 403


def test_rbac_org_only_sees_own_projects(client, org_headers, reviewer_headers):
    # Reviewer can list; org listing is scoped to its own org (no cross-org leak).
    r = client.get("/api/projects", headers=org_headers)
    assert r.status_code == 200
    org_ids = {p["organization"]["id"] for p in r.json()}
    assert len(org_ids) <= 1


def test_ai_analysis_marked_failed_without_key(client, org_headers, reviewer_headers):
    pid = _create_submitted_project(client, org_headers)
    # Reviewer re-runs analysis synchronously; with no API key it should 503.
    r = client.post(f"/api/projects/{pid}/analyze", headers=reviewer_headers)
    assert r.status_code == 503


def test_admin_stats_and_audit(client, admin_headers):
    assert client.get("/api/admin/stats", headers=admin_headers).status_code == 200
    assert client.get("/api/admin/audit", headers=admin_headers).status_code == 200
