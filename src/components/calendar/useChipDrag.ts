import {
  PointerSensor,
  useSensor,
  useSensors,
  type DndContextProps,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TrackerData } from '../../data'
import { draggedRange, sameRange, type DragMode, type DragPreview } from '../../lib/drag'
import { isPublish } from '../../lib/subtasks'
import type { ISODate, Subtask } from '../../types'
import { movePublishDate, moveTask } from '../actions'

// What each draggable part of a chip (its body or an edge) carries.
export interface ChipDragData {
  subtaskId: string
  mode: DragMode
}

interface ActiveDrag {
  subtask: Subtask
  mode: DragMode
  // The day under the pointer when the chip was grabbed.
  fromDay: ISODate
}

// Day cells carry data-day. Asking the browser what's under the pointer
// stays right while week rows grow and shrink mid-drag, which measuring
// the cells once at the start would not.
function dayAt(x: number, y: number): ISODate | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element instanceof HTMLElement && element.dataset.day) return element.dataset.day
  }
  return null
}

// Moves chips by dragging, snapping to whole days. While dragging, `preview`
// holds the chip's would-be dates so the calendar redraws around it; on drop
// the change is saved, with the publish-date prompt where needed.
export function useChipDrag(data: TrackerData | undefined, onNotice: (message: string) => void) {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  // The data as it was when a drop was saved. The dropped chip stays where it
  // landed until fresh data arrives, so it doesn't flash back first.
  const [savedOver, setSavedOver] = useState<TrackerData | null>(null)
  if (savedOver && data !== savedOver) {
    setSavedOver(null)
    setPreview(null)
  }

  const active = useRef<ActiveDrag | null>(null)
  const latest = useRef({ data, preview, onNotice })
  useEffect(() => {
    latest.current = { data, preview, onNotice }
  })
  // A drop ends with a click on whatever is under the pointer, which must
  // not open the dropped chip's card.
  const justDropped = useRef(false)

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a click still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const track = useCallback((event: PointerEvent) => {
    const drag = active.current
    if (!drag) return
    const day = dayAt(event.clientX, event.clientY)
    // Off the grid, the chip goes back to where it was; dropping there cancels.
    const range = day && draggedRange(drag.subtask, drag.mode, drag.fromDay, day)
    setPreview((current) =>
      !range ? null : current && sameRange(current.range, range) ? current : { subtaskId: drag.subtask.id, range },
    )
  }, [])

  const stop = useCallback(() => {
    active.current = null
    window.removeEventListener('pointermove', track)
    delete document.documentElement.dataset.dragging
  }, [track])

  useEffect(() => stop, [stop])

  function onDragStart(event: DragStartEvent) {
    const info = event.active.data.current as ChipDragData | undefined
    const subtask = info && latest.current.data?.subtasks.find((s) => s.id === info.subtaskId)
    const press = event.activatorEvent as PointerEvent
    const fromDay = dayAt(press.clientX, press.clientY)
    if (!info || !subtask || !fromDay) return
    active.current = { subtask, mode: info.mode, fromDay }
    setSavedOver(null)
    document.documentElement.dataset.dragging = info.mode === 'move' ? 'move' : 'resize'
    window.addEventListener('pointermove', track)
  }

  async function onDragEnd() {
    const drag = active.current
    const { data: before, preview: dropped } = latest.current
    stop()
    justDropped.current = true
    setTimeout(() => {
      justDropped.current = false
    })
    if (!drag || !dropped || sameRange(dropped.range, drag.subtask)) {
      setPreview(null)
      return
    }
    try {
      const saved = isPublish(drag.subtask)
        ? await dropPublish(drag.subtask, dropped.range.start)
        : await moveTask(drag.subtask, dropped.range)
      if (saved && before) setSavedOver(before)
      else setPreview(null)
    } catch (error) {
      setPreview(null)
      latest.current.onNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function dropPublish(publish: Subtask, date: ISODate): Promise<boolean> {
    const problem = await movePublishDate(publish.projectId, date)
    if (problem) latest.current.onNotice(problem)
    return problem === null
  }

  const dndProps: DndContextProps = {
    sensors,
    onDragStart,
    onDragEnd: () => void onDragEnd(),
    onDragCancel: () => {
      stop()
      setPreview(null)
    },
    // Dragging is a pointer shortcut; keyboard users change dates in the
    // cards. Keep dnd-kit's default announcements (which read out internal
    // ids) quiet.
    accessibility: {
      announcements: QUIET,
      screenReaderInstructions: { draggable: 'Drag to another day to reschedule.' },
    },
  }

  return {
    dndProps,
    preview,
    wasJustDropped: () => justDropped.current,
  }
}

const QUIET = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
}
