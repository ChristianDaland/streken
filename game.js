const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let GROUND_Y = 400; 
let isLandscape = false;
let isSmallLandscape = false;
const OBSTACLE_TYPES = ['hole', 'wall', 'spikes', 'canon', 'cloud'];

let gameObjects = {
  player: {
    x: 50,
    y: 400,
    speed: 2,
    maxSpeed: 2,
    facingRight: true,
    isFalling: false,
    fallSpeed: 0,
    fallStartY: 400,
    walkFrame: 0,
    state: 'WALKING_HAPPY',
    hurtTimer: 0
  },
  obstacles: [],
  drawnLines: [],
  cameraX: 0,
  score: 0,
  manualStopPenaltyApplied: false,
  isGameOver: false,
  wetObstaclesCounter: 0
};

let scrollAccumulator = 0;
let scrollTimeout = null;
let isDragging = false;
let currentStroke = null;

// Dynamisk skalering
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  isLandscape = canvas.width > canvas.height;
  isSmallLandscape = isLandscape && canvas.height < 500;
  
  if (isLandscape) {
    if (isSmallLandscape) {
      GROUND_Y = Math.floor(canvas.height * 0.72);
    } else if (canvas.height < 600) {
      GROUND_Y = Math.floor(canvas.height * 0.75);
    } else {
      GROUND_Y = Math.floor(canvas.height * 0.70);
    }
  } else {
    GROUND_Y = Math.floor(canvas.height * 0.65);
  }
  
  if (!gameObjects.player.isFalling) {
    gameObjects.player.y = GROUND_Y;
    gameObjects.player.fallStartY = GROUND_Y;
  }
}

window.addEventListener('resize', resizeCanvas);

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
  gameObjects.manualStopPenaltyApplied = false;
  gameObjects.wetObstaclesCounter = 0;

  let startX = 400;
  const spacing = isLandscape && !isSmallLandscape ? 500 : 380;

  for (let i = 0; i < 4; i++) {
    const randomType = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    gameObjects.obstacles.push(createObstacle(startX, randomType));
    startX += spacing;
  }
}

function getCurrentObstacle() {
  return gameObjects.obstacles.find(obs => !obs.passed);
}

// 2. LINJESJEKK & HJELPEFUNKSJONER
function getDrawnYAt(x) {
  if (!gameObjects.drawnLines || gameObjects.drawnLines.length === 0) return null;

  let bestY = null;

  for (let line of gameObjects.drawnLines) {
    if (line.length < 2) continue;

    for (let i = 0; i < line.length - 1; i++) {
      let p1 = line[i];
      let p2 = line[i + 1];

      let minX = Math.min(p1.x, p2.x);
      let maxX = Math.max(p1.x, p2.x);

      if (x >= minX && x <= maxX) {
        let y = null;
        if (maxX === minX) {
          y = p1.y;
        } else {
          let factor = (x - p1.x) / (p2.x - p1.x);
          y = p1.y + factor * (p2.y - p1.y);
        }
        
        if (bestY === null || y < bestY) {
          bestY = y;
        }
      }
    }
  }
  return bestY;
}

function getDrawnLineMaxX() {
  if (!gameObjects.drawnLines || gameObjects.drawnLines.length === 0) return 0;
  let maxX = 0;
  for (let line of gameObjects.drawnLines) {
    if (line.length > 0) {
      let lineMax = Math.max(...line.map(p => p.x));
      if (lineMax > maxX) maxX = lineMax;
    }
  }
  return maxX;
}

function isSafeBridgeOverObstacle(obs) {
  if (!gameObjects.drawnLines || gameObjects.drawnLines.length === 0) return false;

  const obstacleTopY = GROUND_Y - obs.height;

  for (let xCheck = obs.x; xCheck <= obs.x + obs.width; xCheck += 5) {
    let lineY = getDrawnYAt(xCheck);
    if (lineY === null || lineY > obstacleTopY + 10) {
      return false; 
    }
  }
  return true; 
}

function getCloudY() {
  if (isLandscape) {
    if (isSmallLandscape) {
      return Math.max(50, GROUND_Y - 140);
    } else if (canvas.height < 600) {
      return Math.max(60, GROUND_Y - 180);
    } else {
      return GROUND_Y - 220;
    }
  } else {
    return Math.max(80, GROUND_Y - 210);
  }
}

// 3. OPPDATERING
function update() {
  if (gameObjects.isGameOver) return;

  let p = gameObjects.player;
  let currentObs = getCurrentObstacle();

  if (p.state === 'HURT_TOE') {
    p.speed = 0;
    p.walkFrame += 1;
    p.hurtTimer--;
    if (p.hurtTimer <= 0) {
      p.state = 'STOPPED_ANGRY'; 
      p.x -= 25; 
    }
    return;
  }

  if (!p.isFalling) {
    let targetY = GROUND_Y;
    let drawnY = getDrawnYAt(p.x);

    // Sjekk om Streken faktisk skal gå på en tegnet linje:
    // Han må enten allerede gå på en linje (p.y < GROUND_Y - 5)
    // ELLER linjen må starte helt nede ved føttene hans (nærheten av p.y)
    if (drawnY !== null) {
      let heightDiff = p.y - drawnY;
      if (p.y < GROUND_Y - 5 || (heightDiff >= -10 && heightDiff <= 25)) {
        targetY = drawnY;
      }
    }

    // Kollisjonslogikk for fysiske hindre
    if (currentObs && !currentObs.passed) {
      if (currentObs.type === 'wall' || currentObs.type === 'canon' || currentObs.type === 'spikes') {
        if (p.x + 5 >= currentObs.x && p.x < currentObs.x + currentObs.width) {
          if (!isSafeBridgeOverObstacle(currentObs)) {
            if (p.speed > 0) {
              p.speed = 0;
              p.state = 'HURT_TOE';
              p.hurtTimer = 150;
              p.x = currentObs.x - 5;
              gameObjects.score = Math.max(0, gameObjects.score - 75);
            }
            return;
          }
        }
      } else if (currentObs.type === 'hole' && p.x >= currentObs.x && p.x <= currentObs.x + currentObs.width) {
        if (drawnY === null) {
          p.isFalling = true;
          p.fallStartY = GROUND_Y;
          p.fallSpeed = 0;
          p.speed = 0;
        }
      }
      // Skyen påvirker aldri bakkenivået
    }

    // Sjekk om han går av en tegnet linje ut i luften
    if (p.y < GROUND_Y && drawnY === null) {
      let isOverHole = (currentObs && currentObs.type === 'hole' && p.x >= currentObs.x && p.x <= currentObs.x + currentObs.width);
      if (!isOverHole) {
        p.isFalling = true;
        p.fallStartY = p.y;
        p.fallSpeed = 0;
        p.speed = 0;
      }
    }

    // Sjekk om spilleren har tegnet tak/paraply OVER skyen
    let hasRoofAbove = false;
    const cloudY = getCloudY();
    if (currentObs && currentObs.type === 'cloud') {
      for (let xCheck = currentObs.x - 20; xCheck <= currentObs.x + currentObs.width + 20; xCheck += 10) {
        let lineY = getDrawnYAt(xCheck);
        if (lineY !== null && lineY < cloudY) {
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

    // Våt-status hvis han er under sky uten tak over
    if (currentObs && !currentObs.passed) {
      if (currentObs.type === 'cloud' && p.x >= currentObs.x && p.x <= currentObs.x + currentObs.width) {
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

    // Sjekk om hinder er passert
    gameObjects.obstacles.forEach(obs => {
      if (!obs.passed) {
        const obsEndX = obs.x + obs.width;
        const lineEndX = getDrawnLineMaxX();
        const endThreshold = Math.max(obsEndX, lineEndX) + 20;

        if (p.x > endThreshold) {
          obs.passed = true;
          let earnedPoints = 100;
          if (gameObjects.manualStopPenaltyApplied) earnedPoints = 10;
          if (gameObjects.wetObstaclesCounter > 0) {
            earnedPoints = Math.floor(earnedPoints / 2);
            gameObjects.wetObstaclesCounter--;
          }
          gameObjects.score += earnedPoints;
          gameObjects.manualStopPenaltyApplied = false;

          const lastObs = gameObjects.obstacles[gameObjects.obstacles.length - 1];
          const spacing = isLandscape && !isSmallLandscape ? 500 : 380;
          const randomType = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
          gameObjects.obstacles.push(createObstacle(lastObs.x + spacing, randomType));
        }
      }
    });

  } else {
    p.fallSpeed += 0.4;
    p.y += p.fallSpeed;

    let isOverHoleWithoutBridge = (currentObs && currentObs.type === 'hole' && p.x >= currentObs.x && p.x <= currentObs.x + currentObs.width && getDrawnYAt(p.x) === null);

    if (!isOverHoleWithoutBridge && p.y >= GROUND_Y) {
      let fallHeight = GROUND_Y - p.fallStartY;
      p.y = GROUND_Y;
      p.isFalling = false;
      p.fallSpeed = 0;

      if (fallHeight > 130) {
        gameObjects.isGameOver = true;
      } else if (fallHeight > 45) {
        p.state = 'HURT_TOE';
        p.hurtTimer = 120;
        gameObjects.score = Math.max(0, gameObjects.score - 50);
      } else {
        p.state = 'WALKING_HAPPY';
        p.speed = p.maxSpeed;
      }
    }

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
  gameObjects.player.fallStartY = GROUND_Y;
  gameObjects.player.walkFrame = 0;
  gameObjects.player.state = 'WALKING_HAPPY';
  gameObjects.player.hurtTimer = 0;
  gameObjects.drawnLines = [];
  gameObjects.cameraX = 0;
  gameObjects.score = 0;
  gameObjects.manualStopPenaltyApplied = false;
  gameObjects.isGameOver = false;
  gameObjects.wetObstaclesCounter = 0;
  initObstacles();
}

// 4. TEGNING AV SCENE OG ALLE STREKER
function drawScene() {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(-gameObjects.cameraX, GROUND_Y);

  gameObjects.obstacles.forEach(obs => {
    const screenX = obs.x - gameObjects.cameraX;

    if (obs.type === 'hole') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, canvas.height);
      ctx.moveTo(screenX + obs.width, canvas.height);
      ctx.lineTo(screenX + obs.width, GROUND_Y);
    } else if (obs.type === 'wall') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, GROUND_Y - obs.height);
      ctx.lineTo(screenX + obs.width, GROUND_Y - obs.height);
      ctx.lineTo(screenX + obs.width, GROUND_Y);
    } else if (obs.type === 'spikes') {
      ctx.lineTo(screenX, GROUND_Y);
      const spikeWidth = obs.width / obs.count;
      for (let i = 0; i < obs.count; i++) {
        ctx.lineTo(screenX + i * spikeWidth + spikeWidth / 2, GROUND_Y - obs.height);
        ctx.lineTo(screenX + (i + 1) * spikeWidth, GROUND_Y);
      }
    } else if (obs.type === 'canon') {
      ctx.lineTo(screenX, GROUND_Y);
      ctx.lineTo(screenX, GROUND_Y - obs.height);
      ctx.lineTo(screenX + obs.width, GROUND_Y - obs.height + 10);
      ctx.lineTo(screenX + obs.width, GROUND_Y);
    } else if (obs.type === 'cloud') {
      ctx.lineTo(screenX + obs.width, GROUND_Y);
    }
  });

  ctx.lineTo(canvas.width + gameObjects.cameraX * 2, GROUND_Y);
  ctx.stroke();

  gameObjects.obstacles.forEach(obs => {
    if (obs.type === 'cloud') {
      const screenX = obs.x - gameObjects.cameraX;
      const cloudY = getCloudY();

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
  });

  if (gameObjects.drawnLines && gameObjects.drawnLines.length > 0) {
    ctx.beginPath();
    for (let line of gameObjects.drawnLines) {
      if (line.length > 1) {
        ctx.moveTo(line[0].x - gameObjects.cameraX, line[0].y);
        for (let i = 1; i < line.length; i++) {
          ctx.lineTo(line[i].x - gameObjects.cameraX, line[i].y);
        }
      }
    }
    ctx.stroke();
  }

  ctx.save();
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Poeng: ' + gameObjects.score, 30, 40);

  if (gameObjects.wetObstaclesCounter > 0) {
    ctx.fillStyle = '#66ccff';
    ctx.fillText('Våt! (Redusert poeng i ' + gameObjects.wetObstaclesCounter + ' hinder til)', 30, 70);
  }

  if (!isSmallLandscape) {
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.textAlign = 'center';
    let currentObs = getCurrentObstacle();
    let hintText = 'Bruk musehjulet (eller trykk bak/på Streken) for bevegelse';
    
    if (currentObs) {
      if (currentObs.type === 'hole') hintText = 'Tegn en bro over hele hullet foran Streken!';
      else if (currentObs.type === 'wall' || currentObs.type === 'canon') hintText = 'Tegn over hinderet, eller trykk på Streken for å snu!';
      else if (currentObs.type === 'spikes') hintText = 'Tegn høyt nok over piggene!';
      else if (currentObs.type === 'cloud') hintText = 'Tegn et tak over skyen som en paraply for å ikke bli våt!';
    }
    ctx.fillText(hintText, canvas.width / 2, canvas.height - 20);
  }
  ctx.restore();

  if (gameObjects.isGameOver) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'center';
    ctx.fillText('STREKEN FALT NED / DØDE!', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Sluttscore: ' + gameObjects.score, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('Trykk eller klikk for å prøve igjen', canvas.width / 2, canvas.height / 2 + 65);
    ctx.restore();
  }
}

// 5. HELPER FOR HENDER
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

// 7. INPUT-LOGIKK MED INTERPOLERING
function getCanvasCoordinates(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const vx = window.visualViewport ? window.visualViewport.offsetLeft : 0;
  const vy = window.visualViewport ? window.visualViewport.offsetTop : 0;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left - vx) * scaleX,
    y: (clientY - rect.top - vy) * scaleY
  };
}

function handleInputStart(screenX, screenY) {
  if (gameObjects.isGameOver) {
    resetGame();
    return;
  }

  let p = gameObjects.player;
  let playerScreenX = p.x - gameObjects.cameraX;

  if (screenX <= playerScreenX + 25) {
    if (p.state === 'HURT_TOE') return;

    if (p.speed !== 0) {
      p.speed = 0;
      scrollAccumulator = 0;
    } else {
      if (p.facingRight) {
        p.speed = -p.maxSpeed;
        p.facingRight = false;
      } else {
        p.speed = p.maxSpeed;
        p.facingRight = true;
      }
      p.state = 'WALKING_HAPPY';
      
      if (!gameObjects.manualStopPenaltyApplied) {
        gameObjects.score = Math.max(0, gameObjects.score - 20);
        gameObjects.manualStopPenaltyApplied = true;
      }
    }
  } else {
    isDragging = true;
    currentStroke = [{
      x: screenX + gameObjects.cameraX,
      y: screenY
    }];
    gameObjects.drawnLines.push(currentStroke);
  }
}

function handleInputMove(screenX, screenY) {
  if (!isDragging || !currentStroke || gameObjects.isGameOver) return;

  const newX = screenX + gameObjects.cameraX;
  const newY = screenY;

  const lastPoint = currentStroke[currentStroke.length - 1];
  const dx = newX - lastPoint.x;
  const dy = newY - lastPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 5) {
    const steps = Math.ceil(distance / 5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      currentStroke.push({
        x: lastPoint.x + dx * t,
        y: lastPoint.y + dy * t
      });
    }
  } else {
    currentStroke.push({
      x: newX,
      y: newY
    });
  }
}

function handleInputEnd() {
  isDragging = false;
  currentStroke = null;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (gameObjects.isGameOver) return;

  let p = gameObjects.player;
  if (p.isFalling) return;

  const direction = e.deltaY < 0 ? 1 : -1;

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
  const coords = getCanvasCoordinates(e.clientX, e.clientY);
  handleInputStart(coords.x, coords.y);
});

canvas.addEventListener('mousemove', (e) => {
  const coords = getCanvasCoordinates(e.clientX, e.clientY);
  handleInputMove(coords.x, coords.y);
});

window.addEventListener('mouseup', handleInputEnd);

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
    handleInputStart(coords.x, coords.y);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch.clientX, touch.clientY);
    handleInputMove(coords.x, coords.y);
  }
}, { passive: false });

window.addEventListener('touchend', handleInputEnd);

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

resizeCanvas();
gameObjects.player.y = GROUND_Y;
gameObjects.player.fallStartY = GROUND_Y;
initObstacles();
gameLoop();