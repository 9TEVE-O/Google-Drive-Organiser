import React, { useRef, useEffect, useState, useMemo } from "react";
import { DriveFile } from "../types";
import { Sparkles, Maximize2, Minimize2, Eye, Cpu, Activity, RefreshCw } from "lucide-react";

interface NeuralSynapseCanvasProps {
  files: DriveFile[];
  isSyncing?: boolean;
  className?: string;
  filesInPlan?: { [key: string]: { category: string; tags: string[]; relevance: number } };
  onNodeClick?: (category: string) => void;
}

interface SynapseNode {
  id: string;
  name: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  count: number;
  color: string;
  glowColor: string;
  pulseOffset: number;
}

interface SynapseParticle {
  sourceIndex: number;
  targetIndex: number;
  progress: number;
  speed: number;
  size: number;
  color: string;
}

export default function NeuralSynapseCanvas({
  files,
  isSyncing = false,
  className = "",
  filesInPlan = {},
  onNodeClick
}: NeuralSynapseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SynapseNode | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Group files into logical semantic categories
  const categoryStats = useMemo(() => {
    const map: Record<string, { count: number; sampleFiles: string[] }> = {
      "Documents": { count: 0, sampleFiles: [] },
      "Spreadsheets": { count: 0, sampleFiles: [] },
      "Media & Images": { count: 0, sampleFiles: [] },
      "Archives & Code": { count: 0, sampleFiles: [] },
      "Organized by AI": { count: 0, sampleFiles: [] }
    };

    files.forEach(f => {
      const mime = (f.mimeType || "").toLowerCase();
      const planCategory = filesInPlan[f.id]?.category;

      if (planCategory) {
        map["Organized by AI"].count++;
        if (map["Organized by AI"].sampleFiles.length < 3) {
          map["Organized by AI"].sampleFiles.push(f.name);
        }
      } else if (mime.includes("spreadsheet") || f.name.endsWith(".csv") || f.name.endsWith(".xlsx")) {
        map["Spreadsheets"].count++;
        if (map["Spreadsheets"].sampleFiles.length < 3) map["Spreadsheets"].sampleFiles.push(f.name);
      } else if (mime.includes("document") || mime.includes("pdf") || mime.includes("text")) {
        map["Documents"].count++;
        if (map["Documents"].sampleFiles.length < 3) map["Documents"].sampleFiles.push(f.name);
      } else if (mime.includes("image") || mime.includes("video") || mime.includes("audio")) {
        map["Media & Images"].count++;
        if (map["Media & Images"].sampleFiles.length < 3) map["Media & Images"].sampleFiles.push(f.name);
      } else {
        map["Archives & Code"].count++;
        if (map["Archives & Code"].sampleFiles.length < 3) map["Archives & Code"].sampleFiles.push(f.name);
      }
    });

    return map;
  }, [files, filesInPlan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || (isExpanded ? 360 : 180));

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = isExpanded ? 360 : 180;
    };
    window.addEventListener("resize", handleResize);

    // Color definitions for clusters
    const clusterConfig = [
      { name: "Gemini Core", color: "#6366f1", glowColor: "rgba(99, 102, 241, 0.45)", angle: 0, dist: 0 },
      { name: "Documents", color: "#38bdf8", glowColor: "rgba(56, 189, 248, 0.4)", angle: 0.3, dist: 0.38 },
      { name: "Spreadsheets", color: "#10b981", glowColor: "rgba(16, 185, 129, 0.4)", angle: 1.5, dist: 0.36 },
      { name: "Organized by AI", color: "#a855f7", glowColor: "rgba(168, 85, 247, 0.45)", angle: 2.8, dist: 0.4 },
      { name: "Media & Images", color: "#f59e0b", glowColor: "rgba(245, 158, 11, 0.4)", angle: 4.1, dist: 0.37 },
      { name: "Archives & Code", color: "#ec4899", glowColor: "rgba(236, 72, 153, 0.4)", angle: 5.2, dist: 0.38 }
    ];

    // Initialize nodes
    const nodes: SynapseNode[] = clusterConfig.map((cfg, idx) => {
      const isCore = idx === 0;
      const count = isCore ? files.length : (categoryStats[cfg.name]?.count || 0);
      const baseRadius = isCore ? 18 : Math.max(9, Math.min(22, 10 + count * 1.5));
      const cx = width / 2;
      const cy = height / 2;
      const x = isCore ? cx : cx + Math.cos(cfg.angle) * (width * 0.4 * cfg.dist);
      const y = isCore ? cy : cy + Math.sin(cfg.angle) * (height * 0.42 * cfg.dist);

      return {
        id: `node_${idx}`,
        name: cfg.name,
        category: cfg.name,
        x,
        y,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: baseRadius,
        count,
        color: cfg.color,
        glowColor: cfg.glowColor,
        pulseOffset: Math.random() * Math.PI * 2
      };
    });

    // Initialize moving particles along synapses
    const particles: SynapseParticle[] = [];
    const particleCount = isSyncing ? 28 : 14;
    for (let i = 0; i < particleCount; i++) {
      const targetIndex = 1 + Math.floor(Math.random() * (nodes.length - 1));
      particles.push({
        sourceIndex: 0,
        targetIndex,
        progress: Math.random(),
        speed: (0.003 + Math.random() * 0.006) * (isSyncing ? 2.5 : 1),
        size: 1.5 + Math.random() * 2,
        color: nodes[targetIndex].color
      });
    }

    let time = 0;
    const isDark = document.documentElement.classList.contains("dark");

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      // Center Core Coordinates
      const cx = width / 2;
      const cy = height / 2;

      // Draw faint concentric orbital guide rings
      ctx.save();
      ctx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.04)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      [0.2, 0.38, 0.52].forEach(scale => {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(width, height) * scale, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();

      // Update and draw synaptic connection lines
      for (let i = 1; i < nodes.length; i++) {
        const core = nodes[0];
        const target = nodes[i];

        // Gentle floating harmonic movement
        if (i !== 0) {
          target.x += Math.sin(time + target.pulseOffset) * 0.2;
          target.y += Math.cos(time + target.pulseOffset) * 0.2;
        }

        // Quadratic bezier curved synapse
        const midX = (core.x + target.x) / 2 + Math.sin(time * 0.5 + i) * 12;
        const midY = (core.y + target.y) / 2 + Math.cos(time * 0.5 + i) * 12;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(core.x, core.y);
        ctx.quadraticCurveTo(midX, midY, target.x, target.y);

        // Gradient line
        const grad = ctx.createLinearGradient(core.x, core.y, target.x, target.y);
        grad.addColorStop(0, isDark ? "rgba(99, 102, 241, 0.3)" : "rgba(99, 102, 241, 0.2)");
        grad.addColorStop(1, target.color + (isDark ? "40" : "30"));

        ctx.strokeStyle = grad;
        ctx.lineWidth = isSyncing ? 2 : 1.25;
        ctx.stroke();
        ctx.restore();
      }

      // Draw data pulse particles travelling along synapses
      particles.forEach(p => {
        p.progress += p.speed;
        if (p.progress >= 1) {
          p.progress = 0;
          p.targetIndex = 1 + Math.floor(Math.random() * (nodes.length - 1));
          p.color = nodes[p.targetIndex].color;
        }

        const source = nodes[p.sourceIndex];
        const target = nodes[p.targetIndex];
        const midX = (source.x + target.x) / 2 + Math.sin(time * 0.5 + p.targetIndex) * 12;
        const midY = (source.y + target.y) / 2 + Math.cos(time * 0.5 + p.targetIndex) * 12;

        // Quadratic interpolation
        const t = p.progress;
        const px = (1 - t) * (1 - t) * source.x + 2 * (1 - t) * t * midX + t * t * target.x;
        const py = (1 - t) * (1 - t) * source.y + 2 * (1 - t) * t * midY + t * t * target.y;

        ctx.save();
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = isDark ? 8 : 4;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Draw nodes
      nodes.forEach((node, idx) => {
        const isCore = idx === 0;
        const isHovered = hoveredNode?.id === node.id;
        const pulse = Math.sin(time * 2 + node.pulseOffset) * (isCore ? 3 : 1.5);
        const r = Math.max(4, node.radius + (isHovered ? 4 : 0) + (isSyncing ? pulse : 0));

        ctx.save();
        // Radial aura glow
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r * 2.5);
        glow.addColorStop(0, node.glowColor);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Node disc
        ctx.fillStyle = isCore 
          ? (isDark ? "#1e1b4b" : "#e0e7ff")
          : (isDark ? "#0f172a" : "#ffffff");
        ctx.strokeStyle = node.color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner glowing core dot
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, isCore ? 6 : Math.max(3, r * 0.4), 0, Math.PI * 2);
        ctx.fill();

        // Text label
        ctx.fillStyle = isDark ? "#e2e8f0" : "#334155";
        ctx.font = `600 ${isCore ? 11 : 10}px 'Plus Jakarta Sans', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.name, node.x, node.y + r + 12);

        // Item count pill / text
        if (!isCore && node.count > 0) {
          ctx.fillStyle = isDark ? "#94a3b8" : "#64748b";
          ctx.font = `500 9px 'JetBrains Mono', monospace`;
          ctx.fillText(`${node.count}`, node.x, node.y + r + 24);
        }

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Mouse hover detection
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });

      let found: SynapseNode | null = null;
      for (const node of nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 8) {
          found = node;
          break;
        }
      }
      setHoveredNode(found);
    };

    const handleMouseLeave = () => {
      setHoveredNode(null);
      setMousePos(null);
    };

    const handleClick = () => {
      if (hoveredNode && hoveredNode.id !== "node_0" && onNodeClick) {
        onNodeClick(hoveredNode.category);
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [files, isSyncing, isExpanded, categoryStats, onNodeClick]);

  return (
    <div 
      ref={containerRef}
      className={`relative rounded-2xl border border-slate-200/90 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-xs overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Top subtle controls & telemetry strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/60 text-xs">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSyncing ? 'bg-indigo-400' : 'bg-emerald-400'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isSyncing ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-indigo-500" />
            Neural Drive Topology
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
            · {files.length} active synapses
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isSyncing && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Indexing...
            </span>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse View" : "Expand View"}
            className="flex items-center gap-1 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Interactive Generative Canvas */}
      <div className="relative w-full" style={{ height: isExpanded ? "360px" : "180px" }}>
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block cursor-crosshair"
        />

        {/* Hover HUD detail floating tooltip */}
        {hoveredNode && hoveredNode.id !== "node_0" && (
          <div 
            className="absolute bottom-3 left-4 pointer-events-none bg-slate-900/90 text-white dark:bg-slate-950/90 border border-slate-700/80 rounded-xl p-3 shadow-xl backdrop-blur-md max-w-xs animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between gap-3 pb-1 border-b border-slate-800">
              <span className="font-semibold text-xs text-indigo-300">{hoveredNode.name}</span>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                {hoveredNode.count} {hoveredNode.count === 1 ? 'file' : 'files'}
              </span>
            </div>
            {categoryStats[hoveredNode.name]?.sampleFiles.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Indexed Samples:</span>
                {categoryStats[hoveredNode.name].sampleFiles.map((fname, i) => (
                  <p key={i} className="text-[11px] text-slate-300 truncate font-mono">
                    · {fname}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
