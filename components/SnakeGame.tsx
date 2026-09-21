"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// --- TIPI E COSTANTI ---
type Point = { x: number; y: number };
type SnakeSegment = { x: number; y: number; px: number; py: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type FloatingText = { x: number; y: number; text: string; life: number; maxLife: number; color: string; scale?: number };

const GRID = 20;
const CELL = 20;
const CANVAS_SIZE = GRID * CELL;
const N = GRID * GRID; // 400 celle

export default function SnakeDopamine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover" | "victory">("menu");
  const [mode, setMode] = useState<"manual" | "auto">("auto");
  const [score, setScore] = useState<number>(0);
  const [completion, setCompletion] = useState<string>("0.0");

  // --- GENERAZIONE MAPPA HAMILTONIANA (VITTORIA MATEMATICA 100%) ---
  const cycleNumber = useMemo(() => {
    const arr = Array(GRID).fill(0).map(() => Array(GRID).fill(0));
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) {
      arr[cy][cx] = i;
      if (cy === 0 && cx === 0) { cx = 1; cy = 0; continue; }
      if (cx === 0) { cy -= 1; continue; }
      if (cy % 2 === 0) {
        if (cx === GRID - 1) cy += 1; else cx += 1;
      } else {
        if (cx === 1 && cy === GRID - 1) cx -= 1;
        else if (cx === 1) cy += 1;
        else cx -= 1;
      }
    }
    return arr;
  }, []);

  const game = useRef({
    snake: [] as SnakeSegment[],
    dir: { x: 1, y: 0 },
    inputQueue: [] as Point[],
    food: { x: 5, y: 5 },
    particles: [] as Particle[],
    texts: [] as FloatingText[],
    logicTimer: 0,
    speed: 25, 
    shake: 0,
    flash: 0,
    lastTime: 0,
    activeTime: 0, // Traccia il tempo reale effettivo di gioco
    combo: 1,
    lastEatTime: 0,
    hyperdriveGlow: 0,
  });

  const getSmartDir = useCallback(() => {
    const { snake, food } = game.current;
    const head = snake[0];
    const tail = snake[snake.length - 1];

    const headIdx = cycleNumber[head.y][head.x];
    const tailIdx = cycleNumber[tail.y][tail.x];
    const foodIdx = cycleNumber[food.y][food.x];

    let safeInterval = (tailIdx - headIdx + N) % N;
    if (safeInterval === 0 && snake.length < N) safeInterval = N;

    let distToFood = (foodIdx - headIdx + N) % N;
    let bestNext = null;
    let maxJump = -1;

    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
    let defaultDir = dirs[0];

    // Disattiva scorciatoie al 75% per garantire che si incastri perfettamente come un puzzle
    const isLateGame = snake.length > N * 0.75; 
    const margin = isLateGame ? N : 2; 

    for (const d of dirs) {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
        const nIdx = cycleNumber[ny][nx];
        const jump = (nIdx - headIdx + N) % N;
        
        if (jump === 1) defaultDir = d; // Mossa sicura base

        // Scorciatoie dopaminiche
        if (jump > 0 && jump <= distToFood && jump <= safeInterval - margin) {
          if (jump > maxJump) {
            maxJump = jump;
            bestNext = d;
          }
        }
      }
    }
    return bestNext || defaultDir;
  }, [cycleNumber]);

  const spawnFood = useCallback(() => {
    const freeSpots: Point[] = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!game.current.snake.some(s => s.x === x && s.y === y)) freeSpots.push({ x, y });
      }
    }
    if (freeSpots.length > 0) {
      game.current.food = freeSpots[Math.floor(Math.random() * freeSpots.length)];
    }
  }, []);

  const startGame = (selectedMode: "manual" | "auto") => {
    setMode(selectedMode);
    game.current = {
      snake: [{ x: 1, y: 0, px: 1, py: 0 }, { x: 0, y: 0, px: 0, py: 0 }],
      dir: { x: 1, y: 0 },
      inputQueue: [],
      food: { x: 5, y: 5 },
      particles: [],
      texts: [],
      logicTimer: 0,
      speed: selectedMode === "auto" ? 25 : 90,
      shake: 0,
      flash: 0,
      lastTime: performance.now(),
      activeTime: 0,
      combo: 1,
      lastEatTime: 0,
      hyperdriveGlow: 0,
    };
    spawnFood();
    setScore(0);
    setCompletion("0.0");
    setGameState("playing");
  };

  useEffect(() => {
    if (gameState !== "playing" || mode !== "manual") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      const lastDir = game.current.inputQueue.length > 0 ? game.current.inputQueue[game.current.inputQueue.length - 1] : game.current.dir;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameState !== "playing") return;
    const ctx = canvas.getContext("2d")!;
    let animationFrameId: number;

    const render = (time: number) => {
      const state = game.current;
      let dt = time - state.lastTime;
      if (dt > 100) dt = 16; // Previene scatti al rientro della scheda
      state.lastTime = time;
      state.activeTime += dt;

      // --- PID SPEED CONTROLLER (Magia per 0.4% costante) ---
      if (mode === "auto") {
        const elapsedSec = state.activeTime / 1000;
        const currentApples = state.snake.length - 2;
        const targetApples = elapsedSec * 1.6; // 1.6 mele/sec = esattamente 0.4% di completamento al sec
        const diff = targetApples - currentApples;
        
        // Se in ritardo, la velocità scala brutalmente a 1ms (Warp speed) per recuperare
        state.speed = Math.max(1, Math.min(100, 25 - diff * 20));
        
        // Effetto grafico Warp
        state.hyperdriveGlow = state.speed < 5 ? Math.min(1, state.hyperdriveGlow + dt * 0.01) : Math.max(0, state.hyperdriveGlow - dt * 0.005);
      }

      state.logicTimer += dt;
      // Loop While per permettere al gioco di fare N step per frame quando in Hyperdrive
      while (state.logicTimer >= state.speed) {
        state.logicTimer -= state.speed;

        if (mode === "auto") {
          state.dir = getSmartDir();
        } else if (state.inputQueue.length > 0) {
          state.dir = state.inputQueue.shift()!;
        }

        const head = state.snake[0];
        const nextX = head.x + state.dir.x;
        const nextY = head.y + state.dir.y;
        const isSelfCollision = state.snake.some((s, index) => index !== state.snake.length - 1 && s.x === nextX && s.y === nextY);

        if (nextX < 0 || nextX >= GRID || nextY < 0 || nextY >= GRID || isSelfCollision) {
          state.shake = 30; 
          setGameState("gameover");
          return; 
        }

        const newSnake: SnakeSegment[] = [{ x: nextX, y: nextY, px: head.x, py: head.y }];
        for (let i = 0; i < state.snake.length - 1; i++) {
          newSnake.push({ x: state.snake[i].x, y: state.snake[i].y, px: state.snake[i + 1].x, py: state.snake[i + 1].y });
        }

        // MANGIA IL CIBO
        if (nextX === state.food.x && nextY === state.food.y) {
          const timeSinceLastEat = state.activeTime - state.lastEatTime;
          state.combo = timeSinceLastEat < 800 ? state.combo + 1 : 1;
          state.lastEatTime = state.activeTime;

          const earned = 10 * Math.min(state.combo, 10);
          setScore(s => s + earned);
          
          const rawPercent = ((state.snake.length + 1) / N) * 100;
          setCompletion(rawPercent.toFixed(1));
          
          state.shake = Math.min(25, 4 + state.combo * 1.5); 
          state.flash = rawPercent > 90 ? 1.5 : 1; // Flash fortissimo nel finale
          
          if (mode === "manual") state.speed = Math.max(30, state.speed - 1);

          const tail = state.snake[state.snake.length - 1];
          newSnake.push({ x: tail.x, y: tail.y, px: tail.x, py: tail.y });

          if (newSnake.length >= N) {
            setCompletion("100.0");
            setGameState("victory");
            return;
          }

          let comboStr = "";
          let textColor = "#fff";
          if (state.combo >= 15) { comboStr = " GODLIKE!"; textColor = "#fbbf24"; }
          else if (state.combo >= 5) { comboStr = " MEGA!"; textColor = "#a78bfa"; }
          if (state.hyperdriveGlow > 0.5) { comboStr = " WARP!"; textColor = "#22d3ee"; }
          
          state.texts.push({ x: nextX * CELL, y: nextY * CELL, text: `+${earned}${comboStr}`, life: 1, maxLife: 1, color: textColor, scale: 1.5 });
          
          const hue = 140 + (rawPercent / 100) * 260; 
          for (let i = 0; i < 20 + state.combo; i++) {
            state.particles.push({
              x: nextX * CELL + CELL / 2, y: nextY * CELL + CELL / 2,
              vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18,
              life: 1, maxLife: 0.5 + Math.random(), 
              color: `hsl(${hue + (Math.random() * 60 - 30)}, 100%, 65%)`,
              size: Math.random() * 6 + 2
            });
          }
          spawnFood();
        }
        state.snake = newSnake;
      }

      // --- RENDER VISIVO A 60 FPS ---
      ctx.fillStyle = "#09090b"; 
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.1})`;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        state.flash -= dt * 0.005;
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
      for(let i=0; i<GRID; i++) {
        for(let j=0; j<GRID; j++) {
          ctx.fillRect(i * CELL + 1, j * CELL + 1, CELL - 2, CELL - 2);
        }
      }

      ctx.save();
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
        state.shake *= 0.75; 
        if (state.shake < 0.5) state.shake = 0;
      }

      // Evitiamo interpolazioni strane se stiamo saltando troppi frame nel Warp
      const progress = state.speed < 5 ? 1 : Math.min(1, state.logicTimer / state.speed);
      const interp = (p1: number, p2: number) => p1 + (p2 - p1) * progress;
      
      const percent = state.snake.length / N;
      const currentHue = (140 + percent * 260) % 360; 

      // Cibo
      const pulse = 1 + Math.sin(time / 80) * 0.3;
      const foodHue = state.hyperdriveGlow > 0.5 ? 190 : (currentHue + 180) % 360;
      ctx.shadowBlur = 30;
      ctx.shadowColor = `hsl(${foodHue}, 100%, 60%)`;
      ctx.fillStyle = `hsl(${foodHue}, 100%, 70%)`;
      ctx.beginPath();
      ctx.arc(state.food.x * CELL + CELL/2, state.food.y * CELL + CELL/2, (CELL/2.2) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Corpo Serpente (Base + Hyperdrive Glow)
      const isLateGame = percent > 0.85;
      ctx.shadowBlur = isLateGame ? 40 : 20 + state.hyperdriveGlow * 30;
      ctx.shadowColor = state.hyperdriveGlow > 0.1 ? "#22d3ee" : `hsl(${currentHue}, 100%, 50%)`;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = CELL * (0.65 + percent * 0.15); 

      const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      grad.addColorStop(0, state.hyperdriveGlow > 0.1 ? "#67e8f9" : `hsl(${currentHue}, 100%, 65%)`); 
      grad.addColorStop(1, state.hyperdriveGlow > 0.1 ? "#0284c7" : `hsl(${currentHue - 40}, 100%, 35%)`); 
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
      ctx.shadowBlur = 40;
      ctx.beginPath();
      ctx.arc(hx, hy, CELL * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Particelle
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life -= dt / 1000;
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Testi Dopaminici
      ctx.textAlign = "center";
      for (let i = state.texts.length - 1; i >= 0; i--) {
        const t = state.texts[i];
        t.y -= dt * 0.1;
        t.life -= dt / 1000;
        if (t.life <= 0) { state.texts.splice(i, 1); continue; }
        
        const scale = 1 + (1 - t.life) * (t.scale || 1);
        ctx.font = `900 ${18 * scale}px 'Inter', system-ui, sans-serif`;
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.life / t.maxLife;
        ctx.shadowBlur = 20;
        ctx.shadowColor = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, mode, getSmartDir]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "system-ui, sans-serif", padding: "20px", color: "white", backgroundColor: "#000", minHeight: "100vh" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%", maxWidth: `${CANVAS_SIZE}px`, marginBottom: "15px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "12px", color: "#71717a", fontWeight: "bold", letterSpacing: "2px" }}>SCORE</p>
          <h2 style={{ margin: 0, fontSize: "36px", textShadow: "0 0 20px rgba(251, 191, 36, 0.6)", color: "#fcd34d", lineHeight: "1" }}>{score.toLocaleString()}</h2>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#71717a", fontWeight: "bold", letterSpacing: "2px" }}>COMPLETION</p>
          <h2 style={{ margin: 0, fontSize: "28px", color: parseFloat(completion) === 100 ? "#fbbf24" : "#e4e4e7", lineHeight: "1", fontVariantNumeric: "tabular-nums" }}>{completion}%</h2>
        </div>
      </div>

      <div style={{ position: "relative", width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`, borderRadius: "16px", overflow: "hidden", boxShadow: `0 0 80px -10px ${parseFloat(completion) > 90 ? 'rgba(251, 191, 36, 0.5)' : parseFloat(completion) > 60 ? 'rgba(167, 139, 250, 0.4)' : 'rgba(52, 211, 153, 0.2)'}, 0 0 0 4px #18181b`, transition: "box-shadow 1s" }}>
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ display: "block" }} />

        {gameState === "menu" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(9, 9, 11, 0.9)", backdropFilter: "blur(12px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", zIndex: 10 }}>
            <div style={{ textAlign: "center", marginBottom: "10px" }}>
              <h1 style={{ color: "#fff", margin: 0, fontSize: "4rem", textShadow: "0 0 40px #34d399, 0 0 10px #34d399", fontWeight: 900, fontStyle: "italic", letterSpacing: "-2px" }}>SNAKE</h1>
              <h2 style={{ color: "#f472b6", margin: "-12px 0 0 0", fontSize: "1.6rem", textShadow: "0 0 25px #f472b6", letterSpacing: "8px" }}>DOPAMINE</h2>
            </div>
            <button onClick={() => startGame("manual")} style={{ padding: "16px 32px", fontSize: "16px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", width: "280px", fontWeight: "bold", boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)", transform: "scale(1)", transition: "all 0.1s" }} onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
              🎮 GIOCA (MANUALE)
            </button>
            <button onClick={() => startGame("auto")} style={{ padding: "16px 32px", fontSize: "16px", background: "linear-gradient(45deg, #8b5cf6, #ec4899)", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", width: "280px", fontWeight: "bold", boxShadow: "0 0 35px rgba(236, 72, 153, 0.6)", transform: "scale(1)", transition: "all 0.1s" }} onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
              🤖 GUARDA L'AI (ASMR TIKTOK)
            </button>
          </div>
        )}

        {gameState === "gameover" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(220, 38, 38, 0.25)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <h2 style={{ color: "#f87171", fontSize: "4.5rem", margin: "0", textShadow: "0 0 40px #ef4444", fontWeight: 900 }}>WASTED</h2>
            <p style={{ fontSize: "1.4rem", margin: "10px 0 30px 0", color: "#fecaca", fontWeight: "bold" }}>SCORE: {score}</p>
            <button onClick={() => setGameState("menu")} style={{ padding: "14px 35px", fontSize: "18px", backgroundColor: "#fff", color: "#ef4444", border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "900", boxShadow: "0 0 25px rgba(239, 68, 68, 0.6)" }}>
              RIPROVA
            </button>
          </div>
        )}

        {gameState === "victory" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(251, 191, 36, 0.25)", backdropFilter: "blur(10px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <h2 style={{ color: "#fef3c7", fontSize: "4.5rem", margin: "0", textShadow: "0 0 50px #fbbf24", fontWeight: 900 }}>GODLIKE</h2>
            <p style={{ fontSize: "1.4rem", margin: "10px 0 30px 0", color: "#fde68a", fontWeight: "bold" }}>100.0% COMPLETATO - SCORE: {score}</p>
            <button onClick={() => setGameState("menu")} style={{ padding: "14px 35px", fontSize: "18px", backgroundColor: "#fbbf24", color: "#000", border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "900", boxShadow: "0 0 35px rgba(251, 191, 36, 0.8)" }}>
              TORNA AL MENU
            </button>
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: `${CANVAS_SIZE}px`, height: "8px", backgroundColor: "#18181b", borderRadius: "10px", marginTop: "25px", overflow: "hidden", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5)" }}>
        <div style={{ height: "100%", width: `${completion}%`, background: "linear-gradient(90deg, #34d399, #8b5cf6, #fbbf24, #fff)", transition: "width 0.1s linear", boxShadow: "0 0 10px rgba(255,255,255,0.5)" }} />
      </div>
    </div>
  );
}


