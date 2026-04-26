const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const coinLabel = document.getElementById("coinLabel");
const crewLabel = document.getElementById("crewLabel");
const blockLabel = document.getElementById("blockLabel");
const statusLabel = document.getElementById("statusLabel");
const hotbarButtons = Array.from(document.querySelectorAll(".hotbar-slot"));
const respawnButton = document.getElementById("respawnButton");
const resetButton = document.getElementById("resetButton");
const touchLeftButton = document.getElementById("touchLeft");
const touchRightButton = document.getElementById("touchRight");
const touchJumpButton = document.getElementById("touchJump");
const touchSprintButton = document.getElementById("touchSprint");
const touchMineButton = document.getElementById("touchMine");
const touchPlaceButton = document.getElementById("touchPlace");
const fullscreenButton = document.getElementById("fullscreenButton");
const installButton = document.getElementById("installButton");
const rotatePrompt = document.getElementById("rotatePrompt");
const desktopBlocker = document.getElementById("desktopBlocker");

ctx.imageSmoothingEnabled = false;

const TILE = 32;
const COLS = 220;
const ROWS = 44;
const WORLD_WIDTH = COLS * TILE;
const WORLD_HEIGHT = ROWS * TILE;
const GRAVITY = 1700;
const REACH = TILE * 5.2;

const TILE_IDS = {
  air: 0,
  grass: 1,
  dirt: 2,
  stone: 3,
  wood: 4,
  pad: 5,
  checkpoint: 6,
};

const PLACEABLE = {
  dirt: TILE_IDS.dirt,
  stone: TILE_IDS.stone,
  wood: TILE_IDS.wood,
};

const TILE_TO_ITEM = {
  [TILE_IDS.grass]: "dirt",
  [TILE_IDS.dirt]: "dirt",
  [TILE_IDS.stone]: "stone",
  [TILE_IDS.wood]: "wood",
};

const TILE_COLORS = {
  [TILE_IDS.grass]: {
    face: "#6cae46",
    top: "#94d76c",
    shade: "#4d7f33",
    detail: "#c9f294",
  },
  [TILE_IDS.dirt]: {
    face: "#a46738",
    top: "#c6844a",
    shade: "#7a4a28",
    detail: "#d9ab6a",
  },
  [TILE_IDS.stone]: {
    face: "#8b94a8",
    top: "#b4bfd0",
    shade: "#687284",
    detail: "#dce3f1",
  },
  [TILE_IDS.wood]: {
    face: "#9b6337",
    top: "#b57b48",
    shade: "#6f4323",
    detail: "#dfb26d",
  },
  [TILE_IDS.pad]: {
    face: "#df5353",
    top: "#ffd07d",
    shade: "#9d2525",
    detail: "#fff2c0",
  },
  [TILE_IDS.checkpoint]: {
    face: "#3b7bd4",
    top: "#8ec5ff",
    shade: "#234f8c",
    detail: "#f4fbff",
  },
};

const input = {
  left: false,
  right: false,
  sprint: false,
  jumpHeld: false,
  jumpPressed: false,
  pointer: {
    x: 0,
    y: 0,
    inside: false,
  },
  minePressed: false,
  placePressed: false,
  mineHeld: false,
  placeHeld: false,
  actionRepeatTimer: 0,
};

let game = null;
let lastFrame = 0;
let deferredInstallPrompt = null;

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function isDesktopBlocked() {
  return false;
}

function isCompactMobileViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function isMobilePlayMode() {
  return isTouchDevice() || isCompactMobileViewport();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function approach(value, target, amount) {
  if (value < target) {
    return Math.min(value + amount, target);
  }
  return Math.max(value - amount, target);
}

function rectsIntersect(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function fillTerrainColumn(tiles, col, surfaceRow) {
  for (let row = surfaceRow; row < ROWS; row += 1) {
    if (row === surfaceRow) {
      tiles[row][col] = TILE_IDS.grass;
    } else if (row < surfaceRow + 3) {
      tiles[row][col] = TILE_IDS.dirt;
    } else {
      tiles[row][col] = TILE_IDS.stone;
    }
  }
}

function getTile(state, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return TILE_IDS.air;
  }
  return state.tiles[row][col];
}

function setTile(state, col, row, tileId) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    return;
  }
  state.tiles[row][col] = tileId;
}

function isSolidTile(tileId) {
  return tileId !== TILE_IDS.air;
}

function isBreakableTile(tileId) {
  return (
    tileId === TILE_IDS.grass ||
    tileId === TILE_IDS.dirt ||
    tileId === TILE_IDS.stone ||
    tileId === TILE_IDS.wood
  );
}

function isPlayerInsideTile(player, col, row) {
  return rectsIntersect(player, {
    x: col * TILE,
    y: row * TILE,
    width: TILE,
    height: TILE,
  });
}

function make2DArray(rows, cols, fillValue) {
  return Array.from({ length: rows }, () => Array(cols).fill(fillValue));
}

function addPlatform(state, startCol, endCol, row, tileId) {
  for (let col = startCol; col <= endCol; col += 1) {
    setTile(state, col, row, tileId);
  }
}

function addPillar(state, col, topRow, bottomRow, tileId) {
  for (let row = topRow; row <= bottomRow; row += 1) {
    setTile(state, col, row, tileId);
  }
}

function carvePit(state, surfaceHeights, startCol, endCol, topRow) {
  for (let col = startCol; col <= endCol; col += 1) {
    for (let row = topRow; row < ROWS; row += 1) {
      setTile(state, col, row, TILE_IDS.air);
    }
    surfaceHeights[col] = ROWS + 2;
  }
}

function addCoin(state, col, row) {
  state.coins.push({
    x: col * TILE + TILE * 0.5,
    y: row * TILE + TILE * 0.5,
    collected: false,
    bobOffset: state.coins.length * 0.4,
  });
}

function addCrewMember(state, config) {
  state.crewMembers.push({
    id: config.id,
    name: config.name,
    line: config.line,
    x: config.col * TILE + 4,
    y: config.standRow * TILE - 44,
    width: 24,
    height: 44,
    palette: config.palette,
    phase: state.crewMembers.length * 0.6,
    facing: config.facing ?? 1,
    met: false,
  });
}

function addTree(state, col, surfaceRow, height) {
  for (let row = surfaceRow - height; row < surfaceRow; row += 1) {
    setTile(state, col, row, TILE_IDS.wood);
  }
  state.trees.push({
    x: col * TILE + TILE * 0.5,
    y: (surfaceRow - height) * TILE,
    radius: TILE * (1.2 + Math.random() * 0.25),
  });
}

function smoothRange(array, start, end, baseValue) {
  for (let col = start; col <= end; col += 1) {
    array[col] = baseValue;
  }
}

function resetPlayerToSpawn(state, preserveVelocity = false) {
  const player = state.player;
  player.x = state.spawn.x;
  player.y = state.spawn.y;
  player.vx = preserveVelocity ? player.vx : 0;
  player.vy = 0;
  player.onGround = false;
  player.coyoteTimer = 0;
  player.jumpBuffer = 0;
  player.padCooldown = 0;
}

function setStatus(state, text, duration = 2.4) {
  state.statusText = text;
  state.statusTimer = duration;
}

function createNewGame() {
  const rngSeed = Math.floor(Math.random() * 1000000);
  const rng = createRng(rngSeed);
  const state = {
    rngSeed,
    rng,
    time: 0,
    tiles: make2DArray(ROWS, COLS, TILE_IDS.air),
    coins: [],
    crewMembers: [],
    trees: [],
    portal: {
      x: 212 * TILE,
      y: 20 * TILE,
      width: TILE * 2.4,
      height: TILE * 3.4,
      open: false,
    },
    camera: {
      x: 0,
      y: 0,
    },
    inventory: {
      dirt: 18,
      stone: 10,
      wood: 14,
    },
    selectedBlock: "dirt",
    totalCoins: 0,
    collectedCoins: 0,
    metCrewCount: 0,
    activeCrew: null,
    statusText: "Explore the world, gather every stud, and meet the crew.",
    statusTimer: 4,
    activeCheckpoint: null,
    won: false,
    hoverTile: null,
    spawn: {
      x: 0,
      y: 0,
    },
    player: {
      x: 0,
      y: 0,
      width: 24,
      height: 44,
      vx: 0,
      vy: 0,
      onGround: false,
      coyoteTimer: 0,
      jumpBuffer: 0,
      facing: 1,
      walkTime: 0,
      padCooldown: 0,
    },
  };

  const surfaceHeights = Array.from({ length: COLS }, (_, col) => {
    const base =
      31 +
      Math.round(Math.sin(col * 0.17) * 1.5 + Math.sin(col * 0.052 + 1.2) * 2);
    return clamp(base + Math.round((rng() - 0.5) * 2), 27, 35);
  });

  smoothRange(surfaceHeights, 0, 15, 31);
  smoothRange(surfaceHeights, 16, 30, 30);
  smoothRange(surfaceHeights, 31, 45, 32);
  smoothRange(surfaceHeights, 56, 72, 31);
  smoothRange(surfaceHeights, 101, 115, 30);
  smoothRange(surfaceHeights, 116, 135, 29);
  smoothRange(surfaceHeights, 164, 175, 30);
  smoothRange(surfaceHeights, 176, 205, 31);
  smoothRange(surfaceHeights, 206, 219, 30);

  for (let col = 0; col < COLS; col += 1) {
    fillTerrainColumn(state.tiles, col, surfaceHeights[col]);
  }

  addTree(state, 12, surfaceHeights[12], 4);
  addTree(state, 24, surfaceHeights[24], 5);
  addTree(state, 33, surfaceHeights[33], 4);
  addTree(state, 74, surfaceHeights[74], 5);
  addTree(state, 138, surfaceHeights[138], 5);

  carvePit(state, surfaceHeights, 46, 55, 24);
  addPlatform(state, 48, 49, 25, TILE_IDS.wood);
  addPlatform(state, 52, 53, 23, TILE_IDS.wood);
  setTile(state, 44, surfaceHeights[44], TILE_IDS.pad);

  setTile(state, 60, surfaceHeights[60], TILE_IDS.checkpoint);
  addPlatform(state, 67, 69, 26, TILE_IDS.stone);
  addPlatform(state, 70, 72, 24, TILE_IDS.wood);

  carvePit(state, surfaceHeights, 91, 100, 22);
  addPlatform(state, 93, 94, 27, TILE_IDS.stone);
  addPlatform(state, 96, 97, 24, TILE_IDS.stone);
  addPlatform(state, 99, 100, 21, TILE_IDS.wood);
  setTile(state, 88, surfaceHeights[88], TILE_IDS.pad);
  addPillar(state, 106, 24, surfaceHeights[106] - 1, TILE_IDS.stone);
  addPillar(state, 107, 22, surfaceHeights[107] - 1, TILE_IDS.stone);
  addPillar(state, 108, 20, surfaceHeights[108] - 1, TILE_IDS.stone);

  addPillar(state, 121, 21, surfaceHeights[121] - 1, TILE_IDS.stone);
  addPillar(state, 122, 20, surfaceHeights[122] - 1, TILE_IDS.stone);
  addPillar(state, 123, 22, surfaceHeights[123] - 1, TILE_IDS.stone);
  addPlatform(state, 126, 128, 24, TILE_IDS.wood);
  setTile(state, 129, surfaceHeights[129], TILE_IDS.checkpoint);

  carvePit(state, surfaceHeights, 151, 163, 25);
  addPlatform(state, 152, 153, 28, TILE_IDS.wood);
  addPlatform(state, 156, 157, 26, TILE_IDS.wood);
  addPlatform(state, 160, 161, 24, TILE_IDS.stone);
  setTile(state, 149, surfaceHeights[149], TILE_IDS.pad);
  setTile(state, 166, surfaceHeights[166], TILE_IDS.checkpoint);

  addPlatform(state, 172, 174, 28, TILE_IDS.wood);
  addPlatform(state, 176, 178, 26, TILE_IDS.wood);
  addPlatform(state, 180, 182, 24, TILE_IDS.stone);
  addPlatform(state, 185, 187, 22, TILE_IDS.stone);
  addPlatform(state, 190, 193, 20, TILE_IDS.wood);
  addPlatform(state, 197, 200, 18, TILE_IDS.stone);
  addPillar(state, 205, 20, surfaceHeights[205] - 1, TILE_IDS.stone);
  addPillar(state, 206, 18, surfaceHeights[206] - 1, TILE_IDS.stone);
  addPillar(state, 207, 16, surfaceHeights[207] - 1, TILE_IDS.stone);
  addPlatform(state, 209, 214, 20, TILE_IDS.stone);

  addCoin(state, 10, 27);
  addCoin(state, 24, 24);
  addCoin(state, 34, 25);
  addCoin(state, 49, 21);
  addCoin(state, 53, 19);
  addCoin(state, 60, 27);
  addCoin(state, 73, 22);
  addCoin(state, 94, 24);
  addCoin(state, 97, 21);
  addCoin(state, 108, 17);
  addCoin(state, 127, 21);
  addCoin(state, 157, 22);
  addCoin(state, 181, 19);
  addCoin(state, 193, 15);
  addCoin(state, 212, 16);

  addCrewMember(state, {
    id: "luffy",
    name: "Luffy",
    col: 9,
    standRow: surfaceHeights[9],
    line: "Break blocks, build bridges, and race me to that portal!",
    palette: {
      skin: "#f1c6a4",
      shirt: "#ca4030",
      pants: "#3556ae",
      hair: "#141926",
      hat: "#d5a23f",
      accent: "#f6e9bd",
    },
  });

  addCrewMember(state, {
    id: "chopper",
    name: "Chopper",
    col: 24,
    standRow: surfaceHeights[24],
    line: "Need extra wood? Mine the grove and stack your own path.",
    palette: {
      skin: "#8b5f41",
      shirt: "#5fa0d8",
      pants: "#9f6a45",
      hair: "#5f3f2b",
      hat: "#f18bb3",
      accent: "#fff4f8",
    },
  });

  addCrewMember(state, {
    id: "nami",
    name: "Nami",
    col: 60,
    standRow: surfaceHeights[60],
    line: "Collect every stud. The portal will not open without them.",
    palette: {
      skin: "#f0c39b",
      shirt: "#4fb7b7",
      pants: "#f4f1e4",
      hair: "#df7a36",
      hat: "#df7a36",
      accent: "#fff0d8",
    },
  });

  addCrewMember(state, {
    id: "zoro",
    name: "Zoro",
    col: 118,
    standRow: surfaceHeights[118],
    line: "That stone wall has a shortcut. Cut through or climb over it.",
    palette: {
      skin: "#e6c2a2",
      shirt: "#f2f4f7",
      pants: "#1c7a4f",
      hair: "#49b75f",
      hat: "#49b75f",
      accent: "#cdeed5",
    },
  });

  addCrewMember(state, {
    id: "sanji",
    name: "Sanji",
    col: 166,
    standRow: surfaceHeights[166],
    line: "Clean jumps and sprint timing will carry you through the last obby.",
    palette: {
      skin: "#f1cfb0",
      shirt: "#1d2a45",
      pants: "#1b2334",
      hair: "#e5c15a",
      hat: "#e5c15a",
      accent: "#f9e4a0",
    },
    facing: -1,
  });

  state.totalCoins = state.coins.length;

  state.spawn.x = TILE * 5;
  state.spawn.y = (surfaceHeights[5] - 2) * TILE - state.player.height;
  resetPlayerToSpawn(state);
  state.camera.x = 0;
  state.camera.y = clamp(state.player.y - canvas.height * 0.45, 0, WORLD_HEIGHT - canvas.height);

  return state;
}

function getWorldPointerPosition() {
  return {
    x: input.pointer.x + game.camera.x,
    y: input.pointer.y + game.camera.y,
  };
}

function tileDistanceFromPlayer(state, col, row) {
  const playerCenterX = state.player.x + state.player.width * 0.5;
  const playerCenterY = state.player.y + state.player.height * 0.45;
  const tileCenterX = col * TILE + TILE * 0.5;
  const tileCenterY = row * TILE + TILE * 0.5;
  return Math.hypot(tileCenterX - playerCenterX, tileCenterY - playerCenterY);
}

function hasSolidNeighbor(state, col, row) {
  const neighbors = [
    [col - 1, row],
    [col + 1, row],
    [col, row - 1],
    [col, row + 1],
  ];

  return neighbors.some(([neighborCol, neighborRow]) =>
    isSolidTile(getTile(state, neighborCol, neighborRow)),
  );
}

function updateHoverTile(state) {
  if (!input.pointer.inside) {
    state.hoverTile = null;
    return;
  }

  const worldPoint = getWorldPointerPosition();
  const col = Math.floor(worldPoint.x / TILE);
  const row = Math.floor(worldPoint.y / TILE);

  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) {
    state.hoverTile = null;
    return;
  }

  state.hoverTile = {
    col,
    row,
    reachable: tileDistanceFromPlayer(state, col, row) <= REACH,
  };
}

function mineHoveredBlock(state) {
  const hover = state.hoverTile;
  if (!hover || !hover.reachable) {
    return;
  }

  const tileId = getTile(state, hover.col, hover.row);
  if (!isBreakableTile(tileId)) {
    return;
  }

  if (isPlayerInsideTile(state.player, hover.col, hover.row)) {
    return;
  }

  setTile(state, hover.col, hover.row, TILE_IDS.air);
  const itemKey = TILE_TO_ITEM[tileId];
  state.inventory[itemKey] += 1;
  setStatus(state, `Mined ${itemKey}. Build a shortcut with it.`);
}

function placeHoveredBlock(state) {
  const hover = state.hoverTile;
  if (!hover || !hover.reachable) {
    return;
  }

  if (getTile(state, hover.col, hover.row) !== TILE_IDS.air) {
    return;
  }

  if (state.inventory[state.selectedBlock] <= 0) {
    setStatus(state, `Out of ${state.selectedBlock}. Mine more blocks first.`, 2.2);
    return;
  }

  if (!hasSolidNeighbor(state, hover.col, hover.row)) {
    setStatus(state, "Place blocks next to existing terrain or platforms.", 2.2);
    return;
  }

  const blockTile = PLACEABLE[state.selectedBlock];
  setTile(state, hover.col, hover.row, blockTile);

  if (isPlayerInsideTile(state.player, hover.col, hover.row)) {
    setTile(state, hover.col, hover.row, TILE_IDS.air);
    return;
  }

  state.inventory[state.selectedBlock] -= 1;
  setStatus(state, `${state.selectedBlock[0].toUpperCase()}${state.selectedBlock.slice(1)} placed.`);
}

function activateCheckpoint(state, col, row) {
  const checkpointId = `${col}:${row}`;
  if (state.activeCheckpoint === checkpointId) {
    return;
  }

  state.activeCheckpoint = checkpointId;
  state.spawn.x = col * TILE + (TILE - state.player.width) * 0.5;
  state.spawn.y = row * TILE - state.player.height - 2;
  setStatus(state, "Checkpoint saved. If you fall, you respawn here.", 2.6);
}

function handleSpecialTiles(state) {
  const player = state.player;
  const footRow = Math.floor((player.y + player.height + 2) / TILE);
  const footLeft = Math.floor((player.x + 4) / TILE);
  const footRight = Math.floor((player.x + player.width - 4) / TILE);

  for (let col = footLeft; col <= footRight; col += 1) {
    const tileId = getTile(state, col, footRow);
    if (tileId === TILE_IDS.pad && player.onGround && player.padCooldown <= 0) {
      player.vy = -820;
      player.onGround = false;
      player.padCooldown = 0.32;
      setStatus(state, "Jump pad boost!");
    }

    if (tileId === TILE_IDS.checkpoint) {
      activateCheckpoint(state, col, footRow);
    }
  }
}

function respawnPlayer(state) {
  resetPlayerToSpawn(state);
  setStatus(state, "Respawned at your last checkpoint.", 2);
}

function resolveHorizontalCollisions(state) {
  const player = state.player;
  const startCol = Math.floor(player.x / TILE);
  const endCol = Math.floor((player.x + player.width) / TILE);
  const startRow = Math.floor((player.y + 4) / TILE);
  const endRow = Math.floor((player.y + player.height - 4) / TILE);

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (!isSolidTile(getTile(state, col, row))) {
        continue;
      }

      const tileRect = {
        x: col * TILE,
        y: row * TILE,
        width: TILE,
        height: TILE,
      };

      if (!rectsIntersect(player, tileRect)) {
        continue;
      }

      if (player.vx > 0) {
        player.x = tileRect.x - player.width;
      } else if (player.vx < 0) {
        player.x = tileRect.x + tileRect.width;
      }
      player.vx = 0;
    }
  }

  player.x = clamp(player.x, 0, WORLD_WIDTH - player.width);
}

function resolveVerticalCollisions(state) {
  const player = state.player;
  const startCol = Math.floor((player.x + 2) / TILE);
  const endCol = Math.floor((player.x + player.width - 2) / TILE);
  const startRow = Math.floor(player.y / TILE);
  const endRow = Math.floor((player.y + player.height) / TILE);

  player.onGround = false;

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (!isSolidTile(getTile(state, col, row))) {
        continue;
      }

      const tileRect = {
        x: col * TILE,
        y: row * TILE,
        width: TILE,
        height: TILE,
      };

      if (!rectsIntersect(player, tileRect)) {
        continue;
      }

      if (player.vy > 0) {
        player.y = tileRect.y - player.height;
        player.vy = 0;
        player.onGround = true;
        player.coyoteTimer = 0.12;
      } else if (player.vy < 0) {
        player.y = tileRect.y + tileRect.height;
        player.vy = 0;
      }
    }
  }
}

function updatePlayer(state, dt) {
  const player = state.player;
  const mobileMode = isMobilePlayMode();
  const moveDirection = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const usingSprint = input.sprint || (mobileMode && moveDirection !== 0);
  const targetSpeed = moveDirection * (usingSprint ? (mobileMode ? 272 : 255) : (mobileMode ? 206 : 190));
  const acceleration = player.onGround ? (mobileMode ? 2550 : 2100) : (mobileMode ? 1620 : 1350);
  const friction = player.onGround ? (mobileMode ? 2900 : 2400) : 520;

  if (moveDirection !== 0) {
    player.vx = approach(player.vx, targetSpeed, acceleration * dt);
    player.facing = moveDirection;
  } else {
    player.vx = approach(player.vx, 0, friction * dt);
  }

  player.coyoteTimer = Math.max(0, player.coyoteTimer - dt);
  player.padCooldown = Math.max(0, player.padCooldown - dt);
  player.jumpBuffer = input.jumpPressed ? 0.14 : Math.max(0, player.jumpBuffer - dt);

  const wantsJump = player.jumpBuffer > 0;
  if (wantsJump && (player.onGround || player.coyoteTimer > 0)) {
    player.vy = mobileMode ? -540 : -520;
    player.onGround = false;
    player.jumpBuffer = 0;
    player.coyoteTimer = 0;
  }

  if (!input.jumpHeld && player.vy < -160) {
    player.vy += GRAVITY * 0.85 * dt;
  }

  player.vy += GRAVITY * dt;
  player.x += player.vx * dt;
  resolveHorizontalCollisions(state);
  player.y += player.vy * dt;
  resolveVerticalCollisions(state);
  handleSpecialTiles(state);

  if (player.onGround && moveDirection !== 0) {
    player.walkTime += dt * (usingSprint ? 1.7 : 1.15);
  }

  if (player.y > WORLD_HEIGHT + TILE * 4) {
    respawnPlayer(state);
  }
}

function updateCoins(state) {
  const player = state.player;
  for (const coin of state.coins) {
    if (coin.collected) {
      continue;
    }

    const dx = player.x + player.width * 0.5 - coin.x;
    const dy = player.y + player.height * 0.5 - coin.y;
    if (Math.hypot(dx, dy) < TILE * 0.72) {
      coin.collected = true;
      state.collectedCoins += 1;
      setStatus(state, "Stud collected.", 1.4);
    }
  }
}

function updateCrewEncounters(state) {
  const player = state.player;
  state.activeCrew = null;

  for (const crewMember of state.crewMembers) {
    const expanded = {
      x: crewMember.x - 14,
      y: crewMember.y - 6,
      width: crewMember.width + 28,
      height: crewMember.height + 18,
    };

    if (rectsIntersect(player, expanded)) {
      state.activeCrew = crewMember;
      if (!crewMember.met) {
        crewMember.met = true;
        state.metCrewCount += 1;
        setStatus(state, `${crewMember.name} joined your run.`, 2.3);
      }
      break;
    }
  }
}

function updatePortal(state) {
  state.portal.open = state.collectedCoins >= state.totalCoins;

  if (!state.portal.open || state.won) {
    return;
  }

  const player = state.player;
  const portalRect = {
    x: state.portal.x,
    y: state.portal.y,
    width: state.portal.width,
    height: state.portal.height,
  };

  if (rectsIntersect(player, portalRect)) {
    state.won = true;
    setStatus(state, "Portal cleared. Run complete!", 6);
  }
}

function updateCamera(state, dt) {
  const targetX = clamp(
    state.player.x + state.player.width * 0.5 - canvas.width * 0.5,
    0,
    Math.max(0, WORLD_WIDTH - canvas.width),
  );
  const targetY = clamp(
    state.player.y + state.player.height * 0.45 - canvas.height * 0.55,
    0,
    Math.max(0, WORLD_HEIGHT - canvas.height),
  );

  state.camera.x = lerp(state.camera.x, targetX, Math.min(1, dt * 6));
  state.camera.y = lerp(state.camera.y, targetY, Math.min(1, dt * 5));
}

function updateHUD(state) {
  if (coinLabel) {
    coinLabel.textContent = `Studs: ${state.collectedCoins} / ${state.totalCoins}`;
  }
  if (crewLabel) {
    crewLabel.textContent = `Crew: ${state.metCrewCount} / ${state.crewMembers.length}`;
  }
  if (blockLabel) {
    blockLabel.textContent = `Blocks: Dirt ${state.inventory.dirt} | Stone ${state.inventory.stone} | Wood ${state.inventory.wood}`;
  }
  if (statusLabel) {
    statusLabel.textContent = `Status: ${state.statusText}`;
  }
}

function drawSky(state) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#9ad8f1");
  gradient.addColorStop(0.55, "#d1f0fd");
  gradient.addColorStop(1, "#fff2d8");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255, 244, 188, 0.7)";
  ctx.beginPath();
  ctx.arc(canvas.width * 0.18, canvas.height * 0.18, canvas.width * 0.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (let index = 0; index < 5; index += 1) {
    const x = ((index * 280 + state.time * 18) % (canvas.width + 220)) - 110;
    const y = 86 + index * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, 62, 20, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 34, y - 8, 48, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 32, y - 4, 42, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTile(col, row, tileId, state) {
  const palette = TILE_COLORS[tileId];
  const x = col * TILE - state.camera.x;
  const y = row * TILE - state.camera.y;

  if (x + TILE < 0 || x > canvas.width || y + TILE < 0 || y > canvas.height) {
    return;
  }

  ctx.fillStyle = palette.face;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = palette.top;
  ctx.fillRect(x, y, TILE, 8);
  ctx.fillStyle = palette.shade;
  ctx.fillRect(x, y + TILE - 6, TILE, 6);
  ctx.fillStyle = palette.detail;
  ctx.fillRect(x + 6, y + 12, 4, 4);
  ctx.fillRect(x + 18, y + 20, 4, 4);

  if (tileId === TILE_IDS.checkpoint) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 8, y + 8, TILE - 16, TILE - 16);
  }
}

function drawWorld(state) {
  const startCol = Math.max(0, Math.floor(state.camera.x / TILE) - 1);
  const endCol = Math.min(COLS - 1, Math.ceil((state.camera.x + canvas.width) / TILE) + 1);
  const startRow = Math.max(0, Math.floor(state.camera.y / TILE) - 1);
  const endRow = Math.min(ROWS - 1, Math.ceil((state.camera.y + canvas.height) / TILE) + 1);

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const tileId = state.tiles[row][col];
      if (tileId === TILE_IDS.air) {
        continue;
      }
      drawTile(col, row, tileId, state);
    }
  }

  for (const tree of state.trees) {
    const x = tree.x - state.camera.x;
    const y = tree.y - state.camera.y;
    ctx.fillStyle = "rgba(77, 127, 51, 0.82)";
    ctx.beginPath();
    ctx.arc(x, y + 18, tree.radius, 0, Math.PI * 2);
    ctx.arc(x - tree.radius * 0.55, y + 34, tree.radius * 0.72, 0, Math.PI * 2);
    ctx.arc(x + tree.radius * 0.55, y + 34, tree.radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCoins(state) {
  for (const coin of state.coins) {
    if (coin.collected) {
      continue;
    }
    const x = coin.x - state.camera.x;
    const y = coin.y - state.camera.y + Math.sin(state.time * 4 + coin.bobOffset) * 4;
    ctx.fillStyle = "#ffbf3a";
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(x - 3, y - 7, 6, 14);
  }
}

function drawCrewMembers(state) {
  for (const crewMember of state.crewMembers) {
    const x = crewMember.x - state.camera.x;
    const y = crewMember.y - state.camera.y + Math.sin(state.time * 2.6 + crewMember.phase) * 2;
    const swing = Math.sin(state.time * 4 + crewMember.phase) * 2;

    ctx.save();

    if (crewMember.facing < 0) {
      ctx.translate(x + crewMember.width * 0.5, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(x + crewMember.width * 0.5), 0);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(x + 1, y + crewMember.height + 2, crewMember.width - 2, 5);

    if (crewMember.id === "chopper") {
      ctx.fillStyle = crewMember.palette.skin;
      ctx.fillRect(x + 4, y + 10, 16, 10);
      ctx.fillRect(x + 6, y + 20, 12, 11);
      ctx.fillStyle = crewMember.palette.shirt;
      ctx.fillRect(x + 5, y + 23, 14, 10);
      ctx.fillStyle = crewMember.palette.pants;
      ctx.fillRect(x + 6, y + 33, 5, 9);
      ctx.fillRect(x + 14, y + 33, 5, 9);
      ctx.fillStyle = crewMember.palette.hat;
      ctx.fillRect(x + 3, y + 3, 18, 10);
      ctx.fillStyle = crewMember.palette.accent;
      ctx.fillRect(x + 10, y + 5, 4, 6);
      ctx.fillRect(x + 8, y + 7, 8, 2);
      ctx.fillStyle = "#6a4531";
      ctx.fillRect(x + 1, y + 8, 4, 8);
      ctx.fillRect(x + 19, y + 8, 4, 8);
    } else {
      ctx.fillStyle = crewMember.palette.skin;
      ctx.fillRect(x + 4, y + 2, 16, 16);
      ctx.fillStyle = crewMember.palette.shirt;
      ctx.fillRect(x + 3, y + 18, 18, 14);
      ctx.fillRect(x + 0, y + 18 + swing * 0.18, 4, 12);
      ctx.fillRect(x + 20, y + 18 - swing * 0.18, 4, 12);
      ctx.fillStyle = crewMember.palette.pants;
      ctx.fillRect(x + 5, y + 32 + swing * 0.22, 5, 12);
      ctx.fillRect(x + 14, y + 32 - swing * 0.22, 5, 12);
      ctx.fillStyle = crewMember.palette.hair;
      ctx.fillRect(x + 4, y + 0, 16, 6);

      if (crewMember.id === "luffy") {
        ctx.fillStyle = crewMember.palette.accent;
        ctx.fillRect(x + 2, y + 4, 20, 3);
        ctx.fillStyle = crewMember.palette.hat;
        ctx.fillRect(x + 5, y - 2, 14, 7);
      } else if (crewMember.id === "nami") {
        ctx.fillRect(x + 2, y + 4, 4, 13);
        ctx.fillRect(x + 18, y + 4, 4, 13);
      } else if (crewMember.id === "zoro") {
        ctx.fillStyle = "#234a35";
        ctx.fillRect(x + 12, y + 19, 4, 13);
      } else if (crewMember.id === "sanji") {
        ctx.fillStyle = crewMember.palette.accent;
        ctx.fillRect(x + 10, y + 20, 3, 10);
        ctx.fillStyle = crewMember.palette.hair;
        ctx.fillRect(x + 3, y + 3, 9, 6);
      }
    }

    ctx.restore();

    ctx.fillStyle = "rgba(20, 28, 42, 0.72)";
    ctx.fillRect(x - 8, y - 18, 54, 14);
    ctx.fillStyle = "#fff5dd";
    ctx.font = '700 11px "Trebuchet MS", sans-serif';
    ctx.fillText(crewMember.name, x - 3, y - 7);
  }
}

function wrapBubbleText(text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawCrewDialogue(state) {
  if (!state.activeCrew) {
    return;
  }

  const crewMember = state.activeCrew;
  const anchorX = crewMember.x - state.camera.x + crewMember.width * 0.5;
  const anchorY = crewMember.y - state.camera.y - 12;

  ctx.font = '400 14px "Trebuchet MS", sans-serif';
  const lines = wrapBubbleText(crewMember.line, 240);
  const bubbleWidth = 268;
  const bubbleHeight = 22 + lines.length * 18;
  const bubbleX = clamp(anchorX - bubbleWidth * 0.5, 20, canvas.width - bubbleWidth - 20);
  const bubbleY = Math.max(16, anchorY - bubbleHeight - 12);

  ctx.fillStyle = "rgba(21, 27, 39, 0.82)";
  ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.strokeRect(bubbleX + 0.5, bubbleY + 0.5, bubbleWidth - 1, bubbleHeight - 1);

  const pointerX = clamp(anchorX, bubbleX + 18, bubbleX + bubbleWidth - 18);
  ctx.beginPath();
  ctx.moveTo(pointerX - 10, bubbleY + bubbleHeight);
  ctx.lineTo(pointerX + 10, bubbleY + bubbleHeight);
  ctx.lineTo(anchorX, anchorY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffefbf";
  ctx.font = '700 13px "Trebuchet MS", sans-serif';
  ctx.fillText(crewMember.name, bubbleX + 14, bubbleY + 18);

  ctx.fillStyle = "#fffaf0";
  ctx.font = '400 14px "Trebuchet MS", sans-serif';
  lines.forEach((line, index) => {
    ctx.fillText(line, bubbleX + 14, bubbleY + 38 + index * 17);
  });
}

function drawPortal(state) {
  const x = state.portal.x - state.camera.x;
  const y = state.portal.y - state.camera.y;
  const glowAlpha = state.portal.open ? 0.85 : 0.26;

  ctx.fillStyle = "#5d6679";
  ctx.fillRect(x - 10, y + 8, 12, state.portal.height);
  ctx.fillRect(x + state.portal.width - 2, y + 8, 12, state.portal.height);
  ctx.fillRect(x - 10, y, state.portal.width + 20, 14);

  const glow = ctx.createRadialGradient(
    x + state.portal.width * 0.5,
    y + state.portal.height * 0.5,
    10,
    x + state.portal.width * 0.5,
    y + state.portal.height * 0.5,
    74,
  );
  if (state.portal.open) {
    glow.addColorStop(0, `rgba(114, 255, 232, ${glowAlpha})`);
    glow.addColorStop(1, "rgba(114, 255, 232, 0)");
  } else {
    glow.addColorStop(0, `rgba(255, 129, 85, ${glowAlpha})`);
    glow.addColorStop(1, "rgba(255, 129, 85, 0)");
  }

  ctx.fillStyle = glow;
  ctx.fillRect(x - 36, y - 20, state.portal.width + 72, state.portal.height + 64);

  ctx.fillStyle = state.portal.open ? "#1dc7c0" : "#bc5d3a";
  ctx.fillRect(x + 8, y + 20, state.portal.width - 16, state.portal.height - 18);

  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(x + 14, y + 30, state.portal.width - 28, state.portal.height - 38);
}

function drawPlayer(state) {
  const player = state.player;
  const x = player.x - state.camera.x;
  const y = player.y - state.camera.y;
  const swing = Math.sin(player.walkTime * 10) * 5;

  ctx.save();
  if (player.facing < 0) {
    ctx.translate(x + player.width * 0.5, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + player.width * 0.5), 0);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(x + 1, y + player.height + 2, player.width - 2, 6);

  ctx.fillStyle = "#f4d3b5";
  ctx.fillRect(x + 4, y + 2, 16, 16);

  ctx.fillStyle = "#1c2f54";
  ctx.fillRect(x + 3, y + 18, 18, 14);

  ctx.fillStyle = "#d45c34";
  ctx.fillRect(x + 0, y + 18 + swing * 0.12, 4, 13);
  ctx.fillRect(x + 20, y + 18 - swing * 0.12, 4, 13);

  ctx.fillStyle = "#283042";
  ctx.fillRect(x + 5, y + 32 + swing * 0.14, 5, 12);
  ctx.fillRect(x + 14, y + 32 - swing * 0.14, 5, 12);

  ctx.fillStyle = "#111827";
  ctx.fillRect(x + 5, y + 7, 14, 4);
  ctx.fillStyle = "#2a3447";
  ctx.fillRect(x + 4, y + 0, 16, 5);

  const heldColor = TILE_COLORS[PLACEABLE[state.selectedBlock]].top;
  ctx.fillStyle = heldColor;
  ctx.fillRect(x + 18, y + 22, 7, 7);

  ctx.restore();
}

function drawHover(state) {
  if (!state.hoverTile) {
    return;
  }

  const x = state.hoverTile.col * TILE - state.camera.x;
  const y = state.hoverTile.row * TILE - state.camera.y;

  ctx.lineWidth = 3;
  ctx.strokeStyle = state.hoverTile.reachable ? "rgba(255, 246, 177, 0.95)" : "rgba(255, 98, 98, 0.9)";
  ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
  ctx.fillStyle = state.hoverTile.reachable ? "rgba(255, 246, 177, 0.12)" : "rgba(255, 98, 98, 0.12)";
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
}

function drawCanvasHud(state) {
  const panelWidth = 308;
  const panelHeight = 104;
  const panelX = 20;
  const panelY = 18;

  ctx.fillStyle = "rgba(22, 28, 45, 0.55)";
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

  ctx.fillStyle = "#fff6dc";
  ctx.font = '700 16px "Trebuchet MS", sans-serif';
  ctx.fillText(`Seed ${game.rngSeed}`, panelX + 18, panelY + 24);
  ctx.fillText(`Selected ${state.selectedBlock}`, panelX + 18, panelY + 48);
  ctx.fillText(`Crew ${state.metCrewCount}/${state.crewMembers.length}`, panelX + 18, panelY + 72);
  ctx.font = '400 14px "Trebuchet MS", sans-serif';

  const remaining = state.totalCoins - state.collectedCoins;
  const goalText = state.portal.open
    ? "Portal open: sprint to the finish."
    : `${remaining} stud${remaining === 1 ? "" : "s"} left to unlock the portal.`;
  ctx.fillText(goalText, panelX + 18, panelY + 92);

  if (state.won) {
    ctx.fillStyle = "rgba(15, 25, 37, 0.78)";
    ctx.fillRect(canvas.width * 0.5 - 260, canvas.height * 0.5 - 76, 520, 152);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.strokeRect(canvas.width * 0.5 - 260.5, canvas.height * 0.5 - 75.5, 521, 151);
    ctx.fillStyle = "#fff8e7";
    ctx.font = '700 38px Georgia, serif';
    ctx.fillText("Portal Cleared", canvas.width * 0.5 - 134, canvas.height * 0.5 - 10);
    ctx.font = '400 18px "Trebuchet MS", sans-serif';
    ctx.fillText(
      "You blended building, mining, and obby movement into one run.",
      canvas.width * 0.5 - 214,
      canvas.height * 0.5 + 28,
    );
  }
}

function render(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky(state);
  drawWorld(state);
  drawPortal(state);
  drawCoins(state);
  drawCrewMembers(state);
  drawPlayer(state);
  drawHover(state);
  drawCrewDialogue(state);
  drawCanvasHud(state);
}

function step(timestamp) {
  if (!game) {
    return;
  }

  if (!lastFrame) {
    lastFrame = timestamp;
  }

  const dt = Math.min(0.033, (timestamp - lastFrame) / 1000);
  lastFrame = timestamp;

  game.time += dt;
  game.statusTimer = Math.max(0, game.statusTimer - dt);
  if (game.statusTimer === 0 && !game.won) {
    if (game.portal.open) {
      game.statusText = "Portal open. Head to the glowing gate.";
    } else {
      game.statusText = "Mine blocks, meet the crew, collect studs, and build your path.";
    }
  }

  if (!game.won) {
    updatePlayer(game, dt);
    updateCoins(game);
    updateCrewEncounters(game);
    updatePortal(game);
  }

  updateCamera(game, dt);
  updateHoverTile(game);

  if (input.minePressed) {
    mineHoveredBlock(game);
  }

  if (input.placePressed) {
    placeHoveredBlock(game);
  }

  updateHUD(game);
  render(game);

  input.jumpPressed = false;
  input.minePressed = false;
  input.placePressed = false;

  requestAnimationFrame(step);
}

function selectBlock(blockName) {
  game.selectedBlock = blockName;
  for (const button of hotbarButtons) {
    button.classList.toggle("is-selected", button.dataset.slot === blockName);
  }

  if (navigator.vibrate && isTouchDevice()) {
    navigator.vibrate(12);
  }
}

function setPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  input.pointer.x = (event.clientX - rect.left) * scaleX;
  input.pointer.y = (event.clientY - rect.top) * scaleY;
  input.pointer.inside = true;
}

function setPointerFromClientPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  input.pointer.x = (clientX - rect.left) * scaleX;
  input.pointer.y = (clientY - rect.top) * scaleY;
  input.pointer.inside = true;
}

function triggerJumpPress() {
  if (!input.jumpHeld) {
    input.jumpPressed = true;
  }
  input.jumpHeld = true;
}

function releaseJumpPress() {
  input.jumpHeld = false;
}

function handleCanvasTapAction() {
  if (!game) {
    return;
  }

  updateHoverTile(game);
  const hover = game.hoverTile;
  if (!hover || !hover.reachable) {
    return;
  }

  if (isBreakableTile(getTile(game, hover.col, hover.row))) {
    input.minePressed = true;
  } else {
    input.placePressed = true;
  }
}

function bindHoldButton(button, onPress, onRelease = onPress) {
  if (!button) {
    return;
  }

  const start = (event) => {
    event.preventDefault();
    button.classList.add("is-pressed");
    onPress();
  };

  const end = (event) => {
    event.preventDefault();
    button.classList.remove("is-pressed");
    onRelease();
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", (event) => {
    if (event.buttons === 0) {
      button.classList.remove("is-pressed");
      onRelease();
    }
  });
}

function updateRotatePrompt() {
  if (!rotatePrompt) {
    return;
  }

  if (isDesktopBlocked()) {
    rotatePrompt.classList.remove("is-visible");
    rotatePrompt.setAttribute("aria-hidden", "true");
    return;
  }

  const portraitSmallScreen =
    window.matchMedia("(max-width: 720px)").matches &&
    window.matchMedia("(orientation: portrait)").matches;
  rotatePrompt.classList.toggle("is-visible", portraitSmallScreen);
  rotatePrompt.setAttribute("aria-hidden", portraitSmallScreen ? "false" : "true");
}

function updateDesktopBlocker() {
  if (!desktopBlocker) {
    return;
  }

  const blocked = isDesktopBlocked();
  desktopBlocker.classList.toggle("is-visible", blocked);
  desktopBlocker.setAttribute("aria-hidden", blocked ? "false" : "true");
}

function resizeCanvas() {
  const wrapper = canvas.parentElement;
  if (!wrapper) {
    return;
  }

  const rect = wrapper.getBoundingClientRect();
  const baseWidth = Math.max(320, Math.round(rect.width));
  const baseHeight = Math.max(180, Math.round((baseWidth * 9) / 16));
  const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
  const nextWidth = Math.round(baseWidth * pixelRatio);
  const nextHeight = Math.round(baseHeight * pixelRatio);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    ctx.imageSmoothingEnabled = false;
  }

  if (game) {
    game.camera.y = clamp(game.camera.y, 0, Math.max(0, WORLD_HEIGHT - canvas.height));
  }
}

async function requestFullscreen() {
  const element = document.documentElement;
  const requestMethod =
    element.requestFullscreen ||
    element.webkitRequestFullscreen ||
    element.msRequestFullscreen;

  if (!requestMethod) {
    return;
  }

  try {
    await requestMethod.call(element);
  } catch (_) {
    // Ignore unsupported fullscreen requests.
  }
}

async function maybeInstallGame() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch (_) {
    // Ignore dismissed install prompts.
  }

  deferredInstallPrompt = null;
  if (installButton) {
    installButton.hidden = true;
  }
}

function handleKeyChange(event, isDown) {
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    input.left = isDown;
  }

  if (event.code === "ArrowRight" || event.code === "KeyD") {
    input.right = isDown;
  }

  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    input.sprint = isDown;
  }

  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    if (isDown && !input.jumpHeld) {
      input.jumpPressed = true;
    }
    input.jumpHeld = isDown;
    event.preventDefault();
  }
}

function resetWorld() {
  game = createNewGame();
  selectBlock(game.selectedBlock);
  updateHUD(game);
}

window.addEventListener("keydown", (event) => {
  handleKeyChange(event, true);

  if (event.code === "Digit1") {
    selectBlock("dirt");
  } else if (event.code === "Digit2") {
    selectBlock("stone");
  } else if (event.code === "Digit3") {
    selectBlock("wood");
  } else if (event.code === "KeyR") {
    respawnPlayer(game);
  }
});

window.addEventListener("keyup", (event) => {
  handleKeyChange(event, false);
});

window.addEventListener("resize", () => {
  updateDesktopBlocker();
  resizeCanvas();
  updateRotatePrompt();
});

window.addEventListener("orientationchange", () => {
  updateDesktopBlocker();
  resizeCanvas();
  updateRotatePrompt();
});

canvas.addEventListener("mousemove", (event) => {
  setPointerPosition(event);
});

canvas.addEventListener("mouseenter", (event) => {
  setPointerPosition(event);
});

canvas.addEventListener("mouseleave", () => {
  input.pointer.inside = false;
});

canvas.addEventListener("mousedown", (event) => {
  setPointerPosition(event);

  if (event.button === 0) {
    input.minePressed = true;
  } else if (event.button === 2) {
    input.placePressed = true;
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    event.preventDefault();
    setPointerFromClientPosition(touch.clientX, touch.clientY);
    handleCanvasTapAction();
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    event.preventDefault();
    setPointerFromClientPosition(touch.clientX, touch.clientY);
  },
  { passive: false },
);

canvas.addEventListener(
  "touchend",
  (event) => {
    event.preventDefault();
  },
  { passive: false },
);

for (const button of hotbarButtons) {
  button.addEventListener("click", () => {
    selectBlock(button.dataset.slot);
  });
}

respawnButton.addEventListener("click", () => {
  respawnPlayer(game);
});

resetButton.addEventListener("click", () => {
  resetWorld();
});

bindHoldButton(
  touchLeftButton,
  () => {
    input.left = true;
  },
  () => {
    input.left = false;
  },
);

bindHoldButton(
  touchRightButton,
  () => {
    input.right = true;
  },
  () => {
    input.right = false;
  },
);

bindHoldButton(
  touchSprintButton,
  () => {
    input.sprint = true;
  },
  () => {
    input.sprint = false;
  },
);

bindHoldButton(touchJumpButton, triggerJumpPress, releaseJumpPress);

if (touchMineButton) {
  touchMineButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touchMineButton.classList.add("is-pressed");
    input.minePressed = true;
  });
  touchMineButton.addEventListener("pointerup", () => {
    touchMineButton.classList.remove("is-pressed");
  });
  touchMineButton.addEventListener("pointercancel", () => {
    touchMineButton.classList.remove("is-pressed");
  });
}

if (touchPlaceButton) {
  touchPlaceButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touchPlaceButton.classList.add("is-pressed");
    input.placePressed = true;
  });
  touchPlaceButton.addEventListener("pointerup", () => {
    touchPlaceButton.classList.remove("is-pressed");
  });
  touchPlaceButton.addEventListener("pointercancel", () => {
    touchPlaceButton.classList.remove("is-pressed");
  });
}

if (fullscreenButton) {
  fullscreenButton.addEventListener("click", async () => {
    await requestFullscreen();
  });
}

if (installButton) {
  installButton.addEventListener("click", async () => {
    await maybeInstallGame();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) {
    installButton.hidden = false;
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (installButton) {
    installButton.hidden = true;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

updateDesktopBlocker();

if (!isDesktopBlocked()) {
  resetWorld();
  resizeCanvas();
  updateRotatePrompt();
  requestAnimationFrame(step);
} else {
  if (statusLabel) {
    statusLabel.textContent = "Status: Mobile only.";
  }
}
