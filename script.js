// Main Three.js scene objects and pixel wall state
let scene, camera, renderer, controls;
let pixelBlocks = [];
let video, videoCanvas, videoCtx;
let debugCanvas, debugCtx, rgbPanel, modeLabel;
let pixelSize = 20;      // default pixel density
let blockScale = 0.9;    // default pixel block size
let previousFrame = null;

// Default hand tracking and color control state
let hands, modelLoaded = false;
let currentGreenLevel = 1.0;
let currentRedLevel = 1.0;
let currentBlueLevel = 1.0;
let currentBrightness = 1.0;

let currentMode = 'rgb'; // 'rgb' for color and brightness control, 'emoji' for emoji drop
const emojisToFall = [];

// Initializes the scene, video elements, and event listeners
function init() {
  setupScene();             // Sets up Three.js scene, camera, lights
  setupVideoElements();     // Prepares video and debug canvases
  setupEventListeners();    // UI and keyboard listeners
  createPixelGrid();        // Builds the pixel wall mesh grid
  animate();                // Starts render loop
  setupHandTracking();      // Initializes MediaPipe Hands
  createEmojiDisplay();     // Adds emoji animation CSS
  createRGBPanel();         // Shows RGB values panel
  createModeLabel();        // Shows current mode label
}

// Sets up Three.js scene, camera, renderer, and lights
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

  // Lighting for pixel blocks
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 3);
  scene.add(ambientLight);
  scene.add(directionalLight);
}

// Prepares video and debug canvases for camera feed and hand landmarks
function setupVideoElements() {
  video = document.getElementById('camera-video');
  videoCanvas = document.createElement('canvas');
  videoCtx = videoCanvas.getContext('2d');

  // Debug canvas for hand landmarks visualization
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
}

// Creates floating RGB value panel
function createRGBPanel() {
  rgbPanel = document.createElement('div');
  rgbPanel.id = 'rgb-values';
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

// Shows current mode (RGB or Emoji)
function createModeLabel() {
  modeLabel = document.createElement('div');
  modeLabel.style.position = 'absolute';
  modeLabel.style.top = '285px';
  modeLabel.style.right = '20px';
  modeLabel.style.padding = '8px 12px';
  modeLabel.style.background = 'rgba(0, 0, 0, 0.6)';
  modeLabel.style.borderRadius = '8px';
  modeLabel.style.color = '#fff';
  modeLabel.style.fontFamily = 'monospace';
  modeLabel.style.fontSize = '14px';
  modeLabel.style.zIndex = 62;
  document.body.appendChild(modeLabel);
  updateModeLabel();
}

function updateModeLabel() {
  modeLabel.textContent = `Mode: ${currentMode.toUpperCase()}`;
}

// Builds the pixel wall mesh grid based on current density and size
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

      // Center the grid and set scale
      pixel.position.set(x - gridWidth / 2, -(y - gridHeight / 2), 0);
      pixel.scale.set(blockScale, blockScale, 0.1);
      pixel.userData = { gridX: x, gridY: y };

      scene.add(pixel);
      pixelBlocks.push(pixel);
    }
  }
}

// Updates pixel wall colors and depth from camera feed and RGB levels
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
    // Sample color from camera feed for each pixel block
    const sampleX = Math.min(videoCanvas.width - 1 - (gridX * stepX), videoCanvas.width - 1);
    const sampleY = Math.min(gridY * stepY, videoCanvas.height - 1);
    const idx = (sampleY * videoCanvas.width + sampleX) * 4;

    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];

    // Apply RGB and brightness levels from hand gestures
    r = Math.min(255, r * currentRedLevel * currentBrightness);
    g = Math.min(255, g * currentGreenLevel * currentBrightness);
    b = Math.min(255, b * currentBlueLevel * currentBrightness);

    pixel.material.color.setRGB(r / 255, g / 255, b / 255);
    // Set Z position for depth effect based on brightness
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    pixel.position.z = brightness * 5;
  });

  previousFrame = currentFrame;
}

// Handles UI controls
function setupEventListeners() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    createPixelGrid();
  });

  // Pixel density slider
  document.getElementById('density').addEventListener('input', (e) => {
    pixelSize = parseInt(e.target.value);
    document.getElementById('density-value').textContent = pixelSize;
    createPixelGrid();
  });

  // Pixel size slider
  document.getElementById('size').addEventListener('input', (e) => {
    blockScale = parseFloat(e.target.value);
    document.getElementById('size-value').textContent = blockScale.toFixed(1);
    pixelBlocks.forEach(pixel => pixel.scale.set(blockScale, blockScale, 0.1));
  });

  // Keyboard shortcuts for mode switching and RGB reset
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
      currentMode = currentMode === 'rgb' ? 'emoji' : 'rgb';
      updateModeLabel();
    }
    if (e.key.toLowerCase() === 'r') {
      currentRedLevel = 1.0;
      currentGreenLevel = 1.0;
      currentBlueLevel = 1.0;
      currentBrightness = 1.0;
      currentMode = 'rgb';
      updateRGBPanel();
      updateModeLabel();
    }
  });
}

// Initializes MediaPipe Hands and sets up gesture detection
function setupHandTracking() {
  hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

  hands.onResults(results => {
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    if (results.multiHandLandmarks?.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      drawDebugLandmarks(landmarks);

      // Emoji mode: drop emoji for specific gestures
      if (currentMode === 'emoji') {
        if (isOkGesture(landmarks)) dropEmoji('👌');
        if (isPeaceGesture(landmarks)) dropEmoji('✌️');
        if (isThumbsUpGesture(landmarks)) dropEmoji('👍');
      } else {
        // RGB mode: control color channels and brightness with hand
        updateRGBFromHand(landmarks);
      }
    }
  });

  // Start camera feed for hand tracking
  const mpCamera = new Camera(video, {
    onFrame: async () => await hands.send({ image: video }),
    width: 640, height: 480
  });
  mpCamera.start();
  modelLoaded = true;
}

// Drops an emoji from the top of the screen with animation
function dropEmoji(char) {
  const span = document.createElement('span');
  span.textContent = char;
  span.style.position = 'absolute';
  span.style.left = Math.random() * window.innerWidth + 'px';
  span.style.top = '-40px';
  span.style.fontSize = '32px';
  span.style.zIndex = 1000;
  span.style.animation = 'fall 2s linear forwards';
  document.body.appendChild(span);
  setTimeout(() => span.remove(), 2000);
}

// Adds CSS for emoji falling animation
function createEmojiDisplay() {
  const style = document.createElement('style');
  style.innerHTML = `@keyframes fall { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(100vh); opacity: 0; } }`;
  document.head.appendChild(style);
}

// Draws hand landmarks on debug canvas
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

// Utility: Euclidean distance between two hand landmarks
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Utility: Maps hand distance to RGB/brightness scale
function mapDistanceToScale(d) {
  return Math.min(2, Math.max(0.5, d * 5));
}

// Utility: Linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Updates RGB and brightness levels from hand gesture distances
function updateRGBFromHand(lm) {
  const green = dist(lm[4], lm[12]); // Thumb to middle
  const red = dist(lm[4], lm[8]); // Thumb to index
  const blue = dist(lm[4], lm[16]); // Thumb to ring
  const bright = dist(lm[4], lm[20]); // Thumb to pinky

  // Smoothly interpolate to new values
  currentGreenLevel = lerp(currentGreenLevel, mapDistanceToScale(green), 0.1);
  currentRedLevel = lerp(currentRedLevel, mapDistanceToScale(red), 0.1);
  currentBlueLevel = lerp(currentBlueLevel, mapDistanceToScale(blue), 0.1);
  currentBrightness = lerp(currentBrightness, mapDistanceToScale(bright), 0.1);

  updateRGBPanel();
}

// Updates RGB panel display
function updateRGBPanel() {
  const panel = document.getElementById('rgb-values');
  if (panel) {
    panel.innerHTML = `R: ${currentRedLevel.toFixed(2)}<br>G: ${currentGreenLevel.toFixed(2)}<br>B: ${currentBlueLevel.toFixed(2)}<br>Brightness: ${currentBrightness.toFixed(2)}`;
  }
}

// Gesture detection: OK sign
function isOkGesture(lm) {
  return dist(lm[4], lm[8]) < 0.07 && dist(lm[4], lm[12]) > 0.3 && dist(lm[4], lm[16]) > 0.3 && dist(lm[4], lm[20]) > 0.3;
}

// Gesture detection: Peace sign
function isPeaceGesture(lm) {
  return dist(lm[8], lm[4]) > 0.3 && dist(lm[12], lm[4]) > 0.3 && dist(lm[16], lm[4]) < 0.15 && dist(lm[20], lm[4]) < 0.15;
}

// Gesture detection: Thumbs up
function isThumbsUpGesture(lm) {
  const thumbUp = lm[4].y < lm[0].y;
  const fingersFolded =
    dist(lm[8], lm[0]) < 0.2 &&
    dist(lm[12], lm[0]) < 0.2 &&
    dist(lm[16], lm[0]) < 0.2 &&
    dist(lm[20], lm[0]) < 0.2;

  return thumbUp && fingersFolded;
}

// Main animation/render loop
function animate() {
  requestAnimationFrame(animate);
  updatePixelWall();
  controls.update();
  renderer.render(scene, camera);
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
