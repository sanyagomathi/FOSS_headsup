"use strict";

/* =========================================================
   WORD DATA
========================================================= */

const words = [
  "Linux",
  "GitHub",
  "Python",
  "Firefox",
  "Blender",
  "Ubuntu",
  "Docker",
  "React",
  "Git",
  "VLC",
  "GIMP",
  "LibreOffice",
  "WordPress",
  "Kubernetes",
  "TensorFlow",
  "Open Source",
  "Pull Request",
  "Repository",
  "Terminal",
  "Commit",
  "JavaScript",
  "Node.js",
  "Next.js",
  "Fedora",
  "Debian",
  "Mozilla",
  "Apache",
  "MySQL",
  "PostgreSQL",
  "VS Code"
];

/* =========================================================
   DOM ELEMENTS
========================================================= */

const startScreen = document.getElementById("start-screen");
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");

const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");

const correctButton = document.getElementById("correct-button");
const passButton = document.getElementById("pass-button");

const wordElement = document.getElementById("word");
const scoreElement = document.getElementById("score");
const timerElement = document.getElementById("timer");
const finalScoreElement = document.getElementById("final-score");

const tiltStatus = document.getElementById("tilt-status");
const permissionMessage = document.getElementById(
  "permission-message"
);

const gameCard = document.getElementById("game-card");

/* =========================================================
   GAME SETTINGS
========================================================= */

const GAME_DURATION = 60;
const CALIBRATION_SECONDS = 3;

/*
  Increase these values if the game triggers too easily.
  Reduce them if tilting feels difficult.
*/
const CORRECT_THRESHOLD = 30;
const PASS_THRESHOLD = -30;

/*
  The phone must return within this distance of the original
  angle before another gesture can be detected.
*/
const RESET_THRESHOLD = 12;

/*
  Lower value:
  smoother but slightly slower.

  Higher value:
  quicker but more sensitive to shaking.
*/
const SMOOTHING_FACTOR = 0.2;

/*
  Number of consecutive sensor readings required before
  registering a gesture. This avoids accidental triggers.
*/
const REQUIRED_TRIGGER_FRAMES = 3;

/*
  Prevents another word from appearing immediately after
  a correct or pass action.
*/
const CARD_FEEDBACK_DURATION = 500;

/*
  Set this to true while testing to display the tilt angle.
*/
const SHOW_SENSOR_DEBUG = false;

/* =========================================================
   GAME STATE
========================================================= */

let shuffledWords = [];
let currentWordIndex = 0;

let score = 0;
let timeLeft = GAME_DURATION;

let gameRunning = false;
let calibrationComplete = false;
let motionEnabled = false;

let timerInterval = null;
let calibrationInterval = null;

let neutralTilt = null;
let filteredTilt = null;

/*
  Gesture states:

  ready:
  A new tilt may be registered.

  correct:
  A correct tilt was registered. The phone must return to
  neutral before another gesture can occur.

  pass:
  A pass tilt was registered. The phone must return to
  neutral before another gesture can occur.
*/
let gestureState = "ready";

let correctFrameCount = 0;
let passFrameCount = 0;

/* =========================================================
   GENERAL HELPERS
========================================================= */

function showScreen(screenToShow) {
  startScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");

  screenToShow.classList.remove("hidden");
}

function shuffleArray(array) {
  const copiedArray = [...array];

  for (let i = copiedArray.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [copiedArray[i], copiedArray[randomIndex]] = [
      copiedArray[randomIndex],
      copiedArray[i]
    ];
  }

  return copiedArray;
}

function resetFrameCounters() {
  correctFrameCount = 0;
  passFrameCount = 0;
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

/* =========================================================
   WORD MANAGEMENT
========================================================= */

function prepareWords() {
  shuffledWords = shuffleArray(words);
  currentWordIndex = 0;
}

function displayCurrentWord() {
  if (shuffledWords.length === 0) {
    prepareWords();
  }

  wordElement.textContent = shuffledWords[currentWordIndex];
}

function displayNextWord() {
  currentWordIndex++;

  if (currentWordIndex >= shuffledWords.length) {
    shuffledWords = shuffleArray(words);
    currentWordIndex = 0;
  }

  displayCurrentWord();
}

/* =========================================================
   CARD FEEDBACK
========================================================= */

function clearCardState() {
  gameCard.classList.remove(
    "correct-state",
    "pass-state"
  );
}

function showCardState(type) {
  clearCardState();

  if (type === "correct") {
    gameCard.classList.add("correct-state");
  }

  if (type === "pass") {
    gameCard.classList.add("pass-state");
  }
}

/* =========================================================
   CORRECT AND PASS ACTIONS
========================================================= */

function registerCorrect(source = "sensor") {
  if (!gameRunning || !calibrationComplete) {
    return;
  }

  /*
    Sensor gestures are locked until the phone returns
    to its neutral position.
  */
  if (source === "sensor" && gestureState !== "ready") {
    return;
  }

  if (source === "sensor") {
    gestureState = "correct";
  }

  score++;
  scoreElement.textContent = score;

  wordElement.textContent = "CORRECT!";
  tiltStatus.textContent = "Return to the starting position";

  showCardState("correct");
  vibrate(100);

  setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    clearCardState();
    displayNextWord();

    if (source === "manual") {
      gestureState = "ready";
      tiltStatus.textContent = "Ready";
    } else {
      tiltStatus.textContent = "Return phone to neutral";
    }
  }, CARD_FEEDBACK_DURATION);
}

function registerPass(source = "sensor") {
  if (!gameRunning || !calibrationComplete) {
    return;
  }

  if (source === "sensor" && gestureState !== "ready") {
    return;
  }

  if (source === "sensor") {
    gestureState = "pass";
  }

  wordElement.textContent = "PASS!";
  tiltStatus.textContent = "Return to the starting position";

  showCardState("pass");
  vibrate([60, 40, 60]);

  setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    clearCardState();
    displayNextWord();

    if (source === "manual") {
      gestureState = "ready";
      tiltStatus.textContent = "Ready";
    } else {
      tiltStatus.textContent = "Return phone to neutral";
    }
  }, CARD_FEEDBACK_DURATION);
}

/* =========================================================
   LANDSCAPE ORIENTATION DETECTION
========================================================= */

function getScreenOrientationAngle() {
  if (
    screen.orientation &&
    typeof screen.orientation.angle === "number"
  ) {
    return screen.orientation.angle;
  }

  if (typeof window.orientation === "number") {
    return window.orientation;
  }

  return 0;
}

function getLandscapeTilt(event) {
  const orientationAngle = getScreenOrientationAngle();

  /*
    Portrait mode uses beta for front/back movement.

    Landscape mode generally uses gamma because the phone's
    coordinate system rotates with the device.
  */

  if (orientationAngle === 90) {
    return -event.gamma;
  }

  if (
    orientationAngle === -90 ||
    orientationAngle === 270
  ) {
    return event.gamma;
  }

  /*
    Portrait fallback.
  */
  return event.beta;
}

/* =========================================================
   SENSOR SMOOTHING
========================================================= */

function smoothTilt(rawTilt) {
  if (filteredTilt === null) {
    filteredTilt = rawTilt;
    return filteredTilt;
  }

  filteredTilt =
    filteredTilt +
    SMOOTHING_FACTOR * (rawTilt - filteredTilt);

  return filteredTilt;
}

/* =========================================================
   MOTION HANDLER
========================================================= */

function handleOrientation(event) {
  if (!gameRunning || !motionEnabled) {
    return;
  }

  const rawTilt = getLandscapeTilt(event);

  if (
    rawTilt === null ||
    rawTilt === undefined ||
    Number.isNaN(rawTilt)
  ) {
    return;
  }

  const smoothedTilt = smoothTilt(rawTilt);

  /*
    During calibration, continuously update the neutral angle.
    The final reading becomes the player's natural holding
    position.
  */
  if (!calibrationComplete) {
    neutralTilt = smoothedTilt;
    return;
  }

  if (neutralTilt === null) {
    neutralTilt = smoothedTilt;
    return;
  }

  const relativeTilt = smoothedTilt - neutralTilt;

  if (SHOW_SENSOR_DEBUG) {
    tiltStatus.textContent =
      `Tilt: ${relativeTilt.toFixed(1)}°`;
  }

  /*
    Wait for the phone to return close to neutral before
    enabling the next gesture.
  */
  if (gestureState !== "ready") {
    resetFrameCounters();

    if (Math.abs(relativeTilt) <= RESET_THRESHOLD) {
      gestureState = "ready";

      if (!SHOW_SENSOR_DEBUG) {
        tiltStatus.textContent = "Ready";
      }
    }

    return;
  }

  /*
    Detect correct tilt.
  */
  if (relativeTilt >= CORRECT_THRESHOLD) {
    correctFrameCount++;
    passFrameCount = 0;

    if (correctFrameCount >= REQUIRED_TRIGGER_FRAMES) {
      resetFrameCounters();
      registerCorrect("sensor");
    }

    return;
  }

  /*
    Detect pass tilt.
  */
  if (relativeTilt <= PASS_THRESHOLD) {
    passFrameCount++;
    correctFrameCount = 0;

    if (passFrameCount >= REQUIRED_TRIGGER_FRAMES) {
      resetFrameCounters();
      registerPass("sensor");
    }

    return;
  }

  /*
    The player is inside the neutral area.
  */
  resetFrameCounters();

  if (!SHOW_SENSOR_DEBUG) {
    tiltStatus.textContent = "Ready";
  }
}

/* =========================================================
   MOTION PERMISSION
========================================================= */

async function requestMotionPermission() {
  if (!window.DeviceOrientationEvent) {
    throw new Error(
      "Motion sensors are not supported by this browser."
    );
  }

  /*
    iPhone and iPad require permission from a user-triggered
    action such as pressing the Start button.
  */
  if (
    typeof DeviceOrientationEvent.requestPermission ===
    "function"
  ) {
    const permission =
      await DeviceOrientationEvent.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Motion permission was denied. Please allow Motion & Orientation Access in your browser settings."
      );
    }
  }

  if (!motionEnabled) {
    window.addEventListener(
      "deviceorientation",
      handleOrientation,
      true
    );

    motionEnabled = true;
  }
}

/* =========================================================
   FULLSCREEN AND LANDSCAPE MODE
========================================================= */

async function enterGameMode() {
  /*
    Fullscreen and orientation locking are not available on
    every browser. Failure should not stop the game.
  */

  try {
    if (
      document.documentElement.requestFullscreen &&
      !document.fullscreenElement
    ) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    console.log("Fullscreen mode is unavailable.");
  }

  try {
    if (
      screen.orientation &&
      typeof screen.orientation.lock === "function"
    ) {
      await screen.orientation.lock("landscape");
    }
  } catch (error) {
    console.log("Landscape lock is unavailable.");
  }
}

/* =========================================================
   CALIBRATION
========================================================= */

function startCalibration() {
  clearInterval(calibrationInterval);

  calibrationComplete = false;
  neutralTilt = null;
  filteredTilt = null;

  gestureState = "ready";
  resetFrameCounters();

  let countdown = CALIBRATION_SECONDS;

  wordElement.textContent = countdown;
  tiltStatus.textContent =
    "Place the phone horizontally on your forehead";

  calibrationInterval = setInterval(() => {
    countdown--;

    if (countdown > 0) {
      wordElement.textContent = countdown;
      return;
    }

    clearInterval(calibrationInterval);
    calibrationInterval = null;

    /*
      If readings have been received, neutralTilt already
      contains the player's current forehead position.
    */
    if (filteredTilt !== null) {
      neutralTilt = filteredTilt;
    }

    calibrationComplete = true;
    gestureState = "ready";

    displayCurrentWord();
    tiltStatus.textContent = "Ready";

    beginTimer();
  }, 1000);
}

/* =========================================================
   TIMER
========================================================= */

function beginTimer() {
  clearInterval(timerInterval);

  timerElement.textContent = timeLeft;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerElement.textContent = timeLeft;

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

/* =========================================================
   START AND END GAME
========================================================= */

async function startGame() {
  permissionMessage.textContent = "";
  startButton.disabled = true;

  try {
    /*
      Motion permission must remain directly connected to the
      button press, especially on iOS.
    */
    await requestMotionPermission();

    await enterGameMode();

    clearInterval(timerInterval);
    clearInterval(calibrationInterval);

    score = 0;
    timeLeft = GAME_DURATION;

    gameRunning = true;
    calibrationComplete = false;

    neutralTilt = null;
    filteredTilt = null;

    gestureState = "ready";
    resetFrameCounters();

    scoreElement.textContent = score;
    timerElement.textContent = timeLeft;

    clearCardState();
    prepareWords();

    showScreen(gameScreen);
    startCalibration();
  } catch (error) {
    console.error(error);

    permissionMessage.textContent =
      error.message ||
      "Unable to access the phone's motion sensor.";
  } finally {
    startButton.disabled = false;
  }
}

function endGame() {
  gameRunning = false;
  calibrationComplete = false;

  clearInterval(timerInterval);
  clearInterval(calibrationInterval);

  timerInterval = null;
  calibrationInterval = null;

  clearCardState();
  resetFrameCounters();

  finalScoreElement.textContent = score;

  showScreen(resultScreen);

  vibrate([100, 60, 100]);
}

async function restartGame() {
  await startGame();
}

/* =========================================================
   MANUAL CONTROLS
========================================================= */

function handleManualCorrect() {
  if (gestureState !== "ready") {
    return;
  }

  gestureState = "manual";
  registerCorrect("manual");
}

function handleManualPass() {
  if (gestureState !== "ready") {
    return;
  }

  gestureState = "manual";
  registerPass("manual");
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", restartGame);

correctButton.addEventListener(
  "click",
  handleManualCorrect
);

passButton.addEventListener(
  "click",
  handleManualPass
);

/*
  Recalibrate when the phone changes orientation during
  an active game.
*/
window.addEventListener("orientationchange", () => {
  if (!gameRunning) {
    return;
  }

  filteredTilt = null;
  neutralTilt = null;
  gestureState = "ready";

  resetFrameCounters();

  tiltStatus.textContent =
    "Hold steady while the phone recalibrates";

  setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    if (filteredTilt !== null) {
      neutralTilt = filteredTilt;
    }

    tiltStatus.textContent = "Ready";
  }, 1000);
});

/* =========================================================
   INITIAL SCREEN
========================================================= */

showScreen(startScreen);