"""Shared fixtures for Faktur Indo backend tests."""
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend .env to get MONGO_URL and DB_NAME
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if "EXPO_PUBLIC_BACKEND_URL" in os.environ else None
if not BASE_URL:
    # fallback to frontend .env
    load_dotenv(Path("/app/frontend/.env"))
    BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Seed test sessions
USER_A = "user_test123"
TOKEN_A = "TEST_TOKEN_E2E"
USER_B = "user_testB456"
TOKEN_B = "TEST_TOKEN_E2E_B"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="session", autouse=True)
def seed_sessions(mongo_db):
    """Seed two users + sessions for cross-tenant isolation testing."""
    future = datetime.now(timezone.utc) + timedelta(days=7)
    for uid, email, token in [
        (USER_A, "TEST_a@example.com", TOKEN_A),
        (USER_B, "TEST_b@example.com", TOKEN_B),
    ]:
        mongo_db.users.update_one(
            {"user_id": uid},
            {"$set": {"user_id": uid, "email": email, "name": f"TEST {uid}",
                      "picture": "", "created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        mongo_db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {"session_token": token, "user_id": uid,
                      "expires_at": future, "created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    yield
    # Cleanup: delete test data
    for uid in [USER_A, USER_B]:
        mongo_db.clients.delete_many({"user_id": uid})
        mongo_db.invoices.delete_many({"user_id": uid})
        mongo_db.business_profiles.delete_many({"user_id": uid})
        mongo_db.users.delete_one({"user_id": uid})
    mongo_db.user_sessions.delete_many({"session_token": {"$in": [TOKEN_A, TOKEN_B]}})


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_a():
    return {"Authorization": f"Bearer {TOKEN_A}"}


@pytest.fixture
def auth_b():
    return {"Authorization": f"Bearer {TOKEN_B}"}


@pytest.fixture(autouse=True)
def clean_user_data(mongo_db):
    """Clean test user's invoices/clients/profile before each test."""
    for uid in [USER_A, USER_B]:
        mongo_db.clients.delete_many({"user_id": uid})
        mongo_db.invoices.delete_many({"user_id": uid})
        mongo_db.business_profiles.delete_many({"user_id": uid})
    yield
