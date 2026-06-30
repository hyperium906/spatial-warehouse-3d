import pytest
from fastapi.testclient import TestClient
from main import app, read_db, write_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    # Keep backup of database.json
    original_db = read_db()
    # Write a small test dataset
    test_data = [
        {
            "id": "test_rack",
            "type": "rack",
            "name": "Test Rack",
            "position": {"x": 1.0, "y": 2.0, "z": 3.0},
            "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
            "dimensions": {"w": 2.0, "h": 4.0, "d": 8.0},
            "confidence": 0.95,
            "status": "ok",
            "metadata": {"sku_count": 10, "max_capacity": 60}
        }
    ]
    write_db(test_data)
    yield
    # Restore original database
    write_db(original_db)

def test_get_inventory():
    response = client.get("/api/inventory")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "test_rack"

def test_update_inventory_item():
    update_payload = {
        "id": "test_rack",
        "position": {"x": 5.0, "y": 2.0, "z": 10.0},
        "rotation": {"x": 0.0, "y": 1.57, "z": 0.0}
    }
    response = client.post("/api/inventory/update", json=update_payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Verify DB reflects changes
    db_items = read_db()
    assert db_items[0]["position"]["x"] == 5.0
    assert db_items[0]["rotation"]["y"] == 1.57

def test_update_item_not_found():
    update_payload = {
        "id": "non_existent_id",
        "position": {"x": 0.0, "y": 0.0, "z": 0.0},
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0}
    }
    response = client.post("/api/inventory/update", json=update_payload)
    assert response.status_code == 404

def test_get_analytics():
    response = client.get("/api/analytics")
    assert response.status_code == 200
    data = response.json()
    assert data["total_objects"] == 1
    assert "space_utilization_pct" in data
    assert "rack_utilization_pct" in data
    assert data["category_counts"]["rack"] == 1

def test_trigger_scan():
    scan_payload = {
        "label": "pallet",
        "image_count": 15
    }
    response = client.post("/api/scan", json=scan_payload)
    assert response.status_code == 200
    assert response.json()["status"] == "started"
    
    # Because FastAPI TestClient runs background tasks synchronously,
    # the background reconstruction task has already completed and added the item to the database.
    db_items = read_db()
    assert len(db_items) == 2
    assert any(item["type"] == "pallet" for item in db_items)

