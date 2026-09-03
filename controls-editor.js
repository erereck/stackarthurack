(() => {
  'use strict';

  const controls = document.querySelector('#controls');
  const editor = document.querySelector('#controlEditor');
  const openTop = document.querySelector('#controlSettings');
  const openMenu = document.querySelector('#openControls');
  const closeEditor = document.querySelector('#closeControlEditor');
  const resetButton = document.querySelector('#resetControls');
  const pauseButton = document.querySelector('#pause');
  const overlay = document.querySelector('#overlay');
  const colsInput = document.querySelector('#gridCols');
  const rowsInput = document.querySelector('#gridRows');
  const sizeInput = document.querySelector('#controlSize');
  const colsValue = document.querySelector('#gridColsValue');
  const rowsValue = document.querySelector('#gridRowsValue');
  const sizeValue = document.querySelector('#controlSizeValue');
  const saveState = document.querySelector('#controlSaveState');
  const buttons = [...document.querySelectorAll('.gameBtn')];

  if (!controls || !editor || buttons.length === 0) return;

  const STORAGE_KEY = 'stackArthurControlLayoutV1';
  const DEFAULTS = {
    cols: 6,
    rows: 2,
    size: 100,
    positions: {
      left: { c: 0, r: 1 },
      right: { c: 2, r: 1 },
      jump: { c: 5, r: 1 }
    }
  };

  let state = loadState();
  let editing = false;
  let dragged = null;
  let activePointer = null;
  let resumeAfterEdit = false;
  let saveTimer = 0;

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sanitize(raw) {
    const fresh = cloneDefaults();
    if (!raw || typeof raw !== 'object') return fresh;
    fresh.cols = clamp(Math.round(Number(raw.cols) || fresh.cols), 4, 10);
    fresh.rows = clamp(Math.round(Number(raw.rows) || fresh.rows), 2, 4);
    fresh.size = clamp(Math.round(Number(raw.size) || fresh.size), 75, 125);
    for (const key of ['left', 'right', 'jump']) {
      const candidate = raw.positions && raw.positions[key];
      if (!candidate) continue;
      fresh.positions[key] = {
        c: clamp(Math.round(Number(candidate.c) || 0), 0, fresh.cols - 1),
        r: clamp(Math.round(Number(candidate.r) || 0), 0, fresh.rows - 1)
      };
    }
    return fresh;
  }

  function loadState() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return cloneDefaults();
    }
  }

  function scheduleSave(message = 'salvo automaticamente') {
    clearTimeout(saveTimer);
    saveState.textContent = 'salvando…';
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        saveState.textContent = message;
      } catch {
        saveState.textContent = 'não foi possível salvar';
      }
    }, 90);
  }

  function cellPoint(position, button) {
    const rect = controls.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const halfW = Math.max(34, buttonRect.width / 2);
    const halfH = Math.max(34, buttonRect.height / 2);
    const padX = Math.min(rect.width * 0.18, halfW + 8);
    const padY = Math.min(rect.height * 0.26, halfH + 7);
    const usableW = Math.max(1, rect.width - padX * 2);
    const usableH = Math.max(1, rect.height - padY * 2);
    const x = state.cols <= 1 ? rect.width / 2 : padX + (position.c / (state.cols - 1)) * usableW;
    const y = state.rows <= 1 ? rect.height / 2 : padY + (position.r / (state.rows - 1)) * usableH;
    return { x, y };
  }

  function applyLayout() {
    document.documentElement.style.setProperty('--grid-cols', String(state.cols));
    document.documentElement.style.setProperty('--grid-rows', String(state.rows));
    colsInput.value = String(state.cols);
    rowsInput.value = String(state.rows);
    sizeInput.value = String(state.size);
    colsValue.textContent = String(state.cols);
    rowsValue.textContent = String(state.rows);
    sizeValue.textContent = state.size + '%';

    for (const button of buttons) {
      const key = button.dataset.key;
      const position = state.positions[key] || DEFAULTS.positions[key];
      const point = cellPoint(position, button);
      button.style.left = point.x + 'px';
      button.style.top = point.y + 'px';
      button.style.transform = `translate(-50%, -50%) scale(${state.size / 100})`;
      button.dataset.gridC = String(position.c);
      button.dataset.gridR = String(position.r);
    }
  }

  function closestCell(clientX, clientY, button) {
    const rect = controls.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const halfW = Math.max(34, buttonRect.width / 2);
    const halfH = Math.max(34, buttonRect.height / 2);
    const padX = Math.min(rect.width * 0.18, halfW + 8);
    const padY = Math.min(rect.height * 0.26, halfH + 7);
    const usableW = Math.max(1, rect.width - padX * 2);
    const usableH = Math.max(1, rect.height - padY * 2);
    const localX = clamp(clientX - rect.left, padX, rect.width - padX);
    const localY = clamp(clientY - rect.top, padY, rect.height - padY);
    const c = state.cols <= 1 ? 0 : Math.round(((localX - padX) / usableW) * (state.cols - 1));
    const r = state.rows <= 1 ? 0 : Math.round(((localY - padY) / usableH) * (state.rows - 1));
    return { c: clamp(c, 0, state.cols - 1), r: clamp(r, 0, state.rows - 1) };
  }

  function moveButtonTo(key, target) {
    const current = state.positions[key];
    const occupiedKey = Object.keys(state.positions).find((other) => {
      if (other === key) return false;
      const p = state.positions[other];
      return p.c === target.c && p.r === target.r;
    });
    if (occupiedKey) state.positions[occupiedKey] = { ...current };
    state.positions[key] = { ...target };
  }

  function openEditor() {
    if (editing) return;
    editing = true;
    resumeAfterEdit = false;
    if (overlay && getComputedStyle(overlay).display === 'none' && pauseButton && pauseButton.textContent.includes('Ⅱ')) {
      pauseButton.click();
      resumeAfterEdit = true;
    }
    editor.hidden = false;
    controls.classList.add('editing');
    buttons.forEach((button) => button.classList.remove('on'));
    applyLayout();
  }

  function finishDrag() {
    if (!dragged) return;
    dragged.classList.remove('dragging');
    dragged = null;
    activePointer = null;
    scheduleSave();
  }

  function closeControlEditor() {
    finishDrag();
    editing = false;
    editor.hidden = true;
    controls.classList.remove('editing');
    if (resumeAfterEdit && pauseButton) pauseButton.click();
    resumeAfterEdit = false;
  }

  function resizeGrid() {
    state.cols = Number(colsInput.value);
    state.rows = Number(rowsInput.value);
    for (const key of Object.keys(state.positions)) {
      state.positions[key].c = clamp(state.positions[key].c, 0, state.cols - 1);
      state.positions[key].r = clamp(state.positions[key].r, 0, state.rows - 1);
    }
    applyLayout();
    scheduleSave();
  }

  function resizeButtons() {
    state.size = Number(sizeInput.value);
    applyLayout();
    scheduleSave();
  }

  function resetLayout() {
    state = cloneDefaults();
    applyLayout();
    scheduleSave('padrão restaurado');
  }

  function beginDrag(event, button) {
    if (!editing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dragged = button;
    activePointer = event.pointerId;
    button.classList.add('dragging');
    button.setPointerCapture?.(event.pointerId);
  }

  function dragMove(event) {
    if (!editing || !dragged || event.pointerId !== activePointer) return;
    event.preventDefault();
    const target = closestCell(event.clientX, event.clientY, dragged);
    moveButtonTo(dragged.dataset.key, target);
    applyLayout();
  }

  function dragEnd(event) {
    if (!editing || !dragged || event.pointerId !== activePointer) return;
    event.preventDefault();
    finishDrag();
  }

  for (const button of buttons) {
    button.addEventListener('pointerdown', (event) => beginDrag(event, button), true);
    button.addEventListener('pointermove', dragMove, true);
    button.addEventListener('pointerup', dragEnd, true);
    button.addEventListener('pointercancel', dragEnd, true);
  }

  controls.addEventListener('pointerdown', (event) => {
    if (editing) event.preventDefault();
  });

  openTop?.addEventListener('click', openEditor);
  openMenu?.addEventListener('click', openEditor);
  closeEditor?.addEventListener('click', closeControlEditor);
  resetButton?.addEventListener('click', resetLayout);
  colsInput?.addEventListener('input', resizeGrid);
  rowsInput?.addEventListener('input', resizeGrid);
  sizeInput?.addEventListener('input', resizeButtons);
  window.addEventListener('resize', applyLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyLayout, 120));

  applyLayout();
})();
