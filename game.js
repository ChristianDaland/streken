const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GROUND_Y = 300;
const OBSTACLE_TYPES = ['hole', 'wall', 'spikes', 'canon', 'cloud'];

let gameObjects = {
  player: {
    x: 50,
    y: GROUND_Y,
    speed: 2,
    maxSpeed: 2,
    facingRight: true,
    isFalling: false,
    fallSpeed: 0,
    walkFrame: 0,
    state: 'WALKING_HAPPY',
    hurtTimer: 0
  },
  currentObstacleIndex: 0,
  obstacles: [],
  drawnLine: [],
  cameraX: 0,
  score: 0,
  manualStopPenaltyApplied: false,
  isGameOver: false,
  wetObstaclesCounter: 0
};

let scrollAccumulator = 0;
let scrollTimeout = null;
let isDragging = false;

// 1. GENERER HINDRINGER
function createObstacle(xPos, type) {
  if (type === 'hole') {
    return { type: 'hole', x: xPos, width: 130 + Math.random() * 40, passed: false };
  } else if (type === 'wall') {
    return { type: 'wall', x: xPos, width: 15, height: 60 + Math.random() * 40, passed: false };
  } else if (type === 'spikes') {
    return { type: 'spikes', x: xPos, width: 100 + Math.random() * 30, height: 35, count: 6, passed: false };
  } else if (type === 'canon') {
    return { type: 'canon', x: xPos, width: 40, height: 35, passed: false };
  } else if (type === 'cloud') {
    return { type: 'cloud', x: xPos, width: 130, height: 140, passed: false };
  }
}

function initObstacles() {
  gameObjects.obstacles = [];
  gameObjects.currentObstacleIndex = 0;
  gameObjects.manualStopPenaltyApplied = false;
  gameObjects.wetObstaclesCounter = 0;
  spawnNextObstacle(350);
}

function spawnNextObstacle(xPos) {
  const randomType = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
  gameObjects.obstacles.push(createObstacle(xPos, randomType));
}

// 2. LINJESJEKK
function getDrawnYAt(x) {
  if (gameObjects.drawnLine.length < 2) return null;

  for (let i = 0; i < gameObjects.drawnLine.length - 1; i++) {
    let p1 = gameObjects.drawnLine[i];
    let p2 = gameObjects.drawnLine[i + 1];

    let minX = Math.min(p1.x, p2.x);
    let maxX = Math.max(p1.x, p2.x);

    if (x >= minX && x <= maxX) {
      if (maxX === minX) return p1.y;
      let factor = (x - p1.x) / (p2.x - p1.x);
      return p1.y + factor * (p2.y - p1.y);
    }
  }
  return null;
}

function getDrawnLineMaxX() {
  if (gameObjects.drawnLine.length === 0) return 0;
  return Math.max(...gameObjects.drawnLine.map(p => p.x));
}

function getDrawnLineMinX() {
  if (gameObjects.drawnLine.length === 0) return Infinity;
  return Math.min(...gameObjects.drawnLine.map(p => p.x));
}

// Sjekker om linjen er en gyldig, trygg bro over hinderet
function isSafeBridgeOverObstacle(obs) {
  if (gameObjects.drawnLine.length < 2) return false;

  const obstacleTopY = GROUND_Y - obs.height;

  // Sjekk gjennom hele hinderets bredde
  for (let xCheck = obs.x; xCheck <= obs.x + obs.width; xCheck += 5) {
    let lineY = getDrawnYAt(xCheck);
    // Hvis det mangler strek over hinderet, eller hvis streken er lavere (høyere Y-verdi) enn toppen av hinderet
    if (lineY === null || lineY > obstacleTopY) {
      return false; // Streken er for lav eller mangler her -> ikke en trygg bro!
    }
  }
  return true; // Broen dekker hele hinderet og er høyt nok opp!
}

// 3. OPPDATERING
function update() {
  if (gameObjects.isGameOver) return;

  let p = gameObjects.player;
  let currentObs = gameObjects.obstacles[gameObjects.currentObstacleIndex];

  // Hvis han har vondt i tåen, la ham hoppe i ro og tel ned timeren
  if (p.state === 'HURT_TOE') {
    p.speed = 0;
    p.walkFrame += 1;
    p.hurtTimer--;
    if (p.hurtTimer <= 0) {
      p.state = 'STOPPED_ANGRY'; 
      p.x -= 25; // Flytt ham litt bakover slik at han kommer ut av kollisjonssonen
    }
    return;
  }

  if (!p.isFalling) {
    let drawnY = getDrawnYAt(p.x);
    let targetY = GROUND_Y;

    // Sjekk kollisjon med faste hinder (vegger, kanoner, pigger)
    if (currentObs && (currentObs.type === 'wall' || currentObs.type === 'canon' || currentObs.type === 'spikes') && !currentObs.passed) {
      
      // Når spilleren nærmer seg hinderet
      if (p.x + 5 >= currentObs.x && p.x < currentObs.x + currentObs.width) {
        
        // Hvis det IKKE finnes en trygg bro over hinderet, skal han krasje og få tå-smerte!
        if (!isSafeBridgeOverObstacle(currentObs)) {
          if (p.speed > 0) {
            p.speed = 0;
            p.state = 'HURT_TOE';
            p.hurtTimer = 150; // Vis smerte i ca 2.5 sekunder
            p.x = currentObs.x - 5; // Sett foten fint opp til kanten
            gameObjects.score = Math.max(0, gameObjects.score - 75);
            gameObjects.drawnLine = [];
          }
          return;
        }
      }
    }

    if (currentObs && currentObs.type === 'cloud') {
      targetY = GROUND_Y;
    } else if (drawnY !== null) {
      targetY = drawnY;
    }

    let hasRoofAbove = false;
    if (currentObs && currentObs.type === 'cloud') {
      for (let xCheck = currentObs.x - 20; xCheck <= currentObs.x + currentObs.width; xCheck += 10) {
        let lineY = getDrawnYAt(xCheck);
        if (lineY !== null && lineY < GROUND_Y - 50 && lineY > GROUND_Y - 220) {
          hasRoofAbove = true;
          break;
        }
      }
    }

    if (p.speed === 0) {
      if (p.state !== 'HURT_TOE' && p.state !== 'STOPPED_ANGRY') p.state = 'STOPPED_ANGRY';
    } else if (p.state !== 'HURT_TOE') {
      p.state = 'WALKING_HAPPY';
    }

    if (currentObs && !currentObs.passed) {
      if (currentObs.type === 'hole' && p.x > currentObs.x + 10 && p.x < currentObs.x + currentObs.width - 10) {
        if (drawnY === null) {
          p.isFalling = true;
          p.speed = 0;
        }
      } else if (currentObs.type === 'cloud' && p.x >= currentObs.x && p.x <= currentObs.x + currentObs.width) {
        if (!hasRoofAbove && gameObjects.wetObstaclesCounter === 0) {
          gameObjects.wetObstaclesCounter = 5; 
        }
      }
    }

    if (p.speed !== 0) {
      p.x += p.speed;
      if (p.x < 10) p.x = 10;
      p.walkFrame += 1;
      p.facingRight = p.speed > 0;
    }
    p.y = targetY;

    if (currentObs) {
      const obsEndX = currentObs.x + currentObs.width;
      const lineEndX = getDrawnLineMaxX();
      const endThreshold = Math.max(obsEndX, lineEndX) + 20;

      if (p.x > endThreshold && !currentObs.passed) {
        currentObs.passed = true;
        let earnedPoints = 100;
        if (gameObjects.manualStopPenaltyApplied) earnedPoints = 10;
        if (gameObjects.wetObstaclesCounter > 0) {
          earnedPoints = Math.floor(earnedPoints / 2);
          gameObjects.wetObstaclesCounter--;
        }
        gameObjects.score += earnedPoints;
        gameObjects.currentObstacleIndex++;
        gameObjects.manualStopPenaltyApplied = false;
        spawnNextObstacle(p.x + 300);
        gameObjects.drawnLine = [];
      }
    }
  } else {
    p.fallSpeed += 0.4;
    p.y += p.fallSpeed;
    if (p.y > canvas.height + 50) {
      gameObjects.isGameOver = true;
    }
  }

  gameObjects.cameraX = Math.max(0, p.x - canvas.width / 3);
}

function resetGame() {
  gameObjects.player.x = 50;
  gameObjects.player.y = GROUND_Y;
  gameObjects.player.speed = 2;
  gameObjects.player.facingRight = true;
  gameObjects.player.isFalling = false;
  gameObjects.player.fallSpeed = 0;
  gameObjects.player.walkFrame = 0;
  gameObjects.player.state = 'WALKING_HAPPY';
  gameObjects.player.hurtTimer = 0;
  gameObjects.drawnLine = [];
  gameObjects.cameraX = 0;
  gameObjects.score = 0;
  gameObjects.manualStopPenaltyApplied = false;
  gameObjects.isGameOver = false;
  gameObjects.wetObstaclesCounter = 0;
  initObstacles();
}

// 4. TEGNING AV SCENE OG DYNAMISK TEKST
function drawScene() {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let currentObs = gameObjects.obstacles[gameObjects.currentObstacleIndex];

  // Hovedbakken
  ctx.beginPath();
  ctx.moveTo(-gameObjects.cameraX, GROUND_Y);

  if (currentObs) {
    const screenX = currentObs.x - gameObjects.cameraX;

    if (currentObs.type === 'hole') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, canvas.height);
      ctx.moveTo(screenX + currentObs.width, canvas.height);
      ctx.lineTo(screenX + currentObs.width, GROUND_Y);
    } else if (currentObs.type === 'wall') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, GROUND_Y - currentObs.height);
      ctx.lineTo(screenX + currentObs.width, GROUND_Y - currentObs.height);
      ctx.lineTo(screenX + currentObs.width, GROUND_Y);
    } else if (currentObs.type === 'spikes') {
      ctx.lineTo(screenX, GROUND_Y);
      const spikeWidth = currentObs.width / currentObs.count;
      for (let i = 0; i < currentObs.count; i++) {
        ctx.lineTo(screenX + i * spikeWidth + spikeWidth / 2, GROUND_Y - currentObs.height);
        ctx.lineTo(screenX + (i + 1) * spikeWidth, GROUND_Y);
      }
    } else if (currentObs.type === 'canon') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, GROUND_Y - currentObs.height);
      ctx.lineTo(screenX + currentObs.width, GROUND_Y - currentObs.height + 10);
      ctx.lineTo(screenX + currentObs.width, GROUND_Y);
    } else if (currentObs.type === 'cloud') {
      ctx.lineTo(screenX + currentObs.width, GROUND_Y);
    }
  }

  ctx.lineTo(canvas.width + gameObjects.cameraX, GROUND_Y);
  ctx.stroke();

  // Regnsky
  if (currentObs && currentObs.type === 'cloud') {
    const screenX = currentObs.x - gameObjects.cameraX;
    const cloudY = GROUND_Y - 240;

    ctx.beginPath();
    ctx.arc(screenX + 35, cloudY, 22, Math.PI, 0, false);
    ctx.arc(screenX + 70, cloudY - 12, 28, Math.PI, 0, false);
    ctx.arc(screenX + 105, cloudY, 22, Math.PI, 0, false);
    ctx.lineTo(screenX + 15, cloudY + 10);
    ctx.closePath();
    ctx.stroke();

    ctx.save();
    ctx.lineWidth = 2;
    const dropOffset = (Date.now() / 10) % 25;
    for (let i = 0; i < 5; i++) {
      let dropX = screenX + 25 + i * 20;
      let dropY = cloudY + 20 + dropOffset;
      ctx.beginPath();
      ctx.moveTo(dropX, dropY);
      ctx.lineTo(dropX - 5, dropY + 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Tegnet linje
  if (gameObjects.drawnLine.length > 1) {
    ctx.beginPath();
    ctx.moveTo(gameObjects.drawnLine[0].x - gameObjects.cameraX, gameObjects.drawnLine[0].y);
    for (let i = 1; i < gameObjects.drawnLine.length; i++) {
      ctx.lineTo(gameObjects.drawnLine[i].x - gameObjects.cameraX, gameObjects.drawnLine[i].y);
    }
    ctx.stroke();
  }

  // UI / Poeng og dynamisk hjelpetekst
  ctx.save();
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Poeng: ' + gameObjects.score, 30, 40);

  if (gameObjects.wetObstaclesCounter > 0) {
    ctx.fillStyle = '#66ccff';
    ctx.fillText('Våt! (Redusert poeng i ' + gameObjects.wetObstaclesCounter + ' hinder til)', 30, 70);
  }

  // Dynamisk veiledning i bunnen av canvas
  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'center';
  let hintText = 'Bruk musehjulet til å rulle frem og tilbake';
  
  if (currentObs) {
    if (currentObs.type === 'hole') hintText = 'Tegn en bro over hele hullet!';
    else if (currentObs.type === 'wall' || currentObs.type === 'canon') hintText = 'Tegn over hele hinderet, eller rull bakover for å snu!';
    else if (currentObs.type === 'spikes') hintText = 'Tegn høyt nok over piggene for å unngå å slå deg!';
    else if (currentObs.type === 'cloud') hintText = 'Tegn et tak over skyen for å unngå å bli våt!';
  }
  ctx.fillText(hintText, canvas.width / 2, canvas.height - 20);
  ctx.restore();

  // Game Over
  if (gameObjects.isGameOver) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'center';
    ctx.fillText('STREKEN FALDT NED / DØDE!', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Sluttscore: ' + gameObjects.score, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('Klikk med musen for å prøve igjen', canvas.width / 2, canvas.height / 2 + 65);
    ctx.restore();
  }
}

// 5. HELPER FOR FINGERER
function drawHand(ctx, startX, startY, angle, scale = 1) {
  ctx.save();
  ctx.translate(startX, startY);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.lineTo(-5, -12);
  ctx.lineTo(0, -22);
  ctx.lineTo(5, -12);
  ctx.lineTo(10, -25);
  ctx.lineTo(15, -12);
  ctx.lineTo(20, -23);
  ctx.lineTo(22, -10);
  ctx.lineTo(27, -18);
  ctx.lineTo(24, -2);
  ctx.restore();
}

// 6. TEGNING AV STREKEN
function drawStrekenCharacter(x, y, frame, facingRight, state) {
  ctx.save();
  ctx.translate(x - gameObjects.cameraX, y);

  if (!facingRight) {
    ctx.scale(-1, 1);
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const isMoving = gameObjects.player.speed !== 0;
  let bob = isMoving ? Math.abs(Math.sin(frame * 0.25)) * 3 : 0;

  if (state === 'HURT_TOE') {
    bob = Math.abs(Math.sin(frame * 0.6)) * 12;
  }

  ctx.translate(0, -bob);
  ctx.beginPath();

  if (state === 'HURT_TOE') {
    ctx.moveTo(-15, 0);
    ctx.bezierCurveTo(-10, -25, -5, -45, 0, -60);
    ctx.lineTo(-25, -25);

    ctx.moveTo(-10, -75);
    ctx.bezierCurveTo(-25, -85, -35, -70, -30, -50);

    ctx.moveTo(0, -60);
    ctx.bezierCurveTo(5, -90, 20, -110, 35, -100);
    ctx.bezierCurveTo(45, -95, 40, -80, 25, -80);

  } else if (state === 'STOPPED_ANGRY') {
    const talkMouth = Math.sin(frame * 0.4) * 8;
    const armWave = Math.sin(frame * 0.3) * 0.2;

    ctx.moveTo(-35, 0);
    ctx.bezierCurveTo(-20, -20, -15, -55, -10, -85);
    ctx.bezierCurveTo(-25, -95, -45, -100, -55, -110 + armWave * 10);
    drawHand(ctx, -55, -110 + armWave * 10, -Math.PI / 3 + armWave);
    ctx.lineTo(-10, -85);

    ctx.bezierCurveTo(-5, -115, 0, -135, 15, -145);
    ctx.bezierCurveTo(30, -150, 40, -135, 32, -125);
    ctx.lineTo(10 - talkMouth, -115);
    ctx.bezierCurveTo(25, -105, 25, -95, 10, -90);

    ctx.bezierCurveTo(20, -80, 40, -85, 55, -95 - armWave * 10);
    drawHand(ctx, 55, -95 - armWave * 10, Math.PI / 4 - armWave);
    ctx.lineTo(12, -75);
    ctx.bezierCurveTo(15, -50, 8, -25, 0, 0);

  } else {
    ctx.moveTo(-40, 0);
    ctx.bezierCurveTo(-30, -20, -25, -60, -20, -90);
    ctx.bezierCurveTo(-35, -110, -50, -125, -65, -140);
    drawHand(ctx, -65, -140, -Math.PI / 4);
    ctx.lineTo(-20, -90);

    ctx.bezierCurveTo(-15, -120, -10, -150, 5, -165);
    ctx.bezierCurveTo(20, -175, 30, -160, 20, -145);
    ctx.lineTo(-5, -130);
    ctx.bezierCurveTo(10, -120, 15, -110, 5, -100);

    ctx.bezierCurveTo(15, -115, 35, -140, 50, -165);
    drawHand(ctx, 50, -165, Math.PI / 6);
    ctx.lineTo(10, -85);
    ctx.bezierCurveTo(12, -55, 5, -25, 0, 0);
  }

  ctx.stroke();

  if (gameObjects.wetObstaclesCounter > 0) {
    ctx.save();
    ctx.strokeStyle = '#66ccff';
    ctx.lineWidth = 2;
    const splashAnim = (frame * 0.3) % Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(-15 - Math.sin(splashAnim) * 10, -60 - splashAnim * 15);
    ctx.lineTo(-18 - Math.sin(splashAnim) * 10, -50 - splashAnim * 15);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(15 + Math.cos(splashAnim) * 10, -70 - splashAnim * 12);
    ctx.lineTo(18 + Math.cos(splashAnim) * 10, -60 - splashAnim * 12);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// 7. EVENT LISTENERS
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (gameObjects.isGameOver) return;

  let p = gameObjects.player;
  if (p.isFalling) return;

  const direction = e.deltaY < 0 ? 1 : -1;

  // Hvis han er stoppet (enten etter stopp eller ferdig med tå-skade), tillat å rulle bakover
  if (p.state === 'STOPPED_ANGRY' && direction < 0) {
    p.speed = -p.maxSpeed;
    p.facingRight = false;
    p.state = 'WALKING_HAPPY';
    scrollAccumulator = 0;
    
    if (!gameObjects.manualStopPenaltyApplied) {
      gameObjects.score = Math.max(0, gameObjects.score - 20);
      gameObjects.manualStopPenaltyApplied = true;
    }
    return;
  }

  // Ignorer musehjul mens tå-skaden pågår aktivt
  if (p.state === 'HURT_TOE') return;

  if (p.speed !== 0 && ((p.speed > 0 && direction < 0) || (p.speed < 0 && direction > 0))) {
    p.speed = 0;
    scrollAccumulator = 0;
    return;
  }

  scrollAccumulator += direction;

  if (scrollAccumulator >= 2) {
    p.speed = p.maxSpeed;
    p.facingRight = true;
    scrollAccumulator = 0;
  } else if (scrollAccumulator <= -2) {
    p.speed = -p.maxSpeed;
    p.facingRight = false;
    scrollAccumulator = 0;
  }

  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    scrollAccumulator = 0;
  }, 300);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  if (gameObjects.isGameOver) {
    resetGame();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  isDragging = true;
  gameObjects.drawnLine = [{
    x: e.clientX - rect.left + gameObjects.cameraX,
    y: e.clientY - rect.top
  }];
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging || gameObjects.isGameOver) return;
  const rect = canvas.getBoundingClientRect();
  gameObjects.drawnLine.push({
    x: e.clientX - rect.left + gameObjects.cameraX,
    y: e.clientY - rect.top
  });
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// 8. MAIN LOOP
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  update();
  drawScene();
  drawStrekenCharacter(
    gameObjects.player.x, 
    gameObjects.player.y, 
    gameObjects.player.walkFrame, 
    gameObjects.player.facingRight,
    gameObjects.player.state
  );

  requestAnimationFrame(gameLoop);
}

initObstacles();
gameLoop();