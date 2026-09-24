/* ==========================================
   ICE SLIDE - Child-Friendly Canvas Game Engine
   Full-screen playgrid responsive on Mobile & Desktop
   ========================================== */

(function () {
  "use strict";

  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');

  var W = 400;
  var H = 700;
  var scale = 1;
  var offY = 0;
  var dpr = 1;
  var groundY;
  var PLAYER_X;

  // Clouds and Snow Environment State
  var clouds = [];
  var snowFlakes = [];

  function resize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Responsive aspect-ratio independent scale math for Mobile & Desktop
    if (vw >= vh) {
      // Landscape / Desktop / Widescreen Tablet
      H = 600;
      W = Math.max(400, Math.round(H * (vw / vh)));
      scale = (vh * dpr) / H;
    } else {
      // Portrait / Mobile Phone
      W = 400;
      H = Math.max(520, Math.round(W * (vh / vw)));
      scale = (vw * dpr) / W;
    }

    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    offY = 0;

    groundY = H * 0.74;
    PLAYER_X = Math.min(W * 0.25, 160);

    initClouds();
    initSnow();
  }

  function initClouds() {
    clouds = [];
    var cloudCount = Math.max(5, Math.round(W / 120));
    for (var i = 0; i < cloudCount; i++) {
      clouds.push({
        x: Math.random() * (W + 200) - 100,
        y: 30 + Math.random() * 120,
        w: 60 + Math.random() * 70,
        spd: 10 + Math.random() * 16
      });
    }
  }

  function initSnow() {
    snowFlakes = [];
    var snowCount = Math.max(35, Math.round(W / 15));
    for (var i = 0; i < snowCount; i++) {
      snowFlakes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1.5 + Math.random() * 3.5,
        spdY: 22 + Math.random() * 32,
        spdX: -10 + Math.random() * 20,
        phase: Math.random() * 6.28
      });
    }
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
  });

  /* ---------- Physics & Tiers ---------- */
  var GRAVITY = 1550;
  var JUMP_V = 550;
  var PLAYER_R = 19;
  var JUMP_AIRTIME = (2 * JUMP_V) / GRAVITY;

  var TIERS = [
    { m: 0, name: '❄️ Snowy Hills', spd: 150, snowman: false, hole: false },
    { m: 350, name: '🧊 Cracking Ice', spd: 190, snowman: true, hole: false },
    { m: 850, name: '🌊 Ocean Slide', spd: 225, snowman: true, hole: true },
    { m: 1450, name: '✨ Crystal Canyon', spd: 265, snowman: true, hole: true },
    { m: 2150, name: '🌨️ Blizzard Run', spd: 305, snowman: true, hole: true },
    { m: 3000, name: '⭐ Polar Paradise', spd: 345, snowman: true, hole: true }
  ];

  function tierOf(m) {
    var idx = 0;
    for (var k = 0; k < TIERS.length; k++) {
      if (m >= TIERS[k].m) idx = k;
    }
    return idx;
  }

  /* ---------- Game State ---------- */
  var STATE_TITLE = 0, STATE_PLAY = 1, STATE_OVER = 2;
  var state = STATE_TITLE;

  var player, obstacles, fish, particles, popups;
  var distance, score, fishCount, tier, tierFlash, best = 0, alive, tclock, shake;
  var nextSpawnX, fishTimer;

  try {
    best = parseInt(localStorage.getItem('ice_best') || '0', 10) || 0;
  } catch (e) {}

  function reset() {
    player = { footY: 0, vy: 0, grounded: true, squash: 0, tilt: 0, blinkTimer: 0 };
    obstacles = [];
    fish = [];
    particles = [];
    popups = [];
    distance = 0;
    score = 0;
    fishCount = 0;
    tier = 0;
    tierFlash = 0;
    alive = true;
    tclock = 0;
    shake = 0;
    nextSpawnX = W + 340;
    fishTimer = 0.8;
  }

  function burst(x, y, n, color, spread, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      var sp = Math.random() * power;
      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.8,
        r: 2 + Math.random() * 3.5,
        life: 1,
        decay: 0.02 + Math.random() * 0.025,
        color: color,
        isStar: Math.random() < 0.3
      });
    }
  }

  function spawnObstacle(forceX) {
    var t = TIERS[tier];
    var pool = ['rock', 'rock', 'seal'];
    if (t.snowman) pool.push('snowman');
    if (t.hole) pool.push('hole', 'hole');

    var type = pool[(Math.random() * pool.length) | 0];
    var x = forceX != null ? forceX : W + 60;
    var o = { type: type, x: x };

    if (type === 'rock') { o.w = 30; o.h = 26; }
    else if (type === 'seal') { o.w = 44; o.h = 30; o.phase = Math.random() * 6.28; }
    else if (type === 'snowman') { o.w = 34; o.h = 82; }
    else if (type === 'hole') { o.w = 55 + Math.random() * 20; o.h = 0; }

    obstacles.push(o);
    return o;
  }

  function spawnFish(forceX) {
    var elevated = Math.random() < 0.42;
    fish.push({
      x: forceX != null ? forceX : W + 40,
      h: elevated ? 62 + Math.random() * 38 : 8,
      elevated: elevated,
      got: 0,
      phase: Math.random() * 6.28
    });
  }

  function advanceSpawnCursor(dt, speed) {
    nextSpawnX -= speed * dt;
    if (nextSpawnX <= W + 50) {
      var o = spawnObstacle(nextSpawnX);
      var jumpDist = speed * JUMP_AIRTIME;
      var tierEase = Math.max(1, 1.7 - tier * 0.14);
      var minGap = Math.max(150, jumpDist * 0.55) * tierEase;
      var hard = (o.type === 'hole' || o.type === 'snowman');
      var extra = hard ? 70 + Math.random() * 100 : 25 + Math.random() * 70;
      nextSpawnX = o.x + o.w + minGap + extra;
    }
  }

  /* ---------- Action & Jump ---------- */
  function doJump() {
    if (state !== STATE_PLAY || !alive) return;
    if (player.grounded) {
      player.vy = JUMP_V;
      player.grounded = false;
      if (window.IceAudio) window.IceAudio.sfx.jump();
      burst(PLAYER_X, groundY, 8, '255, 255, 255', 14, 2.0);
    }
  }

  /* ---------- Update Loop ---------- */
  function step(dt) {
    tclock += dt;
    var t = TIERS[tier];
    var speed = t.spd + Math.min(140, distance * 0.03);

    player.vy -= GRAVITY * dt;
    player.footY += player.vy * dt;

    if (player.footY <= 0) {
      if (!player.grounded) {
        player.squash = 1;
        if (window.IceAudio) window.IceAudio.sfx.land();
        burst(PLAYER_X, groundY, 6, '255, 255, 255', 14, 1.4);
      }
      player.footY = 0;
      player.vy = 0;
      player.grounded = true;
    }

    if (player.squash > 0) player.squash = Math.max(0, player.squash - 4.8 * dt);
    player.tilt = Math.max(-0.45, Math.min(0.45, -player.vy * 0.00085));

    distance += (speed * dt) / 10;
    score = Math.floor(distance) + fishCount * 3;

    var newTier = tierOf(distance);
    if (newTier > tier) {
      tier = newTier;
      tierFlash = 1;
      shake = Math.max(shake, 0.4);
      if (window.IceAudio) window.IceAudio.sfx.levelup();
      burst(W / 2, H * 0.3, 30, '255, 215, 0', 80, 4.0);
    }

    advanceSpawnCursor(dt, speed);

    fishTimer -= dt;
    if (fishTimer <= 0) {
      spawnFish();
      fishTimer = 1.1 + Math.random() * 0.9;
    }

    var playerBodyY = groundY - player.footY - PLAYER_R;

    // Obstacle Collisions
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.x -= speed * dt;
      if (o.x < -120) {
        obstacles.splice(i, 1);
        continue;
      }
      var overlapX = (PLAYER_X + PLAYER_R > o.x) && (PLAYER_X - PLAYER_R < o.x + o.w);
      if (overlapX) {
        if (o.type === 'hole') {
          if (player.footY < 6) return crash();
        } else {
          if (player.footY < o.h - 4) return crash();
        }
      }
    }

    // Fish Collectibles
    for (var j = fish.length - 1; j >= 0; j--) {
      var f = fish[j];
      if (f.got) {
        f.got -= 3.5 * dt;
        if (f.got <= 0) fish.splice(j, 1);
        continue;
      }
      f.x -= speed * dt;
      if (f.x < -40) {
        fish.splice(j, 1);
        continue;
      }
      var fy = groundY - f.h;
      var dx = PLAYER_X - f.x;
      var dy = playerBodyY - fy;
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_R + 14) {
        f.got = 1;
        fishCount++;
        score = Math.floor(distance) + fishCount * 3;

        if (window.IceAudio) window.IceAudio.sfx.fish(f.elevated);

        popups.push({
          x: f.x,
          y: fy - 10,
          life: 1,
          text: f.elevated ? '+3 ⭐' : '+3 🐟',
          color: f.elevated ? '255, 215, 0' : '90, 200, 255'
        });

        burst(f.x, fy, f.elevated ? 16 : 10, f.elevated ? '255, 215, 0' : '90, 200, 255', 16, 2.5);
      }
    }

    // Particle & Popup physics
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx * dt * 60;
      pt.y += pt.vy * dt * 60;
      pt.vy += 0.28 * dt * 60 * 0.02;
      pt.life -= pt.decay * dt * 60;
      if (pt.life <= 0) particles.splice(p, 1);
    }

    for (var u = popups.length - 1; u >= 0; u--) {
      popups[u].y -= 0.8 * dt * 60;
      popups[u].life -= 0.022 * dt * 60;
      if (popups[u].life <= 0) popups.splice(u, 1);
    }

    if (shake > 0) shake = Math.max(0, shake - 2.8 * dt);
    if (tierFlash > 0) tierFlash = Math.max(0, tierFlash - 0.5 * dt);
  }

  function crash() {
    alive = false;
    shake = 1;
    burst(PLAYER_X, groundY - player.footY, 30, '255, 100, 130', 28, 3.8);
    if (window.IceAudio) window.IceAudio.sfx.crash();
    gameOver();
  }

  function ambient(dt) {
    tclock += dt;
    var speed = 80;
    advanceSpawnCursor(dt, speed);
    for (var i = obstacles.length - 1; i >= 0; i--) {
      obstacles[i].x -= speed * dt;
      if (obstacles[i].x < -120) obstacles.splice(i, 1);
    }
    fishTimer -= dt;
    if (fishTimer <= 0) {
      spawnFish();
      fishTimer = 1.1 + Math.random() * 0.9;
    }
    for (var j = fish.length - 1; j >= 0; j--) {
      fish[j].x -= speed * dt;
      if (fish[j].x < -40) fish.splice(j, 1);
    }
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx * dt * 60;
      pt.y += pt.vy * dt * 60;
      pt.life -= pt.decay * dt * 60;
      if (pt.life <= 0) particles.splice(p, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - 2.8 * dt);
  }

  /* ---------- DRAWING CHILD-FRIENDLY CHARACTERS ---------- */

  // Pip the Penguin
  function drawPenguin() {
    var x = PLAYER_X;
    var y = groundY - player.footY;
    var sqx = 1 + player.squash * 0.22;
    var sqy = 1 - player.squash * 0.22;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.tilt);
    ctx.scale(sqx, sqy);

    // Cute Shadow
    ctx.fillStyle = 'rgba(15, 50, 80, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, PLAYER_R + 4, PLAYER_R * 0.95, PLAYER_R * 0.3, 0, 0, 6.2832);
    ctx.fill();

    // Flapping Wings
    var flap = Math.sin(tclock * 12) * 0.45 + (player.grounded ? 0 : 0.7);
    ctx.fillStyle = '#23384c';
    ctx.beginPath();
    ctx.ellipse(-PLAYER_R * 0.88, -2, 6.5, 13, -0.35 - flap * 0.5, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(PLAYER_R * 0.88, -2, 6.5, 13, 0.35 + flap * 0.5, 0, 6.2832);
    ctx.fill();

    // Chubby Dark Body
    var g = ctx.createLinearGradient(0, -PLAYER_R, 0, PLAYER_R);
    g.addColorStop(0, '#3a5068');
    g.addColorStop(1, '#1e2d3d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, PLAYER_R * 0.88, PLAYER_R * 1.05, 0, 0, 6.2832);
    ctx.fill();

    // White Fluffy Belly
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, PLAYER_R * 0.22, PLAYER_R * 0.62, PLAYER_R * 0.74, 0, 0, 6.2832);
    ctx.fill();

    // Head
    ctx.fillStyle = '#1e2d3d';
    ctx.beginPath();
    ctx.arc(0, -PLAYER_R * 0.74, PLAYER_R * 0.55, 0, 6.2832);
    ctx.fill();

    // Cute Pink Cheeks
    ctx.fillStyle = 'rgba(255, 130, 160, 0.65)';
    ctx.beginPath();
    ctx.arc(-7, -PLAYER_R * 0.68, 3.8, 0, 6.2832);
    ctx.arc(7, -PLAYER_R * 0.68, 3.8, 0, 6.2832);
    ctx.fill();

    // Big Shiny Anime Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(3.5, -PLAYER_R * 0.82, 4.8, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(4.8, -PLAYER_R * 0.82, 2.5, 0, 6.2832);
    ctx.fill();

    // Eye Sparkle Highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.8, -PLAYER_R * 0.88, 1.1, 0, 6.2832);
    ctx.fill();

    // Beanie Winter Hat with Fluffy Pom-Pom
    ctx.fillStyle = '#ff477e';
    ctx.beginPath();
    ctx.arc(0, -PLAYER_R * 1.05, PLAYER_R * 0.52, Math.PI, 0);
    ctx.fill();

    ctx.fillStyle = '#ffb3c6';
    ctx.fillRect(-PLAYER_R * 0.55, -PLAYER_R * 1.12, PLAYER_R * 1.1, 4);

    // Pom-Pom
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -PLAYER_R * 1.4, 5, 0, 6.2832);
    ctx.fill();

    // Cute Orange Beak
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.moveTo(PLAYER_R * 0.35, -PLAYER_R * 0.74);
    ctx.lineTo(PLAYER_R * 0.88, -PLAYER_R * 0.68);
    ctx.lineTo(PLAYER_R * 0.35, -PLAYER_R * 0.58);
    ctx.closePath();
    ctx.fill();

    // Cute Feet
    ctx.fillStyle = '#ff9f1c';
    ctx.beginPath();
    ctx.ellipse(-6, PLAYER_R * 0.96, 6.5, 3.5, 0, 0, 6.2832);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, PLAYER_R * 0.96, 6.5, 3.5, 0, 0, 6.2832);
    ctx.fill();

    ctx.restore();
  }

  // Draw Obstacles
  function drawObstacle(o) {
    var gx = o.x;
    var gy = groundY;

    if (o.type === 'hole') {
      ctx.fillStyle = 'rgba(10, 80, 130, 0.4)';
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy + 7, o.w / 2 + 5, 15, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#0b4a72';
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy + 7, o.w / 2 - 2, 10, 0, 0, 6.2832);
      ctx.fill();

      ctx.strokeStyle = '#7cd6f8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy + 6, o.w * 0.3, 4, 0, 0, 6.2832);
      ctx.stroke();

    } else if (o.type === 'rock') {
      var g = ctx.createLinearGradient(0, gy - o.h, 0, gy);
      g.addColorStop(0, '#a5f3fc');
      g.addColorStop(0.5, '#38bdf8');
      g.addColorStop(1, '#0284c7');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + 3, gy - o.h * 0.7);
      ctx.lineTo(gx + o.w * 0.45, gy - o.h);
      ctx.lineTo(gx + o.w - 3, gy - o.h * 0.65);
      ctx.lineTo(gx + o.w, gy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gx + o.w * 0.3, gy - o.h * 0.7, 2, 0, 6.2832);
      ctx.fill();

    } else if (o.type === 'seal') {
      var bob = Math.sin(tclock * 3.5 + o.phase) * 2.5;

      ctx.fillStyle = 'rgba(15, 50, 80, 0.16)';
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy + 4, o.w * 0.5, 6, 0, 0, 6.2832);
      ctx.fill();

      var g2 = ctx.createLinearGradient(0, gy - o.h, 0, gy);
      g2.addColorStop(0, '#cbd5e1');
      g2.addColorStop(1, '#64748b');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy - o.h * 0.45 + bob, o.w * 0.52, o.h * 0.52, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(gx + o.w * 0.68, gy - o.h * 0.48 + bob, o.w * 0.22, o.h * 0.25, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(gx + o.w * 0.75, gy - o.h * 0.58 + bob, 2.2, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(gx + o.w * 0.77, gy - o.h * 0.62 + bob, 0.9, 0, 6.2832);
      ctx.fill();

    } else if (o.type === 'snowman') {
      ctx.fillStyle = 'rgba(15, 50, 80, 0.16)';
      ctx.beginPath();
      ctx.ellipse(gx + o.w / 2, gy + 4, o.w * 0.62, 7, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(gx + o.w / 2, gy - o.h * 0.24, o.w * 0.52, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + o.w / 2, gy - o.h * 0.62, o.w * 0.38, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + o.w / 2, gy - o.h * 0.90, o.w * 0.28, 0, 6.2832); ctx.fill();

      ctx.fillStyle = '#ff477e';
      ctx.fillRect(gx + o.w / 2 - 12, gy - o.h * 0.75, 24, 5);

      var armAngle = Math.sin(tclock * 4) * 0.3;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gx + o.w / 2 + 10, gy - o.h * 0.62);
      ctx.lineTo(gx + o.w / 2 + 22, gy - o.h * 0.7 + Math.sin(armAngle) * 6);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(gx + o.w / 2 - 12, gy - o.h * 1.02, 24, 4);
      ctx.fillRect(gx + o.w / 2 - 8, gy - o.h * 1.2, 16, 12);

      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(gx + o.w / 2, gy - o.h * 0.90);
      ctx.lineTo(gx + o.w / 2 + 12, gy - o.h * 0.88);
      ctx.lineTo(gx + o.w / 2, gy - o.h * 0.84);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(gx + o.w / 2 - 4, gy - o.h * 0.93, 1.8, 0, 6.2832);
      ctx.arc(gx + o.w / 2 + 4, gy - o.h * 0.93, 1.8, 0, 6.2832);
      ctx.fill();
    }
  }

  // Draw Cute Fish & Golden Stars
  function drawFish(f) {
    var a = f.got ? f.got : 1;
    var y = groundY - f.h + Math.sin(tclock * 3.2 + f.phase) * 5;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(f.x, y);

    if (f.elevated) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, 6.2832);
      ctx.fill();
    }

    ctx.fillStyle = f.elevated ? '#ffc107' : '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, 6.2832);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-16, -7);
    ctx.lineTo(-16, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5, -1.8, 2, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(5.8, -1.8, 1, 0, 6.2832);
    ctx.fill();

    ctx.restore();
  }

  /* ---------- MASTER RENDER LOOP ---------- */
  function render() {
    var vw = canvas.width;
    var vh = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Dynamic Gradient Sky
    var skyG = ctx.createLinearGradient(0, 0, 0, vh);
    skyG.addColorStop(0, '#bae6fd');
    skyG.addColorStop(0.55, '#7dd3fc');
    skyG.addColorStop(1, '#e0f2fe');
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, vw, vh);

    // Shake & Scale Matrix
    ctx.setTransform(
      scale, 0, 0, scale,
      (Math.random() - 0.5) * shake * 8 * scale,
      (Math.random() - 0.5) * shake * 8 * scale
    );

    // Floating Clouds across wide screen W
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      cl.x -= cl.spd * 0.016;
      if (cl.x < -140) cl.x = W + 100;
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, cl.w * 0.3, 0, 6.2832);
      ctx.arc(cl.x + cl.w * 0.25, cl.y - 8, cl.w * 0.35, 0, 6.2832);
      ctx.arc(cl.x + cl.w * 0.5, cl.y, cl.w * 0.28, 0, 6.2832);
      ctx.fill();
    }

    // Snowcapped Distant Mountains across wide screen W
    ctx.fillStyle = 'rgba(255, 255, 255, 0.68)';
    var mountSpan = 180;
    var totalMounts = Math.ceil((W + 300) / mountSpan);
    for (var m = 0; m < totalMounts; m++) {
      var mx = ((m * mountSpan - tclock * 12) % (W + 240)) - 120;
      ctx.beginPath();
      ctx.moveTo(mx, groundY - 20);
      ctx.lineTo(mx + 80, groundY - 130);
      ctx.lineTo(mx + 160, groundY - 20);
      ctx.closePath();
      ctx.fill();
    }

    // Ice Ground
    var groundG = ctx.createLinearGradient(0, groundY, 0, H);
    groundG.addColorStop(0, '#f0f9ff');
    groundG.addColorStop(1, '#bae6fd');
    ctx.fillStyle = groundG;
    ctx.fillRect(0, groundY, W, H - groundY);

    // Ice Speed Streak lines
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
    ctx.lineWidth = 2.5;
    var streakSpan = 80;
    var totalStreaks = Math.ceil((W + 100) / streakSpan);
    for (var s = 0; s < totalStreaks; s++) {
      var sx = ((s * streakSpan - tclock * 220) % (W + 100)) - 50;
      ctx.beginPath();
      ctx.moveTo(sx, groundY + 8);
      ctx.lineTo(sx + 36, groundY + 24);
      ctx.stroke();
    }

    // Render Entities
    for (var o = 0; o < obstacles.length; o++) drawObstacle(obstacles[o]);
    for (var f = 0; f < fish.length; f++) drawFish(fish[f]);

    if (alive) drawPenguin();

    // Gentle Falling Snow
    ctx.fillStyle = '#ffffff';
    for (var sn = 0; sn < snowFlakes.length; sn++) {
      var sf = snowFlakes[sn];
      sf.y += sf.spdY * 0.016;
      sf.x += Math.sin(tclock * 2 + sf.phase) * 0.5;
      if (sf.y > H) { sf.y = -10; sf.x = Math.random() * W; }
      ctx.beginPath();
      ctx.arc(sf.x, sf.y, sf.r, 0, 6.2832);
      ctx.fill();
    }

    // Sparkle Particles
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = 'rgba(' + pt.color + ', 1)';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * pt.life, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Popups
    ctx.textAlign = 'center';
    ctx.font = '700 16px Fredoka, sans-serif';
    for (var u = 0; u < popups.length; u++) {
      ctx.globalAlpha = Math.max(0, popups[u].life);
      ctx.fillStyle = 'rgb(' + popups[u].color + ')';
      ctx.fillText(popups[u].text, popups[u].x, popups[u].y);
    }
    ctx.globalAlpha = 1;

    // In-game HUD
    if (state === STATE_PLAY) {
      ctx.fillStyle = '#16537e';
      ctx.font = '700 42px Fredoka, sans-serif';
      ctx.fillText(String(score), W / 2, 58);

      ctx.font = '600 14px Fredoka, sans-serif';
      ctx.fillStyle = '#2c6e91';
      ctx.fillText(Math.floor(distance) + ' m  •  ' + fishCount + ' 🐟', W / 2, 80);

      if (tierFlash > 0) {
        ctx.globalAlpha = Math.min(1, tierFlash * 2.2);
        ctx.font = '700 28px Fredoka, sans-serif';
        ctx.fillStyle = '#ff477e';
        ctx.fillText(TIERS[tier].name, W / 2, H * 0.28);
        ctx.globalAlpha = 1;
      }
    }

    // Full-screen Soft Vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8, 45, 80, 0.18)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
  }

  /* ---------- GAME ENGINE LOOP ---------- */
  var last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;

    if (state === STATE_PLAY) step(dt);
    else ambient(dt);

    render();
  }

  /* ---------- UI CONTROLLER ---------- */
  var titleEl = document.getElementById('title');
  var overEl = document.getElementById('over');
  var overCard = document.getElementById('overCard');
  var overTitle = document.getElementById('overTitle');
  var finalEl = document.getElementById('finalScore');
  var tierLine = document.getElementById('tierLine');
  var bestLine = document.getElementById('bestLine');
  var overShownAt = 0;

  var FUN_MESSAGES = [
    'Belly Flop! 🐧',
    'Snow Slid Away! ❄️',
    'Splash Landing! 💦',
    'Awesome Try! ⭐'
  ];

  function startGame() {
    if (window.IceAudio) window.IceAudio.init();
    reset();
    state = STATE_PLAY;
    titleEl.classList.add('hidden');
    overEl.classList.add('hidden');
    last = 0;
  }

  function gameOver() {
    state = STATE_OVER;
    if (score > best) {
      best = score;
      try { localStorage.setItem('ice_best', String(best)); } catch (e) {}
      bestLine.textContent = '🎉 New Best Record!';
    } else {
      bestLine.textContent = 'Best Score: ' + best;
    }
    overTitle.textContent = FUN_MESSAGES[(Math.random() * FUN_MESSAGES.length) | 0];
    finalEl.textContent = score;
    tierLine.textContent = Math.floor(distance) + ' m  •  ' + fishCount + ' 🐟 collected';
    overEl.classList.remove('hidden');
    overCard.classList.remove('fade');
    void overCard.offsetWidth;
    overCard.classList.add('fade');
    overShownAt = Date.now();
  }

  document.getElementById('startBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });

  document.getElementById('againBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    startGame();
  });

  overEl.addEventListener('pointerdown', function () {
    if (state === STATE_OVER && Date.now() - overShownAt > 450) {
      startGame();
    }
  });

  /* ---------- INPUT HANDLING ---------- */
  canvas.addEventListener('pointerdown', function (e) {
    if (window.IceAudio) window.IceAudio.init();
    if (state === STATE_PLAY) {
      doJump();
    }
    e.preventDefault();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') {
      if (window.IceAudio) window.IceAudio.init();
      if (state === STATE_PLAY) doJump();
      else startGame();
      e.preventDefault();
    }
  });

  document.addEventListener('visibilitychange', function () { last = 0; });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- BOOT ---------- */
  resize();
  reset();
  bestLine.textContent = 'Best Score: ' + best;
  requestAnimationFrame(loop);

})();
