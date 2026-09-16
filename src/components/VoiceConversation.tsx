import React, { useState, useRef, useEffect } from "react";
import { 
  Mic, 
  MicOff, 
  Radio, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Square, 
  Send, 
  AudioWaveform as WaveformIcon,
  MessageSquare,
  HelpCircle,
  CheckCircle2
} from "lucide-react";

interface LiveMessage {
  id: string;
  sender: 'user' | 'gemini';
  text: string;
  timestamp: string;
}

const AVAILABLE_VOICES = [
  { id: "Zephyr", name: "Zephyr", style: "Balanced, clear, and natural" },
  { id: "Puck", name: "Puck", style: "Playful, bright, and expressive" },
  { id: "Charon", name: "Charon", style: "Deep, calm, and resonant" },
  { id: "Kore", name: "Kore", style: "Warm, gentle, and measured" },
  { id: "Fenrir", name: "Fenrir", style: "Authoritative and crisp" },
];

export default function VoiceConversation() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("Zephyr");
  const [connectionStatus, setConnectionStatus] = useState<string>("Ready to connect");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<LiveMessage[]>([
    {
      id: "intro",
      sender: "gemini",
      text: "Welcome to Live Voice! Press 'Start Voice Conversation' to speak with me in real-time using model gemini-3.1-flash-live-preview.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [textPrompt, setTextPrompt] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);

  // Audio Context & WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef(false);
  const currentModelTextRef = useRef<string>("");
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  isMutedRef.current = isMuted;

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptContainerRef.current?.scrollTo({
      top: transcriptContainerRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [transcripts, isModelSpeaking]);

  // Audio level animation
  const updateAudioVisualizer = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
    }
    animationFrameRef.current = requestAnimationFrame(updateAudioVisualizer);
  };

  // Convert Float32Array to 16-bit PCM Little Endian Base64
  const float32ToPcm16Base64 = (float32Array: Float32Array): string => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const uint8 = new Uint8Array(pcm16.buffer);
    let binary = "";
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  };

  // Decode 24kHz 16-bit PCM Base64 to AudioBuffer
  const pcm16Base64ToAudioBuffer = (base64: string, ctx: AudioContext): AudioBuffer => {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
    }
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.copyToChannel(float32, 0);
    return audioBuffer;
  };

  // Play audio chunk with gapless scheduling
  const scheduleAudioChunk = (base64Audio: string) => {
    if (!outputAudioCtxRef.current) {
      outputAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
    }

    const ctx = outputAudioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    try {
      const audioBuffer = pcm16Base64ToAudioBuffer(base64Audio, ctx);
      const now = ctx.currentTime;
      if (nextStartTimeRef.current < now) {
        nextStartTimeRef.current = now;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setIsModelSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsModelSpeaking(false);
        }
      };
    } catch (e) {
      console.error("Audio chunk playback error:", e);
    }
  };

  // Stop playback on interruption
  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (outputAudioCtxRef.current) {
      nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
    }
    setIsModelSpeaking(false);
  };

  // Start Live Session
  const startLiveConversation = async () => {
    setErrorMessage(null);
    setIsConnecting(true);
    setConnectionStatus("Requesting microphone permission...");

    try {
      // 1. Get user microphone stream (16kHz preferred)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // 2. Setup input AudioContext (16kHz)
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      inputAudioCtxRef.current = inputCtx;

      const sourceNode = inputCtx.createMediaStreamSource(stream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      sourceNode.connect(analyser);
      analyser.connect(processor);
      processor.connect(inputCtx.destination);

      // Start animation loop
      updateAudioVisualizer();

      // 3. Setup WebSocket connection to server Live API bridge
      setConnectionStatus("Connecting to Gemini Live API...");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/live?voice=${selectedVoice}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
          const inputChannel = e.inputBuffer.getChannelData(0);
          const pcmBase64 = float32ToPcm16Base64(inputChannel);
          ws.send(JSON.stringify({ audio: pcmBase64 }));
        }
      };

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setIsListening(true);
        setConnectionStatus("Live session established. Speak naturally!");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "connected") {
            setConnectionStatus(`Connected (Voice: ${data.voice || selectedVoice})`);
          }

          if (data.type === "audio" && data.audio) {
            scheduleAudioChunk(data.audio);
          }

          if (data.type === "text" && data.text) {
            currentModelTextRef.current += data.text;
            setTranscripts(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.sender === "gemini") {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, text: currentModelTextRef.current }
                ];
              } else {
                return [
                  ...prev,
                  {
                    id: `gemini-${Date.now()}`,
                    sender: "gemini",
                    text: currentModelTextRef.current,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              }
            });
          }

          if (data.type === "turnComplete") {
            currentModelTextRef.current = "";
          }

          if (data.type === "interrupted") {
            stopAllPlayback();
            currentModelTextRef.current = "";
            setConnectionStatus("Speech interrupted by user");
            setTimeout(() => setConnectionStatus("Listening..."), 1200);
          }

          if (data.type === "error") {
            setErrorMessage(data.error);
          }
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      ws.onerror = (err) => {
        console.error("Live WebSocket error:", err);
        setErrorMessage("WebSocket connection error. Please check server status.");
      };

      ws.onclose = () => {
        disconnectLiveConversation();
        setConnectionStatus("Session closed");
      };

    } catch (err: any) {
      console.error("Live conversation start error:", err);
      setIsConnecting(false);
      setErrorMessage(
        err.name === "NotAllowedError"
          ? "Microphone access denied. Please grant microphone permission in your browser or iframe settings."
          : `Failed to initialize microphone or connection: ${err.message}`
      );
      setConnectionStatus("Connection failed");
    }
  };

  // Disconnect & cleanup
  const disconnectLiveConversation = () => {
    stopAllPlayback();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (inputAudioCtxRef.current && inputAudioCtxRef.current.state !== "closed") {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsListening(false);
    setIsModelSpeaking(false);
    setAudioLevel(0);
    setConnectionStatus("Ready to connect");
  };

  // Send text to Live API as fallback/complement
  const handleSendTextPrompt = () => {
    const text = textPrompt.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({ text }));
    setTranscripts(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        sender: "user",
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setTextPrompt("");
  };

  useEffect(() => {
    return () => {
      disconnectLiveConversation();
    };
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/50 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                <Radio className="h-5 w-5 animate-pulse" />
              </span>
              <h2 className="font-display font-bold text-slate-900 text-xl tracking-tight">
                Gemini Live Voice Conversations
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                gemini-3.1-flash-live-preview
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Experience real-time, low-latency audio streaming directly with Gemini Live API. Speak naturally into your microphone and hear immediate conversational voice responses.
            </p>
          </div>

          {/* Voice Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-700 shrink-0">
              Voice:
            </label>
            <select
              value={selectedVoice}
              disabled={isConnected || isConnecting}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 cursor-pointer"
            >
              {AVAILABLE_VOICES.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.style})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Audio Visualizer & Controls */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6 flex flex-col items-center text-center">
          
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            <span
              className={`h-2 w-2 rounded-full ${
                isModelSpeaking 
                  ? "bg-purple-500 animate-ping" 
                  : isConnected 
                    ? "bg-emerald-500" 
                    : isConnecting 
                      ? "bg-amber-500 animate-pulse" 
                      : "bg-slate-400"
              }`}
            />
            <span>{connectionStatus}</span>
          </div>

          {/* Glowing Audio Orb / Visualizer */}
          <div className="relative flex items-center justify-center my-4">
            {/* Outer pulsating wave */}
            <div
              className={`absolute rounded-full transition-all duration-300 ${
                isModelSpeaking
                  ? "bg-purple-500/20 ring-4 ring-purple-300"
                  : isConnected && !isMuted
                    ? "bg-indigo-500/20 ring-4 ring-indigo-200"
                    : "bg-slate-100"
              }`}
              style={{
                width: `${140 + audioLevel * 0.8}px`,
                height: `${140 + audioLevel * 0.8}px`
              }}
            />

            {/* Inner Interactive Sphere */}
            <div
              className={`relative z-10 h-32 w-32 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform duration-200 ${
                isModelSpeaking
                  ? "bg-gradient-to-tr from-purple-600 to-indigo-600 text-white scale-105"
                  : isConnected
                    ? "bg-gradient-to-tr from-indigo-600 to-sky-500 text-white"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
            >
              {isModelSpeaking ? (
                <>
                  <WaveformIcon className="h-10 w-10 animate-pulse" />
                  <span className="text-[10px] font-semibold mt-1 tracking-wider uppercase">Speaking</span>
                </>
              ) : isConnected ? (
                <>
                  {isMuted ? <MicOff className="h-10 w-10 text-rose-200" /> : <Mic className="h-10 w-10" />}
                  <span className="text-[10px] font-semibold mt-1 tracking-wider uppercase">
                    {isMuted ? "Muted" : "Listening"}
                  </span>
                </>
              ) : (
                <>
                  <MicOff className="h-10 w-10" />
                  <span className="text-[10px] font-semibold mt-1 tracking-wider uppercase">Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Real-time soundwave level bars */}
          {isConnected && (
            <div className="flex items-center gap-1.5 h-6">
              {[12, 28, 45, 60, 35, 18, 50, 75, 40, 25, 65, 30].map((baseHeight, i) => {
                const dynamicHeight = Math.max(
                  4,
                  Math.min(24, Math.round((baseHeight * audioLevel) / 60))
                );
                return (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isModelSpeaking ? "bg-purple-500" : "bg-indigo-500"
                    }`}
                    style={{ height: `${dynamicHeight}px` }}
                  />
                );
              })}
            </div>
          )}

          {/* Action Button Controls */}
          <div className="w-full space-y-3">
            {!isConnected ? (
              <button
                onClick={startLiveConversation}
                disabled={isConnecting}
                className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Connecting to Gemini Live...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Start Voice Conversation
                  </>
                )}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`py-2.5 px-4 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition cursor-pointer ${
                    isMuted
                      ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                      : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                  }`}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="h-4 w-4 text-rose-600" /> Unmute Mic
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" /> Mute Mic
                    </>
                  )}
                </button>

                <button
                  onClick={disconnectLiveConversation}
                  className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Square className="h-4 w-4 fill-current" /> Stop Session
                </button>
              </div>
            )}

            {/* Error Message alert */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 text-left">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Microphone or Connection Notice</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Guidance Info */}
          <div className="border-t border-slate-100 pt-4 w-full text-left space-y-1.5 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              Live Conversation Tips:
            </div>
            <p>• You can interrupt Gemini naturally at any time simply by speaking.</p>
            <p>• Output audio is streamed at 24kHz PCM for natural voice timbre.</p>
            <p>• Ask questions about your Google Drive layout, task scheduling, or ideas.</p>
          </div>
        </div>

        {/* Right Column: Real-time Transcript Stream & Fallback Text */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col h-[520px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                Live Speech Transcript
              </h3>
            </div>
            <button
              onClick={() => setTranscripts([])}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* Transcript Scroll Area */}
          <div
            ref={transcriptContainerRef}
            className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 text-xs"
          >
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1">
                <Radio className="h-6 w-6 text-slate-300" />
                <p>No spoken turns yet.</p>
                <p className="text-[11px]">Start conversation and speak into your microphone.</p>
              </div>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t.id}
                  className={`p-3 rounded-xl leading-relaxed ${
                    t.sender === "user"
                      ? "bg-slate-900 text-white ml-6"
                      : "bg-indigo-50/80 text-slate-800 border border-indigo-100 mr-6"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 text-[10px] opacity-75">
                    <span className="font-semibold">
                      {t.sender === "user" ? "You (Spoken / Typed)" : `Gemini Live (${selectedVoice})`}
                    </span>
                    <span>{t.timestamp}</span>
                  </div>
                  <div className="whitespace-pre-wrap">{t.text}</div>
                </div>
              ))
            )}
          </div>

          {/* Fallback Text Input (can be used alongside or during session) */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendTextPrompt()}
                disabled={!isConnected}
                placeholder={
                  isConnected 
                    ? "Type text to send directly to Live API session..." 
                    : "Connect to send text to Live API..."
                }
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSendTextPrompt}
                disabled={!textPrompt.trim() || !isConnected}
                className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition cursor-pointer"
                title="Send text to Live API"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 px-1">
              <span>Supports simultaneous real-time voice & text turns</span>
              <span>Model: gemini-3.1-flash-live-preview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
