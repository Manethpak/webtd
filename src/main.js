import Phaser from "phaser";
import { TOWERS } from "./engine.js";
import { BattlefieldScene } from "./game-scene.js";
import { DIFFICULTIES } from "./balance.js";
import { BOARD } from "./board.js";

const $ = (id) => document.getElementById(id);
const towerIcons = {
  arrow: new URL("../assets/towers/arrow-prepared/level-1.png", import.meta.url).href,
  ember: new URL("../assets/towers/ember-prepared/level-1.png", import.meta.url).href,
  frost: new URL("../assets/towers/frost-prepared/level-1.png", import.meta.url).href,
};
const roles = {
  arrow: "Precision / fast",
  ember: "Area / explosive",
  frost: "Control / slowing",
};

let battlefield;
let awaitingStart = true;

$("difficulty-choice").add(new Option("Select difficulty…", "", true, true));
for (const [value, preset] of Object.entries(DIFFICULTIES)) {
  $("difficulty-choice").add(new Option(preset.label, value));
}

for (const [index, [type, tower]] of Object.entries(TOWERS).entries()) {
  const button = document.createElement("button");
  button.className = "tower-card";
  button.style.setProperty("--tower-color", tower.color);
  button.dataset.type = type;
  button.dataset.hotkey = `0${index + 1}`;
  button.innerHTML = `<span class="tower-icon"><img src="${towerIcons[type]}" alt="" width="29" height="44"></span><span><b>${tower.name} tower</b><small>${roles[type]} · ${(1 / tower.rate).toFixed(
    2,
  )}/s</small></span><span class="price">${tower.cost} ◈</span>`;
  button.onclick = () => battlefield.choose(type);
  $("tower-list").append(button);
}

function renderInfo() {
  const panel = $("selection");
  const selected = battlefield.selected;
  const buildType = battlefield.buildType;

  if (selected) {
    const stats = battlefield.model.stats(selected);
    panel.innerHTML = `<span class="eyebrow">TOWER / LEVEL ${selected.level} OF 3</span><h3>${stats.name} tower</h3><p>${Math.round(stats.damage)} damage · ${stats.range} range<br>${stats.fireRate.toFixed(2)} shots/s · ${stats.rate.toFixed(2)}s between shots<br>${stats.description}</p><button id="upgrade">${selected.level === 3 ? "Fully upgraded" : `Upgrade · ${battlefield.model.upgradeCost(selected)} ◈`}</button><button id="sell">Sell · ${battlefield.model.sellValue(selected)} ◈</button>`;
    $("upgrade").onclick = () => battlefield.upgradeSelected();
    $("sell").onclick = () => battlefield.sellSelected();
  } else if (buildType) {
    const tower = TOWERS[buildType];
    const economy = battlefield.model.config.economy;
    panel.innerHTML = `<span class="eyebrow">READY TO BUILD / ${battlefield.model.towerCost(buildType)} GOLD</span><h3>${tower.name} tower</h3><p>${(1 / tower.rate).toFixed(2)} shots/s · ${tower.rate.toFixed(2)}s between shots<br>${tower.description} Price rises ${Math.round(economy.priceIncrease * 100)}% every ${economy.purchasesPerIncrease} purchases of this type. Place the base marker on unshaded ground. Press Escape before selecting a built tower.</p>`;
  } else {
    panel.innerHTML =
      '<span class="eyebrow">FIELD NOTES</span><h3>A little teamwork goes far.</h3><p>Frost slows the crowd. Ember breaks it up. Arrow takes care of the stragglers.</p>';
  }
}

function renderUi() {
  const game = battlefield.model;
  const selected = battlefield.selected;
  const difficulty = $("difficulty-choice").value;

  $("gold").textContent = game.gold;
  $("lives").textContent = game.lives;
  $("wave").textContent = game.wave;
  $("wave-limit").textContent = `/${game.maxWaves}`;
  $("difficulty-choice").disabled = !awaitingStart;
  $("difficulty-note").textContent = awaitingStart
    ? difficulty
      ? `${DIFFICULTIES[difficulty].label} selected. Build, then start when ready.`
      : "Choose a difficulty before starting."
    : `${DIFFICULTIES[game.difficulty].label} difficulty active.`;
  $("help-waves").textContent = game.maxWaves;
  $("help-delay").textContent = game.config.waveDelay;
  $("help-refund").textContent = Math.round(game.config.economy.sellRefund * 100);
  $("help-purchases").textContent = game.config.economy.purchasesPerIncrease;
  $("help-price").textContent = Math.round(game.config.economy.priceIncrease * 100);
  $("help-route").textContent = game.config.secondPathWave;
  $("phase").textContent = awaitingStart
    ? difficulty
      ? "BUILD DEFENSES · START WHEN READY"
      : "CHOOSE YOUR DIFFICULTY"
    : battlefield.paused
      ? "TIME STANDS STILL"
      : game.status === "won"
        ? "THE GROVE IS SAFE"
        : game.status === "lost"
          ? "THE GATE HAS FALLEN"
          : game.active
            ? game.secondPathOpen
              ? "TWO ROUTES · DEFEND BOTH ENTRIES"
              : "DEFEND THE GROVE"
            : "PREPARE YOUR DEFENSE";
  $("start").disabled = awaitingStart ? !difficulty : game.active || game.status !== "playing";
  $("start").innerHTML = awaitingStart
    ? "Start game <span>→</span>"
    : game.active
      ? `Wave ${String(game.wave).padStart(2, "0")} in progress <span>···</span>`
      : `Send wave ${String(Math.min(game.maxWaves, game.wave + 1)).padStart(2, "0")} <span>${Math.ceil(game.waveCountdown)}s</span>`;
  $("pause").disabled = awaitingStart;
  $("speed").disabled = awaitingStart;
  $("pause").textContent = battlefield.paused ? "▶ Resume" : "Ⅱ Pause";
  $("speed").textContent = battlefield.speed + "×";
  $("wave-note").textContent = awaitingStart
    ? difficulty
      ? "Place your opening towers, then click Start game."
      : "Select a difficulty to begin."
    : game.active
      ? `${game.enemies.length + game.remaining} enemies remaining · ${game.kills} defeated`
      : (game.wave + 1) % 4 === 0
        ? `Boss wave starts in ${Math.ceil(game.waveCountdown)}s. Prepare your defenses.`
        : `${battlefield.paused ? "Countdown paused" : "Next wave in " + Math.ceil(game.waveCountdown) + "s"} · Click to send early.`;

  document.querySelectorAll(".tower-card").forEach((button) => {
    button.querySelector(".price").textContent = `${game.towerCost(button.dataset.type)} ◈`;
    button.classList.toggle("active", button.dataset.type === battlefield.buildType);
    button.setAttribute("aria-pressed", button.dataset.type === battlefield.buildType);
    button.disabled = awaitingStart && !difficulty;
  });

  if ($("upgrade")) {
    $("upgrade").disabled =
      selected.level === 3 || game.gold < game.upgradeCost(selected) || game.status !== "playing";
  }

  if (game.status !== "playing") {
    $("end").classList.remove("hidden");
    $("end-title").textContent =
      game.status === "won" ? "The forest stands." : "Even roots can fall.";
    $("end-copy").textContent =
      game.status === "won"
        ? `You held all ${game.maxWaves} waves with ${game.lives} lives remaining.`
        : `You reached wave ${game.wave}. Try combining Frost with Ember towers.`;
  }
}

function refresh() {
  renderInfo();
  renderUi();
}

battlefield = new BattlefieldScene({
  isOverlayOpen: () => $("instructions").open,
  onStateChange: renderUi,
  onSelectionChange: refresh,
  onHint: (message) => ($("hint").textContent = message),
});

new Phaser.Game({
  type: Phaser.AUTO,
  width: BOARD.width,
  height: BOARD.height,
  parent: "board",
  backgroundColor: "#233a2c",
  scene: battlefield,
  render: { antialias: true, roundPixels: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

$("difficulty-choice").onchange = () => {
  const difficulty = $("difficulty-choice").value;
  if (!awaitingStart || !difficulty) return;
  battlefield.resetGame({ ...battlefield.gameOptions, difficulty });
  $("hint").textContent = "Place your opening towers, then click Start game.";
  refresh();
};
$("start").onclick = () => {
  if (awaitingStart) {
    if (!$("difficulty-choice").value) return;
    awaitingStart = false;
    battlefield.startWave();
    $("hint").textContent = "Wave one has begun. Hold the gate.";
    refresh();
    return;
  }
  battlefield.startWave();
};
$("pause").onclick = () => battlefield.togglePaused();
$("speed").onclick = () => battlefield.cycleSpeed();
$("restart").onclick = prepareNewGame;
$("reset").onclick = () => {
  const game = battlefield.model;
  if (
    (game.wave === 0 && game.towers.length === 0) ||
    confirm("Start over and clear your defenses?")
  ) {
    prepareNewGame();
  }
};

function prepareNewGame() {
  awaitingStart = true;
  $("difficulty-choice").value = "";
  battlefield.resetGame({ ...battlefield.gameOptions, difficulty: "standard" });
  $("end").classList.add("hidden");
  $("hint").textContent = "Select a difficulty to begin.";
  refresh();
}

$("help").onclick = () => $("instructions").showModal();
$("close-help").onclick = () => $("instructions").close();

document.addEventListener("keydown", (event) => {
  if ($("instructions").open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === "Escape") battlefield.deselect();
  if (
    ["Digit1", "Digit2", "Digit3"].includes(event.code) &&
    (!awaitingStart || $("difficulty-choice").value)
  ) {
    battlefield.choose(Object.keys(TOWERS)[Number(event.code.at(-1)) - 1]);
  }
  if (event.code === "Space" && event.target.tagName !== "BUTTON" && !awaitingStart) {
    event.preventDefault();
    battlefield.togglePaused();
  }
});

refresh();
