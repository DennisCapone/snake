"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// --- TIPI E COSTANTI ---
type Point = { x: number; y: number };
type SnakeSegment = { x: number; y: number; px: number; py: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type FloatingText = { x: number; y: number; text: string; life: number; maxLife: number };

const GRID = 20;
const CELL = 20;
const CANVAS_SIZE = GRID * CELL;

export default function SnakeDopamine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [score, setScore] = useState<number>(0);

  const game = useRef({
    snake: [] as SnakeSegment[],
    dir: { x: 0, y: -1 },
    inputQueue: [] as Point[],
    food: { x: 5, y: 5 },
    particles: [] as Particle[],
    texts: [] as FloatingText[],
    logicTimer: 0,
    speed: 100, 
    shake: 0,
    lastTime: 0,
  });

  // --- LOGICA AI (AUTO MODE) ---
  const getSmartDir = useCallback(() => {
    const { snake, food, dir } = game.current;
    const head = snake[0];
    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
    
    // Evita inversioni a U repentine nell'AI
    const validDirs = dirs.filter(d => !(d.x === -dir.x && d.y === -dir.y));

    // isBodyStrict considera l'intero corpo (utile per il pathfinding verso il cibo)
    const isBodyStrict = (x: number, y: number) => snake.some(s => s.x === x && s.y === y);
    // isBodyLoose ignora la punta della coda (utile per la sopravvivenza, permette di inseguire la propria coda)
    const isBodyLoose = (x: number, y: number) => snake.some((s, i) => i !== snake.length - 1 && s.x === x && s.y === y);

    // BFS per trovare il cibo
    const q: { x: number; y: number; path: Point[] }[] = [{ x: head.x, y: head.y, path: [] }];
    const visited = new Set<number>([head.x + head.y * GRID]);
    let targetPath: Point[] | null = null;

    while (q.length > 0) {
      const curr = q.shift()!;
      if (curr.x === food.x && curr.y === food.y) {
        targetPath = curr.path;
        break;
      }
      for (const d of (curr.path.length === 0 ? validDirs : dirs)) {
        const nx = curr.x + d.x, ny = curr.y + d.y;
        const posKey = nx + ny * GRID;
        if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && !isBodyStrict(nx, ny) && !visited.has(posKey)) {
          visited.add(posKey);
          q.push({ x: nx, y: ny, path: [...curr.path, d] });
        }
      }
    }

    if (targetPath && targetPath.length > 0) return targetPath[0];

    // Modalità Sopravvivenza: cerca la prima cella sicura, permettendosi di seguire la coda
    for (const d of validDirs) {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && !isBodyLoose(nx, ny)) return d;
    }
    return validDirs[0]; 
  }, []);

  // --- CONTROLLI E SETUP ---
  const spawnFood = useCallback(() => {
    // FIX: Previene il loop infinito se il serpente occupa quasi tutta la mappa
    const freeSpots: Point[] = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!game.current.snake.some(s => s.x === x && s.y === y)) {
          freeSpots.push({ x, y });
        }
      }
    }
    if (freeSpots.length > 0) {
      game.current.food = freeSpots[Math.floor(Math.random() * freeSpots.length)];
    }
  }, []);

  const startGame = (selectedMode: "manual" | "auto") => {
    setMode(selectedMode);
    game.current = {
      snake: [{ x: 10, y: 10, px: 10, py: 10 }],
      dir: { x: 0, y: -1 },
      inputQueue: [],
      food: { x: 5, y: 2 },
      particles: [],
      texts: [],
      logicTimer: 0,
      speed: selectedMode === "auto" ? 35 : 110,
      shake: 0,
      lastTime: performance.now(),
    };
    spawnFood();
    setScore(0);
    setGameState("playing");
  };

  useEffect(() => {
    if (gameState !== "playing" || mode !== "manual") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();

      const lastDir = game.current.inputQueue.length > 0 
        ? game.current.inputQueue[game.current.inputQueue.length - 1] 
        : game.current.dir;

      let newDir = null;
      if ((e.key === "ArrowUp" || e.key === "w") && lastDir.y === 0) newDir = { x: 0, y: -1 };
      if ((e.key === "ArrowDown" || e.key === "s") && lastDir.y === 0) newDir = { x: 0, y: 1 };
      if ((e.key === "ArrowLeft" || e.key === "a") && lastDir.x === 0) newDir = { x: -1, y: 0 };
      if ((e.key === "ArrowRight" || e.key === "d") && lastDir.x === 0) newDir = { x: 1, y: 0 };

      if (newDir) game.current.inputQueue.push(newDir);
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, mode]);

  // --- GAME LOOP & RENDERING (60 FPS) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameState !== "playing") return;
    const ctx = canvas.getContext("2d")!;
    let animationFrameId: number;

    const render = (time: number) => {
      const state = game.current;
      let dt = time - state.lastTime;
      // FIX: Previene dt giganteschi (es. quando l'utente cambia scheda del browser) che instakillano il serpente
      if (dt > 100) dt = 16; 
      state.lastTime = time;

      // 1. LOGIC TICK
      state.logicTimer += dt;
      if (state.logicTimer >= state.speed) {
        state.logicTimer -= state.speed;

        if (mode === "auto") {
          state.dir = getSmartDir();
        } else if (state.inputQueue.length > 0) {
          state.dir = state.inputQueue.shift()!;
        }

        const head = state.snake[0];
        const nextX = head.x + state.dir.x;
        const nextY = head.y + state.dir.y;

        // FIX: Ignoriamo l'ultima porzione della coda nella collisione perché si starà già muovendo
        const isSelfCollision = state.snake.some((s, index) => 
          index !== state.snake.length - 1 && s.x === nextX && s.y === nextY
        );

        if (nextX < 0 || nextX >= GRID || nextY < 0 || nextY >= GRID || isSelfCollision) {
          state.shake = 20; 
          setGameState("gameover");
          return; 
        }

        // FIX: Passaggio del testimone (px e py devono guardare la VECCHIA posizione dell'elemento fisicamente precedente)
        const newSnake: SnakeSegment[] = [{ x: nextX, y: nextY, px: head.x, py: head.y }];
        for (let i = 0; i < state.snake.length - 1; i++) {
          newSnake.push({ 
            x: state.snake[i].x, 
            y: state.snake[i].y, 
            px: state.snake[i + 1].x, 
            py: state.snake[i + 1].y 
          });
        }

        // Mangia il cibo
        if (nextX === state.food.x && nextY === state.food.y) {
          setScore(s => s + 10);
          state.shake = 5; 
          if (mode === "manual") state.speed = Math.max(50, state.speed - 2);

          // FIX: Aggiungi la coda ESATTAMENTE alle coordinate statiche della coda precedente in modo che non subisca interpolazione errata in questo frame
          const tail = state.snake[state.snake.length - 1];
          newSnake.push({ x: tail.x, y: tail.y, px: tail.x, py: tail.y });

          state.texts.push({ x: nextX * CELL, y: nextY * CELL, text: "+10", life: 1, maxLife: 1 });
          for (let i = 0; i < 15; i++) {
            state.particles.push({
              x: nextX * CELL + CELL / 2, y: nextY * CELL + CELL / 2,
              vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
              life: 1, maxLife: 1 + Math.random(), color: ["#ef4444", "#fb923c", "#fcd34d"][Math.floor(Math.random() * 3)],
              size: Math.random() * 4 + 2
            });
          }
          spawnFood();
        }
        state.snake = newSnake;
      }

      // 2. DISEGNO GRAFICA
      ctx.fillStyle = "#0f172a"; 
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
      for(let i=0; i<GRID; i++) {
        for(let j=0; j<GRID; j++) {
          ctx.fillRect(i * CELL + 1, j * CELL + 1, CELL - 2, CELL - 2);
        }
      }

      ctx.save();
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        state.shake *= 0.8; 
        if (state.shake < 0.5) state.shake = 0;
      }

      const progress = Math.min(1, state.logicTimer / state.speed);
      const interp = (p1: number, p2: number) => p1 + (p2 - p1) * progress;

      // Cibo
      const pulse = 1 + Math.sin(time / 150) * 0.2;
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(state.food.x * CELL + CELL/2, state.food.y * CELL + CELL/2, (CELL/2.5) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Corpo Serpente
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#10b981";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = CELL * 0.7;

      const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      grad.addColorStop(0, "#34d399"); 
      grad.addColorStop(1, "#059669"); 
      ctx.strokeStyle = grad;

      ctx.beginPath();
      for (let i = 0; i < state.snake.length; i++) {
        const s = state.snake[i];
        const x = interp(s.px, s.x) * CELL + CELL / 2;
        const y = interp(s.py, s.y) * CELL + CELL / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Testa
      const headS = state.snake[0];
      const hx = interp(headS.px, headS.x) * CELL + CELL / 2;
      const hy = interp(headS.py, headS.y) * CELL + CELL / 2;

      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#34d399";
      ctx.beginPath();
      ctx.arc(hx, hy, CELL * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Occhi
      let dx = headS.x - headS.px;
      let dy = headS.y - headS.py;
      if (dx === 0 && dy === 0) { dx = state.dir.x; dy = state.dir.y; }

      ctx.fillStyle = "#0f172a";
      ctx.shadowBlur = 0;
      const eyeOffset = CELL * 0.2;
      const eyeSize = CELL * 0.15;
      ctx.beginPath();
      if (dx !== 0) {
        ctx.arc(hx + dx * eyeOffset, hy - eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.arc(hx + dx * eyeOffset, hy + eyeOffset, eyeSize, 0, Math.PI*2);
      } else { 
        ctx.arc(hx - eyeOffset, hy + dy * eyeOffset, eyeSize, 0, Math.PI*2);
        ctx.arc(hx + eyeOffset, hy + dy * eyeOffset, eyeSize, 0, Math.PI*2);
      }
      ctx.fill();

      // Particelle
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life -= dt / 1000;
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Testi Fluttuanti
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      for (let i = state.texts.length - 1; i >= 0; i--) {
        const t = state.texts[i];
        t.y -= dt * 0.05;
        t.life -= dt / 1000;
        if (t.life <= 0) { state.texts.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(255, 255, 255, ${t.life / t.maxLife})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#3b82f6";
        ctx.fillText(t.text, t.x, t.y);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, mode, getSmartDir]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "system-ui, sans-serif", padding: "20px", color: "white" }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: `${CANVAS_SIZE}px`, marginBottom: "15px" }}>
        <h2 style={{ margin: 0, textShadow: "0 0 10px rgba(74, 222, 128, 0.5)" }}>SCORE: {score}</h2>
        <h2 style={{ margin: 0, color: mode === "auto" ? "#a78bfa" : "#9ca3af", textTransform: "uppercase" }}>{mode}</h2>
      </div>

      <div style={{ position: "relative", width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`, borderRadius: "12px", overflow: "hidden", boxShadow: "0 20px 50px -12px rgba(0,0,0,0.5), 0 0 0 4px #1e293b" }}>
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ display: "block" }} />

        {gameState === "menu" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", zIndex: 10 }}>
            <h1 style={{ color: "#34d399", margin: 0, fontSize: "2.5rem", textShadow: "0 0 20px #34d399", fontWeight: 800 }}>NEON SNAKE</h1>
            <p style={{ color: "#94a3b8", marginBottom: "10px" }}>Seleziona la modalità:</p>
            <button onClick={() => startGame("manual")} style={{ padding: "14px 32px", fontSize: "16px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", width: "240px", fontWeight: "bold", boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)", transition: "transform 0.1s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
              🎮 MANUALE
            </button>
            <button onClick={() => startGame("auto")} style={{ padding: "14px 32px", fontSize: "16px", backgroundColor: "#8b5cf6", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", width: "240px", fontWeight: "bold", boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)", transition: "transform 0.1s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}>
              🤖 AI (PATHFINDING)
            </button>
          </div>
        )}

        {gameState === "gameover" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(220, 38, 38, 0.15)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, animation: "fadeIn 0.3s" }}>
            <h2 style={{ color: "#f87171", fontSize: "3rem", margin: "0 0 10px 0", textShadow: "0 0 20px #ef4444", fontWeight: 900 }}>WASTED</h2>
            <p style={{ fontSize: "1.2rem", margin: "0 0 24px 0", color: "#fca5a5" }}>Punteggio Finale: {score}</p>
            <button onClick={() => setGameState("menu")} style={{ padding: "12px 28px", fontSize: "16px", backgroundColor: "#1f2937", color: "white", border: "2px solid #ef4444", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 0 15px rgba(239, 68, 68, 0.3)" }}>
              RITORNA AL MENU
            </button>
          </div>
        )}
      </div>

      {mode === "manual" && gameState === "playing" && (
        <p style={{ marginTop: "24px", color: "#64748b", fontSize: "14px", letterSpacing: "1px" }}>
          Usa le <strong>FRECCE DIREZIONALI</strong> o <strong>WASD</strong>
        </p>
      )}
    </div>
  );
}
