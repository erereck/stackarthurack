(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const overlayText = document.querySelector('#overlayText');
  const startButton = document.querySelector('#start');
  const pauseButton = document.querySelector('#pause');
  const toast = document.querySelector('#toast');
  const scoreEl = document.querySelector('#score');
  const linesEl = document.querySelector('#lines');
  const craneCountEl = document.querySelector('#craneCount');
  const bestEl = document.querySelector('#best');
  const charBox = document.querySelector('#chars');
  const charDesc = document.querySelector('#charDesc');

  const COLS = 11;
  const ROWS = 9;
  const CELL = 56;
  const BOARD_W = COLS * CELL;
  const BX = (canvas.width - BOARD_W) / 2;
  const GROUND = 704;
  const TRACK_Y = 78;
  const DROP_Y = 132;
  const MAX_CRANES = 3;

  const palette = ['#ef3028', '#f1dc20', '#244ee0', '#28bf42'];
  const glyphs = ['C', 'L', '✣', '≡'];

  const characters = [
    { name: 'Arthur', speed: 188, jump: 424, desc: 'Equilibrado. É a calibração principal do remake.' },
    { name: 'Turbo', speed: 220, jump: 396, desc: 'Mais rápido no chão, pulo ligeiramente menor.' },
    { name: 'Mola', speed: 174, jump: 472, desc: 'Pula mais alto; ótimo para quebrar caixas no ar.' },
    { name: 'Trator', speed: 158, jump: 405, desc: 'Mais lento e estável para empurrar pilhas.' },
    { name: 'Ninja', speed: 207, jump: 444, desc: 'Ágil, rápido e um pouco mais difícil de controlar.' },
    { name: 'Clássico', speed: 181, jump: 418, desc: 'Movimento seco inspirado no ritmo de celular Java.' }
  ];

  let selectedCharacter = 0;
  characters.forEach((character, index) => {
    const button = document.createElement('button');
    button.className = 'char' + (index === 0 ? ' active' : '');
    button.type = 'button';
    button.textContent = character.name;
    button.addEventListener('click', () => {
      selectedCharacter = index;
      [...charBox.children].forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      charDesc.textContent = character.desc;
    });
    charBox.appendChild(button);
  });
  charDesc.textContent = characters[0].desc;

  let best = Number(localStorage.stackArthurBest || 0);
  bestEl.textContent = best;

  let running = false;
  let paused = false;
  let last = 0;
  let score = 0;
  let clearedLines = 0;
  let activeCranes = 1;
  let helmet = 0;
  let superJumps = 0;
  let blocks = [];
  let falling = [];
  let particles = [];
  let cranes = [];
  let pieceQueue = [];
  let nextId = 1;
  let shake = 0;

  const keys = { left: false, right: false, jump: false };
  let player = makePlayer();

  function makePlayer() {
    return {
      x: BX + CELL * 5 + 14,
      y: GROUND - 46,
      w: 28,
      h: 46,
      vx: 0,
      vy: 0,
      onGround: true,
      dead: false,
      facing: 1,
      walkPhase: 0
    };
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function colX(col) { return BX + col * CELL; }
  function colCenter(col) { return colX(col) + CELL / 2; }
  function blockRect(block) {
    return { x: colX(block.c) + 3, y: GROUND - (block.r + 1) * CELL + 3, w: CELL - 6, h: CELL - 6 };
  }
  function rectHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function occupied(c, r, ignore = null) {
    return blocks.find((b) => b !== ignore && b.c === c && b.r === r);
  }
  function columnHeight(c) {
    let height = 0;
    for (const block of blocks) if (block.c === c) height = Math.max(height, block.r + 1);
    return height;
  }

  function normalPiece() {
    return { type: 'normal', color: Math.floor(Math.random() * palette.length) };
  }
  function generatePiece() {
    const roll = Math.random();
    if (roll < 0.045) return { type: 'bonus', color: 0 };
    if (roll < 0.078) return { type: 'helmet', color: 0 };
    if (roll < 0.108) return { type: 'jump', color: 0 };
    return normalPiece();
  }
  function refillQueue() {
    while (pieceQueue.length < 8) pieceQueue.push(generatePiece());
  }
  function takePiece() {
    refillQueue();
    const p = pieceQueue.shift();
    refillQueue();
    return { ...p };
  }

  function chooseTargetColumn(crane) {
    let choice = Math.floor(Math.random() * COLS);
    for (let tries = 0; tries < 7; tries++) {
      const candidate = Math.floor(Math.random() * COLS);
      const tooTall = columnHeight(candidate) >= ROWS - 1;
      const same = candidate === crane.lastTarget;
      if (!tooTall && (!same || Math.random() < 0.25)) { choice = candidate; break; }
    }
    crane.lastTarget = choice;
    return choice;
  }

  function makeCrane(index) {
    const homeSide = index === 1 ? 1 : -1;
    const homeX = homeSide < 0 ? BX - 42 - index * 18 : BX + BOARD_W + 42 + index * 18;
    return {
      index,
      active: index === 0,
      homeSide,
      homeX,
      x: homeX,
      targetCol: 5,
      lastTarget: -1,
      speed: 150 + index * 7,
      state: 'reload',
      timer: index * 0.45,
      carrying: null,
      bob: Math.random() * Math.PI * 2
    };
  }

  function resetCranes() {
    cranes = Array.from({ length: MAX_CRANES }, (_, index) => makeCrane(index));
    activeCranes = 1;
    craneCountEl.textContent = '1';
  }

  function setCraneCount(count, announce = true) {
    const next = clamp(count, 1, MAX_CRANES);
    if (next === activeCranes) return;
    const old = activeCranes;
    activeCranes = next;
    cranes.forEach((crane, index) => {
      const shouldBeActive = index < activeCranes;
      if (shouldBeActive && !crane.active) {
        crane.active = true;
        crane.state = 'reload';
        crane.timer = 0.35 + index * 0.25;
        crane.x = crane.homeX;
        crane.carrying = null;
      }
      if (!shouldBeActive) crane.active = false;
    });
    craneCountEl.textContent = activeCranes;
    if (announce && activeCranes > old) toastMsg(activeCranes + ' GUINDASTES!');
  }

  function reset() {
    score = 0;
    clearedLines = 0;
    activeCranes = 1;
    helmet = 0;
    superJumps = 0;
    blocks = [];
    falling = [];
    particles = [];
    pieceQueue = [];
    nextId = 1;
    shake = 0;
    player = makePlayer();
    refillQueue();
    resetCranes();
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    linesEl.textContent = clearedLines;
    craneCountEl.textContent = activeCranes;
    if (score > best) {
      best = score;
      localStorage.stackArthurBest = String(best);
      bestEl.textContent = best;
    }
  }

  function toastMsg(text) {
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 800);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function updateCrane(crane, dt) {
    if (!crane.active) return;
    crane.bob += dt * 4;

    if (crane.state === 'reload') {
      crane.timer -= dt;
      if (crane.timer <= 0) {
        crane.carrying = takePiece();
        crane.targetCol = chooseTargetColumn(crane);
        crane.state = 'travel';
      }
      return;
    }

    if (crane.state === 'travel') {
      const targetX = colCenter(crane.targetCol);
      const delta = targetX - crane.x;
      const step = crane.speed * (1 + Math.min(clearedLines, 10) * 0.012) * dt;
      if (Math.abs(delta) <= step) {
        crane.x = targetX;
        crane.state = 'aim';
        crane.timer = 0.22 + crane.index * 0.025;
      } else {
        crane.x += Math.sign(delta) * step;
      }
      return;
    }

    if (crane.state === 'aim') {
      crane.timer -= dt;
      if (crane.timer <= 0) {
        dropFromCrane(crane);
        crane.state = 'return';
      }
      return;
    }

    if (crane.state === 'return') {
      const delta = crane.homeX - crane.x;
      const step = crane.speed * 1.16 * dt;
      if (Math.abs(delta) <= step) {
        crane.x = crane.homeX;
        crane.state = 'reload';
        crane.timer = Math.max(0.18, 0.48 - Math.min(clearedLines, 8) * 0.018) + crane.index * 0.04;
      } else {
        crane.x += Math.sign(delta) * step;
      }
    }
  }

  function dropFromCrane(crane) {
    if (!crane.carrying) return;
    const p = crane.carrying;
    falling.push({
      id: nextId++,
      c: crane.targetCol,
      x: colX(crane.targetCol) + 3,
      y: DROP_Y,
      w: CELL - 6,
      h: CELL - 6,
      color: p.color,
      type: p.type,
      vy: 18,
      source: crane.index
    });
    crane.carrying = null;
    vibrate(8);
  }

  function settleBoard() {
    for (let c = 0; c < COLS; c++) {
      const column = blocks.filter((b) => b.c === c).sort((a, b) => a.r - b.r);
      column.forEach((block, row) => { block.r = row; });
    }
  }

  function addBurst(block) {
    const rect = blockRect(block);
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: rect.x + rect.w / 2,
        y: rect.y + rect.h / 2,
        vx: rand(-190, 190),
        vy: rand(-220, -55),
        life: rand(0.3, 0.52),
        color: palette[block.color]
      });
    }
  }

  function findClearSet() {
    const remove = new Set();

    for (let r = 0; r < ROWS; r++) {
      const row = blocks.filter((b) => b.r === r);
      if (row.length === COLS) row.forEach((b) => remove.add(b));
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const start = occupied(c, r);
        if (!start) continue;
        let end = c + 1;
        while (end < COLS) {
          const next = occupied(end, r);
          if (!next || next.color !== start.color) break;
          end++;
        }
        if (end - c >= 3) for (let x = c; x < end; x++) remove.add(occupied(x, r));
        c = end - 1;
      }
    }

    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const start = occupied(c, r);
        if (!start) continue;
        let end = r + 1;
        while (end < ROWS) {
          const next = occupied(c, end);
          if (!next || next.color !== start.color) break;
          end++;
        }
        if (end - r >= 3) for (let y = r; y < end; y++) remove.add(occupied(c, y));
        r = end - 1;
      }
    }
    remove.delete(undefined);
    return remove;
  }

  function resolveBoard() {
    let chain = 0;
    while (chain < 8) {
      const remove = findClearSet();
      if (!remove.size) break;
      chain++;
      remove.forEach(addBurst);
      blocks = blocks.filter((b) => !remove.has(b));
      settleBoard();
      score += 50 * chain;
      clearedLines++;
      setCraneCount(Math.min(MAX_CRANES, 1 + clearedLines));
      updateHUD();
      toastMsg(chain > 1 ? 'CADEIA x' + chain + '! +' + (50 * chain) : 'LINHA! +50');
      vibrate(chain > 1 ? [20, 20, 20] : 18);
    }
  }

  function collectSpecial(fallingBlock) {
    if (fallingBlock.type === 'bonus') {
      score += 150;
      updateHUD();
      toastMsg('+150!');
      return true;
    }
    if (fallingBlock.type === 'helmet') {
      helmet = 1;
      toastMsg('CAPACETE!');
      return true;
    }
    if (fallingBlock.type === 'jump') {
      superJumps += 3;
      toastMsg('3 SUPER PULOS!');
      return true;
    }
    return false;
  }

  function landNormalBlock(fallingBlock) {
    const row = columnHeight(fallingBlock.c);
    if (row >= ROWS) {
      gameOver();
      return;
    }
    blocks.push({ id: fallingBlock.id, c: fallingBlock.c, r: row, color: fallingBlock.color });
    shake = Math.max(shake, 2.7);
    vibrate(12);
    resolveBoard();
  }

  function solids() {
    return blocks.map((b) => ({ ...blockRect(b), block: b }));
  }

  function attemptPush(dir) {
    const frontX = dir > 0 ? player.x + player.w + 2 : player.x - 2;
    const c = Math.floor((frontX - BX) / CELL);
    if (c < 0 || c >= COLS) return false;
    const probeY = player.y + player.h * 0.62;
    let target = null;
    for (const block of blocks.filter((b) => b.c === c)) {
      const rect = blockRect(block);
      if (probeY >= rect.y - 3 && probeY <= rect.y + rect.h + 3) { target = block; break; }
    }
    if (!target) return false;
    const nextCol = target.c + dir;
    if (nextCol < 0 || nextCol >= COLS || occupied(nextCol, target.r)) return false;
    target.c = nextCol;
    settleBoard();
    score += 1;
    updateHUD();
    resolveBoard();
    vibrate(7);
    return true;
  }

  function updatePlayer(dt) {
    const character = characters[selectedCharacter];
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) player.facing = dir;
    player.vx = dir * character.speed;
    if (dir) player.walkPhase += dt * 11;

    if (keys.jump && player.onGround) {
      const boosted = superJumps > 0;
      player.vy = -(boosted ? character.jump * 1.38 : character.jump);
      if (boosted) {
        superJumps--;
        toastMsg('SUPER! x' + superJumps);
      }
      player.onGround = false;
      keys.jump = false;
      vibrate(8);
    }

    const oldX = player.x;
    player.x += player.vx * dt;
    player.x = clamp(player.x, BX, BX + BOARD_W - player.w);
    for (const solid of solids()) {
      if (rectHit(player, solid)) {
        player.x = oldX;
        if (dir) attemptPush(dir);
        break;
      }
    }

    const oldY = player.y;
    player.vy += 1050 * dt;
    player.y += player.vy * dt;
    player.onGround = false;

    if (player.y + player.h >= GROUND) {
      player.y = GROUND - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    for (const solid of solids()) {
      if (!rectHit(player, solid)) continue;
      if (oldY + player.h <= solid.y + 5 && player.vy >= 0) {
        player.y = solid.y - player.h;
        player.vy = 0;
        player.onGround = true;
      } else if (oldY >= solid.y + solid.h - 5 && player.vy < 0) {
        player.y = solid.y + solid.h;
        player.vy = 0;
      }
    }
  }

  function destroyFallingWithHead(index) {
    score += 20;
    falling.splice(index, 1);
    updateHUD();
    toastMsg('CRASH! +20');
    shake = Math.max(shake, 4);
    vibrate([15, 18, 15]);
  }

  function updateFalling(dt) {
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy += 760 * dt;
      f.y += f.vy * dt;

      const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };
      const fallingRect = { x: f.x, y: f.y, w: f.w, h: f.h };

      if (rectHit(fallingRect, playerRect)) {
        if (collectSpecial(f)) {
          falling.splice(i, 1);
          continue;
        }
        const playerHead = player.y + 12;
        const hitFromBelow = player.vy < -35 && playerHead >= f.y + f.h - 16;
        if (hitFromBelow) {
          destroyFallingWithHead(i);
          continue;
        }
        if (helmet > 0) {
          helmet = 0;
          falling.splice(i, 1);
          toastMsg('CAPACETE SALVOU!');
          shake = Math.max(shake, 5);
          vibrate([25, 20, 25]);
          continue;
        }
        gameOver();
        return;
      }

      const floorY = GROUND - columnHeight(f.c) * CELL;
      if (f.y + f.h >= floorY) {
        f.y = floorY - f.h;
        if (collectSpecial(f)) {
          falling.splice(i, 1);
          continue;
        }
        landNormalBlock(f);
        falling.splice(i, 1);
      }
    }
  }

  function gameOver() {
    if (player.dead) return;
    player.dead = true;
    running = false;
    shake = 8;
    vibrate([60, 45, 100]);
    updateHUD();
    setTimeout(() => {
      overlay.style.display = 'grid';
      overlay.querySelector('h1').innerHTML = 'FIM DE<br><span>TURNO</span>';
      overlayText.innerHTML = 'Arthur fez <b>' + score + '</b> pontos e limpou <b>' + clearedLines + '</b> linhas.';
      startButton.textContent = 'JOGAR DE NOVO';
    }, 320);
  }

  function updateParticles(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 560 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  function update(dt) {
    if (!running || paused) return;
    cranes.forEach((crane) => updateCrane(crane, dt));
    updatePlayer(dt);
    updateFalling(dt);
    updateParticles(dt);
    shake = Math.max(0, shake - dt * 20);
  }

  function drawCrate(x, y, w, h, color, type = 'normal') {
    ctx.fillStyle = '#090909';
    ctx.fillRect(Math.round(x - 3), Math.round(y - 3), Math.round(w + 6), Math.round(h + 6));
    const fill = type === 'normal' ? palette[color] : type === 'bonus' ? '#d92de8' : type === 'helmet' ? '#61d8ee' : '#ffffff';
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x + 2), Math.round(y + 2), Math.round(w - 4), Math.round(h - 4));
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    ctx.strokeRect(Math.round(x + 7), Math.round(y + 7), Math.round(w - 14), Math.round(h - 14));
    ctx.fillStyle = '#111';
    ctx.font = '900 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = type === 'bonus' ? '+' : type === 'helmet' ? 'H' : type === 'jump' ? '↑' : glyphs[color];
    ctx.fillText(glyph, Math.round(x + w / 2), Math.round(y + h / 2 + 1));
  }

  function drawBackground() {
    ctx.fillStyle = '#eeb09f';
    ctx.fillRect(0, 0, canvas.width, GROUND);
    ctx.fillStyle = '#e7a094';
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + 31) % canvas.width;
      const y = 175 + ((i * 83) % 390);
      ctx.fillRect(x, y, 33 + (i % 3) * 15, 7);
    }
    ctx.fillStyle = '#d18c84';
    ctx.globalAlpha = 0.25;
    ctx.font = '900 72px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ARTHUR', canvas.width * 0.52, 330);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(BX - 10, TRACK_Y - 9, BOARD_W + 20, 18);
    ctx.fillStyle = '#f3eede';
    ctx.fillRect(BX - 5, TRACK_Y - 3, BOARD_W + 10, 6);
    ctx.fillStyle = '#6e63b9';
    for (let x = BX; x < BX + BOARD_W; x += 34) ctx.fillRect(x, TRACK_Y - 6, 18, 12);

    ctx.fillStyle = '#171820';
    ctx.fillRect(BX - 5, GROUND, BOARD_W + 10, 22);
    ctx.fillStyle = '#707990';
    ctx.fillRect(BX - 5, GROUND + 4, BOARD_W + 10, 5);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    for (let c = 0; c <= COLS; c++) ctx.fillRect(BX + c * CELL - 1, 128, 2, GROUND - 128);
    ctx.globalAlpha = 1;
  }

  function drawCrane(crane) {
    if (!crane.active) return;
    const x = crane.x;
    const y = TRACK_Y;
    const bob = Math.sin(crane.bob) * 1.5;

    ctx.fillStyle = '#0b0b10';
    ctx.fillRect(Math.round(x - 20), Math.round(y - 22), 40, 29);
    ctx.fillStyle = '#6255a5';
    ctx.fillRect(Math.round(x - 15), Math.round(y - 18), 30, 21);
    ctx.fillStyle = '#9a8ce6';
    ctx.fillRect(Math.round(x - 9), Math.round(y - 13), 8, 8);

    ctx.strokeStyle = '#0b0b10';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x, y + 33 + bob);
    ctx.stroke();

    const clawY = y + 44 + bob;
    ctx.beginPath();
    ctx.moveTo(x - 3, clawY - 12);
    ctx.lineTo(x - 20, clawY - 2);
    ctx.lineTo(x - 20, clawY + 14);
    ctx.moveTo(x + 3, clawY - 12);
    ctx.lineTo(x + 20, clawY - 2);
    ctx.lineTo(x + 20, clawY + 14);
    ctx.stroke();

    if (crane.carrying) {
      const size = CELL - 10;
      drawCrate(x - size / 2, clawY + 17, size, size, crane.carrying.color, crane.carrying.type);
    }
  }

  function drawPlayer() {
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const leg = Math.sin(player.walkPhase) * (Math.abs(player.vx) > 1 ? 3 : 0);

    ctx.fillStyle = '#151515';
    ctx.fillRect(x + 5, y + 4, 20, 16);
    ctx.fillStyle = '#e9491d';
    ctx.fillRect(x + 6, y, 18, 8);
    ctx.fillStyle = '#f0bd79';
    ctx.fillRect(x + 9, y + 8, 13, 10);
    ctx.fillStyle = '#111';
    ctx.fillRect(x + (player.facing > 0 ? 18 : 10), y + 11, 3, 3);
    ctx.fillStyle = '#16202c';
    ctx.fillRect(x + 5, y + 18, 18, 18);
    ctx.fillStyle = '#327ec7';
    ctx.fillRect(x + 9, y + 21, 10, 13);
    ctx.fillStyle = '#111';
    ctx.fillRect(x + (player.facing > 0 ? 22 : 1), y + 20, 6, 16);
    ctx.fillRect(x + 5, Math.round(y + 35 + leg), 7, 11);
    ctx.fillRect(x + 17, Math.round(y + 35 - leg), 7, 11);

    if (helmet) {
      ctx.fillStyle = '#70e1ed';
      ctx.fillRect(x + 3, y - 6, 23, 6);
      ctx.fillRect(x + 7, y - 10, 15, 5);
    }
  }

  function draw() {
    const sx = shake ? rand(-shake, shake) : 0;
    const sy = shake ? rand(-shake * 0.4, shake * 0.4) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.clearRect(-12, -12, canvas.width + 24, canvas.height + 24);
    drawBackground();
    cranes.forEach(drawCrane);
    blocks.forEach((b) => {
      const r = blockRect(b);
      drawCrate(r.x, r.y, r.w, r.h, b.color, 'normal');
    });
    falling.forEach((f) => drawCrate(f.x, f.y, f.w, f.h, f.color, f.type));
    drawPlayer();

    particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life / 0.45, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 7, 7);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#111c';
    ctx.font = '900 17px monospace';
    ctx.textAlign = 'right';
    const powers = (helmet ? 'H ' : '') + (superJumps ? '↑x' + superJumps : '');
    if (powers) ctx.fillText(powers, BX + BOARD_W - 8, GROUND - 10);
    ctx.restore();
  }

  function loop(time) {
    const dt = Math.min(0.032, (time - last) / 1000 || 0);
    last = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function startGame() {
    overlay.style.display = 'none';
    overlay.querySelector('h1').innerHTML = 'STACK <span>ARTHUR</span><br>ATTACK';
    overlayText.textContent = 'Agora o guindaste realmente atravessa o trilho, escolhe uma coluna e solta a caixa. Feche linhas, faça 3 iguais e sobreviva.';
    startButton.textContent = 'JOGAR';
    reset();
    paused = false;
    pauseButton.textContent = 'Ⅱ';
    running = true;
    last = performance.now();
  }

  startButton.addEventListener('click', startGame);
  pauseButton.addEventListener('click', () => {
    if (!running) return;
    paused = !paused;
    pauseButton.textContent = paused ? '▶' : 'Ⅱ';
  });

  for (const button of document.querySelectorAll('.gameBtn')) {
    const key = button.dataset.key;
    const down = (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      keys[key] = true;
      button.classList.add('on');
    };
    const up = (event) => {
      event.preventDefault();
      keys[key] = false;
      button.classList.remove('on');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }

  addEventListener('keydown', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = true;
    if (event.code === 'ArrowUp' || event.code === 'Space' || event.code === 'KeyW') keys.jump = true;
    if (event.code === 'Escape' && running) {
      paused = !paused;
      pauseButton.textContent = paused ? '▶' : 'Ⅱ';
    }
  });
  addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
  });

  addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = false;
    if (running) {
      paused = true;
      pauseButton.textContent = '▶';
    }
  });

  reset();
  requestAnimationFrame(loop);
})();
