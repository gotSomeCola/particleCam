let scene, camera, renderer, controls;
let pixelBlocks = [];
let video, videoCanvas, videoCtx;
let pixelSize = 20;
let blockScale = 0.9;

function init() {
    setupScene();
    setupCamera();
    setupEventListeners();
    createPixelGrid();
    animate();
}

function setupScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x001122);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 25);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting (simplified, accurate color)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 3);
    scene.add(ambientLight);
    scene.add(directionalLight);
}

function setupCamera() {
    video = document.getElementById('camera-video');
    videoCanvas = document.createElement('canvas');
    videoCtx = videoCanvas.getContext('2d');

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
        })
        .catch(err => {
            console.error("Camera access failed:", err);
            video.src = "https://source.unsplash.com/random/640x480";
            video.loop = true;
            alert("Camera unavailable. Using fallback image.");
        });
}

function createPixelGrid() {
    pixelBlocks.forEach(p => scene.remove(p));
    pixelBlocks = [];

    const gridWidth = Math.floor(window.innerWidth / pixelSize);
    const gridHeight = Math.floor(window.innerHeight / pixelSize);

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const material = new THREE.MeshPhongMaterial({ color: 0x000000 });
            const pixel = new THREE.Mesh(geometry, material);

            pixel.position.set(
                x - gridWidth / 2,
                -(y - gridHeight / 2),
                0
            );

            pixel.scale.set(blockScale, blockScale, 0.1);
            pixel.userData = {
                originalX: x - gridWidth / 2,
                originalY: -(y - gridHeight / 2),
                gridX: x,
                gridY: y
            };

            scene.add(pixel);
            pixelBlocks.push(pixel);
        }
    }
}

function updatePixelWall() {
    if (!video.videoWidth) return;

    videoCanvas.width = video.videoWidth;
    videoCanvas.height = video.videoHeight;

    videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);

    const stepX = Math.floor(videoCanvas.width / (window.innerWidth / pixelSize));
    const stepY = Math.floor(videoCanvas.height / (window.innerHeight / pixelSize));

    const imgData = videoCtx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
    const data = imgData.data;

    pixelBlocks.forEach(pixel => {
        const { gridX, gridY } = pixel.userData;

        const sampleX = Math.min(videoCanvas.width - 1 - (gridX * stepX), videoCanvas.width - 1);
        const sampleY = Math.min(gridY * stepY, videoCanvas.height - 1);
        const idx = (sampleY * videoCanvas.width + sampleX) * 4;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        pixel.material.color.setRGB(r / 255, g / 255, b / 255);

        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        pixel.position.z = brightness * 5;
    });
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        createPixelGrid();
    });

    document.getElementById('density').addEventListener('input', (e) => {
        pixelSize = parseInt(e.target.value);
        document.getElementById('density-value').textContent = pixelSize;
        createPixelGrid();
    });

    document.getElementById('size').addEventListener('input', (e) => {
        blockScale = parseFloat(e.target.value);
        document.getElementById('size-value').textContent = blockScale.toFixed(1);
        pixelBlocks.forEach(pixel => {
            pixel.scale.set(blockScale, blockScale, 0.1);
        });
    });
}

function animate() {
    requestAnimationFrame(animate);
    updatePixelWall();
    controls.update();
    renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
