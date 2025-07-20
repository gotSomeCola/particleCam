// Three.js scene objects and pixel wall state
let scene, camera, renderer, controls; // Main 3D scene, camera, renderer, and orbit controls
let pixelBlocks = [];                  // Array holding all pixel block meshes
let video, videoCanvas, videoCtx;      // Video element and canvas for webcam frame processing
let debugCanvas, debugCtx, rgbPanel, modeLabel; // UI elements for debug and controls
let pixelSize = 20;      // Default pixel density (controls grid resolution)
let blockScale = 0.9;    // Default pixel block size (controls block size)
let previousFrame = null;// Stores previous video frame for future use

// Hand tracking and color control state
let hands, modelLoaded = false;        // MediaPipe Hands instance and model loaded flag
let currentGreenLevel = 1.0;           // Default green channel multiplier
let currentRedLevel = 1.0;             // Default red channel multiplier
let currentBlueLevel = 1.0;            // Default blue channel multiplier
let currentBrightness = 1.0;           // Default brightness multiplier

let currentMode = 'emoji';               // Default mode: 'emoji' for emoji drop, 'rgb' for color/brightness control
const emojisToFall = [];               // Array for managing falling emojis

// --- INITIALIZATION ---

// Entry point: initializes scene, video, UI, hand tracking, and starts animation loop
function init() {
  setupScene();             // Set up Three.js scene, camera, renderer, lighting
  setupVideoElements();     // Prepare video and debug canvases for webcam and hand landmarks
  setupEventListeners();    // Set up UI controls and keyboard shortcuts
  createPixelGrid();        // Build the pixel wall mesh grid
  animate();                // Start the render loop
  setupHandTracking();      // Initialize MediaPipe Hands for gesture detection
  createEmojiDisplay();     // Add CSS for emoji falling animation
  createRGBPanel();         // Create floating panel to show RGB values
  createModeLabel();        // Create floating label to show current mode
}

// --- THREE.JS SCENE SETUP ---

// Sets up Three.js scene, camera, renderer, and lighting
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x001122); // Dark blue background

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 25); // Camera positioned to view the pixel wall

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // Smooth camera movement

  // Lighting setup for pixel blocks
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 3);
  scene.add(ambientLight);
  scene.add(directionalLight);
}

// --- VIDEO & DEBUG CANVAS SETUP ---

// Prepares video and debug canvases for camera feed and hand landmarks visualization
function setupVideoElements() {
  video = document.getElementById('camera-video'); // Webcam video element
  videoCanvas = document.createElement('canvas');  // Offscreen canvas for frame processing
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
  updateRGBPanel(); // Initialize with current values
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
  updateModeLabel(); // Initialize with current mode
}

// Updates the mode label text
function updateModeLabel() {
  modeLabel.textContent = `Mode: ${currentMode.toUpperCase()}`;
}

// --- PIXEL WALL GRID ---

// Builds the pixel wall mesh grid based on current density and size
function createPixelGrid() {
  // Remove old pixel blocks from scene
  pixelBlocks.forEach(p => scene.remove(p));
  pixelBlocks = [];

  // Calculate grid size based on window and pixelSize
  const gridWidth = Math.floor(window.innerWidth / pixelSize);
  const gridHeight = Math.floor(window.innerHeight / pixelSize);

  const geometry = new THREE.BoxGeometry(1, 1, 1);

  // Create pixel blocks and add to scene
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const material = new THREE.MeshPhongMaterial({ color: 0x000000 });
      const pixel = new THREE.Mesh(geometry, material);

      // Center the grid and set scale
      pixel.position.set(x - gridWidth / 2, -(y - gridHeight / 2), 0);
      pixel.scale.set(blockScale, blockScale, 0.1);
      pixel.userData = { gridX: x, gridY: y }; // Store grid position for sampling

      scene.add(pixel);
      pixelBlocks.push(pixel);
    }
  }
}

// Updates pixel wall colors and depth from camera feed and RGB/brightness levels
function updatePixelWall() {
  if (!video.videoWidth) return; // Skip if video not ready

  // Resize canvas to match video
  videoCanvas.width = video.videoWidth;
  videoCanvas.height = video.videoHeight;
  videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);

  // Get current frame pixel data
  const currentFrame = videoCtx.getImageData(0, 0, videoCanvas.width, videoCanvas.height);
  const stepX = Math.floor(videoCanvas.width / (window.innerWidth / pixelSize));
  const stepY = Math.floor(videoCanvas.height / (window.innerHeight / pixelSize));
  const data = currentFrame.data;

  // For each pixel block, sample color from camera feed and apply RGB/brightness
  pixelBlocks.forEach(pixel => {
    const { gridX, gridY } = pixel.userData;
    // Sample color from corresponding camera pixel
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

    // Set pixel block color
    pixel.material.color.setRGB(r / 255, g / 255, b / 255);

    // Set Z position for depth effect based on brightness
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    pixel.position.z = brightness * 5;
  });

  previousFrame = currentFrame; // Store frame for future use
}

// --- UI EVENT LISTENERS ---

// Handles UI controls and keyboard shortcuts
function setupEventListeners() {
  // Window resize: update camera and renderer, rebuild pixel grid
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    createPixelGrid();
  });

  // Pixel density slider: changes pixelSize and rebuilds grid
  document.getElementById('density').addEventListener('input', (e) => {
    pixelSize = parseInt(e.target.value);
    document.getElementById('density-value').textContent = pixelSize;
    createPixelGrid();
  });

  // Pixel size slider: changes blockScale and updates all pixel blocks
  document.getElementById('size').addEventListener('input', (e) => {
    blockScale = parseFloat(e.target.value);
    document.getElementById('size-value').textContent = blockScale.toFixed(1);
    pixelBlocks.forEach(pixel => pixel.scale.set(blockScale, blockScale, 0.1));
  });

  // Keyboard shortcuts:
  // 'm' key: toggle between RGB and Emoji mode
  // 'r' key: reset RGB and brightness to defaults and switch to RGB mode
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
      currentMode = 'emoji';
      updateRGBPanel();
      updateModeLabel();
    }
  });
}

// --- HAND TRACKING & GESTURE DETECTION ---

// Initializes MediaPipe Hands and sets up gesture detection
function setupHandTracking() {
  // Create MediaPipe Hands instance and set options
  hands = new Hands({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });

  // Callback for each frame with hand landmarks
  hands.onResults(results => {
    debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height); // Clear debug canvas
    if (results.multiHandLandmarks?.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      drawDebugLandmarks(landmarks); // Draw hand landmarks for feedback on camera

      // If in emoji mode, check for gestures and drop corresponding emoji
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

// --- EMOJI DROP ANIMATION ---

// Drops an emoji from the top of the screen with animation
function dropEmoji(char) {
  const span = document.createElement('span');
  span.textContent = char;
  span.style.position = 'absolute';
  span.style.left = Math.random() * window.innerWidth + 'px'; // Random horizontal position
  span.style.top = '-40px'; // Start above the screen
  span.style.fontSize = '32px';
  span.style.zIndex = 1000;
  span.style.animation = 'fall 2s linear forwards'; // Use CSS animation
  document.body.appendChild(span);
  setTimeout(() => span.remove(), 2000); // Remove after animation
}

// Adds CSS for emoji falling animation
function createEmojiDisplay() {
  const style = document.createElement('style');
  style.innerHTML = `@keyframes fall { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(100vh); opacity: 0; } }`;
  document.head.appendChild(style);
}

// --- HAND LANDMARKS VISUALIZATION ---

// Draws hand landmarks on debug canvas for visual feedback
function drawDebugLandmarks(landmarks) {
  debugCtx.fillStyle = '#00ffcc';
  landmarks.forEach(point => {
    // x is mirrored for camera view
    const x = (1 - point.x) * debugCanvas.width;
    const y = point.y * debugCanvas.height;
    debugCtx.beginPath();
    debugCtx.arc(x, y, 4, 0, 2 * Math.PI);
    debugCtx.fill();
  });
}

// --- UTILITY FUNCTIONS ---

// Calculates Euclidean distance between two hand landmarks
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Maps hand landmark distance to a scale value for RGB/brightness control
// Ensures the value stays within [0.5, 2] for smooth UI response
function mapDistanceToScale(d) {
  return Math.min(2, Math.max(0.5, d * 5));
}

// Linear interpolation between two values a and b by t
// Used for smoothing and slower transitions of RGB and brightness values
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// --- RGB CONTROL FROM HAND GESTURES ---

// Updates the RGB and brightness levels based on hand gesture distances
// Each finger's distance to the thumb controls a color channel or brightness
// Uses lerp for smooth transitions and calls updateRGBPanel to refresh UI
function updateRGBFromHand(lm) {
  // Thumb to middle finger controls green
  const green = dist(lm[4], lm[12]);
  // Thumb to index finger controls red
  const red = dist(lm[4], lm[8]);
  // Thumb to ring finger controls blue
  const blue = dist(lm[4], lm[16]);
  // Thumb to pinky controls brightness
  const bright = dist(lm[4], lm[20]);

  // Smoothly interpolate to new values
  currentGreenLevel = lerp(currentGreenLevel, mapDistanceToScale(green), 0.1);
  currentRedLevel = lerp(currentRedLevel, mapDistanceToScale(red), 0.1);
  currentBlueLevel = lerp(currentBlueLevel, mapDistanceToScale(blue), 0.1);
  currentBrightness = lerp(currentBrightness, mapDistanceToScale(bright), 0.1);

  // Update the RGB panel display with new values
  updateRGBPanel();
}

// Updates the floating RGB panel in the UI to show current values
// Displays red, green, blue, and brightness
function updateRGBPanel() {
  const panel = document.getElementById('rgb-values');
  if (panel) {
    panel.innerHTML =
      `R: ${currentRedLevel.toFixed(2)}<br>` +
      `G: ${currentGreenLevel.toFixed(2)}<br>` +
      `B: ${currentBlueLevel.toFixed(2)}<br>` +
      `Brightness: ${currentBrightness.toFixed(2)}`;
  }
}

// --- HAND GESTURE DETECTION ---

// Gesture detection: OK sign 
function isOkGesture(lm) {
  return dist(lm[4], lm[8]) < 0.07 && dist(lm[4], lm[12]) > 0.3 && dist(lm[4], lm[16]) > 0.3 && dist(lm[4], lm[20]) > 0.3;
}

// Gesture detection
function isPeaceGesture(lm) {
  return dist(lm[8], lm[4]) > 0.3 && dist(lm[12], lm[4]) > 0.3 && dist(lm[16], lm[4]) < 0.15 && dist(lm[20], lm[4]) < 0.15;
}

// Gesture detection
function isThumbsUpGesture(lm) {
  const thumbUp = lm[4].y < lm[0].y;
  const fingersFolded =
    dist(lm[8], lm[0]) < 0.2 &&
    dist(lm[12], lm[0]) < 0.2 &&
    dist(lm[16], lm[0]) < 0.2 &&
    dist(lm[20], lm[0]) < 0.2;

  return thumbUp && fingersFolded;
}

// --- MAIN ANIMATION LOOP ---

// Main animation/render loop: updates pixel wall and renders scene
function animate() {
  requestAnimationFrame(animate); // Schedule next frame
  updatePixelWall();              // Update pixel wall colors and depth
  controls.update();              // Update camera controls
  renderer.render(scene, camera); // Render the scene
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
