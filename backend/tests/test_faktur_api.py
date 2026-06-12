"""Faktur Indo backend API tests — covers auth, business profile, clients, invoices.

Run: pytest /app/backend/tests/test_faktur_api.py -v
"""
import time
import requests
from datetime import datetime, timezone, timedelta


# ---------- Public health ----------
def test_root_returns_200(api, base_url):
    r = api.get(f"{base_url}/api/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("ok") is True
    assert "message" in data


# ---------- Auth ----------
def test_auth_me_no_token_returns_401(api, base_url):
    r = api.get(f"{base_url}/api/auth/me")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"


def test_auth_me_invalid_token_returns_401(api, base_url):
    r = api.get(f"{base_url}/api/auth/me", headers={"Authorization": "Bearer NOT_A_REAL_TOKEN_xyz"})
    assert r.status_code == 401


def test_auth_me_malformed_header_returns_401(api, base_url):
    r = api.get(f"{base_url}/api/auth/me", headers={"Authorization": "Token abc"})
    assert r.status_code == 401


def test_auth_me_with_valid_seeded_token(api, base_url, auth_a):
    r = api.get(f"{base_url}/api/auth/me", headers=auth_a)
    assert r.status_code == 200
    data = r.json()
    assert "user" in data
    assert data["user"]["user_id"] == "user_test123"
    assert "_id" not in data["user"]


def test_protected_endpoints_reject_missing_token(api, base_url):
    """All protected endpoints must return 401 when no auth header is sent."""
    endpoints = [
        ("GET", "/api/business-profile"),
        ("PUT", "/api/business-profile"),
        ("GET", "/api/clients"),
        ("POST", "/api/clients"),
        ("GET", "/api/invoices"),
        ("POST", "/api/invoices"),
        ("GET", "/api/invoices/next-number"),
    ]
    for method, path in endpoints:
        r = api.request(method, f"{base_url}{path}", json={})
        assert r.status_code == 401, f"{method} {path} returned {r.status_code}, expected 401"


# ---------- Business profile ----------
def test_business_profile_default_empty(api, base_url, auth_a):
    r = api.get(f"{base_url}/api/business-profile", headers=auth_a)
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == "user_test123"
    assert "_id" not in data
    # default empty fields should exist
    for key in ["name", "address", "npwp", "phone", "email", "logo_base64", "signature_base64", "bank_info"]:
        assert key in data


def test_business_profile_put_idempotent(api, base_url, auth_a):
    payload = {
        "name": "TEST CV Maju Jaya",
        "address": "Jl. Sudirman 1, Jakarta",
        "npwp": "01.234.567.8-901.000",
        "phone": "+6281234567890",
        "email": "biz@example.com",
        "logo_base64": "data:image/png;base64,AAAA",
        "signature_base64": "data:image/png;base64,BBBB",
        "bank_info": "BCA 1234567890",
    }
    r1 = api.put(f"{base_url}/api/business-profile", json=payload, headers=auth_a)
    assert r1.status_code == 200
    d1 = r1.json()
    for k, v in payload.items():
        assert d1[k] == v
    assert "_id" not in d1

    # GET to verify persistence
    r_get = api.get(f"{base_url}/api/business-profile", headers=auth_a)
    assert r_get.status_code == 200
    for k, v in payload.items():
        assert r_get.json()[k] == v

    # Idempotent — putting same payload returns same data
    r2 = api.put(f"{base_url}/api/business-profile", json=payload, headers=auth_a)
    assert r2.status_code == 200
    d2 = r2.json()
    for k, v in payload.items():
        assert d2[k] == v


# ---------- Clients ----------
def test_clients_crud(api, base_url, auth_a):
    # CREATE
    payload = {"name": "TEST Client A", "address": "Jl. Mawar 2", "phone": "+628111", "email": "c@x.com"}
    r = api.post(f"{base_url}/api/clients", json=payload, headers=auth_a)
    assert r.status_code == 200
    c = r.json()
    assert c["name"] == payload["name"]
    assert c["id"].startswith("cli_")
    assert "_id" not in c
    cid = c["id"]

    # LIST
    r = api.get(f"{base_url}/api/clients", headers=auth_a)
    assert r.status_code == 200
    lst = r.json()
    assert any(x["id"] == cid for x in lst)
    for item in lst:
        assert "_id" not in item

    # UPDATE
    upd = {"name": "TEST Client A2", "address": "X", "phone": "+628222", "email": "c2@x.com"}
    r = api.put(f"{base_url}/api/clients/{cid}", json=upd, headers=auth_a)
    assert r.status_code == 200
    assert r.json()["name"] == "TEST Client A2"

    # DELETE
    r = api.delete(f"{base_url}/api/clients/{cid}", headers=auth_a)
    assert r.status_code == 200
    # verify gone
    r = api.get(f"{base_url}/api/clients", headers=auth_a)
    assert all(x["id"] != cid for x in r.json())


def test_update_nonexistent_client_returns_404(api, base_url, auth_a):
    r = api.put(f"{base_url}/api/clients/nope_xxx",
                json={"name": "x", "address": "", "phone": "", "email": ""}, headers=auth_a)
    assert r.status_code == 404


# ---------- Invoice numbering ----------
def test_next_number_format_and_increment(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    expected_prefix = f"INV/{now.year}/{now.month:02d}/"

    r1 = api.get(f"{base_url}/api/invoices/next-number", headers=auth_a)
    assert r1.status_code == 200
    n1 = r1.json()["number"]
    assert n1 == f"{expected_prefix}0001", f"Expected {expected_prefix}0001, got {n1}"

    # Create an invoice with that number
    payload = {
        "number": n1, "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "Item 1", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    assert r.status_code == 200

    r2 = api.get(f"{base_url}/api/invoices/next-number", headers=auth_a)
    assert r2.json()["number"] == f"{expected_prefix}0002"


# ---------- Invoices CRUD + business logic ----------
def test_invoice_create_computes_totals(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    payload = {
        "number": "TEST/INV/001",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [
            {"description": "A", "quantity": 2, "rate": 100000},   # 200000
            {"description": "B", "quantity": 1.5, "rate": 50000},  # 75000
        ],
        "ppn_enabled": True,
        "ppn_rate": 11.0,
        "notes": "TEST notes",
        "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    assert r.status_code == 200
    inv = r.json()
    assert inv["subtotal"] == 275000.0
    assert round(inv["ppn_amount"], 2) == round(275000 * 0.11, 2)
    assert round(inv["total"], 2) == round(275000 * 1.11, 2)
    assert inv["status"] == "draft"
    assert "_id" not in inv

    # GET single
    r = api.get(f"{base_url}/api/invoices/{inv['id']}", headers=auth_a)
    assert r.status_code == 200
    assert r.json()["id"] == inv["id"]

    # LIST
    r = api.get(f"{base_url}/api/invoices", headers=auth_a)
    assert r.status_code == 200
    assert any(x["id"] == inv["id"] for x in r.json())


def test_invoice_no_ppn(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    payload = {
        "number": "TEST/INV/NO-PPN",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "X", "quantity": 3, "rate": 10000}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    inv = r.json()
    assert inv["subtotal"] == 30000.0
    assert inv["ppn_amount"] == 0
    assert inv["total"] == 30000.0


def test_invoice_update_recomputes(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    create = {
        "number": "TEST/INV/UPD",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=create, headers=auth_a)
    iid = r.json()["id"]

    # Update items + enable PPN
    upd = {"items": [{"description": "Z", "quantity": 2, "rate": 500}], "ppn_enabled": True, "ppn_rate": 10.0}
    r = api.put(f"{base_url}/api/invoices/{iid}", json=upd, headers=auth_a)
    assert r.status_code == 200
    data = r.json()
    assert data["subtotal"] == 1000.0
    assert data["ppn_amount"] == 100.0
    assert data["total"] == 1100.0


def test_invoice_patch_status(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    payload = {
        "number": "TEST/INV/STATUS",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    iid = r.json()["id"]

    # Valid status transition
    r = api.patch(f"{base_url}/api/invoices/{iid}/status", json={"status": "paid"}, headers=auth_a)
    assert r.status_code == 200
    assert r.json()["status"] == "paid"

    # Invalid status
    r = api.patch(f"{base_url}/api/invoices/{iid}/status", json={"status": "bogus"}, headers=auth_a)
    assert r.status_code == 400

    # Non-existent invoice
    r = api.patch(f"{base_url}/api/invoices/nope/status", json={"status": "paid"}, headers=auth_a)
    assert r.status_code == 404


def test_invoice_delete(api, base_url, auth_a):
    now = datetime.now(timezone.utc)
    payload = {
        "number": "TEST/INV/DEL",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    iid = r.json()["id"]

    r = api.delete(f"{base_url}/api/invoices/{iid}", headers=auth_a)
    assert r.status_code == 200

    r = api.get(f"{base_url}/api/invoices/{iid}", headers=auth_a)
    assert r.status_code == 404


def test_invoice_auto_overdue(api, base_url, auth_a):
    """A 'sent' invoice with past due_date should auto-flip to 'overdue' on GET."""
    now = datetime.now(timezone.utc)
    past = (now - timedelta(days=5)).strftime("%Y-%m-%d")
    payload = {
        "number": "TEST/INV/OVERDUE",
        "issue_date": (now - timedelta(days=10)).strftime("%Y-%m-%d"),
        "due_date": past,
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "sent",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a)
    iid = r.json()["id"]

    r = api.get(f"{base_url}/api/invoices/{iid}", headers=auth_a)
    assert r.status_code == 200
    assert r.json()["status"] == "overdue"

    # also via list
    r = api.get(f"{base_url}/api/invoices", headers=auth_a)
    target = next((x for x in r.json() if x["id"] == iid), None)
    assert target is not None
    assert target["status"] == "overdue"


def test_invoice_with_client_snapshot(api, base_url, auth_a):
    # Create client first
    c = api.post(f"{base_url}/api/clients",
                 json={"name": "TEST Snap Co", "address": "addr", "phone": "+628", "email": "s@x.com"},
                 headers=auth_a).json()
    now = datetime.now(timezone.utc)
    inv = api.post(f"{base_url}/api/invoices", json={
        "number": "TEST/INV/SNAP",
        "client_id": c["id"],
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "X", "quantity": 1, "rate": 1000}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }, headers=auth_a).json()
    assert inv["client_snapshot"]["name"] == "TEST Snap Co"
    assert inv["client_snapshot"]["phone"] == "+628"


# ---------- Cross-tenant isolation ----------
def test_user_b_cannot_see_user_a_clients(api, base_url, auth_a, auth_b):
    r = api.post(f"{base_url}/api/clients",
                 json={"name": "TEST A-Only", "address": "", "phone": "", "email": ""},
                 headers=auth_a)
    cid = r.json()["id"]

    # User B's list should not include A's client
    r = api.get(f"{base_url}/api/clients", headers=auth_b)
    assert r.status_code == 200
    assert all(x["id"] != cid for x in r.json())

    # User B cannot update A's client
    r = api.put(f"{base_url}/api/clients/{cid}",
                json={"name": "hacked", "address": "", "phone": "", "email": ""},
                headers=auth_b)
    assert r.status_code == 404

    # User B "delete" returns ok but did not actually delete (no-op due to user_id filter)
    api.delete(f"{base_url}/api/clients/{cid}", headers=auth_b)
    # A still has the client
    r = api.get(f"{base_url}/api/clients", headers=auth_a)
    assert any(x["id"] == cid for x in r.json())


def test_user_b_cannot_access_user_a_invoice(api, base_url, auth_a, auth_b):
    now = datetime.now(timezone.utc)
    payload = {
        "number": "TEST/INV/ISOL",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }
    iid = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a).json()["id"]

    # B cannot GET
    r = api.get(f"{base_url}/api/invoices/{iid}", headers=auth_b)
    assert r.status_code == 404

    # B's list excludes A's invoice
    r = api.get(f"{base_url}/api/invoices", headers=auth_b)
    assert all(x["id"] != iid for x in r.json())

    # B cannot update or patch status
    r = api.put(f"{base_url}/api/invoices/{iid}",
                json={"notes": "hacked"}, headers=auth_b)
    assert r.status_code == 404

    r = api.patch(f"{base_url}/api/invoices/{iid}/status",
                  json={"status": "paid"}, headers=auth_b)
    assert r.status_code == 404


# ---------- ObjectId leakage ----------
def test_no_objectid_leakage_in_any_response(api, base_url, auth_a):
    """No response should ever contain '_id' (ObjectId)."""
    now = datetime.now(timezone.utc)
    # Seed some data
    api.put(f"{base_url}/api/business-profile",
            json={"name": "TEST BP"}, headers=auth_a)
    api.post(f"{base_url}/api/clients",
             json={"name": "TEST C", "address": "", "phone": "", "email": ""},
             headers=auth_a)
    api.post(f"{base_url}/api/invoices", json={
        "number": "TEST/INV/IDLEAK",
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [{"description": "A", "quantity": 1, "rate": 100}],
        "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
    }, headers=auth_a)

    endpoints = [
        "/api/auth/me", "/api/business-profile", "/api/clients", "/api/invoices",
    ]
    for ep in endpoints:
        r = api.get(f"{base_url}{ep}", headers=auth_a)
        assert r.status_code == 200, f"{ep} -> {r.status_code}"
        body_text = r.text
        assert '"_id"' not in body_text, f"{ep} response leaks _id"
