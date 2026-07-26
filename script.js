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
  "Commit"
];

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
const permissionMessage = document.getElementById("permission-message");
const gameCard = document.getElementById("game-card");

let currentWordIndex = 0;
let score = 0;
let timeLeft = 60;
let timerInterval = null;
let gameRunning = false;

/*
  neutralBeta stores the phone's starting angle.

  Different users may hold the phone at slightly different angles,
  so detecting movement relative to the initial position is more
  reliable than using one fixed angle.
*/
let neutralBeta = null;

/*
  Adjust these values during testing.

  Positive relative tilt = one direction.
  Negative relative tilt = opposite direction.

  Device coordinate behaviour can vary depending on how the phone
  is held, so you may need to swap the actions.
*/
const CORRECT_THRESHOLD = 35;
const PASS_THRESHOLD = -35;

let tiltLocked = false;
const TILT_COOLDOWN = 1200;

async function enterGameMode() {
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }

    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (error) {
    console.log("Fullscreen or orientation lock was unavailable.");
  }
}

function showScreen(screenToShow) {
  startScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");

  screenToShow.classList.remove("hidden");
}

async function startGame() {
  permissionMessage.textContent = "";

  try {
    await enterGameMode();
    await requestMotionPermission();

    score = 0;
    timeLeft = 60;
    currentWordIndex = 0;
    neutralBeta = null;
    tiltLocked = false;
    gameRunning = true;

    shuffleWords();

    scoreElement.textContent = score;
    wordElement.textContent = words[currentWordIndex];

    showScreen(gameScreen);
    beginTimer();
  } catch (error) {
    permissionMessage.textContent = error.message;
  }
}

function shuffleWords() {
  for (let i = words.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [words[i], words[randomIndex]] = [
      words[randomIndex],
      words[i]
    ];
  }
}

function displayNextWord() {
  currentWordIndex++;

  if (currentWordIndex >= words.length) {
    shuffleWords();
    currentWordIndex = 0;
  }

  wordElement.textContent = words[currentWordIndex];
}

function showCardState(type) {
  gameCard.classList.remove("correct-state", "pass-state");

  if (type === "correct") {
    gameCard.classList.add("correct-state");
  }

  if (type === "pass") {
    gameCard.classList.add("pass-state");
  }

  setTimeout(() => {
    gameCard.classList.remove("correct-state", "pass-state");
  }, 500);
}

function registerCorrect() {
  if (!gameRunning || tiltLocked) {
    return;
  }

  tiltLocked = true;
  score++;

  scoreElement.textContent = score;
  tiltStatus.textContent = "Correct!";
  showCardState("correct");

  setTimeout(() => {
    displayNextWord();
    tiltStatus.textContent = "Return phone to neutral";
  }, 400);

  unlockTilt();
}

function registerPass() {
  if (!gameRunning || tiltLocked) {
    return;
  }

  tiltLocked = true;

  tiltStatus.textContent = "Passed!";
  showCardState("pass");

  setTimeout(() => {
    displayNextWord();
    tiltStatus.textContent = "Return phone to neutral";
  }, 400);

  unlockTilt();
}

function unlockTilt() {
  setTimeout(() => {
    tiltLocked = false;
    neutralBeta = null;
    tiltStatus.textContent = "Hold steady";
  }, TILT_COOLDOWN);
}

function handleOrientation(event) {
  if (!gameRunning || tiltLocked || event.beta === null) {
    return;
  }

  const beta = event.beta;

  /*
    Save a neutral value after every completed tilt.
  */
  if (neutralBeta === null) {
    neutralBeta = beta;
    return;
  }

  const relativeTilt = beta - neutralBeta;

  tiltStatus.textContent =
    `Tilt: ${Math.round(relativeTilt)}°`;

  if (relativeTilt >= CORRECT_THRESHOLD) {
    registerCorrect();
  } else if (relativeTilt <= PASS_THRESHOLD) {
    registerPass();
  }
}

async function requestMotionPermission() {
  if (!window.DeviceOrientationEvent) {
    throw new Error(
      "Device orientation is not supported on this browser."
    );
  }

  /*
    iOS Safari exposes requestPermission().
    Other browsers may provide orientation events without this method.
  */
  if (
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const permission =
      await DeviceOrientationEvent.requestPermission();

    if (permission !== "granted") {
      throw new Error("Motion permission was denied.");
    }
  }

  window.addEventListener(
    "deviceorientation",
    handleOrientation,
    true
  );
}

function beginTimer() {
  timerElement.textContent = timeLeft;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerElement.textContent = timeLeft;

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

async function startGame() {
  permissionMessage.textContent = "";

  try {
    await requestMotionPermission();

    score = 0;
    timeLeft = 60;
    currentWordIndex = 0;
    neutralBeta = null;
    tiltLocked = false;
    gameRunning = true;

    shuffleWords();

    scoreElement.textContent = score;
    wordElement.textContent = words[currentWordIndex];

    showScreen(gameScreen);
    beginTimer();
  } catch (error) {
    permissionMessage.textContent = error.message;
  }
}

function endGame() {
  gameRunning = false;

  clearInterval(timerInterval);
  timerInterval = null;

  finalScoreElement.textContent = score;
  showScreen(resultScreen);
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

correctButton.addEventListener("click", registerCorrect);
passButton.addEventListener("click", registerPass);