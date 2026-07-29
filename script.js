"use strict";

/* =========================================================
   WORD LIST
========================================================= */

const words = [
  "Linux",
  "GitHub",
  "Docker",
  "Python",
  "React",
  "Firefox",
  "Ubuntu",
  "Git",
  "VLC",
  "Blender",
  "GIMP",
  "LibreOffice",
  "Kubernetes",
  "TensorFlow",
  "Open Source",
  "Repository",
  "Pull Request",
  "Commit",
  "Terminal",
  "JavaScript",
  "Node.js",
  "Next.js",
  "Fedora",
  "Debian",
  "Mozilla",
  "Apache",
  "MySQL",
  "PostgreSQL",
  "VS Code",
  "FreeCodeCamp",
  "Bug",
  "Debugging",
  "Hacking",
  "Coding",
  "Program",
  "Software",
  "Hardware",
  "Website",
  "Webpage",
  "Browser",
  "Server",
  "Database",
  "Frontend",
  "Backend",
  "Full Stack",
  "API",
  "HTML",
  "CSS",
  "Variable",
  "Function",
  "Loop",
  "Array",
  "String",
  "Integer",
  "Boolean",
  "Condition",
  "Error",
  "Syntax",
  "Algorithm",
  "Code Editor",
  "Compiler",
  "Username",
  "Password",
  "Login",
  "Cloud",
  "Network",
  "Wi-Fi",
  "IP Address",
  "Download",
  "Upload",
  "File",
  "Folder",
  "Link",
  "URL",
  "Copy",
  "Paste",
  "Save",
  "Delete",
  "Refresh",
  "Search",
  "Install",
  "Update",
  "Keyboard",
  "Mouse",
  "Kernel",
  "Firewall",
  "Cookies",
  "Malware",
  "Virus",
  "Restart",
  "Copy & Paste",
  "Fork",
  "Pull Command",
  "Crash"
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
   SETTINGS
========================================================= */

const GAME_DURATION = 60;

const INITIAL_CALIBRATION_SECONDS = 3;

/*
  Tilt limits.

  Increase these values if accidental guesses happen.
  Reduce these values if tilting feels too difficult.
*/
const CORRECT_THRESHOLD = 30;
const PASS_THRESHOLD = -30;

/*
  Number of consecutive readings required before a gesture
  is accepted.
*/
const REQUIRED_TRIGGER_FRAMES = 8;

/*
  Smooths small sensor movements.

  Lower value = smoother but slower.
  Higher value = faster but more sensitive.
*/
const SMOOTHING_FACTOR = 0.2;

/*
  Time to show Correct or Pass feedback.
*/
const FEEDBACK_DURATION = 500;

/*
  Set true while testing to display sensor values.
*/
const SHOW_SENSOR_DEBUG = false;

/*
  Change this to true if Correct and Pass are reversed
  on your phone.
*/
const REVERSE_TILT_DIRECTION = true;

/* =========================================================
   GAME STATE
========================================================= */

let shuffledWords = [];
let currentWordIndex = 0;

let score = 0;
let timeLeft = GAME_DURATION;

let gameRunning = false;
let motionEnabled = false;

const RETURN_TO_NEUTRAL_THRESHOLD = 12;
let timerInterval = null;
let calibrationInterval = null;
let feedbackTimeout = null;

let initialCalibrationComplete = false;
let gestureLocked = false;
let waitingForNeutral = false;

let neutralTilt = null;
let filteredTilt = null;

let correctFrameCount = 0;
let passFrameCount = 0;

/* =========================================================
   SCREEN HELPERS
========================================================= */

function showScreen(screen) {
  if (startScreen) {
    startScreen.classList.add("hidden");
  }

  if (gameScreen) {
    gameScreen.classList.add("hidden");
  }

  if (resultScreen) {
    resultScreen.classList.add("hidden");
  }

  screen.classList.remove("hidden");
}

function setStatus(message) {
  if (tiltStatus) {
    tiltStatus.textContent = message;
  }
}

function setPermissionMessage(message) {
  if (permissionMessage) {
    permissionMessage.textContent = message;
  }
}

/* =========================================================
   WORD FUNCTIONS
========================================================= */

function shuffleArray(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1)
    );

    [shuffled[i], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[i]
    ];
  }

  return shuffled;
}

function prepareWords() {
  shuffledWords = shuffleArray(words);
  currentWordIndex = 0;
}

function displayCurrentWord() {
  if (shuffledWords.length === 0) {
    prepareWords();
  }

  wordElement.textContent =
    shuffledWords[currentWordIndex];
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
  if (!gameCard) {
    return;
  }

  gameCard.classList.remove(
    "correct-state",
    "pass-state"
  );
}

function showCardState(type) {
  clearCardState();

  if (!gameCard) {
    return;
  }

  if (type === "correct") {
    gameCard.classList.add("correct-state");
  }

  if (type === "pass") {
    gameCard.classList.add("pass-state");
  }
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

/* =========================================================
   SENSOR HELPERS
========================================================= */


function getTiltValue(event) {
  if (
    event.gamma === null ||
    event.gamma === undefined ||
    Number.isNaN(event.gamma)
  ) {
    return null;
  }

  let tilt = event.gamma;

  if (REVERSE_TILT_DIRECTION) {
    tilt = -tilt;
  }

  return tilt;
}

let currentLandscapeSide = 1;
let lastOrientationAngle = 0;

function normalizeAngleDifference(current, previous) {
  let difference = current - previous;

  while (difference > 90) {
    difference -= 180;
  }

  while (difference < -90) {
    difference += 180;
  }

  return previous + difference;
}

function smoothTilt(rawTilt) {
  if (filteredTilt === null) {
    filteredTilt = rawTilt;
    return filteredTilt;
  }

  const normalizedTilt =
    normalizeAngleDifference(rawTilt, filteredTilt);

  filteredTilt =
    filteredTilt +
    SMOOTHING_FACTOR *
      (normalizedTilt - filteredTilt);

  return filteredTilt;
}

function resetTriggerCounters() {
  correctFrameCount = 0;
  passFrameCount = 0;
}

/* =========================================================
   MOTION PERMISSION
========================================================= */

async function requestMotionPermission() {
  if (!window.DeviceOrientationEvent) {
    throw new Error(
      "Device orientation is not supported on this phone."
    );
  }

  if (
    typeof DeviceOrientationEvent.requestPermission ===
    "function"
  ) {
    const permission =
      await DeviceOrientationEvent.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Motion access was denied. Enable Motion & Orientation Access in Safari settings."
      );
    }
  }

  window.removeEventListener(
    "deviceorientation",
    handleOrientation,
    true
  );

  window.addEventListener(
    "deviceorientation",
    handleOrientation,
    true
  );

  motionEnabled = true;
}

/* =========================================================
   FULLSCREEN AND LANDSCAPE
========================================================= */

async function enterGameMode() {
  try {
    if (
      document.documentElement.requestFullscreen &&
      !document.fullscreenElement
    ) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    console.log("Fullscreen is unavailable.");
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
   INITIAL CALIBRATION
========================================================= */

function startInitialCalibration() {
  clearInterval(calibrationInterval);

initialCalibrationComplete = false;
gestureLocked = true;
waitingForNeutral = false;

  neutralTilt = null;
  filteredTilt = null;

  resetTriggerCounters();

  let countdown = INITIAL_CALIBRATION_SECONDS;

  wordElement.textContent = countdown;

  setStatus(
    "Hold the phone comfortably on your forehead"
  );

  calibrationInterval = setInterval(() => {
    countdown--;

    if (countdown > 0) {
      wordElement.textContent = countdown;
      return;
    }

    clearInterval(calibrationInterval);
    calibrationInterval = null;

    if (filteredTilt !== null) {
      neutralTilt = filteredTilt;
    }

    initialCalibrationComplete = true;
    gestureLocked = false;

    resetTriggerCounters();

    displayCurrentWord();
    setStatus("Ready");

    startTimer();
  }, 1000);
}


/* =========================================================
   SENSOR HANDLER
========================================================= */
function handleOrientation(event) {
  if (!gameRunning || !motionEnabled) {
    return;
  }

  const rawTilt = getTiltValue(event);
  function smoothTilt(rawTilt) {
    if (filteredTilt === null) {
      filteredTilt = rawTilt;
      return filteredTilt;
    }

  const normalizedTilt =
    normalizeAngleDifference(rawTilt, filteredTilt);

  filteredTilt =
    filteredTilt +
    SMOOTHING_FACTOR *
      (normalizedTilt - filteredTilt);

  return filteredTilt;
}
  if (rawTilt === null) {
    setStatus("No sensor data received");
    return;
  }

  const currentTilt = smoothTilt(rawTilt);

  /*
    During the starting countdown, continuously record the
    player's resting position.
  */
  if (!initialCalibrationComplete) {
    neutralTilt = currentTilt;

    if (SHOW_SENSOR_DEBUG) {
      setStatus(
        `Calibrating | gamma: ${event.gamma.toFixed(1)}°`
      );
    }

    return;
  }

  if (neutralTilt === null) {
    return;
  }

  const relativeTilt = currentTilt - neutralTilt;

  /*
    After an answer, do not allow another gesture until the
    phone returns close to its original position.
  */
  if (waitingForNeutral) {
    if (
      Math.abs(relativeTilt) <=
      RETURN_TO_NEUTRAL_THRESHOLD
    ) {
      waitingForNeutral = false;
      gestureLocked = false;
      resetTriggerCounters();
      setStatus("Ready");
    } else if (SHOW_SENSOR_DEBUG) {
      setStatus(
        `Return to centre | tilt: ${relativeTilt.toFixed(1)}°`
      );
    }

    return;
  }

  if (gestureLocked) {
    return;
  }

  if (SHOW_SENSOR_DEBUG) {
    setStatus(
      `gamma: ${event.gamma.toFixed(1)}° | ` +
      `tilt: ${relativeTilt.toFixed(1)}°`
    );
  }

  if (relativeTilt >= CORRECT_THRESHOLD) {
    correctFrameCount++;
    passFrameCount = 0;

    if (
      correctFrameCount >= REQUIRED_TRIGGER_FRAMES
    ) {
      resetTriggerCounters();
      registerCorrect("sensor");
    }

    return;
  }

  if (relativeTilt <= PASS_THRESHOLD) {
    passFrameCount++;
    correctFrameCount = 0;

    if (
      passFrameCount >= REQUIRED_TRIGGER_FRAMES
    ) {
      resetTriggerCounters();
      registerPass("sensor");
    }

    return;
  }

  resetTriggerCounters();

  if (!SHOW_SENSOR_DEBUG) {
    setStatus("Ready");
  }
}
/* =========================================================
   CORRECT AND PASS
========================================================= */
function registerCorrect(source = "sensor") {
  if (
    !gameRunning ||
    !initialCalibrationComplete ||
    gestureLocked
  ) {
    return;
  }

  gestureLocked = true;
  resetTriggerCounters();

  score++;
  scoreElement.textContent = score;

  wordElement.textContent = "CORRECT!";
  setStatus("Correct!");

  showCardState("correct");
  vibrate(200);

  clearTimeout(feedbackTimeout);

  feedbackTimeout = setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    clearCardState();
    displayNextWord();

    waitingForNeutral = true;
    gestureLocked = true;
    resetTriggerCounters();

    setStatus("Return phone to centre");
  }, FEEDBACK_DURATION);
}

function registerPass(source = "sensor") {
  if (
    !gameRunning ||
    !initialCalibrationComplete ||
    gestureLocked
  ) {
    return;
  }

  gestureLocked = true;
  resetTriggerCounters();

  wordElement.textContent = "PASS!";
  setStatus("Passed!");

  showCardState("pass");
  vibrate([60, 40, 60]);

  clearTimeout(feedbackTimeout);

  feedbackTimeout = setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    clearCardState();
    displayNextWord();

    waitingForNeutral = true;
    gestureLocked = true;
    resetTriggerCounters();

    setStatus("Return phone to centre");
  }, FEEDBACK_DURATION);
}
/* =========================================================
   MANUAL BUTTONS
========================================================= */

function handleManualCorrect() {
  if (
    !gameRunning ||
    gestureLocked
  ) {
    return;
  }

  registerCorrect("manual");
}

function handleManualPass() {
  if (
    !gameRunning ||
    gestureLocked
  ) {
    return;
  }

  registerPass("manual");
}

/* =========================================================
   TIMER
========================================================= */

function startTimer() {
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
   GAME FUNCTIONS
========================================================= */

async function startGame() {
  setPermissionMessage("");

  if (startButton) {
    startButton.disabled = true;
  }

  try {
    /*
      Permission must be requested directly after a user click,
      especially on iPhone.
    */
    await requestMotionPermission();
    await enterGameMode();

    clearInterval(timerInterval);
    clearInterval(calibrationInterval);
    clearTimeout(feedbackTimeout);

    score = 0;
    timeLeft = GAME_DURATION;

gameRunning = true;
initialCalibrationComplete = false;
gestureLocked = true;
waitingForNeutral = false;

    neutralTilt = null;
    filteredTilt = null;

    resetTriggerCounters();

    scoreElement.textContent = score;
    timerElement.textContent = timeLeft;

    clearCardState();
    prepareWords();

    showScreen(gameScreen);
    startInitialCalibration();
  } catch (error) {
    console.error(error);

    setPermissionMessage(
      error.message ||
        "Unable to access the motion sensor."
    );
  } finally {
    if (startButton) {
      startButton.disabled = false;
    }
  }
}

function endGame() {
gameRunning = false;
initialCalibrationComplete = false;
gestureLocked = true;
waitingForNeutral = false;

  clearInterval(timerInterval);
  clearInterval(calibrationInterval);
  clearTimeout(feedbackTimeout);

  timerInterval = null;
  calibrationInterval = null;
  feedbackTimeout = null;

  clearCardState();
  resetTriggerCounters();

  finalScoreElement.textContent = score;

  showScreen(resultScreen);

  vibrate([100, 60, 100]);
}

async function restartGame() {
  await startGame();
}

/* =========================================================
   EVENT LISTENERS
========================================================= */




if (startButton) {
  startButton.addEventListener(
    "click",
    startGame
  );
}

if (restartButton) {
  restartButton.addEventListener(
    "click",
    restartGame
  );
}

if (correctButton) {
  correctButton.addEventListener(
    "click",
    handleManualCorrect
  );
}

if (passButton) {
  passButton.addEventListener(
    "click",
    handleManualPass
  );
}



/* =========================================================
   INITIAL SCREEN
========================================================= */

if (startScreen) {
  showScreen(startScreen);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration =
        await navigator.serviceWorker.register(
          "./service-worker.js"
        );

      console.log(
        "Service worker registered:",
        registration.scope
      );
    } catch (error) {
      console.error(
        "Service worker registration failed:",
        error
      );
    }
  });
}