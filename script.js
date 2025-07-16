// script.js — MediaPipe Camera integration with debug overlay for hand landmarks and gesture-based emoji drop

let scene, camera, renderer, controls;
let pixelBlocks = [], fallingEmojis = [];
let video, videoCanvas, videoCtx;
let debugCanvas, debugCtx, rgbPanel;
let pixelSize = 20;
let blockScale = 0.9;
let previousFrame = null;

let hands, modelLoaded = false;
let currentRedLevel = 1.0;
let currentGreenLevel = 1.0;
let currentBlueLevel = 1.0;
let currentBrightness = 1.0;

function init() {
  setupScene();
  setupVideoElements();
  setupEventListeners();
  createPixelGrid();
  animate();
  setupHandTracking();
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

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 3);
  scene.add(ambientLight);
  scene.add(directionalLight);
}

function setupVideoElements() {
  video = document.getElementById('camera-video');
  videoCanvas = document.createElement('canvas');
  videoCtx = videoCanvas.getContext('2d');

  debugCanvas = document.createElement('canvas');
  debugCanvas.style.position = 'absolute';
  debugCanvas.style.top = '20px';
  debugCanvas.style.right = '20px';
  debugCanvas.width = 160;
  debugCanvas.height = 120;
  debugCanvas.style.zIndex = 60;
  debugCanvas.style.border = '2px solid #ff4d94';
  debugCanvas.style.borderRadius = '8px';
  document.body.appendChild(debugCanvas);
  debugCtx = debugCanvas.getContext('2d');

  rgbPanel = document.createElement('div');
  rgbPanel.style.position = 'absolute';
  rgbPanel.style.top = '150px';
  rgbPanel.style.right = '20px';
  rgbPanel.style.padding = '10px 15px';
  rgbPanel.style.background = 'rgba(0, 0, 0, 0.6)';
  rgbPanel.style.borderRadius = '8px';
  rgbPanel.style.color = '#e0f7ff';
  rgbPanel.style.fontFamily = 'monospace';
  rgbPanel.style.zIndex = 61;
  document.body.appendChild(rgbPanel);
  updateRGBPanel();
}

function updateRGBPanel() {
  rgbPanel.innerHTML = `
    <strong>Color Levels</strong><br>
    R: ${(currentRedLevel).toFixed(2)}<br>
    G: ${(currentGreenLevel).toFixed(2)}<br>
    B: ${(currentBlueLevel).toFixed(2)}<br>
    ☀ Brightness: ${(currentBrightness).toFixed(2)}
  `;
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

  const currentFrame = videoCtx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
  const stepX = Math.floor(videoCanvas.width / (window.innerWidth / pixelSize));
  const stepY = Math.floor(videoCanvas.height / (window.innerHeight / pixelSize));
  const data = currentFrame.data;

  pixelBlocks.forEach(pixel => {
    const { gridX, gridY } = pixel.userData;
    const sampleX = Math.min(videoCanvas.width - 1 - (gridX * stepX), videoCanvas.width - 1);
    const sampleY = Math.min(gridY * stepY, videoCanvas.height - 1);
    const idx = (sampleY * videoCanvas.width + sampleX) * 4;

    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];

    r = Math.min(255, r * currentRedLevel * currentBrightness);
    g = Math.min(255, g * currentGreenLevel * currentBrightness);
    b = Math.min(255, b * currentBlueLevel * currentBrightness);

    pixel.material.color.setRGB(r / 255, g / 255, b / 255);

    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    pixel.position.z = brightness * 5;
  });

  updateEmojis();
  previousFrame = currentFrame;
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

function setupHandTracking() {
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
  });

  hands.onResults(results => {
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      drawDebugLandmarks(landmarks);

      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];

      const greenDist = distance(thumbTip, middleTip);
      const redDist = distance(thumbTip, indexTip);
      const blueDist = distance(thumbTip, ringTip);
      const brightDist = distance(thumbTip, pinkyTip);

      // Smooth transitions
      currentGreenLevel = lerp(currentGreenLevel, mapDistanceToScale(greenDist), 0.1);
      currentRedLevel = lerp(currentRedLevel, mapDistanceToScale(redDist), 0.1);
      currentBlueLevel = lerp(currentBlueLevel, mapDistanceToScale(blueDist), 0.1);
      currentBrightness = lerp(currentBrightness, mapDistanceToScale(brightDist), 0.1);

      updateRGBPanel();

      // Detect OK gesture (thumb tip close to index tip)
      const okDist = distance(thumbTip, indexTip);
      if (okDist < 0.07) {
        spawnEmoji();
      }
    }
  });

  const mpCamera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });

  mpCamera.start();
  modelLoaded = true;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function mapDistanceToScale(d) {
  const clamped = Math.max(0.05, Math.min(0.3, d));
  return ((clamped - 0.05) / 0.25) * 1.5 + 0.5;
}

function lerp(start, end, amt) {
  return start + (end - start) * amt;
}

function drawDebugLandmarks(landmarks) {
  debugCtx.fillStyle = '#00ffcc';
  landmarks.forEach(point => {
    const x = (1 - point.x) * debugCanvas.width;
    const y = point.y * debugCanvas.height;
    debugCtx.beginPath();
    debugCtx.arc(x, y, 4, 0, 2 * Math.PI);
    debugCtx.fill();
  });
}

function spawnEmoji() {
  const emoji = document.createElement('div');
  emoji.textContent = '👌';
  emoji.style.position = 'absolute';
  emoji.style.left = `${Math.random() * window.innerWidth}px`;
  emoji.style.top = `0px`;
  emoji.style.fontSize = '32px';
  emoji.style.zIndex = 999;
  emoji.style.transition = 'top 2s ease-out';
  document.body.appendChild(emoji);

  setTimeout(() => {
    emoji.style.top = `${window.innerHeight}px`;
  }, 50);

  setTimeout(() => {
    emoji.remove();
  }, 2500);
}

function updateEmojis() {
  // Can be used for animated emoji physics later
}

function animate() {
  requestAnimationFrame(animate);
  updatePixelWall();
  controls.update();
  renderer.render(scene, camera);
}

document.addEventListener('DOMContentLoaded', init);
