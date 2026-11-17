import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Scissors,
} from 'lucide-react';

export interface CustomVideoPlayerProps {
  src: string;
  autoPlay?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({ src, autoPlay = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isTrimMode, setIsTrimMode] = useState<boolean>(false);
  const [trimRange, setTrimRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls after inactivity while playing
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetHideTimer();
  }, [resetHideTimer]);

  const skipSeconds = useCallback((delta: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + delta));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Time and buffer update listeners
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.buffered.length > 0 && videoRef.current.duration > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      setBufferedPercent((bufferedEnd / videoRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    setDuration(dur);
    setTrimRange({ start: 0, end: dur });
    if (autoPlay) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  // Scrubber click / drag
  const handleScrubberSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || !videoRef.current || duration <= 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * duration;
    videoRef.current.currentTime = target;
    setCurrentTime(target);
    resetHideTimer();
  };

  // Keyboard navigation inside player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipSeconds(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipSeconds(5);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipSeconds, toggleMute, toggleFullscreen]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
      data-testid="custom-video-player"
      style={{
        position: 'relative',
        width: '100%',
        maxHeight: isFullscreen ? '100vh' : '66vh',
        backgroundColor: '#000000',
        borderRadius: isFullscreen ? 0 : '4px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      <video
        ref={videoRef}
        key={src}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
        style={{
          width: '100%',
          maxHeight: isFullscreen ? '100vh' : '66vh',
          display: 'block',
          cursor: 'pointer',
        }}
      />

      {/* Center Big Play Button (when paused) */}
      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          style={{
            position: 'absolute',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(98, 70, 234, 0.85)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            transition: 'transform 0.15s ease, background-color 0.15s ease',
            zIndex: 5,
          }}
        >
          <Play size={28} fill="currentColor" style={{ marginLeft: '4px' }} />
        </button>
      )}

      {/* Bottom Custom Controls Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          background: 'linear-gradient(to top, rgba(10, 12, 16, 0.95) 0%, rgba(10, 12, 16, 0.6) 70%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          opacity: showControls || !isPlaying ? 1 : 0,
          pointerEvents: showControls || !isPlaying ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          zIndex: 10,
        }}
      >
        {/* Timeline Scrubber Bar */}
        <div
          ref={scrubberRef}
          onClick={handleScrubberSeek}
          style={{
            position: 'relative',
            width: '100%',
            height: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.18)',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          {/* Buffered progress */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${bufferedPercent}%`,
              backgroundColor: 'rgba(255, 255, 255, 0.28)',
              borderRadius: '4px',
            }}
          />

          {/* Played progress */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressPercent}%`,
              backgroundColor: 'var(--primary)',
              borderRadius: '4px',
            }}
          />

          {/* Scrub Handle Knob */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `${progressPercent}%`,
              transform: 'translate(-50%, -50%)',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
            }}
          />

          {/* Trimming Range Markers (when trim mode active) */}
          {isTrimMode && duration > 0 && (
            <>
              <div
                title="Trim Start"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  bottom: '-4px',
                  left: `${(trimRange.start / duration) * 100}%`,
                  width: '3px',
                  backgroundColor: 'var(--warning)',
                  borderRadius: '2px',
                  zIndex: 2,
                }}
              />
              <div
                title="Trim End"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  bottom: '-4px',
                  left: `${(trimRange.end / duration) * 100}%`,
                  width: '3px',
                  backgroundColor: 'var(--warning)',
                  borderRadius: '2px',
                  zIndex: 2,
                }}
              />
            </>
          )}
        </div>

        {/* Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {/* Left Controls: Play/Pause, -5s, +5s, Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="btn-ghost"
              style={{ color: '#ffffff', padding: '6px' }}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(-5)}
              aria-label="Skip backward 5 seconds"
              title="Skip Backward 5s (←)"
              className="btn-ghost"
              style={{
                color: '#ffffff',
                padding: '4px 6px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <RotateCcw size={15} />
              <span style={{ fontWeight: 600 }}>5s</span>
            </button>

            <button
              type="button"
              onClick={() => skipSeconds(5)}
              aria-label="Skip forward 5 seconds"
              title="Skip Forward 5s (→)"
              className="btn-ghost"
              style={{
                color: '#ffffff',
                padding: '4px 6px',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <RotateCw size={15} />
              <span style={{ fontWeight: 600 }}>5s</span>
            </button>

            <span style={{ color: '#ffffff', fontSize: '0.8rem', marginLeft: '6px', fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right Controls: Trimming Hook, Volume, Fullscreen */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsTrimMode(!isTrimMode)}
              aria-label="Toggle clip trimming"
              title={isTrimMode ? 'Close Trimming Tool' : 'Clip Trimming Tool'}
              className={isTrimMode ? 'btn-primary' : 'btn-ghost'}
              style={{
                fontSize: '0.75rem',
                padding: '4px 8px',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Scissors size={14} />
              <span>{isTrimMode ? 'Trimming' : 'Trim'}</span>
            </button>

            {/* Volume Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="btn-ghost"
                style={{ color: '#ffffff', padding: '6px' }}
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume slider"
                style={{
                  width: '64px',
                  cursor: 'pointer',
                  accentColor: 'var(--primary)',
                }}
              />
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="btn-ghost"
              style={{ color: '#ffffff', padding: '6px' }}
            >
              {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
