import time
import threading
import random
from typing import List, Dict, Any

class MeshroomPipelineSim:
    def __init__(self):
        self.is_running = False
        self.progress = 0
        self.current_stage = "Idle"
        self.logs: List[str] = []
        self.lock = threading.Lock()
        
        # Define stages with duration weights and log patterns
        self.stages = [
            {"name": "CameraInit", "duration": 1.5, "desc": "Camera Initialization"},
            {"name": "FeatureExtraction", "duration": 2.5, "desc": "SIFT Feature Extraction"},
            {"name": "ImageMatching", "duration": 2.0, "desc": "Matching Image Pairs"},
            {"name": "FeatureMatching", "duration": 2.0, "desc": "Filtering Geometric Matches"},
            {"name": "StructureFromMotion", "duration": 3.0, "desc": "Calculating Camera Poses (SfM)"},
            {"name": "PrepareDenseScene", "duration": 1.5, "desc": "Undistorting Source Images"},
            {"name": "DepthMap", "duration": 3.5, "desc": "Generating Height/Depth Maps"},
            {"name": "DepthMapFilter", "duration": 1.5, "desc": "Filtering Depth Map Outliers"},
            {"name": "Meshing", "duration": 2.5, "desc": "Generating 3D Triangulated Mesh"},
            {"name": "MeshFiltering", "duration": 1.5, "desc": "Smoothing Polygonal Geometry"},
            {"name": "Texturing", "duration": 2.5, "desc": "Projecting Texture Coordinates"}
        ]

    def _log(self, message: str, level: str = "INFO"):
        timestamp = time.strftime("%H:%M:%S")
        log_line = f"[{timestamp}] [{level}] {message}"
        with self.lock:
            self.logs.append(log_line)
            # Cap logs to prevent memory bloat
            if len(self.logs) > 500:
                self.logs.pop(0)

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "is_running": self.is_running,
                "progress": self.progress,
                "current_stage": self.current_stage,
                "logs": self.logs.copy()
            }

    def start_pipeline(self, image_count: int, object_label: str):
        with self.lock:
            if self.is_running:
                return False
            self.is_running = True
            self.progress = 0
            self.current_stage = self.stages[0]["name"]
            self.logs = []
        
        thread = threading.Thread(target=self._run_pipeline, args=(image_count, object_label))
        thread.daemon = True
        thread.start()
        return True

    def _run_pipeline(self, image_count: int, object_label: str):
        self._log(f"Starting Meshroom photogrammetry automation workflow for asset category: '{object_label}'")
        self._log(f"CLI Input: meshroom_photogrammetry --input ./input_scans/{object_label}_photos --output ./static/cache/{object_label}_mesh")
        self._log(f"Detected {image_count} raw photos in input directory. Camera Database loaded.")

        total_stages = len(self.stages)
        
        for idx, stage in enumerate(self.stages):
            stage_name = stage["name"]
            duration = stage["duration"]
            
            with self.lock:
                self.current_stage = stage_name
                
            self._log(f"Executing Node: {stage_name} ({stage['desc']})", "INFO")
            
            # Print detailed technical logs for specific nodes
            if stage_name == "CameraInit":
                self._log(f"Sensor Database size: 4520 devices. Parsing EXIF metadata...")
                self._log(f"Matching camera sensor model against internal DB: OK")
                self._log(f"Resolution detected: 4032 x 3024. Focal Length: 4.25mm")
                
            elif stage_name == "FeatureExtraction":
                self._log(f"Setting SIFT Feature Detector option 'describerTypes' to: ['sift']")
                self._log(f"Setting scale steps to default: 3. Thread pool: 8 workers")
                for i in range(1, min(image_count + 1, 6)):
                    time.sleep(duration / 6.0)
                    self._log(f"Processed image {i}/{image_count}: found {random.randint(8000, 15000)} keypoints")
                if image_count > 5:
                    self._log(f"Processed remaining {image_count - 5} images in background thread.")
                    
            elif stage_name == "ImageMatching":
                pairs = (image_count * (image_count - 1)) // 2
                self._log(f"Image Matching node initialized. Analyzing {pairs} candidate matches.")
                self._log(f"Extracted {random.randint(150, 400)} matching vocabulary tree elements.")
                
            elif stage_name == "StructureFromMotion":
                self._log(f"Structure from Motion (SfM) solver: IncrementalSfM")
                self._log(f"Triangulated {random.randint(20000, 60000)} points in sparse cloud.")
                self._log(f"Calibrated 3D camera poses for {image_count}/{image_count} views successfully.")
                self._log(f"Average projection error: {round(random.uniform(0.3, 0.7), 4)} pixels.")
                
            elif stage_name == "DepthMap":
                self._log(f"Computing Depth Maps. Heavy GPU processing requested.")
                self._log(f"CUDA device found: GPU_0. Allocating memory...")
                self._log(f"Downscaling images by factor of 2 for processing speed.")
                for i in range(0, 100, 25):
                    time.sleep(duration / 4.0)
                    self._log(f"DepthMap compute task: {i}% complete")
                    
            elif stage_name == "Meshing":
                self._log(f"Constructing dense 3D surface using Delaunay Triangulation.")
                self._log(f"Setting minObservationsForTriangulation: 2")
                self._log(f"Calculated {random.randint(100000, 300000)} faces.")
                
            elif stage_name == "Texturing":
                self._log(f"Unwrapping UV channels using LSCM algorithm.")
                self._log(f"Baking texture atlas mapping. File dimension: 4096 x 4096 px.")
                self._log(f"Texturing file completed: texture_0.png output created.")
            
            # Simulate processing time for this stage
            steps = 5
            for step in range(steps):
                time.sleep(duration / float(steps))
                # Update progress based on current stage index
                base_progress = (idx / total_stages) * 100
                stage_progress = (step + 1) / float(steps) * (100 / total_stages)
                with self.lock:
                    self.progress = int(base_progress + stage_progress)
            
            self._log(f"Node {stage_name} finished successfully. Cache written to disk.", "SUCCESS")
            
        self._log(f"Meshroom pipeline completed in {sum(s['duration'] for s in self.stages)}s", "SUCCESS")
        self._log(f"Reconstructed mesh saved to: ./static/cache/{object_label}_mesh.obj", "SUCCESS")
        
        with self.lock:
            self.progress = 100
            self.is_running = False
            self.current_stage = "Finished"
