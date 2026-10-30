'use client';
// App-wide client state: the signed-in person (display only — the server decides access), the global period filter
// (V1 DataContext dateFilter, remembered per viewer) and the global audio player (V1 AudioPlayer bar).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const UserCtx = createContext(null);
export const useUser = () => useContext(UserCtx);
export const useCan = () => { const u = useUser(); return (p) => !!u?.permissions?.includes(p); };

const PeriodCtx = createContext(null);
export const usePeriod = () => useContext(PeriodCtx);

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

export function AppProviders({ user, children }) {
  const [period, setPeriodState] = useState({ key: 'all', from: '', to: '' });
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('cas-period') || 'null'); if (s?.key) setPeriodState(s); } catch {} }, []);
  const setPeriod = useCallback((p) => { setPeriodState(p); try { localStorage.setItem('cas-period', JSON.stringify(p)); } catch {} }, []);

  // ── audio player ──
  const audio = useRef(null);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [error, setError] = useState(null);

  const ensure = () => {
    if (audio.current) return audio.current;
    const a = new Audio();
    a.preload = 'metadata';
    a.addEventListener('timeupdate', () => setTime(a.currentTime));
    a.addEventListener('loadedmetadata', () => setDuration(a.duration || 0));
    a.addEventListener('ended', () => { setPlaying(false); setTime(0); });
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('error', () => { setPlaying(false); setError('This recording could not be played.'); });
    audio.current = a; return a;
  };
  const play = useCallback((call, list) => {
    if (!call?.audio_file_id) { setError('No recording is stored for this call.'); return; }
    const a = ensure(); setError(null);
    if (list) setQueue(list.filter((c) => c.audio_file_id));
    if (current?.id === call.id) { a.paused ? a.play().catch(() => {}) : a.pause(); return; }
    a.src = `/api/files/${call.audio_file_id}`; a.playbackRate = speed; a.volume = volume;
    setCurrent(call); setTime(0); setDuration(0);
    a.play().catch(() => setError('Playback was blocked — press play again.'));
  }, [current, speed, volume]);
  const toggle = useCallback(() => { const a = audio.current; if (!a) return; a.paused ? a.play().catch(() => {}) : a.pause(); }, []);
  const seek = useCallback((t) => { const a = audio.current; if (a) { a.currentTime = t; setTime(t); } }, []);
  const setSpeed = useCallback((s) => { setSpeedState(s); if (audio.current) audio.current.playbackRate = s; }, []);
  const setVolume = useCallback((v) => { setVolumeState(v); if (audio.current) audio.current.volume = v; }, []);
  const step = useCallback((dir) => {
    const i = queue.findIndex((c) => c.id === current?.id); const next = queue[i + dir];
    if (next) play(next);
  }, [queue, current, play]);
  const stop = useCallback(() => { audio.current?.pause(); setCurrent(null); setPlaying(false); setTime(0); }, []);
  useEffect(() => () => audio.current?.pause(), []);

  const player = useMemo(() => ({ current, playing, time, duration, speed, volume, error, play, toggle, seek, setSpeed, setVolume, step, stop, clearError: () => setError(null) }),
    [current, playing, time, duration, speed, volume, error, play, toggle, seek, setSpeed, setVolume, step, stop]);

  return (
    <UserCtx.Provider value={user}>
      <PeriodCtx.Provider value={{ period, setPeriod }}>
        <PlayerCtx.Provider value={player}>{children}</PlayerCtx.Provider>
      </PeriodCtx.Provider>
    </UserCtx.Provider>
  );
}
