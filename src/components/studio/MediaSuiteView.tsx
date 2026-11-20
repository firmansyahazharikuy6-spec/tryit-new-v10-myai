import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Box,
  Check,
  Cloud,
  Download,
  Gamepad2,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Music,
  PhoneCall,
  PhoneOff,
  Send,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  loadCreationRecords,
  saveCreationRecord,
  type CreationRecord,
} from '../../lib/firebase';
import { syncQueueManager } from '../../lib/syncQueueManager';
import { isRetryableSyncError } from '../../utils/offlineSyncQueue';
import type { MediaSuiteTab } from '../../types/workspace';
import { BrandMark } from '../BrandMark';
import { Myra3DShowcase } from '../three/Myra3DShowcase';
import { MapsExplorer } from './MapsExplorer';

interface MediaSuiteViewProps {
  activeTab: MediaSuiteTab;
  onChangeTab: (tab: MediaSuiteTab) => void;
  onGoHome: () => void;
  onOpenStudio: () => void;
  onOpenGame: () => void;
}

const SUITE_TABS: Array<{ id: MediaSuiteTab; label: string; icon: typeof ImageIcon }> = [
  { id: 'image', label: 'Image Studio', icon: ImageIcon },
  { id: 'music', label: 'Music Studio', icon: Music },
  { id: 'video', label: 'Video Studio', icon: Video },
  { id: 'voice', label: 'Live Voice & Transcribe', icon: PhoneCall },
  { id: 'maps', label: 'Maps Explorer', icon: MapPin },
  { id: '3d', label: '3D Core Showcase', icon: Box },
];

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mimeType: file.type || 'application/octet-stream' });
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToInt16Array(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export function MediaSuiteView({
  activeTab,
  onChangeTab,
  onGoHome,
  onOpenStudio,
  onOpenGame,
}: MediaSuiteViewProps) {
  const { user, signInGoogle } = useAuth();
  const [cloudRecords, setCloudRecords] = useState<CreationRecord[]>([]);
  const [savingCloud, setSavingCloud] = useState(false);
  const [cloudSavedId, setCloudSavedId] = useState<string | null>(null);

  // --- Image Studio State ---
  const [imgPrompt, setImgPrompt] = useState(
    'Architectural studio render of an anodized titanium neural core with indigo softbox lighting',
  );
  const [imgAspect, setImgAspect] = useState('16:9');
  const [imgSize, setImgSize] = useState('1K');
  const [imgUseSearch, setImgUseSearch] = useState(false);
  const [imgSource, setImgSource] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgResult, setImgResult] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  // --- Music Studio State ---
  const [musicPrompt, setMusicPrompt] = useState(
    'Atmospheric cyberpunk synthwave with warm analog bass, crisp arpeggios, 118 BPM, no vocals',
  );
  const [musicModel, setMusicModel] = useState<'lyria-3-clip-preview' | 'lyria-3-pro-preview'>(
    'lyria-3-clip-preview',
  );
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicAudioUrl, setMusicAudioUrl] = useState<string | null>(null);
  const [musicLyrics, setMusicLyrics] = useState<string>('');
  const [musicError, setMusicError] = useState<string | null>(null);

  // --- Video Studio State ---
  const [vidPrompt, setVidPrompt] = useState(
    'Slow orbital camera sweeping around a crystalline AI server monolith in a rain-slick courtyard, twilight reflections',
  );
  const [vidAspect, setVidAspect] = useState<'16:9' | '9:16'>('16:9');
  const [vidDuration, setVidDuration] = useState<'5s' | '8s' | '12s'>('8s');
  const [vidResolution, setVidResolution] = useState<'720p' | '1080p'>('720p');
  const [vidStartFrame, setVidStartFrame] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const [vidBusy, setVidBusy] = useState(false);
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [vidError, setVidError] = useState<string | null>(null);

  // --- Transcribe State ---
  const [transBusy, setTransBusy] = useState(false);
  const [transRecording, setTransRecording] = useState(false);
  const [transResult, setTransResult] = useState<string>('');
  const [transError, setTransError] = useState<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);

  // --- Live Voice WebSocket State (gemini-3.8-live) ---
  const [liveVoice, setLiveVoice] = useState('Zephyr');
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLog, setLiveLog] = useState<Array<{ who: 'user' | 'myra'; text: string }>>([]);
  const [liveTextDraft, setLiveTextDraft] = useState('');
  const liveWsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    if (!user) {
      setCloudRecords([]);
      return;
    }
    void loadCreationRecords(user.uid)
      .then(setCloudRecords)
      .catch(() => {
        // Non-fatal read error
      });
  }, [user]);

  useEffect(() => {
    return () => {
      disconnectLiveVoice();
    };
  }, []);

  async function saveMetadataToCloud(item: Omit<CreationRecord, 'id' | 'createdAt'>) {
    if (!user || savingCloud) return;
    setSavingCloud(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline: buffering creation metadata');
      }
      await saveCreationRecord(user.uid, item);
      setCloudSavedId(item.title);
      const updated = await loadCreationRecords(user.uid);
      setCloudRecords(updated);
    } catch (err) {
      if (isRetryableSyncError(err)) {
        syncQueueManager.enqueue(
          {
            kind: 'creation:create',
            uid: user.uid,
            label: `Save ${item.kind}: ${item.title}`,
            payload: item,
          },
          { immediate: typeof navigator !== 'undefined' && navigator.onLine },
        );
        setCloudSavedId(`${item.title} (queued offline)`);
      }
    } finally {
      setSavingCloud(false);
    }
  }

  async function handleGenerateImage(e: React.FormEvent) {
    e.preventDefault();
    if (!imgPrompt.trim() || imgBusy) return;
    setImgBusy(true);
    setImgError(null);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          aspectRatio: imgAspect,
          imageSize: imgSize,
          useSearch: imgUseSearch,
          imageBase64: imgSource?.base64,
          mimeType: imgSource?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImgError(data.error || 'Image generation failed.');
        return;
      }
      setImgResult(data.imageDataUrl);
    } catch {
      setImgError('Network error while calling Image Studio.');
    } finally {
      setImgBusy(false);
    }
  }

  async function handleGenerateMusic(e: React.FormEvent) {
    e.preventDefault();
    if (!musicPrompt.trim() || musicBusy) return;
    setMusicBusy(true);
    setMusicError(null);
    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, model: musicModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMusicError(data.error || 'Music generation failed.');
        return;
      }
      setMusicAudioUrl(data.audioDataUrl);
      setMusicLyrics(data.lyrics || '');
    } catch {
      setMusicError('Network error while calling Music Studio.');
    } finally {
      setMusicBusy(false);
    }
  }

  async function handleGenerateVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!vidPrompt.trim() || vidBusy) return;
    setVidBusy(true);
    setVidError(null);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: vidPrompt,
          aspectRatio: vidAspect,
          duration: vidDuration,
          resolution: vidResolution,
          imageBase64: vidStartFrame?.base64,
          mimeType: vidStartFrame?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVidError(data.error || 'Video generation failed.');
        return;
      }
      setVidUrl(data.videoDataUrl || data.videoUri);
    } catch {
      setVidError('Network error while calling Video Studio.');
    } finally {
      setVidBusy(false);
    }
  }

  async function submitTranscribeBlob(blob: Blob, mimeType: string) {
    setTransBusy(true);
    setTransError(null);
    try {
      const buf = await blob.arrayBuffer();
      const audioBase64 = arrayBufferToBase64(buf);
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTransError(data.error || 'Audio transcription failed.');
        return;
      }
      setTransResult(data.transcript || '');
    } catch {
      setTransError('Network error during audio transcription.');
    } finally {
      setTransBusy(false);
    }
  }

  async function toggleMicTranscription() {
    if (transRecording && mediaRecRef.current) {
      mediaRecRef.current.stop();
      setTransRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(recChunksRef.current, { type: mime });
        void submitTranscribeBlob(blob, mime);
      };
      mediaRecRef.current = recorder;
      recorder.start();
      setTransRecording(true);
      setTransError(null);
    } catch (err) {
      setTransError(
        err instanceof Error ? err.message : 'Microphone permission denied.',
      );
    }
  }

  function disconnectLiveVoice() {
    try {
      liveWsRef.current?.close();
    } catch {
      // Ignore
    }
    liveWsRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    void micCtxRef.current?.close();
    micCtxRef.current = null;
    scheduledSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignore
      }
    });
    scheduledSourcesRef.current = [];
    void playCtxRef.current?.close();
    playCtxRef.current = null;
    setLiveConnected(false);
    setLiveConnecting(false);
  }

  async function connectLiveVoice() {
    if (liveConnected || liveConnecting) return;
    setLiveConnecting(true);
    setLiveError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      });
      micStreamRef.current = stream;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${window.location.host}/api/live-ws?voice=${encodeURIComponent(liveVoice)}`,
      );
      liveWsRef.current = ws;

      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const playCtx = new AC({ sampleRate: 24000 });
      playCtxRef.current = playCtx;
      nextPlayTimeRef.current = playCtx.currentTime;

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            ready?: boolean;
            error?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            audio?: string;
            interrupted?: boolean;
          };
          if (msg.error) {
            setLiveError(msg.error);
            disconnectLiveVoice();
            return;
          }
          if (msg.ready) {
            setLiveConnected(true);
            setLiveConnecting(false);
          }
          if (msg.inputTranscript) {
            setLiveLog((prev) => [...prev.slice(-24), { who: 'user', text: msg.inputTranscript! }]);
          }
          if (msg.outputTranscript) {
            setLiveLog((prev) => [...prev.slice(-24), { who: 'myra', text: msg.outputTranscript! }]);
          }
          if (msg.interrupted) {
            scheduledSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {
                // Ignore
              }
            });
            scheduledSourcesRef.current = [];
            nextPlayTimeRef.current = playCtx.currentTime;
          }
          if (msg.audio) {
            const int16 = base64ToInt16Array(msg.audio);
            const f32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
              f32[i] = int16[i] / 32768;
            }
            const buf = playCtx.createBuffer(1, f32.length, 24000);
            buf.getChannelData(0).set(f32);
            const src = playCtx.createBufferSource();
            src.buffer = buf;
            src.connect(playCtx.destination);
            const startAt = Math.max(playCtx.currentTime, nextPlayTimeRef.current);
            src.start(startAt);
            nextPlayTimeRef.current = startAt + buf.duration;
            scheduledSourcesRef.current.push(src);
          }
        } catch {
          // Ignore malformed server frame
        }
      };

      ws.onerror = () => {
        setLiveError('WebSocket connection error during Live Voice session.');
        disconnectLiveVoice();
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveConnecting(false);
      };

      const micCtx = new AC({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const srcNode = micCtx.createMediaStreamSource(stream);
      const proc = micCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (ev) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = ev.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        ws.send(JSON.stringify({ audio: arrayBufferToBase64(pcm16.buffer) }));
      };
      srcNode.connect(proc);
      proc.connect(micCtx.destination);
    } catch (err) {
      setLiveError(
        err instanceof Error ? err.message : 'Unable to start microphone for Live Voice.',
      );
      disconnectLiveVoice();
    }
  }

  function handleSendLiveText(e: React.FormEvent) {
    e.preventDefault();
    const txt = liveTextDraft.trim();
    if (!txt || !liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) return;
    liveWsRef.current.send(JSON.stringify({ text: txt }));
    setLiveLog((prev) => [...prev.slice(-24), { who: 'user', text: txt }]);
    setLiveTextDraft('');
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-14 px-3 sm:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-2 text-sm font-display font-bold tracking-tight whitespace-nowrap cursor-pointer"
          >
            <BrandMark variant="myai" className="w-6 h-5 shrink-0" />
            <span className="sm:hidden">MyAI Suite</span>
            <span className="hidden sm:inline">MyAI Multimodal Suite</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenStudio}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">Studio</span>
            <span className="hidden sm:inline">Agent Studio</span>
          </button>
          <button
            type="button"
            onClick={onOpenGame}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">3D Game</span>
            <span className="hidden sm:inline">3D Arena Game</span>
          </button>
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Back to MyAI main site"
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Suite Sub-Navigation Strip */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-[#0D0D10] px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center gap-1.5 overflow-x-auto py-2.5">
          {SUITE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-7 space-y-6">
        {/* TAB 1: IMAGE STUDIO */}
        {activeTab === 'image' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleGenerateImage}
              className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-base font-semibold">
                  Create &amp; Edit Images (Nano Banana 2.1)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Generate high-resolution artwork or upload an image to edit via natural language.
                </p>
              </div>

              <textarea
                rows={4}
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="Describe the image or edit instructions..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-500">Aspect Ratio</span>
                  <select
                    value={imgAspect}
                    onChange={(e) => setImgAspect(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-2"
                  >
                    <option value="1:1">1:1 Square</option>
                    <option value="16:9">16:9 Wide</option>
                    <option value="9:16">9:16 Vertical</option>
                    <option value="4:3">4:3 Classic</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-zinc-500">Resolution</span>
                  <select
                    value={imgSize}
                    onChange={(e) => setImgSize(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-2"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imgUseSearch}
                    onChange={(e) => setImgUseSearch(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span>Search-grounded reference</span>
                </label>

                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{imgSource ? imgSource.name.slice(0, 14) : 'Source Image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const parsed = await readFileAsBase64(file);
                      setImgSource({ ...parsed, name: file.name });
                    }}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={imgBusy || !imgPrompt.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {imgBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rendering with Nano Banana 2.1...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{imgSource ? 'Edit Uploaded Image' : 'Generate Image'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-between min-h-[380px]">
              {imgError && (
                <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{imgError}</span>
                </div>
              )}

              {imgResult ? (
                <div className="space-y-3">
                  <img
                    src={imgResult}
                    alt="Generated asset"
                    className="w-full max-h-[380px] object-contain rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a
                      href={imgResult}
                      download="myai-image.png"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </a>
                    {user && (
                      <button
                        type="button"
                        onClick={() =>
                          void saveMetadataToCloud({
                            kind: 'image',
                            title: imgPrompt.slice(0, 48),
                            prompt: imgPrompt,
                            model: 'gemini-nano-banana-2.1',
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Save Metadata to Firestore</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-60" />
                  <p className="text-xs">Generated or edited artwork appears here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MUSIC STUDIO */}
        {activeTab === 'music' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleGenerateMusic}
              className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-base font-semibold">
                  Generate Music (Lyria 3 Clip &amp; Pro)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Compose 30s stereo previews or full instrumental &amp; vocal tracks.
                </p>
              </div>

              <textarea
                rows={4}
                value={musicPrompt}
                onChange={(e) => setMusicPrompt(e.target.value)}
                placeholder="Genre, instruments, mood, tempo (BPM), vocals..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />

              <label className="block space-y-1 text-xs">
                <span className="text-zinc-500">Lyria Model</span>
                <select
                  value={musicModel}
                  onChange={(e) =>
                    setMusicModel(
                      e.target.value as 'lyria-3-clip-preview' | 'lyria-3-pro-preview',
                    )
                  }
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-2"
                >
                  <option value="lyria-3-clip-preview">Lyria 3 Clip Preview (30s)</option>
                  <option value="lyria-3-pro-preview">Lyria 3 Pro Preview (Full Track)</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={musicBusy || !musicPrompt.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {musicBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Composing Audio Track...</span>
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4" />
                    <span>Compose Music</span>
                  </>
                )}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-center space-y-4 min-h-[300px]">
              {musicError && (
                <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{musicError}</span>
                </div>
              )}

              {musicAudioUrl ? (
                <div className="space-y-4">
                  <audio controls src={musicAudioUrl} className="w-full" />
                  {musicLyrics && (
                    <pre className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {musicLyrics}
                    </pre>
                  )}
                  <div className="flex gap-2">
                    <a
                      href={musicAudioUrl}
                      download="myai-track.mp3"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Audio</span>
                    </a>
                    {user && (
                      <button
                        type="button"
                        onClick={() =>
                          void saveMetadataToCloud({
                            kind: 'music',
                            title: musicPrompt.slice(0, 48),
                            prompt: musicPrompt,
                            model: musicModel,
                            summaryText: musicLyrics,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Save Metadata</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-zinc-500 space-y-2">
                  <Music className="w-8 h-8 mx-auto opacity-60" />
                  <p className="text-xs">Composed stereo audio and lyrics appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: VIDEO STUDIO */}
        {activeTab === 'video' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleGenerateVideo}
              className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4"
            >
              <div>
                <h2 className="font-display text-base font-semibold">
                  Text-to-Video &amp; Animate Image (Omni 1.2 Flash)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Create native 720p/1080p cinema clips from text or animate a starting image frame.
                </p>
              </div>

              <textarea
                rows={4}
                value={vidPrompt}
                onChange={(e) => setVidPrompt(e.target.value)}
                placeholder="Describe motion, camera movement, lighting..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />

              <div className="grid grid-cols-3 gap-2 text-xs">
                <label className="space-y-1">
                  <span className="text-zinc-500">Aspect</span>
                  <select
                    value={vidAspect}
                    onChange={(e) => setVidAspect(e.target.value as '16:9' | '9:16')}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5"
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-500">Length</span>
                  <select
                    value={vidDuration}
                    onChange={(e) => setVidDuration(e.target.value as '5s' | '8s' | '12s')}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5"
                  >
                    <option value="5s">5s</option>
                    <option value="8s">8s</option>
                    <option value="12s">12s</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-500">Quality</span>
                  <select
                    value={vidResolution}
                    onChange={(e) => setVidResolution(e.target.value as '720p' | '1080p')}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </label>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {vidStartFrame
                    ? `Frame: ${vidStartFrame.name.slice(0, 18)}`
                    : 'Optional Start Frame (Image-to-Video)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const parsed = await readFileAsBase64(file);
                    setVidStartFrame({ ...parsed, name: file.name });
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={vidBusy || !vidPrompt.trim()}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {vidBusy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rendering Video via Interactions API...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    <span>{vidStartFrame ? 'Animate Image to Video' : 'Generate Video'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-center min-h-[360px]">
              {vidError && (
                <div className="p-3.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{vidError}</span>
                </div>
              )}

              {vidUrl ? (
                <div className="space-y-3">
                  <video controls src={vidUrl} className="w-full rounded-xl bg-black max-h-[360px]" />
                  {user && (
                    <button
                      type="button"
                      onClick={() =>
                        void saveMetadataToCloud({
                          kind: 'video',
                          title: vidPrompt.slice(0, 48),
                          prompt: vidPrompt,
                          model: 'gemini-omni-1.2-flash',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                    >
                      <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Save Video Metadata</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-center text-zinc-500 space-y-2">
                  <Video className="w-8 h-8 mx-auto opacity-60" />
                  <p className="text-xs">Rendered MP4 playback appears here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: LIVE VOICE & AUDIO TRANSCRIBE */}
        {activeTab === 'voice' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Real-Time Gemini Live Voice (gemini-3.8-live) */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold">
                    Live Voice Conversation (Gemini 3.8 Live)
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Full-duplex 16kHz mic streaming &amp; 24kHz PCM voice replies over WebSocket.
                  </p>
                </div>
                <select
                  value={liveVoice}
                  disabled={liveConnected}
                  onChange={(e) => setLiveVoice(e.target.value)}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="Zephyr">Zephyr</option>
                  <option value="Puck">Puck</option>
                  <option value="Kore">Kore</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Charon">Charon</option>
                </select>
              </div>

              <div className="flex gap-2">
                {liveConnected ? (
                  <button
                    type="button"
                    onClick={disconnectLiveVoice}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Live Session</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={liveConnecting}
                    onClick={connectLiveVoice}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {liveConnecting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Connecting WebSocket...</span>
                      </>
                    ) : (
                      <>
                        <PhoneCall className="w-4 h-4" />
                        <span>Start Live Voice Call</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {liveError && (
                <div className="p-3 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                  {liveError}
                </div>
              )}

              <div className="h-52 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-2 text-xs">
                {liveLog.length === 0 ? (
                  <p className="text-zinc-500">
                    Live voice transcript turns will appear here once connected.
                  </p>
                ) : (
                  liveLog.map((entry, idx) => (
                    <div key={idx} className="leading-relaxed">
                      <span
                        className={`font-semibold mr-1.5 ${
                          entry.who === 'myra' ? 'text-indigo-500' : 'text-emerald-500'
                        }`}
                      >
                        {entry.who === 'myra' ? 'MYRA:' : 'You:'}
                      </span>
                      <span>{entry.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendLiveText} className="flex gap-2">
                <input
                  type="text"
                  value={liveTextDraft}
                  onChange={(e) => setLiveTextDraft(e.target.value)}
                  disabled={!liveConnected}
                  placeholder="Optional text nudge during live session..."
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs disabled:opacity-40"
                />
                <button
                  type="submit"
                  disabled={!liveConnected || !liveTextDraft.trim()}
                  className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium disabled:opacity-40 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Audio Transcription (gemini-3.5-transcribe) */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold">
                  Transcribe Audio (Gemini 3.5 Transcribe)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Record directly from microphone or upload audio files for clean transcription.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleMicTranscription}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer ${
                    transRecording
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  }`}
                >
                  {transRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{transRecording ? 'Stop & Transcribe' : 'Record Microphone'}</span>
                </button>

                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload Audio File</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void submitTranscribeBlob(file, file.type || 'audio/mp3');
                      }
                    }}
                  />
                </label>
              </div>

              {transBusy && (
                <div className="flex items-center gap-2 text-xs text-indigo-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcribing with gemini-3.5-transcribe...</span>
                </div>
              )}

              {transError && (
                <div className="p-3 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                  {transError}
                </div>
              )}

              <textarea
                readOnly
                rows={9}
                value={transResult}
                placeholder="Clean audio transcription will appear here..."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs resize-none"
              />

              {user && transResult && (
                <button
                  type="button"
                  onClick={() =>
                    void saveMetadataToCloud({
                      kind: 'transcript',
                      title: transResult.slice(0, 48),
                      prompt: 'Audio Transcription',
                      model: 'gemini-3.5-transcribe',
                      summaryText: transResult,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Save Transcript to Firestore</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: GOOGLE MAPS EXPLORER */}
        {activeTab === 'maps' && <MapsExplorer />}

        {/* TAB 6: 3D SHOWCASE */}
        {activeTab === '3d' && <Myra3DShowcase />}

        {/* Firestore Saved Creations History Strip */}
        <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Cloud className="w-4 h-4 text-indigo-500" />
              <span>Firestore Cloud Creations Log</span>
              {cloudSavedId && (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </span>
              )}
            </div>
            {!user && (
              <button
                type="button"
                onClick={() => void signInGoogle()}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Sign in with Google to save creations to Firestore
              </button>
            )}
          </div>

          {user && cloudRecords.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cloudRecords.slice(0, 8).map((rec) => (
                <div
                  key={rec.id}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-zinc-500">
                    <span className="uppercase">{rec.kind}</span>
                    <span>{rec.model}</span>
                  </div>
                  <div className="font-medium truncate">{rec.title}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
