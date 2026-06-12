"""Iteration 2 — Tests for new endpoints: duplicate, payment-link, midtrans notification.

Run: pytest /app/backend/tests/test_new_features.py -v
"""
import hashlib
import os
from datetime import datetime, timezone, timedelta

import pytest
import requests


# ---------- Helpers ----------
def _create_invoice(api, base_url, auth, *, number="TEST/INV/SRC", with_client_snapshot=False, ppn=False):
    now = datetime.now(timezone.utc)
    payload = {
        "number": number,
        "issue_date": now.strftime("%Y-%m-%d"),
        "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
        "items": [
            {"description": "Konsultasi", "quantity": 2, "rate": 250000},
            {"description": "Setup biaya", "quantity": 1, "rate": 500000},
        ],
        "ppn_enabled": ppn,
        "ppn_rate": 11.0,
        "notes": "TEST source notes",
        "status": "draft",
    }
    r = api.post(f"{base_url}/api/invoices", json=payload, headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================
# 1) DUPLICATE INVOICE
# =========================================================
class TestDuplicateInvoice:
    def test_duplicate_creates_new_draft_with_new_number_and_dates(self, api, base_url, auth_a):
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/DUP-SRC", ppn=True)
        src_id = src["id"]

        r = api.post(f"{base_url}/api/invoices/{src_id}/duplicate", headers=auth_a)
        assert r.status_code == 200, r.text
        dup = r.json()

        # New id, new number, status reset
        assert dup["id"] != src_id
        assert dup["id"].startswith("inv_")
        assert dup["number"] != src["number"]
        # Auto-generated number INV/YYYY/MM/####
        now = datetime.now(timezone.utc)
        assert dup["number"].startswith(f"INV/{now.year}/{now.month:02d}/")
        assert dup["status"] == "draft"

        # Dates: issue=today, due=today+14d
        today = now.strftime("%Y-%m-%d")
        due14 = (now + timedelta(days=14)).strftime("%Y-%m-%d")
        assert dup["issue_date"] == today
        assert dup["due_date"] == due14

        # Items & totals copied
        assert len(dup["items"]) == len(src["items"])
        for s_it, d_it in zip(src["items"], dup["items"]):
            assert s_it["description"] == d_it["description"]
            assert s_it["quantity"] == d_it["quantity"]
            assert s_it["rate"] == d_it["rate"]
        assert dup["subtotal"] == src["subtotal"]
        assert dup["ppn_amount"] == src["ppn_amount"]
        assert dup["total"] == src["total"]
        assert dup["ppn_enabled"] == src["ppn_enabled"]

        # No ObjectId leak, payment fields default empty strings
        assert "_id" not in dup
        for k in ("payment_url", "payment_token", "midtrans_order_id", "midtrans_status"):
            assert dup.get(k) == ""

        # GET → verify persisted
        r_get = api.get(f"{base_url}/api/invoices/{dup['id']}", headers=auth_a)
        assert r_get.status_code == 200
        assert r_get.json()["id"] == dup["id"]

    def test_duplicate_nonexistent_returns_404(self, api, base_url, auth_a):
        r = api.post(f"{base_url}/api/invoices/nope_999/duplicate", headers=auth_a)
        assert r.status_code == 404

    def test_duplicate_cross_tenant_404(self, api, base_url, auth_a, auth_b):
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/DUP-X")
        r = api.post(f"{base_url}/api/invoices/{src['id']}/duplicate", headers=auth_b)
        assert r.status_code == 404

    def test_duplicate_requires_auth(self, api, base_url):
        r = api.post(f"{base_url}/api/invoices/anything/duplicate")
        assert r.status_code == 401


# =========================================================
# 2) MIDTRANS PAYMENT LINK
# =========================================================
class TestPaymentLink:
    def test_payment_link_nonexistent_invoice_returns_404(self, api, base_url, auth_a):
        r = api.post(f"{base_url}/api/invoices/nope_xxx/payment-link", headers=auth_a)
        assert r.status_code == 404

    def test_payment_link_requires_auth(self, api, base_url):
        r = api.post(f"{base_url}/api/invoices/any/payment-link")
        assert r.status_code == 401

    def test_payment_link_cross_tenant_404(self, api, base_url, auth_a, auth_b):
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/PAY-X")
        r = api.post(f"{base_url}/api/invoices/{src['id']}/payment-link", headers=auth_b)
        assert r.status_code == 404

    def test_payment_link_zero_total_returns_400(self, api, base_url, auth_a):
        now = datetime.now(timezone.utc)
        payload = {
            "number": "TEST/INV/PAY-ZERO",
            "issue_date": now.strftime("%Y-%m-%d"),
            "due_date": (now + timedelta(days=7)).strftime("%Y-%m-%d"),
            "items": [{"description": "Free", "quantity": 1, "rate": 0}],
            "ppn_enabled": False, "ppn_rate": 11.0, "notes": "", "status": "draft",
        }
        inv = api.post(f"{base_url}/api/invoices", json=payload, headers=auth_a).json()
        r = api.post(f"{base_url}/api/invoices/{inv['id']}/payment-link", headers=auth_a)
        assert r.status_code == 400

    def test_payment_link_creation_or_graceful_502(self, api, base_url, auth_a, mongo_db):
        """Either Midtrans accepts → fields populated, OR rejects → 502 + invoice unchanged."""
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/PAY-OK", ppn=True)
        before = src.copy()
        assert before["payment_url"] == ""

        r = api.post(f"{base_url}/api/invoices/{src['id']}/payment-link", headers=auth_a)
        if r.status_code == 200:
            data = r.json()
            assert data["payment_url"], "payment_url must be non-empty on success"
            assert data["payment_url"].startswith("http")
            assert data["payment_token"], "payment_token must be set"
            assert data["midtrans_order_id"].startswith(src["id"] + "-")
            assert data["midtrans_status"] == "pending"
            assert "_id" not in data

            # GET to verify persistence
            fresh = api.get(f"{base_url}/api/invoices/{src['id']}", headers=auth_a).json()
            assert fresh["payment_url"] == data["payment_url"]
            assert fresh["payment_token"] == data["payment_token"]
            assert fresh["midtrans_order_id"] == data["midtrans_order_id"]
            print(f"INFO Midtrans accepted key — payment_url={data['payment_url']}")
        elif r.status_code == 502:
            # Expected fallback for invalid key — verify invoice was NOT mutated
            fresh = api.get(f"{base_url}/api/invoices/{src['id']}", headers=auth_a).json()
            assert fresh["payment_url"] == ""
            assert fresh["payment_token"] == ""
            assert fresh["midtrans_order_id"] == ""
            assert fresh["midtrans_status"] == ""
            print(f"INFO Midtrans rejected key (502) — error: {r.text[:200]}")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text[:300]}")


# =========================================================
# 3) MIDTRANS WEBHOOK NOTIFICATION
# =========================================================
SERVER_KEY = "Mid-server-rizlQnLFBYVcoiP9Z7YKcoRq"


def _sig(order_id: str, status_code: str, gross_amount: str) -> str:
    raw = f"{order_id}{status_code}{gross_amount}{SERVER_KEY}"
    return hashlib.sha512(raw.encode("utf-8")).hexdigest()


class TestMidtransNotification:
    def test_invalid_signature_returns_400(self, api, base_url):
        payload = {
            "order_id": "inv_abc-1700000000",
            "status_code": "200",
            "gross_amount": "100000.00",
            "signature_key": "deadbeef" * 16,
            "transaction_status": "settlement",
        }
        r = api.post(f"{base_url}/api/midtrans/notification", json=payload)
        assert r.status_code == 400

    def test_settlement_flips_invoice_to_paid(self, api, base_url, auth_a, mongo_db):
        # Create an invoice owned by user_A; status sent
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/WH-PAID")
        # Move to sent so we can verify flip to paid
        api.patch(f"{base_url}/api/invoices/{src['id']}/status",
                  json={"status": "sent"}, headers=auth_a)

        order_id = f"{src['id']}-{int(datetime.now(timezone.utc).timestamp())}"
        gross_amount = f"{int(round(src['total']))}.00"
        status_code = "200"
        payload = {
            "order_id": order_id,
            "status_code": status_code,
            "gross_amount": gross_amount,
            "signature_key": _sig(order_id, status_code, gross_amount),
            "transaction_status": "settlement",
            "fraud_status": "accept",
        }
        r = api.post(f"{base_url}/api/midtrans/notification", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify invoice flipped to paid
        fresh = api.get(f"{base_url}/api/invoices/{src['id']}", headers=auth_a).json()
        assert fresh["status"] == "paid"
        assert fresh["midtrans_status"] == "settlement"

    def test_unknown_order_returns_ok(self, api, base_url):
        """Webhook for unknown order_id should be silently accepted (idempotent)."""
        order_id = "inv_doesnotexist-1700000000"
        status_code = "200"
        gross_amount = "10000.00"
        payload = {
            "order_id": order_id,
            "status_code": status_code,
            "gross_amount": gross_amount,
            "signature_key": _sig(order_id, status_code, gross_amount),
            "transaction_status": "settlement",
            "fraud_status": "accept",
        }
        r = api.post(f"{base_url}/api/midtrans/notification", json=payload)
        assert r.status_code == 200

    def test_cancel_reverts_to_sent(self, api, base_url, auth_a):
        src = _create_invoice(api, base_url, auth_a, number="TEST/INV/WH-CANCEL")
        api.patch(f"{base_url}/api/invoices/{src['id']}/status",
                  json={"status": "sent"}, headers=auth_a)

        order_id = f"{src['id']}-{int(datetime.now(timezone.utc).timestamp())}"
        gross_amount = f"{int(round(src['total']))}.00"
        status_code = "202"
        payload = {
            "order_id": order_id,
            "status_code": status_code,
            "gross_amount": gross_amount,
            "signature_key": _sig(order_id, status_code, gross_amount),
            "transaction_status": "cancel",
            "fraud_status": "",
        }
        r = api.post(f"{base_url}/api/midtrans/notification", json=payload)
        assert r.status_code == 200
        fresh = api.get(f"{base_url}/api/invoices/{src['id']}", headers=auth_a).json()
        assert fresh["status"] == "sent"
        assert fresh["midtrans_status"] == "cancel"


# =========================================================
# 4) NEW SCHEMA FIELDS DEFAULTS
# =========================================================
class TestInvoiceSchemaNewFields:
    def test_new_fields_present_with_defaults_on_create(self, api, base_url, auth_a):
        inv = _create_invoice(api, base_url, auth_a, number="TEST/INV/SCHEMA")
        for key in ("payment_url", "payment_token", "midtrans_order_id", "midtrans_status"):
            assert key in inv, f"Missing field {key}"
            assert inv[key] == ""

    def test_new_fields_present_in_list(self, api, base_url, auth_a):
        _create_invoice(api, base_url, auth_a, number="TEST/INV/SCHEMA-LIST")
        r = api.get(f"{base_url}/api/invoices", headers=auth_a)
        assert r.status_code == 200
        for inv in r.json():
            for key in ("payment_url", "payment_token", "midtrans_order_id", "midtrans_status"):
                assert key in inv
