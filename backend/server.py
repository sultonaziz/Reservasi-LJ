"""Faktur Indo — Invoice app backend.

Endpoints (all under /api):
  - Auth (Emergent Google):  POST /auth/session, GET /auth/me, POST /auth/logout
  - Business profile:        GET /business-profile, PUT /business-profile
  - Clients:                 GET /clients, POST /clients, PUT /clients/{id}, DELETE /clients/{id}
  - Invoices:                GET /invoices, POST /invoices, GET /invoices/{id},
                             PUT /invoices/{id}, DELETE /invoices/{id},
                             PATCH /invoices/{id}/status, GET /invoices/next-number
"""
from __future__ import annotations

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
    except Exception as e:
        logger.warning("Index creation issue: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
