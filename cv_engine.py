import math
from typing import List, Dict, Any

class SpatialCVEngine:
    @staticmethod
    def aabb_intersect(obj1: Dict[str, Any], obj2: Dict[str, Any]) -> bool:
        """
        Check if two 3D bounding boxes intersect using Axis-Aligned Bounding Boxes (AABB).
        Assume position is the center of the bounding box.
        """
        p1 = obj1["position"]
        d1 = obj1["dimensions"]
        
        p2 = obj2["position"]
        d2 = obj2["dimensions"]
        
        # Calculate min and max bounds for object 1
        min1_x = p1["x"] - d1["w"] / 2
        max1_x = p1["x"] + d1["w"] / 2
        min1_y = p1["y"] - d1["h"] / 2
        max1_y = p1["y"] + d1["h"] / 2
        min1_z = p1["z"] - d1["d"] / 2
        max1_z = p1["z"] + d1["d"] / 2
        
        # Calculate min and max bounds for object 2
        min2_x = p2["x"] - d2["w"] / 2
        max2_x = p2["x"] + d2["w"] / 2
        min2_y = p2["y"] - d2["h"] / 2
        max2_y = p2["y"] + d2["h"] / 2
        min2_z = p2["z"] - d2["d"] / 2
        max2_z = p2["z"] + d2["d"] / 2
        
        # Check overlaps on X, Y, and Z axes
        overlap_x = min1_x <= max2_x and max1_x >= min2_x
        overlap_y = min1_y <= max2_y and max1_y >= min2_y
        overlap_z = min1_z <= max2_z and max1_z >= min2_z
        
        return overlap_x and overlap_y and overlap_z

    @classmethod
    def check_safety_hazards(cls, objects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes objects for spatial anomalies and hazards:
        1. Blocking main transit corridor (x is close to 0 and not a forklift).
        2. Collision/intersection with other objects.
        3. Exceeding warehouse boundary (assumed limits: x=[-15, 15], y=[0, 8], z=[-15, 15]).
        Updates object status to 'hazard' if violations occur.
        """
        hazards = []
        
        for i, obj in enumerate(objects):
            violations = []
            
            # 1. Main corridor blockage check (Aisle x ~ 0 is forklift path)
            # If a static object is placed in the center lane and is not a mobile forklift, it blocks transit.
            if obj["type"] != "forklift" and abs(obj["position"]["x"]) < 1.0:
                violations.append("Blocking main transit corridor (lane X=0)")
            
            # 2. Border boundaries check
            pos = obj["position"]
            dim = obj["dimensions"]
            min_x, max_x = pos["x"] - dim["w"]/2, pos["x"] + dim["w"]/2
            min_y, max_y = pos["y"] - dim["h"]/2, pos["y"] + dim["h"]/2
            min_z, max_z = pos["z"] - dim["d"]/2, pos["z"] + dim["d"]/2
            
            if min_x < -15.0 or max_x > 15.0 or min_z < -15.0 or max_z > 15.0:
                violations.append("Object bounds exceed warehouse walls (limit +/- 15m)")
            if min_y < 0.0 or max_y > 8.0:
                violations.append("Object exceeds height limit (8m) or placed below ground level")
            
            # 3. Collision with other objects
            for j, other in enumerate(objects):
                if i != j and cls.aabb_intersect(obj, other):
                    violations.append(f"Spatial collision detected with {other['name']} ({other['id']})")
            
            # Update status in-place
            if violations:
                obj["status"] = "hazard"
                obj["metadata"]["violations"] = violations
                hazards.append({
                    "id": obj["id"],
                    "name": obj["name"],
                    "violations": violations
                })
            else:
                obj["status"] = "ok"
                obj["metadata"].pop("violations", None)
                
        return hazards

    @staticmethod
    def calculate_analytics(objects: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compute warehouse capacity statistics.
        Warehouse dimensions assumed: 30m x 20m x 8m (Volume = 4800 m³)
        """
        total_vol = 30.0 * 20.0 * 8.0
        occupied_vol = 0.0
        racks_capacity_max = 120.0 # slots
        racks_capacity_used = 0.0
        category_counts = {}
        hazard_count = 0
        
        for obj in objects:
            # Calculate volume
            dim = obj["dimensions"]
            vol = dim["w"] * dim["h"] * dim["d"]
            occupied_vol += vol
            
            # Category distribution
            otype = obj["type"]
            category_counts[otype] = category_counts.get(otype, 0) + 1
            
            # Capacity count
            if otype == "rack":
                racks_capacity_used += obj["metadata"].get("sku_count", 0)
            
            if obj["status"] == "hazard":
                hazard_count += 1
                
        space_utilization_pct = round((occupied_vol / total_vol) * 100, 2)
        rack_utilization_pct = round((racks_capacity_used / racks_capacity_max) * 100, 2) if racks_capacity_max > 0 else 0.0
        
        return {
            "total_objects": len(objects),
            "space_utilization_pct": space_utilization_pct,
            "rack_utilization_pct": rack_utilization_pct,
            "occupied_volume_m3": round(occupied_vol, 2),
            "category_counts": category_counts,
            "hazard_count": hazard_count
        }

    @staticmethod
    def estimate_3d_bounding_box_from_images(label: str, image_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simulate a computer vision bounding box estimation pipeline.
        In a real application, this runs a 3D Deep Learning model (like PointRCNN, YOLO3D, or FCOS3D)
        to extract 3D boxes from input coordinates and images.
        """
        # Determine defaults based on labels
        size_defaults = {
            "pallet": {"w": 1.2, "h": 1.2, "d": 1.2},
            "crate": {"w": 1.5, "h": 1.0, "d": 1.5},
            "barrel": {"w": 0.8, "h": 1.1, "d": 0.8},
            "forklift": {"w": 1.4, "h": 2.1, "d": 2.8},
            "rack": {"w": 2.0, "h": 4.0, "d": 8.0}
        }
        
        dims = size_defaults.get(label.lower(), {"w": 1.0, "h": 1.0, "d": 1.0})
        
        # Add slight variation based on mock image info to represent real CV inference jitter
        img_h = image_metadata.get("height", 1080)
        img_w = image_metadata.get("width", 1920)
        seed_val = (img_h * img_w) % 100
        
        # Add random but deterministic offsets
        jitter = (seed_val / 1000.0) - 0.05  # -0.05 to +0.05
        dims["w"] = round(dims["w"] + jitter, 2)
        dims["h"] = round(dims["h"] + jitter, 2)
        dims["d"] = round(dims["d"] + jitter, 2)
        
        # Estimate position (random coordinates on floor within bounds)
        x = round((seed_val % 20) - 10, 1)
        y = round(dims["h"] / 2.0, 2) # rest on ground
        z = round(((seed_val * 7) % 20) - 10, 1)
        
        return {
            "position": {"x": x, "y": y, "z": z},
            "rotation": {"x": 0.0, "y": round((seed_val % 4) * (math.pi / 2.0), 2), "z": 0.0},
            "dimensions": dims,
            "confidence": round(0.85 + (seed_val % 15) / 100.0, 2)
        }
