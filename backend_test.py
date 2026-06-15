"""
Backend API Test Suite for Bus Reservation System
Tests all new endpoints: Buses, Drivers, Reservations, Calendar, Reminders, and Invoice Conversion
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://invoice-reservation.preview.emergentagent.com/api"
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Test data storage
test_data = {
    "session_token": None,
    "user": None,
    "client_id": None,
    "bus_id": None,
    "driver_id": None,
    "reservation_id": None,
    "invoice_id": None
}

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")

def print_test(test_name, passed, details=""):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {test_name}")
    if details:
        print(f"    {details}")

def get_auth_headers():
    """Get authorization headers with Bearer token"""
    if not test_data["session_token"]:
        raise Exception("No session token available. Run authentication first.")
    return {
        "Authorization": f"Bearer {test_data['session_token']}",
        "Content-Type": "application/json"
    }

# ============================================================================
# AUTHENTICATION TESTS
# ============================================================================

def test_authentication():
    """Test Emergent Google Login authentication flow"""
    print_section("AUTHENTICATION TESTS")
    
    print("⚠️  Note: Using test session token (bypassing OAuth for testing)")
    print("    In production, this would come from Emergent Google Login OAuth flow")
    
    try:
        # Try to load test session token
        token_file = "/app/test_session_token.txt"
        try:
            with open(token_file, "r") as f:
                test_token = f.read().strip()
            print(f"    Loaded test token from {token_file}")
        except FileNotFoundError:
            print(f"    Test token file not found. Creating test session...")
            import subprocess
            result = subprocess.run(
                ["python3", "/app/create_test_session.py"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                with open(token_file, "r") as f:
                    test_token = f.read().strip()
                print("    Test session created successfully")
            else:
                print_test("Create test session", False, result.stderr)
                return False
        
        # Test the token
        test_data["session_token"] = test_token
        me_response = requests.get(
            f"{BASE_URL}/auth/me",
            headers={"Authorization": f"Bearer {test_token}"},
            timeout=10
        )
        
        if me_response.status_code == 200:
            test_data["user"] = me_response.json().get("user")
            print_test("Verify test session token", True, f"User: {test_data['user'].get('email')}")
            return True
        else:
            print_test("Verify test session token", False, 
                      f"Status: {me_response.status_code}, Error: {me_response.text[:200]}")
            return False
            
    except Exception as e:
        print_test("Authentication", False, f"Exception: {str(e)}")
        return False

def test_auth_me():
    """Test GET /auth/me endpoint"""
    try:
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            user = response.json().get("user")
            print_test("GET /auth/me", True, f"User: {user.get('email')}")
            return True
        else:
            print_test("GET /auth/me", False, f"Status: {response.status_code}")
            return False
    except Exception as e:
        print_test("GET /auth/me", False, str(e))
        return False

# ============================================================================
# CLIENT TESTS (Prerequisite for Reservations)
# ============================================================================

def test_create_client():
    """Test POST /clients - Create a client for reservation testing"""
    print_section("CLIENT TESTS (Prerequisite)")
    
    try:
        client_data = {
            "name": "PT Wisata Nusantara",
            "address": "Jl. Sudirman No. 123, Jakarta Pusat",
            "phone": "021-12345678",
            "email": "wisata@nusantara.co.id"
        }
        
        response = requests.post(
            f"{BASE_URL}/clients",
            headers=get_auth_headers(),
            json=client_data,
            timeout=10
        )
        
        if response.status_code == 200:
            client = response.json()
            test_data["client_id"] = client.get("id")
            print_test("POST /clients", True, f"Client ID: {test_data['client_id']}")
            return True
        else:
            print_test("POST /clients", False, f"Status: {response.status_code}, Error: {response.text[:200]}")
            return False
    except Exception as e:
        print_test("POST /clients", False, str(e))
        return False

# ============================================================================
# BUS/ARMADA CRUD TESTS
# ============================================================================

def test_bus_crud():
    """Test all Bus CRUD operations"""
    print_section("BUS/ARMADA CRUD TESTS")
    
    results = []
    
    # 1. CREATE Bus
    try:
        bus_data = {
            "name": "Bus Pariwisata Eksekutif 45",
            "plate_number": "B 1234 XYZ",
            "capacity": 45,
            "description": "Bus pariwisata dengan AC, TV, dan karaoke",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/buses",
            headers=get_auth_headers(),
            json=bus_data,
            timeout=10
        )
        
        if response.status_code == 200:
            bus = response.json()
            test_data["bus_id"] = bus.get("id")
            print_test("POST /buses (Create)", True, f"Bus ID: {test_data['bus_id']}")
            results.append(True)
        else:
            print_test("POST /buses (Create)", False, f"Status: {response.status_code}, Error: {response.text[:200]}")
            results.append(False)
    except Exception as e:
        print_test("POST /buses (Create)", False, str(e))
        results.append(False)
    
    # 2. LIST Buses
    try:
        response = requests.get(
            f"{BASE_URL}/buses",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            buses = response.json()
            print_test("GET /buses (List)", True, f"Found {len(buses)} bus(es)")
            results.append(True)
        else:
            print_test("GET /buses (List)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /buses (List)", False, str(e))
        results.append(False)
    
    # 3. GET Single Bus
    if test_data["bus_id"]:
        try:
            response = requests.get(
                f"{BASE_URL}/buses/{test_data['bus_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                bus = response.json()
                print_test("GET /buses/{id} (Get Single)", True, f"Bus: {bus.get('name')}")
                results.append(True)
            else:
                print_test("GET /buses/{id} (Get Single)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("GET /buses/{id} (Get Single)", False, str(e))
            results.append(False)
    
    # 4. UPDATE Bus
    if test_data["bus_id"]:
        try:
            update_data = {
                "description": "Bus pariwisata premium dengan AC, TV, karaoke, dan reclining seats",
                "capacity": 47
            }
            
            response = requests.put(
                f"{BASE_URL}/buses/{test_data['bus_id']}",
                headers=get_auth_headers(),
                json=update_data,
                timeout=10
            )
            
            if response.status_code == 200:
                bus = response.json()
                print_test("PUT /buses/{id} (Update)", True, f"Updated capacity: {bus.get('capacity')}")
                results.append(True)
            else:
                print_test("PUT /buses/{id} (Update)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("PUT /buses/{id} (Update)", False, str(e))
            results.append(False)
    
    # Note: We'll skip DELETE for now to use the bus in reservation tests
    
    return all(results)

# ============================================================================
# DRIVER CRUD TESTS
# ============================================================================

def test_driver_crud():
    """Test all Driver CRUD operations"""
    print_section("DRIVER CRUD TESTS")
    
    results = []
    
    # 1. CREATE Driver
    try:
        driver_data = {
            "name": "Budi Santoso",
            "phone": "081234567890",
            "license_number": "SIM-A-123456789",
            "is_active": True
        }
        
        response = requests.post(
            f"{BASE_URL}/drivers",
            headers=get_auth_headers(),
            json=driver_data,
            timeout=10
        )
        
        if response.status_code == 200:
            driver = response.json()
            test_data["driver_id"] = driver.get("id")
            print_test("POST /drivers (Create)", True, f"Driver ID: {test_data['driver_id']}")
            results.append(True)
        else:
            print_test("POST /drivers (Create)", False, f"Status: {response.status_code}, Error: {response.text[:200]}")
            results.append(False)
    except Exception as e:
        print_test("POST /drivers (Create)", False, str(e))
        results.append(False)
    
    # 2. LIST Drivers
    try:
        response = requests.get(
            f"{BASE_URL}/drivers",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            drivers = response.json()
            print_test("GET /drivers (List)", True, f"Found {len(drivers)} driver(s)")
            results.append(True)
        else:
            print_test("GET /drivers (List)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /drivers (List)", False, str(e))
        results.append(False)
    
    # 3. GET Single Driver
    if test_data["driver_id"]:
        try:
            response = requests.get(
                f"{BASE_URL}/drivers/{test_data['driver_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                driver = response.json()
                print_test("GET /drivers/{id} (Get Single)", True, f"Driver: {driver.get('name')}")
                results.append(True)
            else:
                print_test("GET /drivers/{id} (Get Single)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("GET /drivers/{id} (Get Single)", False, str(e))
            results.append(False)
    
    # 4. UPDATE Driver
    if test_data["driver_id"]:
        try:
            update_data = {
                "phone": "081234567899",
                "is_active": True
            }
            
            response = requests.put(
                f"{BASE_URL}/drivers/{test_data['driver_id']}",
                headers=get_auth_headers(),
                json=update_data,
                timeout=10
            )
            
            if response.status_code == 200:
                driver = response.json()
                print_test("PUT /drivers/{id} (Update)", True, f"Updated phone: {driver.get('phone')}")
                results.append(True)
            else:
                print_test("PUT /drivers/{id} (Update)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("PUT /drivers/{id} (Update)", False, str(e))
            results.append(False)
    
    # Note: We'll skip DELETE for now to use the driver in reservation tests
    
    return all(results)

# ============================================================================
# RESERVATION CRUD TESTS
# ============================================================================

def test_reservation_crud():
    """Test all Reservation CRUD operations"""
    print_section("RESERVATION CRUD TESTS")
    
    results = []
    
    # 1. CREATE Reservation
    try:
        # Calculate dates
        departure = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        return_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        reservation_data = {
            "client_id": test_data["client_id"],
            "bus_id": test_data["bus_id"],
            "driver_id": test_data["driver_id"],
            "departure_date": departure,
            "return_date": return_date,
            "pickup": {
                "pic_name": "Ahmad Wijaya",
                "pic_phone": "081298765432",
                "address": "Jl. Gatot Subroto No. 45, Jakarta Selatan",
                "standby_time": "05:00",
                "seat_capacity": 40
            },
            "destination": "Bandung - Lembang",
            "notes": "Perjalanan wisata keluarga, mohon bus dalam kondisi bersih",
            "status": "booked",
            "total_price": 5000000,
            "downpayment": 2000000
        }
        
        response = requests.post(
            f"{BASE_URL}/reservations",
            headers=get_auth_headers(),
            json=reservation_data,
            timeout=10
        )
        
        if response.status_code == 200:
            reservation = response.json()
            test_data["reservation_id"] = reservation.get("id")
            print_test("POST /reservations (Create)", True, f"Reservation ID: {test_data['reservation_id']}")
            results.append(True)
        else:
            print_test("POST /reservations (Create)", False, f"Status: {response.status_code}, Error: {response.text[:200]}")
            results.append(False)
    except Exception as e:
        print_test("POST /reservations (Create)", False, str(e))
        results.append(False)
    
    # 2. LIST Reservations
    try:
        response = requests.get(
            f"{BASE_URL}/reservations",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reservations = response.json()
            print_test("GET /reservations (List All)", True, f"Found {len(reservations)} reservation(s)")
            results.append(True)
        else:
            print_test("GET /reservations (List All)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /reservations (List All)", False, str(e))
        results.append(False)
    
    # 3. LIST Reservations with Status Filter
    try:
        response = requests.get(
            f"{BASE_URL}/reservations?status=booked",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reservations = response.json()
            print_test("GET /reservations?status=booked (Filter)", True, f"Found {len(reservations)} booked reservation(s)")
            results.append(True)
        else:
            print_test("GET /reservations?status=booked (Filter)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /reservations?status=booked (Filter)", False, str(e))
        results.append(False)
    
    # 4. GET Single Reservation
    if test_data["reservation_id"]:
        try:
            response = requests.get(
                f"{BASE_URL}/reservations/{test_data['reservation_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                reservation = response.json()
                print_test("GET /reservations/{id} (Get Single)", True, f"Destination: {reservation.get('destination')}")
                results.append(True)
            else:
                print_test("GET /reservations/{id} (Get Single)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("GET /reservations/{id} (Get Single)", False, str(e))
            results.append(False)
    
    # 5. UPDATE Reservation
    if test_data["reservation_id"]:
        try:
            update_data = {
                "notes": "Perjalanan wisata keluarga, mohon bus dalam kondisi bersih. Update: Tambahan snack box untuk peserta.",
                "total_price": 5500000
            }
            
            response = requests.put(
                f"{BASE_URL}/reservations/{test_data['reservation_id']}",
                headers=get_auth_headers(),
                json=update_data,
                timeout=10
            )
            
            if response.status_code == 200:
                reservation = response.json()
                print_test("PUT /reservations/{id} (Update)", True, f"Updated price: Rp {reservation.get('total_price'):,.0f}")
                results.append(True)
            else:
                print_test("PUT /reservations/{id} (Update)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("PUT /reservations/{id} (Update)", False, str(e))
            results.append(False)
    
    # 6. PATCH Reservation Status
    if test_data["reservation_id"]:
        try:
            status_data = {
                "status": "downpayment"
            }
            
            response = requests.patch(
                f"{BASE_URL}/reservations/{test_data['reservation_id']}/status",
                headers=get_auth_headers(),
                json=status_data,
                timeout=10
            )
            
            if response.status_code == 200:
                reservation = response.json()
                print_test("PATCH /reservations/{id}/status (Update Status)", True, f"New status: {reservation.get('status')}")
                results.append(True)
            else:
                print_test("PATCH /reservations/{id}/status (Update Status)", False, f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            print_test("PATCH /reservations/{id}/status (Update Status)", False, str(e))
            results.append(False)
    
    # Note: We'll skip DELETE for now to use the reservation in other tests
    
    return all(results)

# ============================================================================
# RESERVATION CALENDAR TESTS
# ============================================================================

def test_reservation_calendar():
    """Test GET /reservations/calendar endpoint"""
    print_section("RESERVATION CALENDAR TESTS")
    
    results = []
    
    # Test calendar for current month
    try:
        now = datetime.now()
        response = requests.get(
            f"{BASE_URL}/reservations/calendar?year={now.year}&month={now.month}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reservations = response.json()
            print_test("GET /reservations/calendar (Current Month)", True, f"Found {len(reservations)} reservation(s)")
            results.append(True)
        else:
            print_test("GET /reservations/calendar (Current Month)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /reservations/calendar (Current Month)", False, str(e))
        results.append(False)
    
    # Test calendar for next month
    try:
        next_month = datetime.now() + timedelta(days=32)
        response = requests.get(
            f"{BASE_URL}/reservations/calendar?year={next_month.year}&month={next_month.month}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reservations = response.json()
            print_test("GET /reservations/calendar (Next Month)", True, f"Found {len(reservations)} reservation(s)")
            results.append(True)
        else:
            print_test("GET /reservations/calendar (Next Month)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("GET /reservations/calendar (Next Month)", False, str(e))
        results.append(False)
    
    return all(results)

# ============================================================================
# RESERVATION REMINDERS TESTS
# ============================================================================

def test_reservation_reminders():
    """Test GET /reservations/reminders endpoint"""
    print_section("RESERVATION REMINDERS TESTS")
    
    try:
        response = requests.get(
            f"{BASE_URL}/reservations/reminders",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reminders = response.json()
            print_test("GET /reservations/reminders", True, f"Found {len(reminders)} reminder(s)")
            
            # Show reminder details if any
            for reminder in reminders:
                reasons = reminder.get("reminder_reasons", [])
                if reasons:
                    print(f"    - Reservation {reminder.get('id')}: {', '.join(reasons)}")
            
            return True
        else:
            print_test("GET /reservations/reminders", False, f"Status: {response.status_code}")
            return False
    except Exception as e:
        print_test("GET /reservations/reminders", False, str(e))
        return False

# ============================================================================
# RESERVATION TO INVOICE TESTS
# ============================================================================

def test_reservation_to_invoice():
    """Test POST /reservations/{id}/to-invoice endpoint"""
    print_section("RESERVATION TO INVOICE CONVERSION TESTS")
    
    if not test_data["reservation_id"]:
        print_test("POST /reservations/{id}/to-invoice", False, "No reservation ID available")
        return False
    
    try:
        response = requests.post(
            f"{BASE_URL}/reservations/{test_data['reservation_id']}/to-invoice",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            invoice = result.get("invoice", {})
            test_data["invoice_id"] = invoice.get("id")
            message = result.get("message", "")
            print_test("POST /reservations/{id}/to-invoice", True, 
                      f"Invoice: {invoice.get('number')}, Message: {message}")
            
            # Verify invoice was created
            if test_data["invoice_id"]:
                try:
                    inv_response = requests.get(
                        f"{BASE_URL}/invoices/{test_data['invoice_id']}",
                        headers=get_auth_headers(),
                        timeout=10
                    )
                    if inv_response.status_code == 200:
                        print_test("Verify Invoice Created", True, f"Invoice ID: {test_data['invoice_id']}")
                    else:
                        print_test("Verify Invoice Created", False, f"Status: {inv_response.status_code}")
                except Exception as e:
                    print_test("Verify Invoice Created", False, str(e))
            
            return True
        else:
            print_test("POST /reservations/{id}/to-invoice", False, 
                      f"Status: {response.status_code}, Error: {response.text[:200]}")
            return False
    except Exception as e:
        print_test("POST /reservations/{id}/to-invoice", False, str(e))
        return False

# ============================================================================
# CLEANUP TESTS
# ============================================================================

def test_cleanup():
    """Clean up test data"""
    print_section("CLEANUP")
    
    # Delete reservation
    if test_data["reservation_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/reservations/{test_data['reservation_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("DELETE /reservations/{id}", response.status_code == 200, 
                      f"Deleted reservation {test_data['reservation_id']}")
        except Exception as e:
            print_test("DELETE /reservations/{id}", False, str(e))
    
    # Delete bus
    if test_data["bus_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/buses/{test_data['bus_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("DELETE /buses/{id}", response.status_code == 200, 
                      f"Deleted bus {test_data['bus_id']}")
        except Exception as e:
            print_test("DELETE /buses/{id}", False, str(e))
    
    # Delete driver
    if test_data["driver_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/drivers/{test_data['driver_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("DELETE /drivers/{id}", response.status_code == 200, 
                      f"Deleted driver {test_data['driver_id']}")
        except Exception as e:
            print_test("DELETE /drivers/{id}", False, str(e))
    
    # Delete client
    if test_data["client_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/clients/{test_data['client_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("DELETE /clients/{id}", response.status_code == 200, 
                      f"Deleted client {test_data['client_id']}")
        except Exception as e:
            print_test("DELETE /clients/{id}", False, str(e))
    
    # Note: We keep the invoice as it's a record of the transaction

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("  BUS RESERVATION SYSTEM - BACKEND API TEST SUITE")
    print("="*80)
    print(f"\n  Base URL: {BASE_URL}")
    print(f"  Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\n" + "="*80)
    
    test_results = {}
    
    # Authentication
    auth_success = test_authentication()
    test_results["Authentication"] = auth_success
    
    if not auth_success:
        print("\n" + "="*80)
        print("  ⚠️  AUTHENTICATION FAILED - CANNOT PROCEED WITH API TESTS")
        print("="*80)
        print("\n  This application uses Emergent Google Login authentication.")
        print("  To test the APIs, you need a valid session_token from the OAuth flow.")
        print("\n  Please:")
        print("  1. Complete the OAuth flow in the frontend application")
        print("  2. Extract the session_token from the response")
        print("  3. Re-run this test with the token")
        return
    
    test_auth_me()
    
    # Prerequisites
    test_results["Client Creation"] = test_create_client()
    
    # Main tests
    test_results["Bus CRUD"] = test_bus_crud()
    test_results["Driver CRUD"] = test_driver_crud()
    test_results["Reservation CRUD"] = test_reservation_crud()
    test_results["Reservation Calendar"] = test_reservation_calendar()
    test_results["Reservation Reminders"] = test_reservation_reminders()
    test_results["Reservation to Invoice"] = test_reservation_to_invoice()
    
    # Cleanup
    test_cleanup()
    
    # Summary
    print_section("TEST SUMMARY")
    
    passed = sum(1 for result in test_results.values() if result)
    total = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n{'='*80}")
    print(f"  TOTAL: {passed}/{total} test groups passed")
    print(f"{'='*80}\n")
    
    if passed == total:
        print("  🎉 ALL TESTS PASSED!")
    else:
        print(f"  ⚠️  {total - passed} test group(s) failed")
    
    print()

if __name__ == "__main__":
    main()
