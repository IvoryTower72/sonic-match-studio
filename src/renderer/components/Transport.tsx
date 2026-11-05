import type { RefObject } from 'react'
import { REFERENCE_COPY } from '../../shared/copy.js'
import { displayName } from '../../shared/session.js'
import { formatMediaClock } from '../../shared/time.js'
import type { Track } from '../../shared/types.js'

interface TransportProps {
  reference: Track | null
  preview: Track | null
  playing: boolean
  time: number
  duration: number
  volume: number
  error: string | null
  canSetReference: boolean
  audioRef: RefObject<HTMLAudioElement | null>
  scrubbing: RefObject<boolean>
  onSetReference: () => void
  onToggle: () => void
  onSeek: (seconds: number) => void
  onVolume: (volume: number) => void
  onPlay: () => void
  onPause: () => void
  onTimeUpdate: () => void
  onLoaded: () => void
  onError: () => void
}

export function Transport(props: TransportProps) {
  const referenceName = props.reference ? displayName(props.reference) : 'No reference yet'
  const previewName = props.preview ? displayName(props.preview) : 'Nothing playing'
  return (
    <section className="transport" aria-label="Reference and preview">
      <div className="card reference-card">
        <span className="kicker">Reference</span>
        <div className="identity">
          <strong data-testid="reference-name">{referenceName}</strong>
          <span>{REFERENCE_COPY}</span>
        </div>
        <button
          type="button"
          className="button"
          data-testid="set-reference"
          disabled={!props.canSetReference}
          onClick={props.onSetReference}
        >
          Set reference
        </button>
      </div>
      <div className="card preview-card">
        <span className="kicker">Preview</span>
        <div className="identity">
          <strong data-testid="preview-name">{previewName}</strong>
          <span>{props.error ?? 'Does not change the set.'}</span>
        </div>
        <button
          type="button"
          className="button primary"
          data-testid="preview-play"
          onClick={props.onToggle}
        >
          {props.playing ? 'Pause' : 'Play'}
        </button>
        <input
          className="seek"
          type="range"
          aria-label="Seek"
          data-testid="preview-seek"
          min={0}
          max={props.duration || 0}
          step={0.1}
          value={Math.min(props.time, props.duration || 0)}
          disabled={!props.preview}
          onPointerDown={() => {
            props.scrubbing.current = true
          }}
          onPointerUp={() => {
            props.scrubbing.current = false
          }}
          onChange={(event) => props.onSeek(Number(event.target.value))}
        />
        <span className="time-readout" data-testid="preview-time">
          {formatMediaClock(props.time)} / {formatMediaClock(props.duration)}
        </span>
        <label className="volume">
          Vol
          <input
            type="range"
            aria-label="Preview volume"
            data-testid="preview-volume"
            min={0}
            max={1}
            step={0.01}
            value={props.volume}
            onChange={(event) => props.onVolume(Number(event.target.value))}
          />
        </label>
        <audio
          ref={props.audioRef}
          className="clip"
          preload="auto"
          controls
          tabIndex={-1}
          onPlay={props.onPlay}
          onPause={props.onPause}
          onEnded={props.onPause}
          onTimeUpdate={props.onTimeUpdate}
          onLoadedMetadata={props.onLoaded}
          onError={props.onError}
        />
      </div>
    </section>
  )
}
