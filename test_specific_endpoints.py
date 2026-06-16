"""
Focused test for specific reservation and invoice endpoints:
1. DELETE /api/reservations/{id}
2. POST /api/reservations/{id}/to-invoice
3. GET /api/invoices/{id}
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://invoice-reservation.preview.emergentagent.com/api"

# Test data storage
test_data = {
    "session_token": None,
    "user": None,
    "client_id": None,
    "bus_id": None,
    "driver_id": None,
    "reservation_id": None,
    "reservation_id_for_delete": None,
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
# AUTHENTICATION
# ============================================================================

def test_authentication():
    """Test authentication flow"""
    print_section("AUTHENTICATION")
    
    try:
        # Load test session token
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

# ============================================================================
# SETUP: Create test data (client, bus, driver, reservations)
# ============================================================================

def setup_test_data():
    """Create test data needed for the tests"""
    print_section("SETUP: Creating Test Data")
    
    results = []
    
    # 1. Create Client
    try:
        client_data = {
            "name": "PT Wisata Sejahtera",
            "address": "Jl. Merdeka No. 100, Jakarta",
            "phone": "021-98765432",
            "email": "wisata@sejahtera.co.id"
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
            print_test("Create Client", True, f"Client ID: {test_data['client_id']}")
            results.append(True)
        else:
            print_test("Create Client", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("Create Client", False, str(e))
        results.append(False)
    
    # 2. Create Bus
    try:
        bus_data = {
            "name": "Bus Pariwisata Premium 50",
            "plate_number": "B 5678 XYZ",
            "capacity": 50,
            "description": "Bus premium dengan fasilitas lengkap",
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
            print_test("Create Bus", True, f"Bus ID: {test_data['bus_id']}")
            results.append(True)
        else:
            print_test("Create Bus", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("Create Bus", False, str(e))
        results.append(False)
    
    # 3. Create Driver
    try:
        driver_data = {
            "name": "Agus Setiawan",
            "phone": "081298765432",
            "license_number": "SIM-A-987654321",
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
            print_test("Create Driver", True, f"Driver ID: {test_data['driver_id']}")
            results.append(True)
        else:
            print_test("Create Driver", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("Create Driver", False, str(e))
        results.append(False)
    
    # 4. Create Reservation for to-invoice test
    try:
        departure = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        return_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        reservation_data = {
            "client_id": test_data["client_id"],
            "bus_id": test_data["bus_id"],
            "driver_id": test_data["driver_id"],
            "departure_date": departure,
            "return_date": return_date,
            "pickup": {
                "pic_name": "Budi Hartono",
                "pic_phone": "081234567890",
                "address": "Jl. Sudirman No. 50, Jakarta Pusat",
                "standby_time": "06:00",
                "seat_capacity": 45
            },
            "destination": "Yogyakarta - Borobudur",
            "notes": "Perjalanan wisata sekolah",
            "status": "booked",
            "total_price": 7500000,
            "downpayment": 3000000
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
            print_test("Create Reservation (for to-invoice)", True, f"Reservation ID: {test_data['reservation_id']}")
            results.append(True)
        else:
            print_test("Create Reservation (for to-invoice)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("Create Reservation (for to-invoice)", False, str(e))
        results.append(False)
    
    # 5. Create another Reservation for delete test
    try:
        departure = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        return_date = (datetime.now() + timedelta(days=12)).strftime("%Y-%m-%d")
        
        reservation_data = {
            "client_id": test_data["client_id"],
            "bus_id": test_data["bus_id"],
            "driver_id": test_data["driver_id"],
            "departure_date": departure,
            "return_date": return_date,
            "pickup": {
                "pic_name": "Siti Nurhaliza",
                "pic_phone": "081298765432",
                "address": "Jl. Gatot Subroto No. 100, Jakarta Selatan",
                "standby_time": "07:00",
                "seat_capacity": 40
            },
            "destination": "Bali - Kuta",
            "notes": "Perjalanan wisata keluarga",
            "status": "booked",
            "total_price": 10000000,
            "downpayment": 5000000
        }
        
        response = requests.post(
            f"{BASE_URL}/reservations",
            headers=get_auth_headers(),
            json=reservation_data,
            timeout=10
        )
        
        if response.status_code == 200:
            reservation = response.json()
            test_data["reservation_id_for_delete"] = reservation.get("id")
            print_test("Create Reservation (for delete)", True, f"Reservation ID: {test_data['reservation_id_for_delete']}")
            results.append(True)
        else:
            print_test("Create Reservation (for delete)", False, f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        print_test("Create Reservation (for delete)", False, str(e))
        results.append(False)
    
    return all(results)

# ============================================================================
# TEST 1: DELETE /api/reservations/{id}
# ============================================================================

def test_delete_reservation():
    """Test DELETE /api/reservations/{id} with verification"""
    print_section("TEST 1: DELETE /api/reservations/{id}")
    
    if not test_data["reservation_id_for_delete"]:
        print_test("DELETE Reservation", False, "No reservation ID available for delete test")
        return False
    
    reservation_id = test_data["reservation_id_for_delete"]
    
    # Step 1: Verify reservation exists before delete
    try:
        response = requests.get(
            f"{BASE_URL}/reservations/{reservation_id}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            print_test("Verify Reservation Exists (before delete)", True, f"Reservation found: {reservation_id}")
        else:
            print_test("Verify Reservation Exists (before delete)", False, f"Status: {response.status_code}")
            return False
    except Exception as e:
        print_test("Verify Reservation Exists (before delete)", False, str(e))
        return False
    
    # Step 2: Delete the reservation
    try:
        response = requests.delete(
            f"{BASE_URL}/reservations/{reservation_id}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok") == True:
                print_test("DELETE /api/reservations/{id}", True, f"Response: {result}")
            else:
                print_test("DELETE /api/reservations/{id}", False, f"Expected {{ok: true}}, got: {result}")
                return False
        else:
            print_test("DELETE /api/reservations/{id}", False, f"Status: {response.status_code}, Error: {response.text[:200]}")
            return False
    except Exception as e:
        print_test("DELETE /api/reservations/{id}", False, str(e))
        return False
    
    # Step 3: Verify reservation is actually deleted by trying to GET it
    try:
        response = requests.get(
            f"{BASE_URL}/reservations/{reservation_id}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 404:
            print_test("Verify Reservation Deleted (GET returns 404)", True, "Reservation successfully deleted")
            return True
        else:
            print_test("Verify Reservation Deleted (GET returns 404)", False, 
                      f"Expected 404, got {response.status_code}. Reservation may still exist!")
            return False
    except Exception as e:
        print_test("Verify Reservation Deleted (GET returns 404)", False, str(e))
        return False

# ============================================================================
# TEST 2: POST /api/reservations/{id}/to-invoice
# ============================================================================

def test_reservation_to_invoice():
    """Test POST /api/reservations/{id}/to-invoice with detailed verification"""
    print_section("TEST 2: POST /api/reservations/{id}/to-invoice")
    
    if not test_data["reservation_id"]:
        print_test("Convert Reservation to Invoice", False, "No reservation ID available")
        return False
    
    reservation_id = test_data["reservation_id"]
    
    # Step 1: Get reservation details before conversion
    try:
        response = requests.get(
            f"{BASE_URL}/reservations/{reservation_id}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            reservation = response.json()
            print_test("Get Reservation Details", True, 
                      f"Client: {reservation.get('client_snapshot', {}).get('name')}, "
                      f"Bus: {reservation.get('bus_snapshot', {}).get('name')}, "
                      f"Price: Rp {reservation.get('total_price', 0):,.0f}")
        else:
            print_test("Get Reservation Details", False, f"Status: {response.status_code}")
            return False
    except Exception as e:
        print_test("Get Reservation Details", False, str(e))
        return False
    
    # Step 2: Convert reservation to invoice
    try:
        response = requests.post(
            f"{BASE_URL}/reservations/{reservation_id}/to-invoice",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            invoice = result.get("invoice", {})
            message = result.get("message", "")
            test_data["invoice_id"] = invoice.get("id")
            
            print_test("POST /api/reservations/{id}/to-invoice", True, 
                      f"Invoice Number: {invoice.get('number')}, Message: {message}")
            
            # Verify invoice data
            verification_results = []
            
            # Check invoice has ID
            if invoice.get("id"):
                print_test("  ✓ Invoice has ID", True, invoice.get("id"))
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice has ID", False, "Missing invoice ID")
                verification_results.append(False)
            
            # Check invoice number format
            if invoice.get("number") and invoice.get("number").startswith("INV/"):
                print_test("  ✓ Invoice number format", True, invoice.get("number"))
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice number format", False, f"Invalid format: {invoice.get('number')}")
                verification_results.append(False)
            
            # Check client snapshot
            client_snapshot = invoice.get("client_snapshot", {})
            if client_snapshot and client_snapshot.get("name"):
                print_test("  ✓ Client snapshot", True, f"Client: {client_snapshot.get('name')}")
                verification_results.append(True)
            else:
                print_test("  ✓ Client snapshot", False, "Missing or incomplete client snapshot")
                verification_results.append(False)
            
            # Check items
            items = invoice.get("items", [])
            if items and len(items) > 0:
                item = items[0]
                print_test("  ✓ Invoice items", True, 
                          f"Item: {item.get('description')}, Rate: Rp {item.get('rate', 0):,.0f}")
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice items", False, "No items in invoice")
                verification_results.append(False)
            
            # Check pricing
            if invoice.get("subtotal") and invoice.get("total"):
                print_test("  ✓ Invoice pricing", True, 
                          f"Subtotal: Rp {invoice.get('subtotal'):,.0f}, Total: Rp {invoice.get('total'):,.0f}")
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice pricing", False, "Missing subtotal or total")
                verification_results.append(False)
            
            # Check dates
            if invoice.get("issue_date") and invoice.get("due_date"):
                print_test("  ✓ Invoice dates", True, 
                          f"Issue: {invoice.get('issue_date')}, Due: {invoice.get('due_date')}")
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice dates", False, "Missing issue_date or due_date")
                verification_results.append(False)
            
            # Check status
            if invoice.get("status"):
                print_test("  ✓ Invoice status", True, invoice.get("status"))
                verification_results.append(True)
            else:
                print_test("  ✓ Invoice status", False, "Missing status")
                verification_results.append(False)
            
            return all(verification_results)
        else:
            print_test("POST /api/reservations/{id}/to-invoice", False, 
                      f"Status: {response.status_code}, Error: {response.text[:200]}")
            return False
    except Exception as e:
        print_test("POST /api/reservations/{id}/to-invoice", False, str(e))
        return False

# ============================================================================
# TEST 3: GET /api/invoices/{id}
# ============================================================================

def test_get_invoice_detail():
    """Test GET /api/invoices/{id} and verify all fields for PDF generation"""
    print_section("TEST 3: GET /api/invoices/{id}")
    
    if not test_data["invoice_id"]:
        print_test("GET Invoice Detail", False, "No invoice ID available")
        return False
    
    invoice_id = test_data["invoice_id"]
    
    try:
        response = requests.get(
            f"{BASE_URL}/invoices/{invoice_id}",
            headers=get_auth_headers(),
            timeout=10
        )
        
        if response.status_code == 200:
            invoice = response.json()
            print_test("GET /api/invoices/{id}", True, f"Invoice Number: {invoice.get('number')}")
            
            # Verify all required fields for PDF generation
            verification_results = []
            required_fields = {
                "id": "Invoice ID",
                "number": "Invoice Number",
                "issue_date": "Issue Date",
                "due_date": "Due Date",
                "status": "Status",
                "subtotal": "Subtotal",
                "total": "Total",
                "items": "Line Items",
                "client_snapshot": "Client Snapshot",
                "user_id": "User ID"
            }
            
            print("\n  Verifying required fields for PDF generation:")
            for field, description in required_fields.items():
                value = invoice.get(field)
                if value is not None:
                    if field == "items":
                        if isinstance(value, list) and len(value) > 0:
                            print_test(f"    ✓ {description}", True, f"{len(value)} item(s)")
                            verification_results.append(True)
                        else:
                            print_test(f"    ✓ {description}", False, "Empty items list")
                            verification_results.append(False)
                    elif field == "client_snapshot":
                        if isinstance(value, dict) and value.get("name"):
                            print_test(f"    ✓ {description}", True, f"Client: {value.get('name')}")
                            verification_results.append(True)
                        else:
                            print_test(f"    ✓ {description}", False, "Missing or incomplete")
                            verification_results.append(False)
                    else:
                        print_test(f"    ✓ {description}", True, str(value)[:50])
                        verification_results.append(True)
                else:
                    print_test(f"    ✓ {description}", False, "Missing")
                    verification_results.append(False)
            
            # Check optional but useful fields
            print("\n  Checking optional fields:")
            optional_fields = {
                "ppn_enabled": "PPN Enabled",
                "ppn_rate": "PPN Rate",
                "ppn_amount": "PPN Amount",
                "notes": "Notes",
                "created_at": "Created At",
                "updated_at": "Updated At"
            }
            
            for field, description in optional_fields.items():
                value = invoice.get(field)
                if value is not None:
                    print(f"    ℹ️  {description}: {str(value)[:50]}")
            
            # Overall verification
            if all(verification_results):
                print_test("\n  Overall: Invoice has all required fields for PDF generation", True, 
                          f"All {len(required_fields)} required fields present")
                return True
            else:
                failed_count = len([r for r in verification_results if not r])
                print_test("\n  Overall: Invoice has all required fields for PDF generation", False, 
                          f"{failed_count} required field(s) missing")
                return False
        else:
            print_test("GET /api/invoices/{id}", False, 
                      f"Status: {response.status_code}, Error: {response.text[:200]}")
            return False
    except Exception as e:
        print_test("GET /api/invoices/{id}", False, str(e))
        return False

# ============================================================================
# CLEANUP
# ============================================================================

def cleanup():
    """Clean up test data"""
    print_section("CLEANUP")
    
    # Note: We already deleted one reservation in the delete test
    # Clean up remaining test data
    
    # Delete remaining reservation
    if test_data["reservation_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/reservations/{test_data['reservation_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("Delete Reservation", response.status_code == 200, 
                      f"Deleted reservation {test_data['reservation_id']}")
        except Exception as e:
            print_test("Delete Reservation", False, str(e))
    
    # Delete bus
    if test_data["bus_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/buses/{test_data['bus_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("Delete Bus", response.status_code == 200, 
                      f"Deleted bus {test_data['bus_id']}")
        except Exception as e:
            print_test("Delete Bus", False, str(e))
    
    # Delete driver
    if test_data["driver_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/drivers/{test_data['driver_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("Delete Driver", response.status_code == 200, 
                      f"Deleted driver {test_data['driver_id']}")
        except Exception as e:
            print_test("Delete Driver", False, str(e))
    
    # Delete client
    if test_data["client_id"]:
        try:
            response = requests.delete(
                f"{BASE_URL}/clients/{test_data['client_id']}",
                headers=get_auth_headers(),
                timeout=10
            )
            print_test("Delete Client", response.status_code == 200, 
                      f"Deleted client {test_data['client_id']}")
        except Exception as e:
            print_test("Delete Client", False, str(e))
    
    # Note: Keep invoice as it's a record of the transaction

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("  FOCUSED TEST: Reservation & Invoice Endpoints")
    print("="*80)
    print(f"\n  Base URL: {BASE_URL}")
    print(f"  Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("\n" + "="*80)
    
    test_results = {}
    
    # Authentication
    auth_success = test_authentication()
    if not auth_success:
        print("\n⚠️  AUTHENTICATION FAILED - CANNOT PROCEED")
        return
    
    # Setup test data
    setup_success = setup_test_data()
    test_results["Setup Test Data"] = setup_success
    
    if not setup_success:
        print("\n⚠️  SETUP FAILED - CANNOT PROCEED WITH TESTS")
        return
    
    # Run the 3 specific tests
    test_results["DELETE /api/reservations/{id}"] = test_delete_reservation()
    test_results["POST /api/reservations/{id}/to-invoice"] = test_reservation_to_invoice()
    test_results["GET /api/invoices/{id}"] = test_get_invoice_detail()
    
    # Cleanup
    cleanup()
    
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
