import { useEffect, useRef } from 'react'

interface SaveDialogProps {
  mode: 'save' | 'save-as'
  name: string
  onName: (name: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function SaveDialog(props: SaveDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const saveAs = props.mode === 'save-as'
  return (
    <div className="overlay" role="presentation" onMouseDown={props.onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        data-testid="save-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          props.onConfirm()
        }}
      >
        <h2 id="save-title">{saveAs ? 'Save as a new file' : 'Save this set'}</h2>
        <p>
          {saveAs
            ? 'This writes a new JSON file. The file you already have is left as it is.'
            : 'This writes a new JSON file for the set.'}
        </p>
        <label>
          Set name
          <input
            ref={inputRef}
            data-testid="save-name"
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="button primary" data-testid="save-confirm">
            {saveAs ? 'Save as new file' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface DiscardDialogProps {
  onKeep: () => void
  onDiscard: () => void
}

export function DiscardDialog(props: DiscardDialogProps) {
  return (
    <div className="overlay" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="discard-title" data-testid="discard-dialog">
        <h2 id="discard-title">Open another set?</h2>
        <p>This set has unsaved changes. Opening the other one leaves those changes behind.</p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={props.onKeep}>
            Keep editing
          </button>
          <button type="button" className="button primary" data-testid="discard-confirm" onClick={props.onDiscard}>
            Open set
          </button>
        </div>
      </div>
    </div>
  )
}
