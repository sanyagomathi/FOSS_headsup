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
  "FreeCodeCamp"
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
const CORRECT_THRESHOLD = 20;
const PASS_THRESHOLD = -20;

/*
  Number of consecutive readings required before a gesture
  is accepted.
*/
const REQUIRED_TRIGGER_FRAMES = 3;

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
  Recalibration settings.

  After every guess, the player returns the phone to a
  comfortable position. The script waits for stable readings
  and calculates a new neutral angle.
*/
const RECALIBRATION_DELAY = 3000;
const RECALIBRATION_TIMEOUT = 5000;
const REQUIRED_STABLE_FRAMES = 10;
const CALIBRATION_SAMPLE_COUNT = 12;
const STABILITY_THRESHOLD = 1.2;

/*
  Set true while testing to display sensor values.
*/
const SHOW_SENSOR_DEBUG = true;

/*
  Change this to true if Correct and Pass are reversed
  on your phone.
*/
const REVERSE_TILT_DIRECTION = false;

/* =========================================================
   GAME STATE
========================================================= */

let shuffledWords = [];
let currentWordIndex = 0;

let score = 0;
let timeLeft = GAME_DURATION;

let gameRunning = false;
let motionEnabled = false;

let initialCalibrationComplete = false;
let recalibrating = false;
let gestureLocked = false;

let neutralTilt = null;
let filteredTilt = null;

let correctFrameCount = 0;
let passFrameCount = 0;

let recalibrationSamples = [];
let stableFrameCount = 0;
let previousCalibrationTilt = null;
let recalibrationStartTime = 0;

let timerInterval = null;
let calibrationInterval = null;
let feedbackTimeout = null;

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

function getTiltValue(event) {
    const beta = event.beta;
    const gamma = event.gamma;

    if (beta == null || gamma == null) return null;

    let tilt;

    // Screen Orientation API (modern browsers)
    if (screen.orientation && typeof screen.orientation.angle === "number") {

        switch (screen.orientation.angle) {

            case 90:       // Landscape Left
                tilt = gamma;
                break;

            case 270:      // Landscape Right
            case -90:
                tilt = -gamma;
                break;

            case 180:      // Upside-down portrait
                tilt = -beta;
                break;

            default:       // Portrait
                tilt = beta;
        }

    }
    // Older iPhones
    else if (typeof window.orientation === "number") {

        switch (window.orientation) {

            case 90:
                tilt = gamma;
                break;

            case -90:
                tilt = -gamma;
                break;

            case 180:
                tilt = -beta;
                break;

            default:
                tilt = beta;
        }

    } else {
        tilt = beta;
    }

    if (REVERSE_TILT_DIRECTION)
        tilt = -tilt;

    return tilt;
}

function shortestAngleDifference(current, neutral) {
  let difference = current - neutral;

  while (difference > 180) {
    difference -= 360;
  }

  while (difference < -180) {
    difference += 360;
  }

  return difference;
}

function smoothTilt(rawTilt) {
  if (filteredTilt === null) {
    filteredTilt = rawTilt;
    return filteredTilt;
  }

  filteredTilt =
    filteredTilt +
    SMOOTHING_FACTOR *
      (rawTilt - filteredTilt);

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
      "Motion sensors are not supported by this browser."
    );
  }

  /*
    iPhone and iPad require permission from a button click.
  */
  if (
    typeof DeviceOrientationEvent.requestPermission ===
    "function"
  ) {
    const permission =
      await DeviceOrientationEvent.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Motion permission was denied. Please enable Motion and Orientation Access."
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
  recalibrating = false;
  gestureLocked = true;

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
   RECALIBRATION AFTER EVERY GUESS
========================================================= */

function beginNeutralRecalibration() {
  recalibrating = true;
  gestureLocked = true;

  recalibrationSamples = [];
  stableFrameCount = 0;
  previousCalibrationTilt = null;

  recalibrationStartTime = performance.now();

  resetTriggerCounters();

  setStatus(
    "Return the phone to a comfortable position"
  );
}

function processNeutralRecalibration(currentTilt) {
  const elapsed =
    performance.now() - recalibrationStartTime;

  /*
    Gives the player time to return the phone after
    making a gesture.
  */
  if (elapsed < RECALIBRATION_DELAY) {
    previousCalibrationTilt = currentTilt;
    return;
  }

  if (previousCalibrationTilt === null) {
    previousCalibrationTilt = currentTilt;
    return;
  }

  const movement = Math.abs(
    currentTilt - previousCalibrationTilt
  );

  previousCalibrationTilt = currentTilt;

  /*
    Collect readings only while the phone is stable.
  */
  if (movement <= STABILITY_THRESHOLD) {
    stableFrameCount++;
    recalibrationSamples.push(currentTilt);

    if (
      recalibrationSamples.length >
      CALIBRATION_SAMPLE_COUNT
    ) {
      recalibrationSamples.shift();
    }
  } else {
    stableFrameCount = 0;
    recalibrationSamples = [];
  }

  const stableEnough =
    stableFrameCount >= REQUIRED_STABLE_FRAMES &&
    recalibrationSamples.length >=
      CALIBRATION_SAMPLE_COUNT;

  const timedOut =
    elapsed >= RECALIBRATION_TIMEOUT;

  if (stableEnough || timedOut) {
    finishNeutralRecalibration(currentTilt);
  }
}

function finishNeutralRecalibration(fallbackTilt) {
  let newNeutral = fallbackTilt;

  if (recalibrationSamples.length > 0) {
    const total = recalibrationSamples.reduce(
      (sum, value) => sum + value,
      0
    );

    newNeutral =
      total / recalibrationSamples.length;
  }

  neutralTilt = newNeutral;

  /*
    Restart filtering from the newly calculated neutral.
  */
  filteredTilt = newNeutral;

  recalibrating = false;
  gestureLocked = false;

  recalibrationSamples = [];
  stableFrameCount = 0;
  previousCalibrationTilt = null;

  resetTriggerCounters();

  setStatus("Ready");
}

/* =========================================================
   SENSOR HANDLER
========================================================= */

function handleOrientation(event) {
  if (!gameRunning || !motionEnabled) {
    return;
  }

  const rawTilt = getTiltValue(event);

  if (rawTilt === null) {
    return;
  }

  const currentTilt = smoothTilt(rawTilt);

  /*
    During initial calibration, keep calculating the neutral
    angle continuously.
  */
  if (!initialCalibrationComplete) {
    neutralTilt = currentTilt;

    if (SHOW_SENSOR_DEBUG) {
      setStatus(
        `Calibrating: ${currentTilt.toFixed(1)}°`
      );
    }

    return;
  }

  /*
    After each guess, calculate a new neutral angle.
  */
  if (recalibrating) {
    processNeutralRecalibration(currentTilt);

    if (SHOW_SENSOR_DEBUG) {
      setStatus(
        `Recalibrating: ${currentTilt.toFixed(1)}°`
      );
    }

    return;
  }

  if (
    gestureLocked ||
    neutralTilt === null
  ) {
    return;
  }

let relativeTilt = currentTilt - neutralTilt;

// Flip automatically depending on landscape orientation
const angle =
    screen.orientation?.angle ??
    window.orientation ??
    0;

if (angle === 270 || angle === -90) {
    relativeTilt *= -1;
}

  if (SHOW_SENSOR_DEBUG) {
    setStatus(
      `Tilt: ${relativeTilt.toFixed(1)}°`
    );
  }

  /*
    Correct gesture.
  */
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

  /*
    Pass gesture.
  */
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
    recalibrating ||
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
  vibrate(100);

  clearTimeout(feedbackTimeout);

  feedbackTimeout = setTimeout(() => {
    if (!gameRunning) {
      return;
    }

    clearCardState();
    displayNextWord();

    /*
      A new neutral angle is calculated after every guess.
    */
    beginNeutralRecalibration();
  }, FEEDBACK_DURATION);
}

function registerPass(source = "sensor") {
  if (
    !gameRunning ||
    !initialCalibrationComplete ||
    recalibrating ||
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

    /*
      A new neutral angle is calculated after every guess.
    */
    beginNeutralRecalibration();
  }, FEEDBACK_DURATION);
}

/* =========================================================
   MANUAL BUTTONS
========================================================= */

function handleManualCorrect() {
  if (
    !gameRunning ||
    recalibrating ||
    gestureLocked
  ) {
    return;
  }

  registerCorrect("manual");
}

function handleManualPass() {
  if (
    !gameRunning ||
    recalibrating ||
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
    recalibrating = false;
    gestureLocked = true;

    neutralTilt = null;
    filteredTilt = null;

    recalibrationSamples = [];
    stableFrameCount = 0;
    previousCalibrationTilt = null;

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
  recalibrating = false;
  gestureLocked = true;

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
   ORIENTATION CHANGE
========================================================= */

function handleOrientationChange() {
  if (!gameRunning) {
    return;
  }

  /*
    Recalculate neutral if the player rotates the phone
    during the round.
  */
  filteredTilt = null;
  neutralTilt = null;

  recalibrating = true;
  gestureLocked = true;

  recalibrationSamples = [];
  stableFrameCount = 0;
  previousCalibrationTilt = null;

  recalibrationStartTime = performance.now();

  resetTriggerCounters();

  setStatus("Hold steady while recalibrating");
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

window.addEventListener(
  "orientationchange",
  handleOrientationChange
);

/* =========================================================
   INITIAL SCREEN
========================================================= */

if (startScreen) {
  showScreen(startScreen);
}