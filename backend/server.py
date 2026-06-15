"""Faktur Indo — Invoice app backend.

Endpoints (all under /api):
  - Auth (Emergent Google):  POST /auth/session, GET /auth/me, POST /auth/logout
  - Business profile:        GET /business-profile, PUT /business-profile
  - Clients:                 GET /clients, POST /clients, PUT /clients/{id}, DELETE /clients/{id}
  - Invoices:                GET /invoices, POST /invoices, GET /invoices/{id},
                             PUT /invoices/{id}, DELETE /invoices/{id},
                             PATCH /invoices/{id}/status, GET /invoices/next-number
  - Buses (Fleet):           GET /buses, POST /buses, PUT /buses/{id}, DELETE /buses/{id}
  - Drivers:                 GET /drivers, POST /drivers, PUT /drivers/{id}, DELETE /drivers/{id}
  - Reservations:            GET /reservations, POST /reservations, GET /reservations/{id},
                             PUT /reservations/{id}, DELETE /reservations/{id},
                             PATCH /reservations/{id}/status, GET /reservations/calendar,
                             GET /reservations/reminders, POST /reservations/{id}/to-invoice
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Header, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Faktur Indo API")
api = APIRouter(prefix="/api")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

MIDTRANS_SERVER_KEY = os.environ.get("MIDTRANS_SERVER_KEY", "")
MIDTRANS_IS_PRODUCTION = os.environ.get("MIDTRANS_IS_PRODUCTION", "false").lower() == "true"
MIDTRANS_SNAP_URL = (
    "https://app.midtrans.com/snap/v1/transactions"
    if MIDTRANS_IS_PRODUCTION
    else "https://app.sandbox.midtrans.com/snap/v1/transactions"
)


# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=now_utc)


class BusinessProfile(BaseModel):
    user_id: str
    name: str = ""
    address: str = ""
    npwp: str = ""
    phone: str = ""
    email: str = ""
    logo_base64: str = ""
    signature_base64: str = ""
    bank_info: str = ""
    updated_at: datetime = Field(default_factory=now_utc)


class BusinessProfileUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    npwp: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_base64: Optional[str] = None
    signature_base64: Optional[str] = None
    bank_info: Optional[str] = None


class Client(BaseModel):
    id: str = Field(default_factory=lambda: new_id("cli"))
    user_id: str
    name: str
    address: str = ""
    phone: str = ""
    email: str = ""
    created_at: datetime = Field(default_factory=now_utc)


class ClientCreate(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    email: str = ""


class LineItem(BaseModel):
    description: str
    quantity: float = 1
    rate: float = 0


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: new_id("inv"))
    user_id: str
    number: str
    client_id: Optional[str] = None
    client_snapshot: dict = Field(default_factory=dict)  # name/address/phone/email at creation time
    issue_date: str  # YYYY-MM-DD
    due_date: str
    items: List[LineItem] = Field(default_factory=list)
    ppn_enabled: bool = False
    ppn_rate: float = 11.0
    notes: str = ""
    status: str = "draft"  # draft | sent | paid | overdue
    subtotal: float = 0
    ppn_amount: float = 0
    total: float = 0
    payment_url: str = ""
    payment_token: str = ""
    midtrans_order_id: str = ""
    midtrans_status: str = ""
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class InvoiceCreate(BaseModel):
    number: str
    client_id: Optional[str] = None
    issue_date: str
    due_date: str
    items: List[LineItem]
    ppn_enabled: bool = False
    ppn_rate: float = 11.0
    notes: str = ""
    status: str = "draft"


class InvoiceUpdate(BaseModel):
    number: Optional[str] = None
    client_id: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    items: Optional[List[LineItem]] = None
    ppn_enabled: Optional[bool] = None
    ppn_rate: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str


# ---------- Bus/Fleet Models ----------
class Bus(BaseModel):
    id: str = Field(default_factory=lambda: new_id("bus"))
    user_id: str
    name: str  # Nama armada, mis: "Bus Pariwisata 45"
    plate_number: str  # Plat nomor, mis: "B 1234 ABC"
    capacity: int = 45  # Kapasitas kursi
    description: str = ""  # Deskripsi tambahan
    is_active: bool = True
    created_at: datetime = Field(default_factory=now_utc)


class BusCreate(BaseModel):
    name: str
    plate_number: str
    capacity: int = 45
    description: str = ""
    is_active: bool = True


class BusUpdate(BaseModel):
    name: Optional[str] = None
    plate_number: Optional[str] = None
    capacity: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# ---------- Driver Models ----------
class Driver(BaseModel):
    id: str = Field(default_factory=lambda: new_id("drv"))
    user_id: str
    name: str
    phone: str = ""
    license_number: str = ""  # Nomor SIM
    is_active: bool = True
    created_at: datetime = Field(default_factory=now_utc)


class DriverCreate(BaseModel):
    name: str
    phone: str = ""
    license_number: str = ""
    is_active: bool = True


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    is_active: Optional[bool] = None


# ---------- Reservation Models ----------
class PickupDetails(BaseModel):
    pic_name: str = ""  # Nama PIC (Person in Charge)
    pic_phone: str = ""  # Telepon PIC
    address: str = ""  # Alamat lengkap penjemputan
    standby_time: str = ""  # Waktu standby, mis: "05:00"
    seat_capacity: int = 0  # Jumlah kursi yang dipesan


class Reservation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("rsv"))
    user_id: str
    client_id: Optional[str] = None
    client_snapshot: dict = Field(default_factory=dict)  # name/phone/email at creation
    bus_id: Optional[str] = None
    bus_snapshot: dict = Field(default_factory=dict)  # name/plate_number/capacity
    driver_id: Optional[str] = None
    driver_snapshot: dict = Field(default_factory=dict)  # name/phone
    # Dates
    departure_date: str  # YYYY-MM-DD - Tanggal keberangkatan
    return_date: str = ""  # YYYY-MM-DD - Tanggal kembali (opsional untuk one-way)
    # Pickup details
    pickup: PickupDetails = Field(default_factory=PickupDetails)
    # Destination info
    destination: str = ""  # Tujuan perjalanan
    notes: str = ""
    # Status: booked | downpayment | paid | cancel
    status: str = "booked"
    # Pricing
    total_price: float = 0
    downpayment: float = 0
    # Invoice link
    invoice_id: Optional[str] = None
    # Timestamps
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class ReservationCreate(BaseModel):
    client_id: Optional[str] = None
    bus_id: Optional[str] = None
    driver_id: Optional[str] = None
    departure_date: str
    return_date: str = ""
    pickup: PickupDetails = Field(default_factory=PickupDetails)
    destination: str = ""
    notes: str = ""
    status: str = "booked"
    total_price: float = 0
    downpayment: float = 0


class ReservationUpdate(BaseModel):
    client_id: Optional[str] = None
    bus_id: Optional[str] = None
    driver_id: Optional[str] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    pickup: Optional[PickupDetails] = None
    destination: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = None
    downpayment: Optional[float] = None


class ReservationStatusUpdate(BaseModel):
    status: str  # booked | downpayment | paid | cancel


# ---------- Auth ----------
class SessionRequest(BaseModel):
    session_id: str


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires = normalize_dt(session.get("expires_at"))
    if expires and expires < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@api.post("/auth/session")
async def create_session(body: SessionRequest):
    """Exchange Emergent session_id for our app session_token."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        logger.warning("Emergent auth failed: %s %s", r.status_code, r.text[:200])
        raise HTTPException(status_code=401, detail="Auth failed")
    data = r.json()
    email = data["email"]
    name = data.get("name", email)
    picture = data.get("picture", "")
    session_token = data["session_token"]

    # Upsert user by email
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = new_id("user")
        user = User(user_id=user_id, email=email, name=name, picture=picture)
        await db.users.insert_one(user.dict())

    # Store session
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "expires_at": now_utc() + timedelta(days=7),
                "created_at": now_utc(),
            }
        },
        upsert=True,
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user_doc}


@api.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return {"user": user}


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Business Profile ----------
@api.get("/business-profile")
async def get_profile(user: dict = Depends(get_current_user)):
    doc = await db.business_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        # Return empty default
        doc = BusinessProfile(user_id=user["user_id"], email=user["email"], name=user["name"]).dict()
    return doc


@api.put("/business-profile")
async def update_profile(body: BusinessProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    updates["updated_at"] = now_utc()
    updates["user_id"] = user["user_id"]
    await db.business_profiles.update_one(
        {"user_id": user["user_id"]}, {"$set": updates}, upsert=True
    )
    doc = await db.business_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return doc


# ---------- Clients ----------
@api.get("/clients")
async def list_clients(user: dict = Depends(get_current_user)):
    cursor = db.clients.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api.post("/clients")
async def create_client(body: ClientCreate, user: dict = Depends(get_current_user)):
    c = Client(user_id=user["user_id"], **body.dict())
    await db.clients.insert_one(c.dict())
    return c.dict()


@api.put("/clients/{client_id}")
async def update_client(client_id: str, body: ClientCreate, user: dict = Depends(get_current_user)):
    res = await db.clients.update_one(
        {"id": client_id, "user_id": user["user_id"]}, {"$set": body.dict()}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    doc = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return doc


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    await db.clients.delete_one({"id": client_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Invoices ----------
def compute_totals(items: List[LineItem], ppn_enabled: bool, ppn_rate: float):
    subtotal = sum((it.quantity or 0) * (it.rate or 0) for it in items)
    ppn_amount = subtotal * (ppn_rate / 100.0) if ppn_enabled else 0
    total = subtotal + ppn_amount
    return round(subtotal, 2), round(ppn_amount, 2), round(total, 2)


async def maybe_overdue(inv: dict) -> dict:
    """Auto-flip sent invoices to overdue if past due_date."""
    if inv.get("status") == "sent" and inv.get("due_date"):
        try:
            due = datetime.strptime(inv["due_date"], "%Y-%m-%d").date()
            today = now_utc().date()
            if due < today:
                inv["status"] = "overdue"
        except ValueError:
            pass
    return inv


@api.get("/invoices/next-number")
async def next_number(user: dict = Depends(get_current_user)):
    now = now_utc()
    prefix = f"INV/{now.year}/{now.month:02d}/"
    escaped = prefix.replace("/", r"\/")
    cursor = db.invoices.find(
        {"user_id": user["user_id"], "number": {"$regex": f"^{escaped}"}},
        {"_id": 0, "number": 1},
    )
    docs = await cursor.to_list(10000)
    max_seq = 0
    for d in docs:
        try:
            seq = int(d["number"].split("/")[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            continue
    return {"number": f"{prefix}{max_seq + 1:04d}"}


@api.get("/invoices")
async def list_invoices(user: dict = Depends(get_current_user)):
    cursor = db.invoices.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(1000)
    for d in docs:
        await maybe_overdue(d)
    return docs


@api.post("/invoices")
async def create_invoice(body: InvoiceCreate, user: dict = Depends(get_current_user)):
    snapshot = {}
    if body.client_id:
        c = await db.clients.find_one(
            {"id": body.client_id, "user_id": user["user_id"]}, {"_id": 0}
        )
        if c:
            snapshot = {"name": c["name"], "address": c["address"], "phone": c["phone"], "email": c["email"]}
    subtotal, ppn_amount, total = compute_totals(body.items, body.ppn_enabled, body.ppn_rate)
    inv = Invoice(
        user_id=user["user_id"],
        number=body.number,
        client_id=body.client_id,
        client_snapshot=snapshot,
        issue_date=body.issue_date,
        due_date=body.due_date,
        items=body.items,
        ppn_enabled=body.ppn_enabled,
        ppn_rate=body.ppn_rate,
        notes=body.notes,
        status=body.status,
        subtotal=subtotal,
        ppn_amount=ppn_amount,
        total=total,
    )
    await db.invoices.insert_one(inv.dict())
    return inv.dict()


@api.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    doc = await db.invoices.find_one(
        {"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    await maybe_overdue(doc)
    return doc


@api.put("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoiceUpdate, user: dict = Depends(get_current_user)):
    doc = await db.invoices.find_one(
        {"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Invoice not found")
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if "client_id" in updates and updates["client_id"]:
        c = await db.clients.find_one(
            {"id": updates["client_id"], "user_id": user["user_id"]}, {"_id": 0}
        )
        if c:
            updates["client_snapshot"] = {
                "name": c["name"], "address": c["address"], "phone": c["phone"], "email": c["email"]
            }
    # Recompute totals
    items = updates.get("items", doc["items"])
    items_objs = [LineItem(**i) if isinstance(i, dict) else i for i in items]
    ppn_enabled = updates.get("ppn_enabled", doc["ppn_enabled"])
    ppn_rate = updates.get("ppn_rate", doc["ppn_rate"])
    subtotal, ppn_amount, total = compute_totals(items_objs, ppn_enabled, ppn_rate)
    updates["subtotal"] = subtotal
    updates["ppn_amount"] = ppn_amount
    updates["total"] = total
    updates["updated_at"] = now_utc()
    if "items" in updates:
        updates["items"] = [i.dict() if hasattr(i, "dict") else i for i in items_objs]
    await db.invoices.update_one({"id": invoice_id}, {"$set": updates})
    fresh = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return fresh


@api.patch("/invoices/{invoice_id}/status")
async def patch_status(invoice_id: str, body: StatusUpdate, user: dict = Depends(get_current_user)):
    if body.status not in ("draft", "sent", "paid", "overdue"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = await db.invoices.update_one(
        {"id": invoice_id, "user_id": user["user_id"]},
        {"$set": {"status": body.status, "updated_at": now_utc()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    doc = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return doc


@api.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    await db.invoices.delete_one({"id": invoice_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Midtrans Payment Link ----------
@api.post("/invoices/{invoice_id}/payment-link")
async def create_payment_link(invoice_id: str, user: dict = Depends(get_current_user)):
    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(status_code=503, detail="Midtrans belum dikonfigurasi")
    inv = await db.invoices.find_one(
        {"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not inv.get("total") or inv["total"] <= 0:
        raise HTTPException(status_code=400, detail="Total invoice tidak valid")

    client_info = inv.get("client_snapshot") or {}
    # Midtrans needs unique order_id per snap call — embed timestamp to allow retry
    order_id = f"{inv['id']}-{int(datetime.now(timezone.utc).timestamp())}"
    payload = {
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": int(round(inv["total"])),  # IDR integer
        },
        "customer_details": {
            "first_name": client_info.get("name", "")[:60] or "Pelanggan",
            "email": client_info.get("email") or "noreply@example.com",
            "phone": client_info.get("phone") or "",
        },
        "item_details": [
            {
                "id": f"item-{i}",
                "name": (it.get("description") or "Item")[:50],
                "price": int(round((it.get("rate") or 0))),
                "quantity": int(it.get("quantity") or 1),
            }
            for i, it in enumerate(inv.get("items", []))
            if (it.get("rate") or 0) > 0
        ],
    }
    # Reconcile item_details total with gross_amount (Midtrans requires exact match if items present)
    items_total = sum(i["price"] * i["quantity"] for i in payload["item_details"])
    if inv.get("ppn_enabled") and inv.get("ppn_amount"):
        payload["item_details"].append({
            "id": "ppn",
            "name": f"PPN {inv.get('ppn_rate', 11)}%",
            "price": int(round(inv["ppn_amount"])),
            "quantity": 1,
        })
        items_total += int(round(inv["ppn_amount"]))
    if items_total != int(round(inv["total"])):
        # Drop item_details to avoid mismatch (Midtrans allows omitting)
        payload.pop("item_details", None)

    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            r = await http.post(
                MIDTRANS_SNAP_URL,
                json=payload,
                auth=(MIDTRANS_SERVER_KEY, ""),
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
        if r.status_code >= 400:
            logger.warning("Midtrans error %s: %s", r.status_code, r.text[:400])
            raise HTTPException(status_code=502, detail=f"Midtrans error: {r.text[:200]}")
        data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Midtrans call failed")
        raise HTTPException(status_code=502, detail=f"Midtrans gagal: {e}")

    token = data.get("token")
    redirect_url = data.get("redirect_url")
    if not redirect_url:
        raise HTTPException(status_code=502, detail="Midtrans tidak mengembalikan link")

    await db.invoices.update_one(
        {"id": invoice_id},
        {
            "$set": {
                "payment_url": redirect_url,
                "payment_token": token or "",
                "midtrans_order_id": order_id,
                "midtrans_status": "pending",
                "updated_at": now_utc(),
            }
        },
    )
    updated = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    return updated


@api.post("/midtrans/notification")
async def midtrans_notification(payload: dict):
    """Webhook from Midtrans — verify signature and update invoice status."""
    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(status_code=503, detail="Midtrans not configured")
    order_id = payload.get("order_id", "")
    status_code = payload.get("status_code", "")
    gross_amount = payload.get("gross_amount", "")
    signature_key = payload.get("signature_key", "")
    raw = f"{order_id}{status_code}{gross_amount}{MIDTRANS_SERVER_KEY}"
    expected = hashlib.sha512(raw.encode("utf-8")).hexdigest()
    if expected != signature_key:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Strip timestamp suffix from order_id to find invoice
    inv_id = "-".join(order_id.split("-")[:-1]) if "-" in order_id else order_id
    inv = await db.invoices.find_one({"id": inv_id}, {"_id": 0})
    if not inv:
        return {"ok": True}  # ignore unknown orders

    trx_status = payload.get("transaction_status", "")
    fraud = payload.get("fraud_status", "")
    new_status = inv["status"]
    if trx_status in ("capture", "settlement") and fraud in ("accept", ""):
        new_status = "paid"
    elif trx_status in ("cancel", "deny", "expire"):
        new_status = "sent"  # back to unpaid
    elif trx_status == "pending":
        pass

    await db.invoices.update_one(
        {"id": inv_id},
        {"$set": {"status": new_status, "midtrans_status": trx_status, "updated_at": now_utc()}},
    )
    return {"ok": True}


# ---------- Invoice Duplicate ----------
@api.post("/invoices/{invoice_id}/duplicate")
async def duplicate_invoice(invoice_id: str, user: dict = Depends(get_current_user)):
    src = await db.invoices.find_one(
        {"id": invoice_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not src:
        raise HTTPException(status_code=404, detail="Invoice not found")
    nxt = await next_number(user)  # type: ignore
    new_inv = Invoice(
        user_id=user["user_id"],
        number=nxt["number"],
        client_id=src.get("client_id"),
        client_snapshot=src.get("client_snapshot", {}),
        issue_date=now_utc().strftime("%Y-%m-%d"),
        due_date=(now_utc() + timedelta(days=14)).strftime("%Y-%m-%d"),
        items=[LineItem(**it) for it in src.get("items", [])],
        ppn_enabled=src.get("ppn_enabled", False),
        ppn_rate=src.get("ppn_rate", 11),
        notes=src.get("notes", ""),
        status="draft",
        subtotal=src.get("subtotal", 0),
        ppn_amount=src.get("ppn_amount", 0),
        total=src.get("total", 0),
    )
    await db.invoices.insert_one(new_inv.dict())
    return new_inv.dict()


# ---------- Buses (Fleet/Armada) ----------
@api.get("/buses")
async def list_buses(user: dict = Depends(get_current_user)):
    cursor = db.buses.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api.post("/buses")
async def create_bus(body: BusCreate, user: dict = Depends(get_current_user)):
    bus = Bus(user_id=user["user_id"], **body.dict())
    await db.buses.insert_one(bus.dict())
    return bus.dict()


@api.get("/buses/{bus_id}")
async def get_bus(bus_id: str, user: dict = Depends(get_current_user)):
    doc = await db.buses.find_one({"id": bus_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bus tidak ditemukan")
    return doc


@api.put("/buses/{bus_id}")
async def update_bus(bus_id: str, body: BusUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Tidak ada data untuk diupdate")
    res = await db.buses.update_one(
        {"id": bus_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bus tidak ditemukan")
    doc = await db.buses.find_one({"id": bus_id}, {"_id": 0})
    return doc


@api.delete("/buses/{bus_id}")
async def delete_bus(bus_id: str, user: dict = Depends(get_current_user)):
    await db.buses.delete_one({"id": bus_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Drivers ----------
@api.get("/drivers")
async def list_drivers(user: dict = Depends(get_current_user)):
    cursor = db.drivers.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@api.post("/drivers")
async def create_driver(body: DriverCreate, user: dict = Depends(get_current_user)):
    driver = Driver(user_id=user["user_id"], **body.dict())
    await db.drivers.insert_one(driver.dict())
    return driver.dict()


@api.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, user: dict = Depends(get_current_user)):
    doc = await db.drivers.find_one({"id": driver_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver tidak ditemukan")
    return doc


@api.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, body: DriverUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Tidak ada data untuk diupdate")
    res = await db.drivers.update_one(
        {"id": driver_id, "user_id": user["user_id"]}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver tidak ditemukan")
    doc = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    return doc


@api.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(get_current_user)):
    await db.drivers.delete_one({"id": driver_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Reservations ----------
async def get_reservation_snapshots(user_id: str, client_id: str = None, bus_id: str = None, driver_id: str = None):
    """Helper to fetch snapshots for reservation."""
    client_snap, bus_snap, driver_snap = {}, {}, {}
    
    if client_id:
        c = await db.clients.find_one({"id": client_id, "user_id": user_id}, {"_id": 0})
        if c:
            client_snap = {"name": c.get("name", ""), "phone": c.get("phone", ""), "email": c.get("email", "")}
    
    if bus_id:
        b = await db.buses.find_one({"id": bus_id, "user_id": user_id}, {"_id": 0})
        if b:
            bus_snap = {"name": b.get("name", ""), "plate_number": b.get("plate_number", ""), "capacity": b.get("capacity", 0)}
    
    if driver_id:
        d = await db.drivers.find_one({"id": driver_id, "user_id": user_id}, {"_id": 0})
        if d:
            driver_snap = {"name": d.get("name", ""), "phone": d.get("phone", "")}
    
    return client_snap, bus_snap, driver_snap


@api.get("/reservations")
async def list_reservations(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    cursor = db.reservations.find(query, {"_id": 0}).sort("departure_date", -1)
    return await cursor.to_list(1000)


@api.post("/reservations")
async def create_reservation(body: ReservationCreate, user: dict = Depends(get_current_user)):
    client_snap, bus_snap, driver_snap = await get_reservation_snapshots(
        user["user_id"], body.client_id, body.bus_id, body.driver_id
    )
    
    rsv = Reservation(
        user_id=user["user_id"],
        client_id=body.client_id,
        client_snapshot=client_snap,
        bus_id=body.bus_id,
        bus_snapshot=bus_snap,
        driver_id=body.driver_id,
        driver_snapshot=driver_snap,
        departure_date=body.departure_date,
        return_date=body.return_date,
        pickup=body.pickup,
        destination=body.destination,
        notes=body.notes,
        status=body.status,
        total_price=body.total_price,
        downpayment=body.downpayment,
    )
    await db.reservations.insert_one(rsv.dict())
    return rsv.dict()


@api.get("/reservations/calendar")
async def reservations_calendar(
    year: int,
    month: int,
    user: dict = Depends(get_current_user)
):
    """Get reservations for calendar view - filter by year/month."""
    # Build date range for the month
    start_date = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end_date = f"{year + 1:04d}-01-01"
    else:
        end_date = f"{year:04d}-{month + 1:02d}-01"
    
    # Find reservations where departure_date is in the range
    # OR where the reservation spans across this month
    cursor = db.reservations.find(
        {
            "user_id": user["user_id"],
            "status": {"$ne": "cancel"},
            "$or": [
                {"departure_date": {"$gte": start_date, "$lt": end_date}},
                {"return_date": {"$gte": start_date, "$lt": end_date}},
                {
                    "departure_date": {"$lt": start_date},
                    "return_date": {"$gte": end_date}
                }
            ]
        },
        {"_id": 0}
    ).sort("departure_date", 1)
    return await cursor.to_list(1000)


@api.get("/reservations/reminders")
async def reservations_reminders(user: dict = Depends(get_current_user)):
    """Get reservations that need attention (H-2 before departure)."""
    today = now_utc().date()
    reminder_date = (today + timedelta(days=2)).strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")
    
    # Find reservations departing in 2 days that are not fully paid
    # and don't have complete pickup details
    cursor = db.reservations.find(
        {
            "user_id": user["user_id"],
            "departure_date": {"$lte": reminder_date, "$gte": today_str},
            "status": {"$in": ["booked", "downpayment"]},
        },
        {"_id": 0}
    ).sort("departure_date", 1)
    
    reservations = await cursor.to_list(100)
    
    # Add reminder reasons
    for rsv in reservations:
        reasons = []
        if rsv.get("status") in ["booked", "downpayment"]:
            reasons.append("Belum lunas")
        pickup = rsv.get("pickup", {})
        if not pickup.get("pic_name") or not pickup.get("address") or not pickup.get("standby_time"):
            reasons.append("Detail pickup belum lengkap")
        rsv["reminder_reasons"] = reasons
    
    return reservations


@api.get("/reservations/{reservation_id}")
async def get_reservation(reservation_id: str, user: dict = Depends(get_current_user)):
    doc = await db.reservations.find_one(
        {"id": reservation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Reservasi tidak ditemukan")
    return doc


@api.put("/reservations/{reservation_id}")
async def update_reservation(
    reservation_id: str,
    body: ReservationUpdate,
    user: dict = Depends(get_current_user)
):
    doc = await db.reservations.find_one(
        {"id": reservation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Reservasi tidak ditemukan")
    
    updates = {k: v for k, v in body.dict().items() if v is not None}
    
    # Update snapshots if IDs changed
    if "client_id" in updates or "bus_id" in updates or "driver_id" in updates:
        client_snap, bus_snap, driver_snap = await get_reservation_snapshots(
            user["user_id"],
            updates.get("client_id", doc.get("client_id")),
            updates.get("bus_id", doc.get("bus_id")),
            updates.get("driver_id", doc.get("driver_id"))
        )
        if "client_id" in updates:
            updates["client_snapshot"] = client_snap
        if "bus_id" in updates:
            updates["bus_snapshot"] = bus_snap
        if "driver_id" in updates:
            updates["driver_snapshot"] = driver_snap
    
    # Convert pickup to dict if present
    if "pickup" in updates and updates["pickup"]:
        updates["pickup"] = updates["pickup"].dict() if hasattr(updates["pickup"], "dict") else updates["pickup"]
    
    updates["updated_at"] = now_utc()
    
    await db.reservations.update_one({"id": reservation_id}, {"$set": updates})
    fresh = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    return fresh


@api.patch("/reservations/{reservation_id}/status")
async def patch_reservation_status(
    reservation_id: str,
    body: ReservationStatusUpdate,
    user: dict = Depends(get_current_user)
):
    if body.status not in ("booked", "downpayment", "paid", "cancel"):
        raise HTTPException(status_code=400, detail="Status tidak valid. Pilih: booked, downpayment, paid, cancel")
    
    res = await db.reservations.update_one(
        {"id": reservation_id, "user_id": user["user_id"]},
        {"$set": {"status": body.status, "updated_at": now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Reservasi tidak ditemukan")
    
    doc = await db.reservations.find_one({"id": reservation_id}, {"_id": 0})
    return doc


@api.delete("/reservations/{reservation_id}")
async def delete_reservation(reservation_id: str, user: dict = Depends(get_current_user)):
    await db.reservations.delete_one({"id": reservation_id, "user_id": user["user_id"]})
    return {"ok": True}


@api.post("/reservations/{reservation_id}/to-invoice")
async def reservation_to_invoice(reservation_id: str, user: dict = Depends(get_current_user)):
    """Convert a reservation to an invoice."""
    rsv = await db.reservations.find_one(
        {"id": reservation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not rsv:
        raise HTTPException(status_code=404, detail="Reservasi tidak ditemukan")
    
    # Check if already has invoice
    if rsv.get("invoice_id"):
        existing_inv = await db.invoices.find_one({"id": rsv["invoice_id"]}, {"_id": 0})
        if existing_inv:
            return {"invoice": existing_inv, "message": "Invoice sudah ada"}
    
    # Generate next invoice number
    now = now_utc()
    prefix = f"INV/{now.year}/{now.month:02d}/"
    escaped = prefix.replace("/", r"\/")
    cursor = db.invoices.find(
        {"user_id": user["user_id"], "number": {"$regex": f"^{escaped}"}},
        {"_id": 0, "number": 1},
    )
    docs = await cursor.to_list(10000)
    max_seq = 0
    for d in docs:
        try:
            seq = int(d["number"].split("/")[-1])
            max_seq = max(max_seq, seq)
        except (ValueError, IndexError):
            continue
    inv_number = f"{prefix}{max_seq + 1:04d}"
    
    # Build invoice items from reservation
    items = []
    bus_name = rsv.get("bus_snapshot", {}).get("name", "Bus")
    destination = rsv.get("destination", "Perjalanan")
    departure = rsv.get("departure_date", "")
    return_date = rsv.get("return_date", "")
    
    trip_desc = f"Sewa {bus_name}"
    if destination:
        trip_desc += f" - {destination}"
    if departure:
        trip_desc += f" ({departure}"
        if return_date:
            trip_desc += f" s/d {return_date}"
        trip_desc += ")"
    
    items.append({
        "description": trip_desc,
        "quantity": 1,
        "rate": rsv.get("total_price", 0)
    })
    
    # Create invoice
    client_snapshot = rsv.get("client_snapshot", {})
    subtotal = rsv.get("total_price", 0)
    
    new_inv = Invoice(
        user_id=user["user_id"],
        number=inv_number,
        client_id=rsv.get("client_id"),
        client_snapshot=client_snapshot,
        issue_date=now.strftime("%Y-%m-%d"),
        due_date=(now + timedelta(days=7)).strftime("%Y-%m-%d"),
        items=[LineItem(**it) for it in items],
        ppn_enabled=False,
        ppn_rate=11.0,
        notes=f"Invoice dari Reservasi #{reservation_id}\n{rsv.get('notes', '')}",
        status="sent",
        subtotal=subtotal,
        ppn_amount=0,
        total=subtotal,
    )
    await db.invoices.insert_one(new_inv.dict())
    
    # Link invoice to reservation
    await db.reservations.update_one(
        {"id": reservation_id},
        {"$set": {"invoice_id": new_inv.id, "updated_at": now_utc()}}
    )
    
    return {"invoice": new_inv.dict(), "message": "Invoice berhasil dibuat"}


@api.get("/")
async def root():
    return {"message": "Faktur Indo API", "ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.clients.create_index([("user_id", 1), ("created_at", -1)])
        await db.invoices.create_index([("user_id", 1), ("created_at", -1)])
        await db.invoices.create_index([("user_id", 1), ("number", 1)])
        # Bus/Fleet indexes
        await db.buses.create_index([("user_id", 1), ("created_at", -1)])
        await db.buses.create_index("id", unique=True)
        # Driver indexes
        await db.drivers.create_index([("user_id", 1), ("created_at", -1)])
        await db.drivers.create_index("id", unique=True)
        # Reservation indexes
        await db.reservations.create_index([("user_id", 1), ("departure_date", -1)])
        await db.reservations.create_index([("user_id", 1), ("status", 1)])
        await db.reservations.create_index("id", unique=True)
    except Exception as e:
        logger.warning("Index creation issue: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
