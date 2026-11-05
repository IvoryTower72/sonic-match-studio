import { useState, type DragEvent } from 'react'
import { ESTIMATE_COPY, ESTIMATE_LABEL, REMOVE_COPY } from '../../shared/copy.js'
import { plannerDragPayload, readDrag } from '../../shared/drag.js'
import { planTiming } from '../../shared/planner.js'
import { displayName } from '../../shared/session.js'
import { formatHms, formatTrackClock } from '../../shared/time.js'
import type { WorkingSet } from '../../shared/session.js'

interface PlannerProps {
  working: WorkingSet
  selectedIndex: number | null
  onSelect: (index: number) => void
  onTarget: (hours: number, minutes: number) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onReplace: () => void
  onDropLibrary: (paths: string[]) => void
  onReorder: (from: number, to: number) => void
}

export function Planner(props: PlannerProps) {
  const [dragOver, setDragOver] = useState(false)
  const timing = planTiming(props.working.tracks, props.working.targetSeconds)
  const hours = Math.floor(props.working.targetSeconds / 3600)
  const minutes = Math.floor((props.working.targetSeconds % 3600) / 60)
  const last = timing.last

  function takeDrop(event: DragEvent, toIndex: number | null): void {
    event.preventDefault()
    setDragOver(false)
    const payload = readDrag(event.dataTransfer.getData('text/plain'))
    if (!payload) return
    if (payload.kind === 'library') {
      props.onDropLibrary(payload.paths)
      return
    }
    const destination = toIndex == null ? Math.max(0, props.working.tracks.length - 1) : toIndex
    props.onReorder(payload.index, destination)
  }

  return (
    <aside className="planner" aria-label="Gig planner" data-testid="planner">
      <div className="summary">
        <h2>Gig planner</h2>
        <label className="target-edit">
          Target
          <input
            type="number"
            min={0}
            max={99}
            aria-label="Target hours"
            data-testid="target-hours"
            value={hours}
            onChange={(event) => props.onTarget(Number(event.target.value), minutes)}
          />
          h
          <input
            type="number"
            min={0}
            max={59}
            aria-label="Target minutes"
            data-testid="target-minutes"
            value={minutes}
            onChange={(event) => props.onTarget(hours, Number(event.target.value))}
          />
          m
        </label>
        <div className="figures">
          <div>
            <span>Target</span>
            <strong data-testid="target-time">{formatHms(timing.targetSeconds)}</strong>
          </div>
          <div>
            <span>{ESTIMATE_LABEL}</span>
            <strong data-testid="total-time">{formatHms(timing.totalSeconds)}</strong>
          </div>
          <div>
            <span>Remaining</span>
            <strong data-testid="remaining-time">{formatHms(timing.remainingSeconds)}</strong>
          </div>
          <div className="overtime">
            <span>Overtime</span>
            <strong data-testid="overtime" className={timing.overtimeSeconds > 0 ? 'is-over' : undefined}>
              {formatHms(timing.overtimeSeconds)}
            </strong>
          </div>
        </div>
        <p className="note" data-testid="track-count">
          {timing.count} {timing.count === 1 ? 'track' : 'tracks'}
          {timing.unknownDurationCount > 0
            ? ` · ${timing.unknownDurationCount} without a duration, left out of the total`
            : ''}
        </p>
        <p className="note" data-testid="estimate-note" data-estimate="true">
          {ESTIMATE_COPY}
        </p>
      </div>
      <div
        className={dragOver ? 'planner-list dragover' : 'planner-list'}
        data-testid="planner-drop"
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => takeDrop(event, null)}
      >
        {props.working.tracks.length === 0 ? (
          <p className="empty">Drag tracks here. The set can run past the target, and overtime stays visible.</p>
        ) : (
          props.working.tracks.map((track, index) => {
            const end = timing.endSeconds[index]
            const past = end != null && end > timing.targetSeconds
            return (
              <div
                key={track.path}
                className={plannerClass(index, props.selectedIndex, past)}
                data-testid="planner-row"
                data-position={index + 1}
                data-title={track.title}
                draggable
                onClick={() => props.onSelect(index)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', plannerDragPayload(index))
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.stopPropagation()
                  takeDrop(event, index)
                }}
              >
                <span className="index">{index + 1}</span>
                <span>
                  <strong>{displayName(track)}</strong>
                  {track.missing ? <span className="missing"> Missing file</span> : null}
                </span>
                <span className="when">
                  {formatTrackClock(track.durationSeconds)}
                  <br />
                  {end == null ? '—' : formatHms(end)}
                </span>
              </div>
            )
          })
        )}
      </div>
      <div className="foot">
        <div className="row-actions">
          <button type="button" className="button small" data-testid="planner-up" onClick={() => props.onMove(-1)} disabled={props.selectedIndex == null}>
            Up
          </button>
          <button type="button" className="button small" data-testid="planner-down" onClick={() => props.onMove(1)} disabled={props.selectedIndex == null}>
            Down
          </button>
          <button type="button" className="button small" data-testid="planner-replace" onClick={props.onReplace} disabled={props.selectedIndex == null}>
            Replace
          </button>
          <button type="button" className="button small" data-testid="planner-remove" onClick={props.onRemove} disabled={props.selectedIndex == null}>
            Remove
          </button>
        </div>
        <h2>Last track</h2>
        {last ? (
          <p data-testid="last-track">
            {last.title} · {formatTrackClock(last.durationSeconds)} · estimated end{' '}
            {last.endSeconds == null ? '—' : formatHms(last.endSeconds)}
          </p>
        ) : (
          <p data-testid="last-track">No last track yet.</p>
        )}
        <p className="note">{REMOVE_COPY}</p>
      </div>
    </aside>
  )
}

function plannerClass(index: number, selected: number | null, past: boolean): string {
  const names = ['planner-row']
  if (index === selected) names.push('selected')
  if (past) names.push('past')
  return names.join(' ')
}
