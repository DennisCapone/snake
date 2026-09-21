"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

// --- TIPI E COSTANTI ---
type Point = { x: number; y: number };
type SnakeSegment = { x: number; y: number; px: number; py: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type FloatingText = { x: number; y: number; text: string; life: number; maxLife: number; color: string };

const GRID = 20;
const CELL = 20;
const CANVAS_SIZE = GRID * CELL;
const N = GRID * GRID; // 400 celle totali

export default function SnakeDopamine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover" | "victory">("menu");
  const [mode, setMode] = useState<"manual" | "auto">("auto");
  const [score, setScore] = useState<number>(0);
  const [completion, setCompletion] = useState<number>(0);

  // --- GENERAZIONE MAPPA HAMILTONIANA (PER VITTORIA 100% GARANTITA) ---
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
    dir: { x: 0, y: -1 },
    inputQueue: [] as Point[],
    food: { x: 5, y: 5 },
    particles: [] as Particle[],
    texts: [] as FloatingText[],
    logicTimer: 0,
    speed: 100, 
    shake: 0,
    flash: 0, // Flash bianco allo schermo
    lastTime: 0,
    combo: 1,
    lastEatTime: 0,
  });

  // --- LOGICA AI (HAMILTONIAN SHORTCUT ALGORITHM) ---
  const getSmartDir = useCallback(() => {
    const { snake, food } = game.current;
    const head = snake[0];
    const tail = snake[snake.length - 1];

    const headIdx = cycleNumber[head.y][head.x];
    const tailIdx = cycleNumber[tail.y][tail.x];
    const foodIdx = cycleNumber[food.y][food.x];

    // Calcoliamo quanto spazio sicuro abbiamo davanti
    let safeInterval = (tailIdx - headIdx + N) % N;
    if (safeInterval === 0 && snake.length < N) safeInterval = N;

    let distToFood = (foodIdx - headIdx + N) % N;
    let bestNext = null;
    let maxJump = -1;

    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
    let defaultDir = dirs[0];

    // Quando mancano poche celle, l'AI disattiva i salti e segue il percorso perfetto.
    // Effetto visivo e psicologico: lo spettatore lo guarda incastrarsi perfettamente come un puzzle.
    const isLateGame = snake.length > N * 0.75; 
    const margin = isLateGame ? N : 2; 

    for (const d of dirs) {
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) {
        const nIdx = cycleNumber[ny][nx];
        const jump = (nIdx - headIdx + N) % N;
        
        // Direzione sicura predefinita (passo Hamiltoniano standard)
        if (jump === 1) defaultDir = d;

        // Valutazione scorciatoie sicure per renderlo velocissimo
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
      speed: selectedMode === "auto" ? 25 : 100, // Partenza Auto frenetica
      shake: 0,
      flash: 0,
      lastTime: performance.now(),
      combo: 1,
      lastEatTime: performance.now(),
    };
    spawnFood();
    setScore(0);
    setCompletion(0);
    setGameState("playing");
  };

  useEffect(() => {
    if (gameState !== "playing" || mode !== "manual") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();

      const lastDir = game.current.inputQueue.length > 0 
        ? game.current.inputQueue[game.current.inputQueue.length - 1] : game.current.dir;

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
      if (dt > 100) dt = 16; 
      state.lastTime = time;

      // 1. LOGIC TICK - Loop While per permettere velocità sovrumane (es. 5ms a frame)
      state.logicTimer += dt;
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

        if (nextX === state.food.x && nextY === state.food.y) {
          // --- DOPAMINE INJECTION ON EAT ---
          const timeSinceLastEat = time - state.lastEatTime;
          state.combo = timeSinceLastEat < 400 ? state.combo + 1 : 1;
          state.lastEatTime = time;

          const earned = 10 * Math.min(state.combo, 5);
          setScore(s => s + earned);
          setCompletion(Math.floor((state.snake.length + 1) / N * 100));
          
          state.shake = Math.min(20, 5 + state.combo * 2); 
          state.flash = 1; // Flash grid 
          if (mode === "auto") state.speed = Math.max(8, 25 - (state.snake.length / N) * 15); // Accelera verso il capolavoro

          const tail = state.snake[state.snake.length - 1];
          newSnake.push({ x: tail.x, y: tail.y, px: tail.x, py: tail.y });

          if (newSnake.length >= N) {
            setGameState("victory");
            return;
          }

          // Effetti grafici dinamici basati su combo e lunghezza
          let comboStr = "";
          let textColor = "#fff";
          if (state.combo >= 10) { comboStr = " GODLIKE!"; textColor = "#fbbf24"; }
          else if (state.combo >= 5) { comboStr = " MEGA!"; textColor = "#a78bfa"; }
          
          state.texts.push({ x: nextX * CELL, y: nextY * CELL, text: `+${earned}${comboStr}`, life: 1, maxLife: 1, color: textColor });
          
          const intensity = state.snake.length / N;
          const hue = 140 + intensity * 260; // Dal Verde(140) al Viola all'Oro(400=>40)
          
          for (let i = 0; i < 20 + state.combo * 2; i++) {
            state.particles.push({
              x: nextX * CELL + CELL / 2, y: nextY * CELL + CELL / 2,
              vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
              life: 1, maxLife: 0.5 + Math.random(), 
              color: `hsl(${hue + (Math.random() * 40 - 20)}, 100%, 60%)`,
              size: Math.random() * 5 + 2
            });
          }
          spawnFood();
        }
        state.snake = newSnake;
      }

      // 2. DISEGNO GRAFICA (a 60 FPS Fluidissimi)
      ctx.fillStyle = "#09090b"; 
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Flash Effect
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.15})`;
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        state.flash -= dt * 0.005;
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
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
      const intensity = state.snake.length / N;
      const currentHue = (140 + intensity * 260) % 360; 

      // Disegno Cibo
      const pulse = 1 + Math.sin(time / 100) * 0.25;
      const foodHue = (currentHue + 180) % 360; // Colore complementare esatto
      ctx.shadowBlur = 25;
      ctx.shadowColor = `hsl(${foodHue}, 100%, 50%)`;
      ctx.fillStyle = `hsl(${foodHue}, 100%, 60%)`;
      ctx.beginPath();
      ctx.arc(state.food.x * CELL + CELL/2, state.food.y * CELL + CELL/2, (CELL/2.5) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Disegno Corpo Serpente
      ctx.shadowBlur = 20 + intensity * 10;
      ctx.shadowColor = `hsl(${currentHue}, 100%, 50%)`;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = CELL * (0.6 + intensity * 0.2); // Diventa leggermente più spesso e imponente

      const grad = ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      grad.addColorStop(0, `hsl(${currentHue}, 100%, 60%)`); 
      grad.addColorStop(1, `hsl(${currentHue - 40}, 100%, 30%)`); 
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

      // Disegno Testa Fluorescente
      const headS = state.snake[0];
      const hx = interp(headS.px, headS.x) * CELL + CELL / 2;
      const hy = interp(headS.py, headS.y) * CELL + CELL / 2;

      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 30;
      ctx.shadowColor = `hsl(${currentHue}, 100%, 70%)`;
      ctx.beginPath();
      ctx.arc(hx, hy, CELL * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Particelle
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life -= dt / 1000;
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Testi Fluttuanti (Dopamina pura)
      ctx.textAlign = "center";
      for (let i = state.texts.length - 1; i >= 0; i--) {
        const t = state.texts[i];
        t.y -= dt * 0.08;
        t.life -= dt / 1000;
        if (t.life <= 0) { state.texts.splice(i, 1); continue; }
        
        ctx.font = `900 ${20 + (1 - t.life) * 10}px 'Inter', sans-serif`; // Scale up animation
        ctx.fillStyle = t.color;
        ctx.globalAlpha = t.life / t.maxLife;
        ctx.shadowBlur = 15;
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
  }, [gameState, mode, getSmartDir, cycleNumber]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "system-ui, sans-serif", padding: "20px", color: "white", backgroundColor: "#000", minHeight: "100vh" }}>
      
      {/* HEADER HUD */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%", maxWidth: `${CANVAS_SIZE}px`, marginBottom: "15px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "12px", color: "#71717a", fontWeight: "bold", letterSpacing: "2px" }}>TOTAL SCORE</p>
          <h2 style={{ margin: 0, fontSize: "32px", textShadow: "0 0 15px rgba(251, 191, 36, 0.5)", color: "#fcd34d", lineHeight: "1" }}>{score.toLocaleString()}</h2>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: "12px", color: "#71717a", fontWeight: "bold", letterSpacing: "2px" }}>COMPLETION</p>
          <h2 style={{ margin: 0, fontSize: "24px", color: completion === 100 ? "#fbbf24" : "#a1a1aa", lineHeight: "1" }}>{completion}%</h2>
        </div>
      </div>

      {/* CANVAS CONTAINER */}
      <div style={{ position: "relative", width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px`, borderRadius: "16px", overflow: "hidden", boxShadow: `0 0 60px -10px ${completion > 80 ? 'rgba(167, 139, 250, 0.4)' : 'rgba(52, 211, 153, 0.2)'}, 0 0 0 4px #18181b`, transition: "box-shadow 0.5s" }}>
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ display: "block" }} />

        {/* MENU */}
        {gameState === "menu" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(9, 9, 11, 0.9)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", zIndex: 10 }}>
            <div style={{ textAlign: "center" }}>
              <h1 style={{ color: "#fff", margin: 0, fontSize: "3.5rem", textShadow: "0 0 30px #34d399, 0 0 10px #34d399", fontWeight: 900, fontStyle: "italic", letterSpacing: "-2px" }}>SNAKE</h1>
              <h2 style={{ color: "#f472b6", margin: "-10px 0 0 0", fontSize: "1.5rem", textShadow: "0 0 20px #f472b6", letterSpacing: "5px" }}>DOPAMINE</h2>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "20px" }}>
              <button onClick={() => startGame("manual")} style={{ padding: "16px 32px", fontSize: "16px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", width: "260px", fontWeight: "bold", boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)", transform: "scale(1)", transition: "all 0.1s" }} onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
                🎮 GIOCA (MANUALE)
              </button>
              <button onClick={() => startGame("auto")} style={{ padding: "16px 32px", fontSize: "16px", background: "linear-gradient(45deg, #8b5cf6, #ec4899)", color: "white", border: "none", borderRadius: "12px", cursor: "pointer", width: "260px", fontWeight: "bold", boxShadow: "0 0 30px rgba(236, 72, 153, 0.5)", transform: "scale(1)", transition: "all 0.1s" }} onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
                🤖 GUARDA L'AI (ASMR)
              </button>
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {gameState === "gameover" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(220, 38, 38, 0.2)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <h2 style={{ color: "#f87171", fontSize: "4rem", margin: "0", textShadow: "0 0 30px #ef4444", fontWeight: 900 }}>WASTED</h2>
            <p style={{ fontSize: "1.2rem", margin: "10px 0 30px 0", color: "#fecaca", fontWeight: "bold" }}>SCORE: {score}</p>
            <button onClick={() => setGameState("menu")} style={{ padding: "14px 32px", fontSize: "16px", backgroundColor: "#fff", color: "#ef4444", border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "900", boxShadow: "0 0 20px rgba(239, 68, 68, 0.5)" }}>
              RIPROVA
            </button>
          </div>
        )}

        {/* VICTORY (100% COMPLETION) */}
        {gameState === "victory" && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(251, 191, 36, 0.2)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
            <h2 style={{ color: "#fef3c7", fontSize: "4rem", margin: "0", textShadow: "0 0 40px #fbbf24", fontWeight: 900 }}>PERFECTION</h2>
            <p style={{ fontSize: "1.2rem", margin: "10px 0 30px 0", color: "#fde68a", fontWeight: "bold" }}>100% COMPLETATO - SCORE: {score}</p>
            <button onClick={() => setGameState("menu")} style={{ padding: "14px 32px", fontSize: "16px", backgroundColor: "#fbbf24", color: "#000", border: "none", borderRadius: "30px", cursor: "pointer", fontWeight: "900", boxShadow: "0 0 30px rgba(251, 191, 36, 0.6)" }}>
              TORNA AL MENU
            </button>
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: `${CANVAS_SIZE}px`, height: "6px", backgroundColor: "#18181b", borderRadius: "10px", marginTop: "20px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${completion}%`, background: "linear-gradient(90deg, #34d399, #8b5cf6, #fbbf24)", transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

