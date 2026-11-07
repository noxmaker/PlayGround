const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const healthFill = document.getElementById('healthFill');
const batteryFill = document.getElementById('batteryFill');
const objectiveEl = document.getElementById('objective');
const statusEl = document.getElementById('status');
const messageBox = document.getElementById('messageBox');

const map = [
  '####################################',
  '#..........#..........#............#',
  '#..........#..###.....#............#',
  '#..###....................###......#',
  '#......##.....##..............##...#',
  '#..................................#',
  '####..###########..###########..####',
  '#..........#..........#............#',
  '#.............###..................#',
  '#..##....................##........#',
  '#.....##....................###....#',
  '#..........#..........#............#',
  '#######..########..#########..######',
  '#..........#..........#............#',
  '#......###...............##........#',
  '#..##...........##.................#',
  '#.............................###..#',
  '#..........#..........#............#',
  '#..........#..........#............#',
  '####################################'
];

const mapCols = map[0].length;
const mapRows = map.length;

const game = {
  width: canvas.width,
  height: canvas.height,
  keys: {},
  lastTime: 0,
  messageTimer: 0,
  end: false,
  win: false,
  objectiveProgress: 0,
  battery: 100,
  health: 100,
  soundPulse: 0,
  pulseCooldown: 0,
  pulseFlash: 0,
  objectiveList: [
    { id: 'power', x: 12, y: 3, activated: false },
    { id: 'filter', x: 29, y: 8, activated: false },
    { id: 'gate', x: 13, y: 14, activated: false }
  ],
  exit: { x: 3, y: 17 },
  enemies: [
    { x: 25, y: 3, homeX: 25, homeY: 3, alive: true, speed: 0.9 },
    { x: 30, y: 14, homeX: 30, homeY: 14, alive: true, speed: 1.2 },
    { x: 7, y: 9, homeX: 7, homeY: 9, alive: true, speed: 0.75 }
  ],
  player: {
    x: 2.5,
    y: 2.5,
    angle: 0,
    fov: Math.PI / 3,
    moveSpeed: 1.9,
    turnSpeed: 1.2,
    radius: 0.22,
    sprinting: false
  }
};

const renderer = {
  walls: []
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function dist(aX, aY, bX, bY) {
  return Math.hypot(aX - bX, aY - bY);
}

function isWall(x, y) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX < 0 || cellY < 0 || cellX >= mapCols || cellY >= mapRows) return true;
  return map[cellY][cellX] === '#';
}

function canMove(x, y) {
  return !isWall(x - game.player.radius, y - game.player.radius) &&
         !isWall(x + game.player.radius, y - game.player.radius) &&
         !isWall(x - game.player.radius, y + game.player.radius) &&
         !isWall(x + game.player.radius, y + game.player.radius);
}

function showMessage(text) {
  messageBox.textContent = text;
  messageBox.classList.remove('hidden');
  game.messageTimer = 2.5;
}

function hideMessage() {
  messageBox.classList.add('hidden');
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateHUD() {
  healthFill.style.width = `${game.health}%`;
  batteryFill.style.width = `${game.battery}%`;
  const active = game.objectiveList.filter((item) => item.activated).length;
  objectiveEl.textContent = `Objetivo: activar ${active}/3 protocolos y escapar del sector.`;
  if (active === 3) {
    objectiveEl.textContent = 'Objetivo: abrir la salida y regresar a la superficie.';
  }
}

function activateObjectiveIfNear() {
  const player = game.player;
  for (const item of game.objectiveList) {
    if (item.activated) continue;
    if (dist(player.x, player.y, item.x + 0.5, item.y + 0.5) < 0.8) {
      item.activated = true;
      game.objectiveProgress += 1;
      showMessage(`Protocolo ${item.id.toUpperCase()} restaurado`);
      setStatus('Sistema: corredor estabilizado');
    }
  }
}

function updatePlayer(dt) {
  const player = game.player;
  const forward = {
    x: Math.cos(player.angle),
    y: Math.sin(player.angle)
  };
  const side = { x: Math.cos(player.angle + Math.PI / 2), y: Math.sin(player.angle + Math.PI / 2) };

  let moveX = 0;
  let moveY = 0;
  const movePressed = game.keys['KeyW'] || game.keys['ArrowUp'] || game.keys['KeyS'] || game.keys['ArrowDown'];
  const turnPressed = game.keys['KeyA'] || game.keys['KeyD'] || game.keys['ArrowLeft'] || game.keys['ArrowRight'];

  if (game.keys['KeyW'] || game.keys['ArrowUp']) {
    moveX += forward.x;
    moveY += forward.y;
  }
  if (game.keys['KeyS'] || game.keys['ArrowDown']) {
    moveX -= forward.x;
    moveY -= forward.y;
  }
  if (game.keys['KeyA'] || game.keys['ArrowLeft']) {
    moveX += side.x;
    moveY += side.y;
  }
  if (game.keys['KeyD'] || game.keys['ArrowRight']) {
    moveX -= side.x;
    moveY -= side.y;
  }

  if (game.keys['KeyQ']) player.angle -= player.turnSpeed * dt;
  if (game.keys['KeyE']) player.angle += player.turnSpeed * dt;

  const len = Math.hypot(moveX, moveY);
  if (len > 0) {
    moveX /= len; moveY /= len;
    const speed = player.moveSpeed * (game.keys['ShiftLeft'] || game.keys['ShiftRight'] ? 1.8 : 1.0);
    const nx = player.x + moveX * speed * dt;
    const ny = player.y + moveY * speed * dt;
    if (canMove(nx, player.y)) player.x = nx;
    if (canMove(player.x, ny)) player.y = ny;
    if (movePressed || turnPressed) {
      const sprintCost = game.keys['ShiftLeft'] || game.keys['ShiftRight'] ? 1.7 : 1;
      game.battery = clamp(game.battery - 0.02 * dt * 60 * sprintCost, 0, 100);
    }
  }

  if (game.keys['Space']) {
    usePulse();
  }

  if (game.battery <= 0) {
    game.health -= 8 * dt;
    setStatus('Sistema: batería agotada; sin luz propia');
  }
}

function usePulse() {
  if (game.pulseCooldown > 0 || game.end) return;
  game.pulseCooldown = 1.7;
  game.pulseFlash = 1;
  game.soundPulse = 1;
  if (game.battery < 12) {
    showMessage('PULSO no válido: batería crítica');
    return;
  }
  game.battery = clamp(game.battery - 18, 0, 100);
  showMessage('sonar: señal emitida');
  setStatus('Escáner: pulso de eco activo');
}

function updateEnemies(dt) {
  if (game.end) return;
  const player = game.player;
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const distToPlayer = dist(player.x, player.y, enemy.x, enemy.y);
    const hearing = game.soundPulse > 0 ? 5.5 : 1.2;
    if (distToPlayer < hearing) {
      const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const dir = Math.atan2(Math.sin(angleToPlayer - Math.atan2(player.y - enemy.y, player.x - enemy.x)), Math.cos(angleToPlayer - Math.atan2(player.y - enemy.y, player.x - enemy.x)));
      const dx = Math.cos(angleToPlayer);
      const dy = Math.sin(angleToPlayer);
      if (!isWall(enemy.x + dx * 0.04, enemy.y + dy * 0.04)) {
        enemy.x += dx * enemy.speed * dt * 0.95;
        enemy.y += dy * enemy.speed * dt * 0.95;
      }
      if (distToPlayer < 0.6) {
        game.health -= 28 * dt;
        setStatus('Estado: contenedor dañado. El vigilante te ha localizado');
      }
    }
  }

  if (game.health <= 0) {
    game.end = true;
    game.win = false;
    showMessage('MORISTE EN EL SECTOR 7. PRESIONA R PARA REINICIAR');
    setStatus('Sistema: rotura intracorporal');
  }
}

function updateObjectiveState() {
  const active = game.objectiveList.filter((item) => item.activated).length;
  if (active === 3) {
    const exitDist = dist(game.player.x, game.player.y, game.exit.x + 0.5, game.exit.y + 0.5);
    if (exitDist < 0.8) {
      game.end = true;
      game.win = true;
      showMessage('ESCAPE EXITOSO. SECTOR 7 SUPERADO. PRESIONA R');
      setStatus('Estado: transmisión establecida a la superficie');
    }
  }
}

function update(dt) {
  if (game.end) {
    if (game.keys['KeyR']) resetGame();
    return;
  }

  updatePlayer(dt);
  updateEnemies(dt);
  activateObjectiveIfNear();
  updateObjectiveState();
  updateHUD();

  if (game.pulseCooldown > 0) game.pulseCooldown -= dt;
  if (game.pulseFlash > 0) game.pulseFlash -= dt * 2.5;
  if (game.soundPulse > 0) game.soundPulse -= dt * 0.8;

  if (game.messageTimer > 0) {
    game.messageTimer -= dt;
    if (game.messageTimer <= 0) hideMessage();
  }

  if (game.health < 100) {
    game.health = clamp(game.health + 0.8 * dt, 0, 100);
  }

  const moving = game.keys['KeyW'] || game.keys['KeyA'] || game.keys['KeyS'] || game.keys['KeyD'] ||
    game.keys['ArrowUp'] || game.keys['ArrowDown'] || game.keys['ArrowLeft'] || game.keys['ArrowRight'];
  if (!moving && game.battery < 100) {
    game.battery = clamp(game.battery + 4 * dt, 0, 100);
  }
}

function resetGame() {
  game.player.x = 2.5;
  game.player.y = 2.5;
  game.player.angle = 0;
  game.health = 100;
  game.battery = 100;
  game.end = false;
  game.win = false;
  game.objectiveProgress = 0;
  game.objectiveList.forEach((item) => { item.activated = false; });
  game.enemies.forEach((enemy) => {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
    enemy.alive = true;
  });
  setStatus('Estado: bajo observación');
  hideMessage();
  updateHUD();
}

function renderSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, game.height / 2);
  gradient.addColorStop(0, '#0d1b22');
  gradient.addColorStop(1, '#03080d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, game.width, game.height / 2);

  const floorGradient = ctx.createLinearGradient(0, game.height / 2, 0, game.height);
  floorGradient.addColorStop(0, '#101813');
  floorGradient.addColorStop(1, '#040708');
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, game.height / 2, game.width, game.height / 2);
}

function castRay(angle) {
  const originX = game.player.x;
  const originY = game.player.y;
  let distance = 0;
  let hitX = 0;
  let hitY = 0;
  let hit = false;

  while (distance < 15 && !hit) {
    const sampleX = originX + Math.cos(angle) * distance;
    const sampleY = originY + Math.sin(angle) * distance;
    if (isWall(sampleX, sampleY)) {
      hit = true;
      hitX = sampleX;
      hitY = sampleY;
    }
    distance += 0.02;
  }

  return {
    distance: distance,
    hitX,
    hitY,
    angle
  };
}

function renderWalls() {
  const slices = 240;
  const halfFov = game.player.fov / 2;
  const angleStep = game.player.fov / slices;
  const wallColors = ['#234958', '#44677b', '#1b2e36'];

  for (let i = 0; i < slices; ++i) {
    const rayAngle = game.player.angle - halfFov + i * angleStep;
    const ray = castRay(rayAngle);
    const correctedDistance = ray.distance * Math.cos(rayAngle - game.player.angle);
    const wallHeight = clamp((game.height / correctedDistance) * 0.8, 0, game.height * 0.85);
    const shade = clamp(1 - correctedDistance / 12, 0.1, 1);
    const x = (i / slices) * game.width;
    const w = game.width / slices + 1;

    ctx.fillStyle = wallColors[i % wallColors.length];
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, (game.height - wallHeight) / 2, w, wallHeight);
    ctx.fillStyle = `rgba(0,0,0,${0.8 - shade * 0.7})`;
    ctx.fillRect(x, (game.height - wallHeight) / 2, w, wallHeight);

    const thresholdX = i / slices * game.width;
    ctx.fillStyle = `rgba(127, 230, 255, ${0.08 + (1 - correctedDistance / 12) * 0.12})`;
    ctx.fillRect(thresholdX, (game.height - wallHeight) / 2, w, wallHeight * 0.2);
  }

  ctx.globalAlpha = 1;
}

function renderObjectiveMarkers() {
  const player = game.player;
  for (const item of game.objectiveList) {
    if (item.activated) continue;
    const dx = item.x + 0.5 - player.x;
    const dy = item.y + 0.5 - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 12) continue;
    const angleTo = Math.atan2(dy, dx);
    const delta = normalizeAngle(angleTo - player.angle);
    const screenX = (delta / player.fov + 0.5) * game.width;
    const height = clamp(120 - distance * 8, 18, 120);
    const width = clamp(18 + (12 - distance) * 1.4, 16, 48);
    ctx.fillStyle = '#91f2ff';
    ctx.fillRect(screenX - width / 2, game.height / 2 - height / 2, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(screenX - width / 4, game.height / 2 - height / 2 + 8, width / 2, height - 16);
  }
}

function normalizeAngle(angle) {
  while (angle < -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function renderEnemySilhouettes() {
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - game.player.x;
    const dy = enemy.y - game.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 12 || (game.soundPulse <= 0 && distance > 1.6)) continue;
    const angleTo = Math.atan2(dy, dx);
    const delta = normalizeAngle(angleTo - game.player.angle);
    if (Math.abs(delta) > game.player.fov * 0.6) continue;
    const screenX = (delta / game.player.fov + 0.5) * game.width;
    const size = clamp(240 / distance, 18, 80);
    const centerY = game.height / 2 + 8;
    ctx.fillStyle = game.soundPulse > 0 ? '#ff8fa3' : '#b02136';
    ctx.beginPath();
    ctx.arc(screenX, centerY - size * 0.3, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(screenX - size * 0.2, centerY, size * 0.4, size * 0.7);
  }
}

function renderPulseEffect() {
  if (game.pulseFlash <= 0.05) return;
  const alpha = clamp(game.pulseFlash, 0, 1);
  ctx.fillStyle = `rgba(140, 230, 255, ${alpha * 0.4})`;
  ctx.fillRect(0, 0, game.width, game.height);
}

function renderExitDoor() {
  const dx = game.exit.x + 0.5 - game.player.x;
  const dy = game.exit.y + 0.5 - game.player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 10) return;
  const angleTo = Math.atan2(dy, dx);
  const delta = normalizeAngle(angleTo - game.player.angle);
  const screenX = (delta / game.player.fov + 0.5) * game.width;
  const size = clamp(180 - distance * 10, 24, 90);
  ctx.fillStyle = '#d9f7ff';
  ctx.fillRect(screenX - 10, game.height / 2 - size / 2, 20, size);
  ctx.fillStyle = '#7fe6ff';
  ctx.fillRect(screenX - 5, game.height / 2 - size / 2 + 8, 10, size - 16);
}

function renderHudNoise() {
  for (let i = 0; i < 30; ++i) {
    const x = (i * 97 + (game.player.x * 53)) % canvas.width;
    const y = (i * 89 + (game.player.y * 71)) % canvas.height;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 6) * 0.01})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function render() {
  renderSky();
  renderWalls();
  renderObjectiveMarkers();
  renderEnemySilhouettes();
  renderExitDoor();
  renderPulseEffect();
  renderHudNoise();

  if (game.end && game.win) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, game.width, game.height);
  }
}

window.addEventListener('keydown', (event) => {
  game.keys[event.code] = true;
  if (event.code === 'KeyF') usePulse();
  if (event.code === 'KeyR' && game.end) resetGame();
});

window.addEventListener('keyup', (event) => {
  game.keys[event.code] = false;
});

function loop(timestamp) {
  const dt = Math.min((timestamp - game.lastTime) / 1000 || 0.016, 0.033);
  game.lastTime = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(loop);
