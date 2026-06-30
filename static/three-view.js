// ThreeView - Handles 3D Warehouse Visualization and Raycasting Interactivity
let scene, camera, renderer, controls;
let objectsGroup;
let selectedObjectMesh = null;
let boundingBoxHelper = null;
let currentSprintLevel = 5;

// Callbacks
let onSelectObject = null;
let onUpdateObject = null;

// Materials dictionary to reuse
const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 }),
    orangeBeam: new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 }),
    crateWood: new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.9 }),
    crateTrim: new THREE.MeshStandardMaterial({ color: 0x713f12, roughness: 0.9 }),
    cardboard: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 }),
    plasticDrum: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }),
    metalBand: new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.1 }),
    forkliftBody: new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3 }),
    rubberWheel: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 }),
    forkMetal: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 }),
    gridFloor: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 })
};

function initThreeView(containerId, selectCallback, updateCallback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    onSelectObject = selectCallback;
    onUpdateObject = updateCallback;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = null; // transparent to use CSS radial gradient

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    resetCameraPosition();

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clear container and append
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Controls Setup
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // prevent going below floor
    controls.minDistance = 3;
    controls.maxDistance = 40;

    // 5. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight1.position.set(10, 15, 10);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 40;
    const d = 15;
    dirLight1.shadow.camera.left = -d;
    dirLight1.shadow.camera.right = d;
    dirLight1.shadow.camera.top = d;
    dirLight1.shadow.camera.bottom = -d;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.3); // indigo tint fill light
    dirLight2.position.set(-10, 8, -10);
    scene.add(dirLight2);

    // 6. Grid and Floor Setup
    const gridHelper = new THREE.GridHelper(30, 30, 0x6366f1, 0x1e293b);
    gridHelper.position.y = 0.001; // slightly above floor mesh
    scene.add(gridHelper);

    // Floor Mesh
    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMesh = new THREE.Mesh(floorGeo, materials.gridFloor);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // 7. Group for warehouse models
    objectsGroup = new THREE.Group();
    scene.add(objectsGroup);

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // Start animation loop
    animate();
}

function onWindowResize() {
    const container = renderer.domElement.parentElement;
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function resetCameraPosition() {
    camera.position.set(0, 10, 18);
    if (controls) {
        controls.target.set(0, 0, 0);
    }
}

function setGridVisibility(visible) {
    scene.traverse((child) => {
        if (child instanceof THREE.GridHelper) {
            child.visible = visible;
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    if (controls) {
        controls.update();
    }
    
    // Rotate selected outline slightly for dynamic effect
    if (boundingBoxHelper && currentSprintLevel >= 2) {
        boundingBoxHelper.rotation.y += 0.005;
    }

    renderer.render(scene, camera);
}

// Raycasting to select object
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerDown(event) {
    // Only raycast on left-click
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objectsGroup.children, true);

    if (intersects.length > 0) {
        // Find top-level object in objectsGroup
        let object = intersects[0].object;
        while (object.parent && object.parent !== objectsGroup) {
            object = object.parent;
        }
        
        selectObject(object.userData.id);
        if (onSelectObject) {
            onSelectObject(object.userData.id);
        }
    } else {
        // Clear selection if clicked floor
        clearSelection();
        if (onSelectObject) {
            onSelectObject(null);
        }
    }
}

// Select object and highlight it
function selectObject(id) {
    clearSelection();

    const mesh = objectsGroup.children.find(m => m.userData.id === id);
    if (!mesh) return;

    selectedObjectMesh = mesh;

    // Sprint 2 feature: bounding box selection helper
    if (currentSprintLevel >= 2) {
        const box = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Create a custom wireframe box representing the 3D bounding box estimation
        const bboxGeo = new THREE.BoxGeometry(size.x + 0.05, size.y + 0.05, size.z + 0.05);
        const isHazard = mesh.userData.status === 'hazard';
        const color = isHazard ? 0xf43f5e : 0x6366f1; // red for hazards, indigo for ok
        
        const bboxMat = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        
        boundingBoxHelper = new THREE.Mesh(bboxGeo, bboxMat);
        boundingBoxHelper.position.copy(center);
        scene.add(boundingBoxHelper);
    }
}

function clearSelection() {
    selectedObjectMesh = null;
    if (boundingBoxHelper) {
        scene.remove(boundingBoxHelper);
        boundingBoxHelper.geometry.dispose();
        boundingBoxHelper = null;
    }
}

// Render dynamic database items
function renderWarehouse(objectsList, sprintLevel) {
    currentSprintLevel = parseInt(sprintLevel);
    clearSelection();
    
    // Dispose previous models
    while(objectsGroup.children.length > 0){
        const obj = objectsGroup.children[0];
        objectsGroup.remove(obj);
    }

    if (!objectsList) return;

    objectsList.forEach(item => {
        let model;
        
        // Procedurally construct models based on item class
        switch (item.type) {
            case 'rack':
                model = createRackModel(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                break;
            case 'pallet':
                model = createPalletModel(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                break;
            case 'crate':
                model = createCrateModel(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                break;
            case 'barrel':
                model = createBarrelModel(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                break;
            case 'forklift':
                model = createForkliftModel(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                break;
            default:
                // Fallback cube
                const geo = new THREE.BoxGeometry(item.dimensions.w, item.dimensions.h, item.dimensions.d);
                const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
                model = new THREE.Mesh(geo, mat);
        }

        // Apply spatial properties
        model.position.set(item.position.x, item.position.y, item.position.z);
        model.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
        
        // Attach userdata properties for raycaster identification
        model.userData = {
            id: item.id,
            type: item.type,
            status: item.status
        };

        // Sprint 2: Highlight hazard statuses visually
        if (currentSprintLevel >= 2 && item.status === 'hazard') {
            // Add a subtle glowing hazard ring or bounding box under the item
            const hazardRingGeo = new THREE.RingGeometry(
                Math.max(item.dimensions.w, item.dimensions.d) * 0.5,
                Math.max(item.dimensions.w, item.dimensions.d) * 0.65,
                32
            );
            const hazardRingMat = new THREE.MeshBasicMaterial({
                color: 0xf43f5e,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.3
            });
            const hazardRing = new THREE.Mesh(hazardRingGeo, hazardRingMat);
            hazardRing.rotation.x = Math.PI / 2;
            hazardRing.position.y = -item.position.y + 0.05; // place exactly on floor relative to model parent
            model.add(hazardRing);
        }

        objectsGroup.add(model);
    });
}

// Procedural 3D model builders
function createRackModel(w, h, d) {
    const group = new THREE.Group();
    
    // Shelving Posts (4 vertical legs)
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, h, 8);
    const halfW = w / 2;
    const halfD = d / 2;
    
    const offsets = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [-halfW, halfD],
        [halfW, halfD]
    ];
    
    offsets.forEach(offset => {
        const leg = new THREE.Mesh(legGeo, materials.steel);
        leg.position.set(offset[0], 0, offset[1]);
        leg.castShadow = true;
        leg.receiveShadow = true;
        group.add(leg);
    });
    
    // Horizontal Shelving support beams
    const shelfLevels = [-h/3, h/10, h/2.1]; // Y coordinates for shelves
    
    shelfLevels.forEach(yLevel => {
        // Longitudinal main beams
        const beamGeo = new THREE.BoxGeometry(0.06, 0.12, d);
        const leftBeam = new THREE.Mesh(beamGeo, materials.orangeBeam);
        leftBeam.position.set(-halfW, yLevel, 0);
        leftBeam.castShadow = true;
        group.add(leftBeam);
        
        const rightBeam = new THREE.Mesh(beamGeo, materials.orangeBeam);
        rightBeam.position.set(halfW, yLevel, 0);
        rightBeam.castShadow = true;
        group.add(rightBeam);
        
        // Wooden planks on shelves
        const plankCount = 6;
        const plankD = d / (plankCount + 1);
        const plankGeo = new THREE.BoxGeometry(w, 0.03, plankD);
        
        for (let i = 0; i < plankCount; i++) {
            const plank = new THREE.Mesh(plankGeo, materials.wood);
            const zPos = -halfD + (i + 1) * (d / (plankCount + 1));
            plank.position.set(0, yLevel + 0.05, zPos);
            plank.castShadow = true;
            plank.receiveShadow = true;
            group.add(plank);
        }
    });
    
    return group;
}

function createPalletModel(w, h, d) {
    const group = new THREE.Group();
    
    // Wooden base frame (3 long blocks underneath)
    const baseGeo = new THREE.BoxGeometry(w, 0.07, 0.08);
    for (let i = -1; i <= 1; i++) {
        const base = new THREE.Mesh(baseGeo, materials.crateTrim);
        base.position.set(0, -h/2 + 0.035, i * (d/2 - 0.04));
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
    }
    
    // Horizontal slats on top
    const slatGeo = new THREE.BoxGeometry(0.08, 0.02, d);
    const slatCount = 7;
    for (let i = 0; i < slatCount; i++) {
        const slat = new THREE.Mesh(slatGeo, materials.wood);
        const xPos = -w/2 + (i * (w / (slatCount - 1)));
        slat.position.set(xPos, -h/2 + 0.08, 0);
        slat.castShadow = true;
        slat.receiveShadow = true;
        group.add(slat);
    }
    
    // Placed Cardboard Boxes on top
    const boxCount = 3;
    const boxGeo = new THREE.BoxGeometry(w * 0.45, h * 0.7, d * 0.45);
    
    const boxPositions = [
        [-w * 0.22, -h/2 + 0.09 + (h*0.35), -d * 0.22],
        [w * 0.22, -h/2 + 0.09 + (h*0.35), -d * 0.22],
        [0, -h/2 + 0.09 + (h*0.35), d * 0.22]
    ];
    
    boxPositions.forEach(pos => {
        const box = new THREE.Mesh(boxGeo, materials.cardboard);
        box.position.set(pos[0], pos[1], pos[2]);
        box.castShadow = true;
        box.receiveShadow = true;
        group.add(box);
    });
    
    return group;
}

function createCrateModel(w, h, d) {
    const group = new THREE.Group();
    
    // Outer wooden box
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const box = new THREE.Mesh(boxGeo, materials.crateWood);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    
    // Structural support slats (Corners & Crosses)
    // Vertical corner braces
    const braceW = 0.08;
    const braceDepth = 0.02;
    const vBraceGeo = new THREE.BoxGeometry(braceW, h, braceDepth);
    
    const faceOffsets = [
        [0, 0, d/2 + 0.005, 0], // front
        [0, 0, -d/2 - 0.005, 0], // back
        [w/2 + 0.005, 0, 0, Math.PI / 2], // right
        [-w/2 - 0.005, 0, 0, Math.PI / 2] // left
    ];
    
    faceOffsets.forEach(face => {
        // Left column
        const braceL = new THREE.Mesh(vBraceGeo, materials.crateTrim);
        if (face[3] === 0) {
            braceL.position.set(-w/2 + braceW/2, 0, face[2]);
        } else {
            braceL.position.set(face[0], 0, -d/2 + braceW/2);
            braceL.rotation.y = face[3];
        }
        group.add(braceL);
        
        // Right column
        const braceR = new THREE.Mesh(vBraceGeo, materials.crateTrim);
        if (face[3] === 0) {
            braceR.position.set(w/2 - braceW/2, 0, face[2]);
        } else {
            braceR.position.set(face[0], 0, d/2 - braceW/2);
            braceR.rotation.y = face[3];
        }
        group.add(braceR);
        
        // Top and bottom horizontal bands
        const hBraceGeo = new THREE.BoxGeometry(w - braceW * 2, braceW, braceDepth);
        const topH = new THREE.Mesh(hBraceGeo, materials.crateTrim);
        const botH = new THREE.Mesh(hBraceGeo, materials.crateTrim);
        
        if (face[3] === 0) {
            topH.position.set(0, h/2 - braceW/2, face[2]);
            botH.position.set(0, -h/2 + braceW/2, face[2]);
        } else {
            const hBraceRotGeo = new THREE.BoxGeometry(d - braceW * 2, braceW, braceDepth);
            const rotTop = new THREE.Mesh(hBraceRotGeo, materials.crateTrim);
            const rotBot = new THREE.Mesh(hBraceRotGeo, materials.crateTrim);
            rotTop.position.set(face[0], h/2 - braceW/2, 0);
            rotBot.position.set(face[0], -h/2 + braceW/2, 0);
            rotTop.rotation.y = face[3];
            rotBot.rotation.y = face[3];
            group.add(rotTop);
            group.add(rotBot);
            return;
        }
        group.add(topH);
        group.add(botH);
    });
    
    return group;
}

function createBarrelModel(w, h, d) {
    const group = new THREE.Group();
    
    // Cylindrical barrel body
    const r = w / 2;
    const bodyGeo = new THREE.CylinderGeometry(r, r, h, 16);
    const body = new THREE.Mesh(bodyGeo, materials.plasticDrum);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Ribbed metallic bands (3 bands around barrel)
    const bandGeo = new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.04, 16, 1, true);
    const bandLevels = [-h/3, 0, h/3];
    
    bandLevels.forEach(y => {
        const band = new THREE.Mesh(bandGeo, materials.metalBand);
        band.position.y = y;
        group.add(band);
    });
    
    return group;
}

function createForkliftModel(w, h, d) {
    const group = new THREE.Group();
    
    // Main chassis (yellow body)
    const chassisGeo = new THREE.BoxGeometry(w * 0.9, h * 0.4, d * 0.65);
    const chassis = new THREE.Mesh(chassisGeo, materials.forkliftBody);
    chassis.position.set(0, -h * 0.1, -d * 0.1);
    chassis.castShadow = true;
    group.add(chassis);
    
    // Wheels (4 black cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    
    const wheelOffsets = [
        [-w * 0.45, -h * 0.32, -d * 0.3], // front left
        [w * 0.45, -h * 0.32, -d * 0.3],  // front right
        [-w * 0.45, -h * 0.32, d * 0.1],  // back left
        [w * 0.45, -h * 0.32, d * 0.1]    // back right
    ];
    
    wheelOffsets.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, materials.rubberWheel);
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        group.add(wheel);
    });
    
    // Driver Cabin cage (4 metal columns and top plate)
    const cabinGeo = new THREE.BoxGeometry(w * 0.8, h * 0.5, d * 0.4);
    const cabin = new THREE.Mesh(cabinGeo, new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        wireframe: true,
        roughness: 0.9
    }));
    cabin.position.set(0, h * 0.25, -d * 0.1);
    group.add(cabin);
    
    // Lifting Mast & Forks (silver metal on front)
    const mastGeo = new THREE.BoxGeometry(0.1, h * 0.9, 0.1);
    const leftMast = new THREE.Mesh(mastGeo, materials.steel);
    leftMast.position.set(-w * 0.2, h * 0.12, -d * 0.42);
    leftMast.castShadow = true;
    group.add(leftMast);
    
    const rightMast = new THREE.Mesh(mastGeo, materials.steel);
    rightMast.position.set(w * 0.2, h * 0.12, -d * 0.42);
    rightMast.castShadow = true;
    group.add(rightMast);
    
    // Steel Fork prongs
    const forkGeo = new THREE.BoxGeometry(0.12, 0.04, d * 0.4);
    const leftFork = new THREE.Mesh(forkGeo, materials.forkMetal);
    leftFork.position.set(-w * 0.22, -h * 0.3, -d * 0.6);
    leftFork.castShadow = true;
    group.add(leftFork);
    
    const rightFork = new THREE.Mesh(forkGeo, materials.forkMetal);
    rightFork.position.set(w * 0.22, -h * 0.3, -d * 0.6);
    rightFork.castShadow = true;
    group.add(rightFork);
    
    return group;
}
