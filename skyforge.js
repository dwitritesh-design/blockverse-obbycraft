(() => {
  const canvas = document.querySelector("#forgeCanvas");
  const ctx = canvas.getContext("2d");
  const startOverlay = document.querySelector("#forgeStart");
  const startButton = document.querySelector("#startForgeButton");
  const scoreLabel = document.querySelector("#forgeScoreLabel");
  const healthLabel = document.querySelector("#forgeHealthLabel");
  const sparkLabel = document.querySelector("#sparkLabel");
  const waveLabel = document.querySelector("#waveLabel");

  const keys = new Set();
  const touch = { left: false, right: false, shoot: false, dash: false };
  let running = false;
  let lastTime = 0;
  let score = 0;
  let health = 100;
  let sparks = 0;
  let wave = 1;
  let spawnTimer = 0;
  let sparkTimer = 0;
  let shotCooldown = 0;
  let dashCooldown = 0;
  let player;
  let shots;
  let meteors;
  let pickups;
  let particles;
  let stars;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(640, Math.floor(rect.width * scale));
    canvas.height = Math.max(360, Math.floor(rect.height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    buildStars();
  }

  function buildStars() {
    const w = canvas.clientWidth || 1280;
    const h = canvas.clientHeight || 720;
    stars = Array.from({ length: 86 }, (_, index) => ({
      x: (Math.sin(index * 41.7) * 0.5 + 0.5) * w,
      y: (Math.cos(index * 19.9) * 0.5 + 0.5) * h * 0.76,
      r: 1 + (index % 4) * 0.45,
      phase: index * 0.23,
    }));
  }

  function resetGame() {
    running = true;
    lastTime = performance.now();
    score = 0;
    health = 100;
    sparks = 0;
    wave = 1;
    spawnTimer = 0.5;
    sparkTimer = 1.2;
    shotCooldown = 0;
    dashCooldown = 0;
    player = { x: canvas.clientWidth / 2, y: canvas.clientHeight * 0.82, vx: 0 };
    shots = [];
    meteors = [];
    pickups = [];
    particles = [];
    startOverlay.classList.add("is-hidden");
    requestAnimationFrame(loop);
  }

  function spawnMeteor() {
    const w = canvas.clientWidth;
    const size = 24 + Math.random() * 28 + wave * 2;
    meteors.push({
      x: 40 + Math.random() * (w - 80),
      y: -40,
      vx: (Math.random() - 0.5) * (45 + wave * 8),
      vy: 95 + Math.random() * 70 + wave * 18,
      size,
      hp: Math.ceil(size / 26),
      spin: Math.random() * Math.PI,
    });
  }

  function spawnSpark() {
    pickups.push({
      x: 50 + Math.random() * (canvas.clientWidth - 100),
      y: -24,
      vy: 90 + Math.random() * 70,
      r: 14,
    });
  }

  function shoot() {
    if (shotCooldown > 0) return;
    const overcharged = sparks >= 6;
    if (overcharged) sparks -= 6;
    shots.push({
      x: player.x,
      y: player.y - 36,
      vy: overcharged ? -720 : -560,
      r: overcharged ? 12 : 7,
      power: overcharged ? 3 : 1,
      color: overcharged ? "#ffd166" : "#8fb3ff",
    });
    shotCooldown = overcharged ? 0.18 : 0.24;
  }

  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) {
      particles.push({
        x,
        y,
        vx: Math.cos(i * 2.4) * (50 + Math.random() * 160),
        vy: Math.sin(i * 2.4) * (50 + Math.random() * 160),
        life: 0.45 + Math.random() * 0.35,
        color,
      });
    }
  }

  function update(dt) {
    const steer = (keys.has("ArrowRight") || keys.has("d") || touch.right ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") || touch.left ? 1 : 0);
    const wantsShoot = keys.has(" ") || keys.has("w") || keys.has("ArrowUp") || touch.shoot;
    const wantsDash = keys.has("Shift") || touch.dash;

    if (wantsDash && dashCooldown <= 0 && steer !== 0) {
      player.vx = steer * 760;
      dashCooldown = 0.72;
      burst(player.x, player.y, "#ffd166", 10);
    }

    player.vx += steer * 1500 * dt;
    player.vx *= 0.86;
    player.x += player.vx * dt;
    player.x = Math.max(34, Math.min(canvas.clientWidth - 34, player.x));
    if (wantsShoot) shoot();

    shotCooldown = Math.max(0, shotCooldown - dt);
    dashCooldown = Math.max(0, dashCooldown - dt);
    spawnTimer -= dt;
    sparkTimer -= dt;
    wave = 1 + Math.floor(score / 2200);

    if (spawnTimer <= 0) {
      spawnMeteor();
      spawnTimer = Math.max(0.28, 1.18 - wave * 0.07);
    }

    if (sparkTimer <= 0) {
      spawnSpark();
      sparkTimer = Math.max(1.05, 2.8 - wave * 0.08);
    }

    for (const shot of shots) shot.y += shot.vy * dt;
    for (const meteor of meteors) {
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.spin += dt * 1.8;
    }
    for (const pickup of pickups) pickup.y += pickup.vy * dt;
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    for (const shot of shots) {
      for (const meteor of meteors) {
        if (meteor.dead || shot.dead) continue;
        const dx = shot.x - meteor.x;
        const dy = shot.y - meteor.y;
        if (Math.hypot(dx, dy) < meteor.size + shot.r) {
          meteor.hp -= shot.power;
          shot.dead = true;
          burst(shot.x, shot.y, shot.color, 8);
          if (meteor.hp <= 0) {
            meteor.dead = true;
            score += Math.round(120 + meteor.size * 6);
            burst(meteor.x, meteor.y, "#ff8a5b", 18);
          }
        }
      }
    }

    for (const meteor of meteors) {
      if (meteor.dead) continue;
      if (meteor.y > canvas.clientHeight * 0.86) {
        meteor.dead = true;
        health -= Math.round(8 + meteor.size / 5);
        burst(meteor.x, canvas.clientHeight * 0.86, "#ff5c42", 22);
      }
    }

    for (const pickup of pickups) {
      const dx = pickup.x - player.x;
      const dy = pickup.y - player.y;
      if (Math.hypot(dx, dy) < 46) {
        pickup.dead = true;
        sparks += 1;
        score += 180;
        health = Math.min(100, health + 3);
        burst(pickup.x, pickup.y, "#ffd166", 14);
      }
    }

    shots = shots.filter((shot) => !shot.dead && shot.y > -40);
    meteors = meteors.filter((meteor) => !meteor.dead && meteor.y < canvas.clientHeight + 80);
    pickups = pickups.filter((pickup) => !pickup.dead && pickup.y < canvas.clientHeight + 40);
    particles = particles.filter((p) => p.life > 0);

    if (health <= 0) {
      health = 0;
      running = false;
      startButton.textContent = "Restart Defender";
      startOverlay.classList.remove("is-hidden");
    }

    scoreLabel.textContent = score.toString();
    healthLabel.textContent = health.toString();
    sparkLabel.textContent = sparks.toString();
    waveLabel.textContent = wave.toString();
  }

  function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#10162a");
    bg.addColorStop(0.62, "#26304f");
    bg.addColorStop(1, "#f1c773");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const t = performance.now() * 0.001;
    for (const star of stars) {
      ctx.globalAlpha = 0.35 + Math.sin(t + star.phase) * 0.22;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255, 209, 102, 0.16)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.88, w * 0.34, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(w * 0.22, h * 0.86, w * 0.56, 12);
    ctx.fillStyle = "#6a8dff";
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.86, 34, 0, Math.PI * 2);
    ctx.fill();

    drawPlayer();
    for (const shot of shots) drawShot(shot);
    for (const meteor of meteors) drawMeteor(meteor);
    for (const pickup of pickups) drawSpark(pickup);
    for (const p of particles) drawParticle(p);
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 34, 42, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(34, 28);
    ctx.lineTo(0, 12);
    ctx.lineTo(-34, 28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#6a8dff";
    ctx.fillRect(-14, -8, 28, 32);
    ctx.restore();
  }

  function drawShot(shot) {
    ctx.fillStyle = shot.color;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMeteor(meteor) {
    ctx.save();
    ctx.translate(meteor.x, meteor.y);
    ctx.rotate(meteor.spin);
    ctx.fillStyle = "#a95f4a";
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const radius = meteor.size * (i % 2 ? 0.72 : 1);
      const angle = (Math.PI * 2 * i) / 8;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 209, 102, 0.42)";
    ctx.fillRect(-meteor.size * 0.3, -meteor.size * 0.25, meteor.size * 0.34, meteor.size * 0.18);
    ctx.restore();
  }

  function drawSpark(pickup) {
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(pickup.x, pickup.y - pickup.r);
    ctx.lineTo(pickup.x + pickup.r, pickup.y);
    ctx.lineTo(pickup.x, pickup.y + pickup.r);
    ctx.lineTo(pickup.x - pickup.r, pickup.y);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticle(p) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
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
  bindTouch("#forgeTouchLeft", "left");
  bindTouch("#forgeTouchRight", "right");
  bindTouch("#forgeTouchShoot", "shoot");
  bindTouch("#forgeTouchDash", "dash");
  resizeCanvas();
  resetGame();
  running = false;
  startOverlay.classList.remove("is-hidden");
})();
