"""
Create a test user and session in MongoDB for API testing
This bypasses the OAuth flow for testing purposes
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
db_name = os.environ["DB_NAME"]

async def create_test_session():
    """Create a test user and session for API testing"""
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Test user data
    user_id = "user_test123456"
    email = "test@busreservation.com"
    name = "Test User"
    session_token = f"test_token_{uuid.uuid4().hex}"
    
    print("Creating test user and session...")
    print(f"User ID: {user_id}")
    print(f"Email: {email}")
    print(f"Session Token: {session_token}")
    
    # Create or update test user
    await db.users.update_one(
        {"email": email},
        {
            "$set": {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": "",
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    
    # Create session
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
                "created_at": datetime.now(timezone.utc)
            }
        },
        upsert=True
    )
    
    print("\n✅ Test user and session created successfully!")
    print(f"\nUse this session token for testing:")
    print(f"{session_token}")
    
    # Save to file for easy access
    with open("/app/test_session_token.txt", "w") as f:
        f.write(session_token)
    
    print(f"\nToken also saved to: /app/test_session_token.txt")
    
    client.close()
    return session_token

if __name__ == "__main__":
    token = asyncio.run(create_test_session())
