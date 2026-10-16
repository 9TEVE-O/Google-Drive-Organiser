import React, { useEffect, useRef, useState } from "react";
import { User } from "firebase/auth";
import { Sparkles, ShieldCheck, Cpu, ArrowRight, ExternalLink, X, CheckCircle2 } from "lucide-react";

export type AuthPortalPhase = "idle" | "initiating" | "synthesizing";

interface AuthTransitionPortalProps {
  phase: AuthPortalPhase;
  user: User | null;
  onComplete: () => void;
  onCancel?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  maxAlpha: number;
  color: string;
  pulseSpeed: number;
}

export const AuthTransitionPortal: React.FC<AuthTransitionPortalProps> = ({
  phase,
  user,
  onComplete,
  onCancel
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [telemetryText, setTelemetryText] = useState("INITIALIZING NEURAL GATEWAY...");
  const [synthesisProgress, setSynthesisProgress] = useState(0);
  const [isWarpingOut, setIsWarpingOut] = useState(false);

  // Holographic telemetry updates during "initiating" phase
  useEffect(() => {
    if (phase !== "initiating") return;

    const messages = [
      "INITIALIZING NEURAL GATEWAY...",
      "ESTABLISHING SECURE GOOGLE OAUTH TUNNEL...",
      "SYNCHRONIZING WORKSPACE CRYPTO HANDSHAKE...",
      "AWAITING GOOGLE ACCOUNT SELECTION IN POPUP..."
    ];

    let index = 0;
    setTelemetryText(messages[0]);

    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setTelemetryText(messages[index]);
    }, 1800);

    return () => clearInterval(interval);
  }, [phase]);

  // Synthesis progress counter during "synthesizing" phase
  useEffect(() => {
    if (phase !== "synthesizing") return;

    setSynthesisProgress(0);
    setIsWarpingOut(false);

    const steps = [
      { at: 15, text: "OAUTH CREDENTIALS VERIFIED · EPHEMERAL SESSION ACTIVE" },
      { at: 45, text: "CALIBRATING DRIVE TOPOLOGY & FOLDER HIERARCHY..." },
      { at: 75, text: "SYNTHESIZING NEURAL SYNAPSE MATRIX & PERMISSIONS..." },
      { at: 95, text: "QUANTUM WORKSPACE MESH READY · EXPANDING INTERFACE..." }
    ];

    let current = 0;
    const progressTimer = setInterval(() => {
      current += 2;
      setSynthesisProgress(Math.min(current, 100));

      for (const step of steps) {
        if (current >= step.at) {
          setTelemetryText(step.text);
        }
      }

      if (current >= 100) {
        clearInterval(progressTimer);
        // Trigger smooth hyperspace warp dissolve
        setIsWarpingOut(true);
        setTimeout(() => {
          onComplete();
        }, 550);
      }
    }, 32);

    return () => clearInterval(progressTimer);
  }, [phase, onComplete]);

  // Ultra-lightweight particle canvas (low energy, 60fps, clean unmount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Particle palette: futuristic indigo, cyan, violet, and electric blue
    const colors = [
      "rgba(99, 102, 241,", // Indigo
      "rgba(139, 92, 246,", // Violet
      "rgba(6, 182, 212,",  // Cyan
      "rgba(56, 189, 248,"  // Sky blue
    ];

    // Cap particle count strictly to 45 for maximum battery & GPU efficiency
    const particleCount = phase === "synthesizing" ? 55 : 35;
    const particles: Particle[] = [];

    const centerX = width / 2;
    const centerY = height / 2;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * (Math.min(width, height) * 0.45);
      const speed = (Math.random() * 0.8 + 0.3) * (phase === "synthesizing" ? 1.8 : 0.8);

      particles.push({
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: Math.cos(angle + Math.PI / 2) * speed * 0.4 + (Math.random() - 0.5) * 0.3,
        vy: Math.sin(angle + Math.PI / 2) * speed * 0.4 + (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.7 + 0.1,
        maxAlpha: Math.random() * 0.5 + 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        pulseSpeed: Math.random() * 0.02 + 0.01
      });
    }

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Draw faint quantum energy field in the center
      const coreGradient = ctx.createRadialGradient(
        cx, cy, 10,
        cx, cy, Math.min(width, height) * 0.4
      );
      coreGradient.addColorStop(0, phase === "synthesizing" ? "rgba(99, 102, 241, 0.16)" : "rgba(99, 102, 241, 0.09)");
      coreGradient.addColorStop(0.5, "rgba(147, 51, 234, 0.04)");
      coreGradient.addColorStop(1, "rgba(8, 13, 26, 0)");
      ctx.fillStyle = coreGradient;
      ctx.fillRect(0, 0, width, height);

      // Render connecting synaptic filaments between near neighbors
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 90) {
            const alpha = (1 - dist / 90) * 0.22 * Math.min(particles[i].alpha, particles[j].alpha);
            ctx.strokeStyle = `rgba(129, 140, 248, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Render individual particles
      for (const p of particles) {
        // Orbit dynamics: subtle pull toward center + gentle tangential drift
        const dx = cx - p.x;
        const dy = cy - p.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        if (phase === "synthesizing") {
          // Outward radiance during synthesis
          p.x += p.vx * 1.5;
          p.y += p.vy * 1.5;
          if (distToCenter > Math.max(width, height) * 0.6) {
            p.x = cx + (Math.random() - 0.5) * 50;
            p.y = cy + (Math.random() - 0.5) * 50;
          }
        } else {
          // Stable orbital drift during handshake
          const force = 0.00015;
          p.vx += dx * force;
          p.vy += dy * force;
          p.x += p.vx;
          p.y += p.vy;
        }

        // Pulse alpha
        p.alpha += Math.sin(time * 2 + p.x) * 0.01;
        p.alpha = Math.max(0.1, Math.min(p.maxAlpha, p.alpha));

        // Draw particle dot with soft glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color} ${p.alpha})`;
        ctx.shadowColor = "rgba(99, 102, 241, 0.6)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#080d1a]/95 backdrop-blur-2xl transition-all duration-700 ease-out select-none ${
        isWarpingOut ? "scale-[1.08] opacity-0 blur-xs" : "scale-100 opacity-100"
      }`}
    >
      {/* Background Interactive Synaptic Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 pointer-events-none w-full h-full"
      />

      {/* Futuristic Concentric Orbital Rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Outer Ring */}
        <div className="w-[520px] h-[520px] rounded-full border border-indigo-500/15 animate-[spin_60s_linear_infinite] flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee] -top-1.5 absolute"></div>
        </div>

        {/* Mid Ring with dashed frequency track */}
        <div className="w-[380px] h-[380px] rounded-full border border-dashed border-violet-500/25 animate-[spin_35s_linear_infinite_reverse] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_10px_#a78bfa] absolute -bottom-1"></div>
        </div>

        {/* Inner Laser Ring */}
        <div className="w-[260px] h-[260px] rounded-full border border-indigo-400/30 animate-[ping_4s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
      </div>

      {/* Main Interactive Hologram Pod */}
      <div className="relative z-10 max-w-md w-full mx-4 p-8 rounded-3xl bg-slate-900/80 border border-indigo-500/30 backdrop-blur-2xl shadow-[0_0_60px_rgba(99,102,241,0.2)] text-center text-slate-100">
        
        {/* Top telemetry bar with active status glyph */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800/80 mb-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="font-mono text-[10px] tracking-widest text-cyan-400 font-semibold uppercase">
              {phase === "initiating" ? "GATEWAY HANDSHAKE" : "NEURAL MESH SYNTHESIS"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-slate-400 tracking-tight">
              ENC: AES-256 · GSI
            </span>
            {phase === "initiating" && onCancel && (
              <button
                onClick={onCancel}
                title="Cancel Connection"
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center Holographic Glyphs */}
        <div className="relative my-4 flex items-center justify-center">
          {phase === "initiating" ? (
            /* Initiating Holographic Portal Glyph */
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 p-0.5 shadow-[0_0_35px_rgba(99,102,241,0.4)] animate-subtle-pulse flex items-center justify-center">
                <div className="w-full h-full rounded-[14px] bg-[#0a0f20] flex items-center justify-center relative overflow-hidden">
                  {/* Subtle sweep scanline */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent -translate-y-full animate-[scanline_2.5s_ease-in-out_infinite]"></div>
                  
                  {/* Google Workspace G Glyph */}
                  <svg className="w-10 h-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                </div>
              </div>

              {/* Radiant outer energy satellites */}
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-cyan-400 animate-ping"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-violet-400 animate-pulse"></div>
            </div>
          ) : (
            /* Synthesizing Avatar Reveal with Scanning Laser Ring */
            <div className="relative">
              <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-400 via-indigo-500 to-violet-500 shadow-[0_0_40px_rgba(34,211,238,0.5)] animate-pulse flex items-center justify-center">
                {user?.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || "User"} 
                    className="w-full h-full rounded-full object-cover ring-2 ring-white/30"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-indigo-950 flex items-center justify-center text-white font-bold text-2xl font-mono">
                    {user?.displayName ? user.displayName.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-white shadow-[0_0_12px_#10b981]">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Titles & Context */}
        <div className="space-y-1.5 my-4">
          <h3 className="text-lg font-bold tracking-tight text-white font-display">
            {phase === "initiating" 
              ? "Connecting Workspace Matrix" 
              : user?.displayName 
                ? `Welcome, ${user.displayName}`
                : "Workspace Access Granted"}
          </h3>
          <p className="text-xs text-slate-400 font-mono tracking-tight truncate max-w-xs mx-auto">
            {phase === "initiating"
              ? "Select your Google account in the authorization popup..."
              : user?.email || "Ephemeral Google OAuth Bearer active"}
          </p>
        </div>

        {/* Synthesis Progress Bar */}
        {phase === "synthesizing" && (
          <div className="space-y-2 my-5">
            <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span className="text-cyan-400 font-semibold tracking-wider">NEURAL SYNAPSE LOAD</span>
              <span className="tabular-nums font-bold text-indigo-300">{synthesisProgress}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden p-0.5 border border-indigo-500/30">
              <div 
                className="h-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 rounded-full transition-all duration-75 shadow-[0_0_10px_#6366f1]"
                style={{ width: `${synthesisProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Telemetry Status Bar */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-[11px] text-cyan-300/90 flex items-center justify-center gap-2 shadow-inner">
          <Cpu className="h-3.5 w-3.5 text-cyan-400 shrink-0 animate-pulse" />
          <span className="truncate">{telemetryText}</span>
        </div>

        {/* Bottom Helpful Affordance */}
        <div className="pt-5 mt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Client-Isolated
          </span>
          <span className="text-slate-500">v0.9.1 Mesh</span>
        </div>
      </div>
    </div>
  );
};
