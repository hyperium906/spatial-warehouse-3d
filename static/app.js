// App.js - Controller logic, API requests, and Tab/Sprint management
let currentTab = 'floor-map-tab';
let currentSprint = 5;
let inventoryData = [];
let selectedObjectId = null;
let pipelineInterval = null;

// Standalone 3D Preview renderer variables
let previewScene, previewCamera, previewRenderer, previewControls, previewMesh;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Tabs Navigation
    initTabs();
    
    // 2. Initialize 3D Floor Viewer (three-view.js)
    initThreeView('three-container', handleSelectObjectFrom3D, handleUpdateObjectFrom3D);
    
    // 3. Initialize Sprint View Selector
    initSprintSelector();
    
    // 4. Fetch initial dataset
    fetchInventory();
    fetchAnalytics();
    
    // 5. Wire up user controls & forms
    setupControls();
    
    // 6. Setup standalone 3D previewer (for Meshroom outcomes)
    initPreviewThree();
});

// Tab routing logic
function initTabs() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    currentTab = tabId;
    
    // Update navigation active states
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Toggle page views
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id === tabId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Fix renderer sizes on reveal
    if (tabId === 'floor-map-tab') {
        window.dispatchEvent(new Event('resize'));
    }
}

// Sprint selector filters the features active in the UI
function initSprintSelector() {
    const select = document.getElementById('sprint-select');
    select.addEventListener('change', (e) => {
        setSprintLevel(parseInt(e.target.value));
    });
    // Set default sprint
    setSprintLevel(5);
}

function setSprintLevel(sprintNum) {
    currentSprint = sprintNum;
    document.getElementById('active-sprint-badge').textContent = sprintNum;
    
    // Apply visual classes to cards according to the retro milestones
    document.querySelectorAll('.retro-card').forEach((card, idx) => {
        const cardSprint = idx + 1;
        card.classList.remove('active-now', 'disabled');
        if (cardSprint === sprintNum) {
            card.classList.add('active-now');
        } else if (cardSprint > sprintNum) {
            card.classList.add('disabled');
        }
    });
    
    // Sprint features filters:
    const sprint4Features = document.querySelectorAll('.sprint-4-feature');
    const pipelineBtn = document.getElementById('btn-pipeline');
    const analyticsBtn = document.getElementById('btn-analytics');
    const resetCamBtn = document.getElementById('btn-reset-cam');
    
    // Sprint 1: Core 3D Viewer & Layout only
    if (sprintNum === 1) {
        // Only layout. Raycaster and details disabled.
        clearSelection();
        handleSelectObjectFrom3D(null);
        sprint4Features.forEach(el => el.classList.add('hidden'));
        pipelineBtn.classList.add('hidden');
        analyticsBtn.classList.add('hidden');
        if (currentTab === 'pipeline-tab' || currentTab === 'analytics-tab') {
            switchTab('floor-map-tab');
        }
    } 
    // Sprint 2: Object Bounding Box Engine
    else if (sprintNum === 2) {
        sprint4Features.forEach(el => el.classList.add('hidden'));
        pipelineBtn.classList.add('hidden');
        analyticsBtn.classList.add('hidden');
        if (currentTab === 'pipeline-tab' || currentTab === 'analytics-tab') {
            switchTab('floor-map-tab');
        }
    }
    // Sprint 3: Meshroom CLI Integration
    else if (sprintNum === 3) {
        sprint4Features.forEach(el => el.classList.add('hidden'));
        pipelineBtn.classList.remove('hidden');
        analyticsBtn.classList.add('hidden');
        if (currentTab === 'analytics-tab') {
            switchTab('floor-map-tab');
        }
    }
    // Sprint 4: Spatial Updating & Collisions
    else if (sprintNum === 4) {
        sprint4Features.forEach(el => el.classList.remove('hidden'));
        pipelineBtn.classList.remove('hidden');
        analyticsBtn.classList.add('hidden');
        if (currentTab === 'analytics-tab') {
            switchTab('floor-map-tab');
        }
    }
    // Sprint 5: Full Inventory Dashboard
    else {
        sprint4Features.forEach(el => el.classList.remove('hidden'));
        pipelineBtn.classList.remove('hidden');
        analyticsBtn.classList.remove('hidden');
    }

    // Re-render scene with the new sprint capabilities
    renderWarehouse(inventoryData, currentSprint);
}

// REST Requests
async function fetchInventory() {
    try {
        const loader = document.getElementById('canvas-loader');
        if (loader) loader.classList.remove('hidden');
        
        const res = await fetch('/api/inventory');
        inventoryData = await res.json();
        
        // Render in Three.js
        renderWarehouse(inventoryData, currentSprint);
        
        // Populate hazard diagnostics
        renderHazards();
        
        if (loader) loader.classList.add('hidden');
    } catch (err) {
        console.error("Failed to load inventory:", err);
    }
}

async function fetchAnalytics() {
    if (currentSprint < 5) return;
    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        
        // Update stats
        document.getElementById('stat-total-objects').textContent = data.total_objects;
        document.getElementById('stat-space-pct').textContent = `${data.space_utilization_pct}%`;
        document.getElementById('stat-rack-pct').textContent = `${data.rack_utilization_pct}%`;
        document.getElementById('stat-hazards').textContent = data.hazard_count;
        
        // Update Ring Gauges
        updateRingGauge('space-gauge-ring', 'gauge-space-text', data.space_utilization_pct);
        updateRingGauge('rack-gauge-ring', 'gauge-rack-text', data.rack_utilization_pct);
        
        // Render bar chart
        renderCategoryChart(data.category_counts);
    } catch (err) {
        console.error("Failed to load analytics:", err);
    }
}

// Ring Gauges math
function updateRingGauge(ringId, textId, percent) {
    const circle = document.getElementById(ringId);
    const text = document.getElementById(textId);
    if (!circle || !text) return;
    
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    
    // Bound percent 0-100
    const val = Math.min(Math.max(percent, 0), 100);
    const offset = circumference - (val / 100) * circumference;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
    text.textContent = `${val}%`;
}

// Chart rendering
function renderCategoryChart(counts) {
    const container = document.getElementById('category-bars');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Find max to scale widths relative to 100%
    const maxVal = Math.max(...Object.values(counts), 1);
    
    const categories = ['rack', 'pallet', 'crate', 'barrel', 'forklift'];
    categories.forEach(cat => {
        const val = counts[cat] || 0;
        const widthPct = (val / maxVal) * 100;
        
        const row = document.createElement('div');
        row.className = 'chart-bar-row';
        row.innerHTML = `
            <span class="chart-bar-label">${cat}</span>
            <div class="chart-bar-track">
                <div class="chart-bar-fill ${cat}" style="width: ${widthPct}%"></div>
            </div>
            <span class="chart-bar-val">${val}</span>
        `;
        container.appendChild(row);
    });
}

// Hazards list builder
function renderHazards() {
    const list = document.getElementById('hazards-list');
    const empty = document.getElementById('hazards-empty');
    const badge = document.getElementById('hazard-count-badge');
    
    const hazards = inventoryData.filter(o => o.status === 'hazard');
    badge.textContent = hazards.length;
    
    if (hazards.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = '';
    
    hazards.forEach(h => {
        const item = document.createElement('div');
        item.className = 'hazard-item';
        
        // Build reasons list
        const reasons = h.metadata.violations || ["Spatial intersection alert"];
        const reasonsHtml = reasons.map(r => `<p><i class="fa-solid fa-circle-exclamation"></i> ${r}</p>`).join('');
        
        item.innerHTML = `
            <h6><i class="fa-solid fa-triangle-exclamation animate-pulse"></i> ${h.name}</h6>
            ${reasonsHtml}
        `;
        list.appendChild(item);
    });
}

// Object Raycast selection listener
function handleSelectObjectFrom3D(id) {
    selectedObjectId = id;
    const dataPanel = document.getElementById('inspector-data');
    const emptyPanel = document.getElementById('inspector-empty');
    
    // Sprint 1: ignore inspector details
    if (currentSprint === 1 || !id) {
        dataPanel.classList.add('hidden');
        emptyPanel.classList.remove('hidden');
        return;
    }
    
    const obj = inventoryData.find(o => o.id === id);
    if (!obj) return;
    
    emptyPanel.classList.add('hidden');
    dataPanel.classList.remove('hidden');
    
    // Fill text labels
    document.getElementById('obj-type-badge').textContent = obj.type;
    document.getElementById('obj-type-badge').className = `detail-badge ${obj.type}`;
    document.getElementById('obj-name').textContent = obj.name;
    document.getElementById('obj-id').textContent = `ID: ${obj.id}`;
    
    document.getElementById('coord-x').textContent = obj.position.x.toFixed(1) + 'm';
    document.getElementById('coord-y').textContent = obj.position.y.toFixed(1) + 'm';
    document.getElementById('coord-z').textContent = obj.position.z.toFixed(1) + 'm';
    document.getElementById('coord-rot-y').textContent = obj.rotation.y.toFixed(2) + ' rad';
    
    document.getElementById('dim-w').textContent = obj.dimensions.w.toFixed(1) + 'm';
    document.getElementById('dim-h').textContent = obj.dimensions.h.toFixed(1) + 'm';
    document.getElementById('dim-d').textContent = obj.dimensions.d.toFixed(1) + 'm';
    
    const vol = obj.dimensions.w * obj.dimensions.h * obj.dimensions.d;
    document.getElementById('dim-vol').textContent = vol.toFixed(2) + ' m³';
    
    // Confidence bar setting
    const pct = Math.round(obj.confidence * 100);
    document.getElementById('obj-confidence-text').textContent = `${pct}%`;
    document.getElementById('obj-confidence-bar').style.setProperty('--pct', `${pct}%`);
    // Dynamic styling injection for pseudo elements
    const styleSheet = document.getElementById('confidence-bar-styles') || (() => {
        const style = document.createElement('style');
        style.id = 'confidence-bar-styles';
        document.head.appendChild(style);
        return style;
    })();
    styleSheet.innerHTML = `.confidence-bar::before { width: ${pct}% !important; }`;
    
    // SKU counts
    if (obj.type === 'rack') {
        document.getElementById('sku-count-row').classList.remove('hidden');
        document.getElementById('obj-sku-count').textContent = `${obj.metadata.sku_count || 0} / ${obj.metadata.max_capacity || 60} slots`;
    } else if (obj.metadata.sku_count !== undefined) {
        document.getElementById('sku-count-row').classList.remove('hidden');
        document.getElementById('obj-sku-count').textContent = `${obj.metadata.sku_count} items`;
    } else {
        document.getElementById('sku-count-row').classList.add('hidden');
    }
    
    document.getElementById('obj-zone').textContent = obj.metadata.zone || "N/A";
    document.getElementById('obj-last-scanned').textContent = obj.metadata.last_scanned || "N/A";
    
    // Load slider positions for Sprint 4 features
    if (currentSprint >= 4) {
        document.getElementById('adjust-x').value = obj.position.x;
        document.getElementById('adjust-z').value = obj.position.z;
        document.getElementById('adjust-rot').value = obj.rotation.y;
    }
}

// Update object position from 3D Raycasting drag logic
function handleUpdateObjectFrom3D(id, pos, rot) {
    if (currentSprint < 4) return;
    
    // Call API to save coordinates
    fetch('/api/inventory/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: id,
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: rot.x, y: rot.y, z: rot.z }
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            // Hot reload local dataset without full Three.js reconstruction to maintain performance
            const obj = inventoryData.find(o => o.id === id);
            if (obj) {
                obj.position = pos;
                obj.rotation = rot;
            }
            renderHazards();
            fetchAnalytics();
        }
    });
}

// Bind UI actions
function setupControls() {
    // RESET CAMERA
    document.getElementById('btn-reset-cam').addEventListener('click', () => {
        resetCameraPosition();
    });
    
    // GRID TOGGLE
    const gridBtn = document.getElementById('btn-toggle-grid');
    gridBtn.addEventListener('click', () => {
        const active = gridBtn.classList.toggle('active');
        setGridVisibility(active);
    });
    
    // DELETE OBJECT
    document.getElementById('btn-delete-object').addEventListener('click', () => {
        if (!selectedObjectId) return;
        if (confirm(`Are you sure you want to delete object ${selectedObjectId}?`)) {
            fetch(`/api/inventory/delete/${selectedObjectId}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    selectedObjectId = null;
                    fetchInventory();
                    fetchAnalytics();
                    handleSelectObjectFrom3D(null);
                }
            });
        }
    });

    // IMAGE SLIDER DISPLAY
    const slider = document.getElementById('image-count-slider');
    const sliderVal = document.getElementById('image-count-val');
    slider.addEventListener('input', (e) => {
        sliderVal.textContent = `${e.target.value} Photos`;
    });

    // DRAG-AND-DROP FILE UPLOAD MOCKUP
    const dropzone = document.getElementById('upload-dropzone');
    const fileInfo = document.getElementById('upload-files-info');
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const count = e.dataTransfer.files.length;
        if (count > 0) {
            fileInfo.textContent = `${count} multi-angle photo files selected.`;
        }
    });
    
    dropzone.addEventListener('click', () => {
        const fileCount = Math.floor(Math.random() * 20) + 15;
        fileInfo.textContent = `Auto-selected ${fileCount} target reference photos.`;
        slider.value = fileCount;
        sliderVal.textContent = `${fileCount} Photos`;
    });

    // FORM TRIGGER SCAN
    const form = document.getElementById('scan-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const label = document.getElementById('scan-type').value;
        const imageCount = parseInt(slider.value);
        
        triggerPipelineScan(label, imageCount);
    });

    // SPRINT 4 SLIDER OVERRIDES
    const adjustX = document.getElementById('adjust-x');
    const adjustZ = document.getElementById('adjust-z');
    const adjustRot = document.getElementById('adjust-rot');
    
    const handleSliderOverride = () => {
        if (!selectedObjectId || currentSprint < 4) return;
        const obj = inventoryData.find(o => o.id === selectedObjectId);
        if (!obj) return;
        
        const newPos = { x: parseFloat(adjustX.value), y: obj.position.y, z: parseFloat(adjustZ.value) };
        const newRot = { x: obj.rotation.x, y: parseFloat(adjustRot.value), z: obj.rotation.z };
        
        // Update local object mesh immediately for responsiveness
        if (selectedObjectMesh) {
            selectedObjectMesh.position.set(newPos.x, newPos.y, newPos.z);
            selectedObjectMesh.rotation.set(newRot.x, newRot.y, newRot.z);
            
            // Re-render outline helper
            selectObject(selectedObjectId);
        }
        
        // Debounce coordinates updates or update on slider change
        handleUpdateObjectFrom3D(selectedObjectId, newPos, newRot);
    };

    adjustX.addEventListener('input', handleSliderOverride);
    adjustZ.addEventListener('input', handleSliderOverride);
    adjustRot.addEventListener('input', handleSliderOverride);

    // CLEAR LOGS
    document.getElementById('btn-clear-logs').addEventListener('click', () => {
        const terminal = document.getElementById('terminal-output');
        terminal.innerHTML = '<div class="terminal-row line-system">Console logs cleared. System listening...</div>';
    });
}

// Photogrammetry Scan polling
function triggerPipelineScan(label, imageCount) {
    const btn = document.getElementById('btn-start-pipeline');
    btn.disabled = true;
    
    // Clear nodes active/complete classes
    document.querySelectorAll('.node-step').forEach(node => {
        node.classList.remove('active', 'completed');
    });

    const terminal = document.getElementById('terminal-output');
    terminal.innerHTML += `<div class="terminal-row line-input">antigravity@warehouse-cv-node:~$ python3 pipeline_runner.py --task scan --label ${label} --photos ${imageCount}</div>`;
    
    fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            label: label,
            image_count: imageCount
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'started') {
            // Start polling status
            startLogsPolling(label);
        } else {
            btn.disabled = false;
        }
    })
    .catch(err => {
        console.error("Scan error:", err);
        btn.disabled = false;
    });
}

function startLogsPolling(label) {
    if (pipelineInterval) clearInterval(pipelineInterval);
    
    const terminal = document.getElementById('terminal-output');
    const pBar = document.getElementById('pipeline-progress-bar');
    const pText = document.getElementById('pipeline-pct');
    const btn = document.getElementById('btn-start-pipeline');
    const previewEmpty = document.getElementById('preview-empty');
    
    let renderedLinesCount = 0;
    
    pipelineInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/pipeline/status');
            const data = await res.json();
            
            // 1. Update progress metrics
            pBar.style.width = `${data.progress}%`;
            pText.textContent = `${data.progress}%`;
            
            // 2. Update pipeline active visual nodes
            document.querySelectorAll('.node-step').forEach(node => {
                const nodeName = node.getAttribute('data-node');
                node.classList.remove('active', 'completed');
                
                if (nodeName === data.current_stage) {
                    node.classList.add('active');
                }
            });
            
            // Complete previous nodes
            let foundCurrent = false;
            const nodes = ['CameraInit', 'FeatureExtraction', 'ImageMatching', 'StructureFromMotion', 'DepthMap', 'Meshing', 'Texturing'];
            const currentIndex = nodes.indexOf(data.current_stage);
            
            document.querySelectorAll('.node-step').forEach(node => {
                const nodeName = node.getAttribute('data-node');
                const nodeIdx = nodes.indexOf(nodeName);
                if (nodeIdx !== -1 && nodeIdx < currentIndex) {
                    node.classList.add('completed');
                }
            });
            
            // 3. Render logs
            if (data.logs.length > renderedLinesCount) {
                for (let i = renderedLinesCount; i < data.logs.length; i++) {
                    const log = data.logs[i];
                    let logClass = "line-system";
                    if (log.includes("[SUCCESS]")) logClass = "line-success";
                    else if (log.includes("[INFO]")) logClass = "line-info";
                    else if (log.includes("[WARNING]")) logClass = "line-warning";
                    
                    const row = document.createElement('div');
                    row.className = `terminal-row ${logClass}`;
                    row.textContent = log;
                    terminal.appendChild(row);
                }
                renderedLinesCount = data.logs.length;
                
                // Scroll terminal to bottom
                terminal.scrollTop = terminal.scrollHeight;
            }
            
            // 4. Handle process complete
            if (!data.is_running && data.progress === 100) {
                clearInterval(pipelineInterval);
                btn.disabled = false;
                
                // Mark all nodes complete
                document.querySelectorAll('.node-step').forEach(node => {
                    node.classList.add('completed');
                    node.classList.remove('active');
                });
                
                // Refresh data
                await fetchInventory();
                await fetchAnalytics();
                
                // Render Reconstructed 3D Preview
                previewEmpty.classList.add('hidden');
                updatePreviewMesh(label);
            }
        } catch (err) {
            console.error("Polling logs error:", err);
            clearInterval(pipelineInterval);
            btn.disabled = false;
        }
    }, 600);
}

// Standalone 3D Previewer
function initPreviewThree() {
    const container = document.getElementById('preview-three-container');
    if (!container) return;
    
    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x020617);
    
    previewCamera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 10);
    previewCamera.position.set(0, 1.5, 2.5);
    
    previewRenderer = new THREE.WebGLRenderer({ antialias: true });
    previewRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(previewRenderer.domElement);
    
    previewControls = new THREE.OrbitControls(previewCamera, previewRenderer.domElement);
    previewControls.enableDamping = true;
    previewControls.dampingFactor = 0.05;
    previewControls.autoRotate = true;
    previewControls.autoRotateSpeed = 2.0;
    
    // Add lighting
    const ambLight = new THREE.AmbientLight(0xffffff, 0.5);
    previewScene.add(ambLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 2);
    previewScene.add(dirLight);
    
    // Preview Animation Loop
    function animPreview() {
        requestAnimationFrame(animPreview);
        if (previewControls) previewControls.update();
        previewRenderer.render(previewScene, previewCamera);
    }
    animPreview();
}

function updatePreviewMesh(label) {
    // Clear previous preview mesh
    if (previewMesh) {
        previewScene.remove(previewMesh);
    }
    
    // Recreate a model based on label using the builders in three-view
    switch (label) {
        case 'rack':
            previewMesh = createRackModel(1.2, 2.0, 3.0);
            break;
        case 'pallet':
            previewMesh = createPalletModel(1.2, 0.8, 1.2);
            break;
        case 'crate':
            previewMesh = createCrateModel(1.2, 0.9, 1.2);
            break;
        case 'barrel':
            previewMesh = createBarrelModel(0.8, 1.1, 0.8);
            break;
    }
    
    // Scale and center the preview mesh
    previewMesh.scale.set(0.6, 0.6, 0.6);
    previewMesh.position.set(0, 0, 0);
    previewScene.add(previewMesh);
}
