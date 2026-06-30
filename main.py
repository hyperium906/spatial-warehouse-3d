import os
import json
import time
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

# Import our custom CV and Meshroom simulation engines
from cv_engine import SpatialCVEngine
from meshroom_pipeline import MeshroomPipelineSim

app = FastAPI(title="Spatial Warehouse 3D Backend")

# File paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "database.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Create static directory if it doesn't exist
os.makedirs(STATIC_DIR, exist_ok=True)

# Initialize pipeline simulator
pipeline_sim = MeshroomPipelineSim()

# Pydantic models for request validation
class Vector3(BaseModel):
    x: float
    y: float
    z: float

class ObjectUpdate(BaseModel):
    id: str
    position: Vector3
    rotation: Vector3

class ScanRequest(BaseModel):
    label: str
    image_count: int
    image_width: int = 1920
    image_height: int = 1080

# Helper database functions
def read_db() -> List[Dict[str, Any]]:
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error reading database: {e}")
        return []

def write_db(data: List[Dict[str, Any]]):
    try:
        with open(DB_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error writing database: {e}")

# Background task to wait for photogrammetry completion, then insert the detected object
def run_reconstruction_pipeline_task(label: str, image_count: int, image_width: int, image_height: int):
    # Wait until the pipeline thread changes is_running to False
    while True:
        time.sleep(0.5)
        status = pipeline_sim.get_status()
        if not status["is_running"]:
            break
            
    # Estimate 3D bounding box for the new object
    meta = {"width": image_width, "height": image_height}
    box_est = SpatialCVEngine.estimate_3d_bounding_box_from_images(label, meta)
    
    # Read database
    db_data = read_db()
    
    # Create unique ID
    count = sum(1 for o in db_data if o["type"] == label) + 1
    obj_id = f"{label}_{count}_{int(time.time() % 1000)}"
    
    # Create new object
    new_obj = {
        "id": obj_id,
        "type": label,
        "name": f"Reconstructed {label.capitalize()} #{count}",
        "position": box_est["position"],
        "rotation": box_est["rotation"],
        "dimensions": box_est["dimensions"],
        "confidence": box_est["confidence"],
        "status": "ok",
        "metadata": {
            "sku_count": random_items_count(label),
            "zone": "Scanning Area",
            "last_scanned": time.strftime("%Y-%m-%d %H:%M:%S")
        }
    }
    
    # Add to DB
    db_data.append(new_obj)
    
    # Run safety checks on all database objects to flag collisions or blockages
    SpatialCVEngine.check_safety_hazards(db_data)
    
    # Write back to DB
    write_db(db_data)

def random_items_count(label: str) -> int:
    import random
    if label == "pallet":
        return random.randint(5, 30)
    elif label == "crate":
        return random.randint(1, 5)
    elif label == "barrel":
        return random.randint(1, 4)
    elif label == "rack":
        return random.randint(20, 80)
    return 0

# API Routes
@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")

@app.get("/api/inventory")
def get_inventory():
    """Returns the current inventory list with active spatial hazards computed."""
    data = read_db()
    SpatialCVEngine.check_safety_hazards(data)
    write_db(data)
    return data

@app.post("/api/inventory/update")
def update_inventory_item(update: ObjectUpdate):
    """Updates object coordinates in database (e.g. from user dragging in UI)."""
    data = read_db()
    updated = False
    
    for obj in data:
        if obj["id"] == update.id:
            obj["position"] = {"x": update.position.x, "y": update.position.y, "z": update.position.z}
            obj["rotation"] = {"x": update.rotation.x, "y": update.rotation.y, "z": update.rotation.z}
            updated = True
            break
            
    if not updated:
        raise HTTPException(status_code=404, detail="Object not found in inventory")
        
    # Re-evaluate hazards after position updates
    SpatialCVEngine.check_safety_hazards(data)
    write_db(data)
    return {"status": "success", "message": "Position updated successfully"}

@app.post("/api/inventory/delete/{obj_id}")
def delete_inventory_item(obj_id: str):
    """Deletes an object from the inventory database."""
    data = read_db()
    filtered_data = [obj for obj in data if obj["id"] != obj_id]
    
    if len(filtered_data) == len(data):
        raise HTTPException(status_code=404, detail="Object not found")
        
    # Recalculate safety hazards
    SpatialCVEngine.check_safety_hazards(filtered_data)
    write_db(filtered_data)
    return {"status": "success", "message": f"Deleted object {obj_id}"}

@app.post("/api/scan")
def trigger_photogrammetry_scan(req: ScanRequest, bg_tasks: BackgroundTasks):
    """Triggers the photogrammetry reconstruction background thread."""
    status = pipeline_sim.get_status()
    if status["is_running"]:
        raise HTTPException(status_code=400, detail="Meshroom photogrammetry pipeline is already running")
        
    # Start the simulator
    started = pipeline_sim.start_pipeline(req.image_count, req.label)
    if not started:
        raise HTTPException(status_code=500, detail="Failed to initialize pipeline execution thread")
        
    # Queue FastAPI background task to wait for completion and write to database
    bg_tasks.add_task(
        run_reconstruction_pipeline_task,
        req.label,
        req.image_count,
        req.image_width,
        req.image_height
    )
    
    return {"status": "started", "message": f"Photogrammetry pipeline for '{req.label}' started."}

@app.get("/api/pipeline/status")
def get_pipeline_status():
    """Polls the photogrammetry logs and current progress percentage."""
    return pipeline_sim.get_status()

@app.get("/api/analytics")
def get_analytics():
    """Calculates spatial utilization, rack slot usage, and active hazards."""
    data = read_db()
    # Ensure hazards are up to date
    SpatialCVEngine.check_safety_hazards(data)
    return SpatialCVEngine.calculate_analytics(data)

# Mount the static files folder
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    # Launch uvicorn server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
