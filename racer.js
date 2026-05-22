(() => {
  const canvas = document.querySelector("#racerCanvas");
  const ctx = canvas.getContext("2d");
  const startOverlay = document.querySelector("#racerStart");
  const startButton = document.querySelector("#startRaceButton");
  const speedLabel = document.querySelector("#speedLabel");
  const scoreLabel = document.querySelector("#scoreLabel");
  const comboLabel = document.querySelector("#comboLabel");
  const statusLabel = document.querySelector("#raceStatusLabel");

  const keys = new Set();
  const touch = { left: false, right: false, brake: false, boost: false };
  const road = {
    width: 1900,
    segmentLength: 120,
    cameraDepth: 0.84,
    drawDistance: 118,
  };

  let running = false;
  let lastTime = 0;
  let distance = 0;
  let speed = 0;
  let lane = 0;
  let score = 0;
  let combo = 1;
  let crashTimer = 0;
  let roadSeed = 0;
  let traffic = [];
  let boosts = [];

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(640, Math.floor(rect.width * scale));
    canvas.height = Math.max(360, Math.floor(rect.height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function curveAt(index) {
    return Math.sin(index * 0.045) * 1.45 + Math.sin(index * 0.013 + 2) * 2.1;
  }

  function hillAt(index) {
    return Math.sin(index * 0.032 + 1.5) * 82 + Math.sin(index * 0.012) * 120;
  }

  function laneX(laneIndex) {
    return laneIndex * 0.43;
  }

  function resetGame() {
    running = true;
    lastTime = performance.now();
    distance = 0;
    speed = 0;
    lane = 0;
    score = 0;
    combo = 1;
    crashTimer = 0;
    roadSeed += 11;
    traffic = [];
    boosts = [];

    for (let i = 8; i < 110; i += 8) {
      traffic.push({
        z: i * road.segmentLength,
        lane: [-1, 0, 1][Math.abs(Math.floor(Math.sin(i * 17.3 + roadSeed) * 10)) % 3],
        color: ["#f05a48", "#33a6cc", "#2f405d", "#ffe066"][i % 4],
        passed: false,
      });
    }

    for (let i = 12; i < 120; i += 14) {
      boosts.push({
        z: i * road.segmentLength + 160,
        lane: [-1, 0, 1][Math.abs(Math.floor(Math.cos(i * 9.1 + roadSeed) * 12)) % 3],
        active: true,
      });
    }

    startOverlay.classList.add("is-hidden");
    requestAnimationFrame(loop);
  }

  function project(worldX, worldY, worldZ, cameraX, cameraY, cameraZ, curveOffset) {
    const depth = worldZ - cameraZ;
    const scale = road.cameraDepth / Math.max(1, depth);
    const screenW = canvas.clientWidth;
    const screenH = canvas.clientHeight;
    return {
      x: Math.round(screenW / 2 + scale * (worldX - cameraX - curveOffset) * screenW / 2),
      y: Math.round(screenH / 2 - scale * (worldY - cameraY) * screenH / 2),
      w: Math.round(scale * road.width * screenW / 2),
      scale,
    };
  }

  function drawRoad(cameraZ) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const baseSegment = Math.floor(cameraZ / road.segmentLength);
    const cameraY = 920 + hillAt(baseSegment);
    let curveOffset = 0;
    let curveDelta = 0;
    let prev = null;

    const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
    sky.addColorStop(0, "#80d6ff");
    sky.addColorStop(0.62, "#eaf9ff");
    sky.addColorStop(1, "#f6e5a4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#66764a";
    ctx.fillRect(0, height * 0.56, width, height * 0.44);

    for (let n = road.drawDistance; n > 0; n -= 1) {
      const index = baseSegment + n;
      const z = index * road.segmentLength;
      curveDelta += curveAt(index) * 0.018;
      curveOffset += curveDelta;
      const p = project(0, hillAt(index), z, lane * 520, cameraY, cameraZ, curveOffset);
      if (!prev) {
        prev = p;
        continue;
      }

      const grassColor = index % 2 === 0 ? "#5fa35c" : "#519351";
      const roadColor = index % 2 === 0 ? "#354051" : "#2c3544";
      const shoulderColor = index % 2 === 0 ? "#ffd166" : "#f07f4f";
      const laneColor = index % 3 === 0 ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.18)";

      ctx.fillStyle = grassColor;
      ctx.fillRect(0, p.y, width, prev.y - p.y);
      drawQuad(p.x - p.w * 1.12, p.y, p.x - p.w, p.y, prev.x - prev.w, prev.y, prev.x - prev.w * 1.12, prev.y, shoulderColor);
      drawQuad(p.x + p.w, p.y, p.x + p.w * 1.12, p.y, prev.x + prev.w * 1.12, prev.y, prev.x + prev.w, prev.y, shoulderColor);
      drawQuad(p.x - p.w, p.y, p.x + p.w, p.y, prev.x + prev.w, prev.y, prev.x - prev.w, prev.y, roadColor);

      for (const laneMark of [-0.33, 0.33]) {
        const x1 = p.x + p.w * laneMark;
        const x2 = prev.x + prev.w * laneMark;
        drawQuad(x1 - p.w * 0.01, p.y, x1 + p.w * 0.01, p.y, x2 + prev.w * 0.01, prev.y, x2 - prev.w * 0.01, prev.y, laneColor);
      }

      prev = p;
    }
  }

  function drawQuad(x1, y1, x2, y2, x3, y3, x4, y4, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  }

  function drawBillboard(item, cameraZ, color, type) {
    const baseSegment = Math.floor(cameraZ / road.segmentLength);
    let curveOffset = 0;
    let curveDelta = 0;
    for (let i = baseSegment; i < Math.floor(item.z / road.segmentLength); i += 1) {
      curveDelta += curveAt(i) * 0.018;
      curveOffset += curveDelta;
    }
    const p = project(laneX(item.lane) * road.width, hillAt(item.z / road.segmentLength), item.z, lane * 520, 920 + hillAt(baseSegment), cameraZ, curveOffset);
    if (p.scale <= 0 || p.y < 0 || p.y > canvas.clientHeight) return;
    const w = Math.max(10, p.scale * canvas.clientWidth * (type === "boost" ? 250 : 330));
    const h = Math.max(8, p.scale * canvas.clientHeight * (type === "boost" ? 120 : 260));

    if (type === "boost") {
      ctx.fillStyle = "rgba(255, 209, 102, 0.82)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, w, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff9c7";
      ctx.lineWidth = Math.max(2, w * 0.04);
      ctx.stroke();
      return;
    }

    ctx.fillStyle = color;
    ctx.fillRect(p.x - w / 2, p.y - h, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillRect(p.x - w * 0.25, p.y - h * 0.78, w * 0.5, h * 0.2);
    ctx.fillStyle = "#17202f";
    ctx.fillRect(p.x - w * 0.42, p.y - h * 0.1, w * 0.22, h * 0.12);
    ctx.fillRect(p.x + w * 0.2, p.y - h * 0.1, w * 0.22, h * 0.12);
  }

  function drawPlayer() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const x = w / 2;
    const y = h * 0.78;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 48, 92, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5c42";
    roundedRect(-64, -54, 128, 92, 12);
    ctx.fillStyle = "#ffe066";
    roundedRect(-42, -96, 84, 48, 10);
    ctx.fillStyle = "#17202f";
    ctx.fillRect(-48, 22, 30, 28);
    ctx.fillRect(18, 22, 30, 28);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillRect(-28, -84, 56, 20);
    ctx.restore();
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function update(dt) {
    const steer = (keys.has("ArrowRight") || keys.has("d") || touch.right ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") || touch.left ? 1 : 0);
    const boosting = keys.has("ArrowUp") || keys.has("w") || keys.has(" ") || touch.boost;
    const braking = keys.has("ArrowDown") || keys.has("s") || touch.brake;

    speed += (boosting ? 560 : 300) * dt;
    if (braking) speed -= 760 * dt;
    speed = Math.max(0, Math.min(boosting ? 2550 : 2050, speed));
    lane += steer * dt * (1.45 + speed / 1600);
    lane *= 0.985;
    lane = Math.max(-1.38, Math.min(1.38, lane));
    distance += speed * dt;
    score += Math.floor(speed * dt * combo * 0.045);

    if (Math.abs(lane) > 1.22 && speed > 900) {
      speed -= 680 * dt;
      statusLabel.textContent = "Shoulder";
    } else {
      statusLabel.textContent = "Racing";
    }

    for (const boost of boosts) {
      const dz = boost.z - distance;
      if (boost.active && dz > -140 && dz < 190 && Math.abs(lane - boost.lane * 0.43) < 0.22) {
        speed = Math.min(2800, speed + 720);
        score += 500 * combo;
        combo = Math.min(9, combo + 1);
        boost.active = false;
        statusLabel.textContent = "Boost";
      }
    }

    for (const car of traffic) {
      const dz = car.z - distance;
      const carLane = car.lane * 0.43;
      if (dz < -300) {
        car.z += 12800 + Math.random() * 2600;
        car.lane = [-1, 0, 1][Math.floor(Math.random() * 3)];
        car.passed = false;
      }
      if (!car.passed && dz < -120) {
        car.passed = true;
        if (Math.abs(lane - carLane) < 0.4) {
          combo = Math.min(9, combo + 1);
          score += 250 * combo;
          statusLabel.textContent = "Near miss";
        }
      }
      if (dz > -95 && dz < 135 && Math.abs(lane - carLane) < 0.25) {
        crashTimer = 1.2;
        running = false;
        statusLabel.textContent = "Crash";
        startOverlay.classList.remove("is-hidden");
        startButton.textContent = "Restart Race";
      }
    }

    speedLabel.textContent = Math.round(speed / 13);
    scoreLabel.textContent = score.toString();
    comboLabel.textContent = `x${combo}`;
  }

  function render() {
    drawRoad(distance);
    boosts.filter((boost) => boost.active && boost.z > distance - 300 && boost.z < distance + road.drawDistance * road.segmentLength)
      .sort((a, b) => b.z - a.z)
      .forEach((boost) => drawBillboard(boost, distance, "#ffd166", "boost"));
    traffic.filter((car) => car.z > distance - 300 && car.z < distance + road.drawDistance * road.segmentLength)
      .sort((a, b) => b.z - a.z)
      .forEach((car) => drawBillboard(car, distance, car.color, "car"));
    drawPlayer();

    if (crashTimer > 0) {
      ctx.fillStyle = `rgba(255, 92, 66, ${Math.min(0.45, crashTimer)})`;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
  }

  function loop(now) {
    if (!running) {
      render();
      return;
    }
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function bindTouch(id, name) {
    const el = document.querySelector(id);
    const set = (value) => {
      touch[name] = value;
    };
    el.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      set(true);
    });
    el.addEventListener("pointerup", () => set(false));
    el.addEventListener("pointercancel", () => set(false));
    el.addEventListener("pointerleave", () => set(false));
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", (event) => {
    keys.add(event.key);
    if (event.key.toLowerCase() === "r") resetGame();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key));
  startButton.addEventListener("click", resetGame);
  bindTouch("#touchSteerLeft", "left");
  bindTouch("#touchSteerRight", "right");
  bindTouch("#touchBrake", "brake");
  bindTouch("#touchBoost", "boost");
  resizeCanvas();
  render();
})();
