import {
  MouseSensor,
  TouchSensor,
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
  // For a touch drag, the element the finger went down on (see onDragStart).
  touchTarget: EventTarget | null
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
  // The subtask being dragged, for the phone layout's floating copy.
  const [activeSubtask, setActiveSubtask] = useState<Subtask | null>(null)
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
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Press and hold to drag by touch, so a swipe still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const trackAt = useCallback((x: number, y: number) => {
    const drag = active.current
    if (!drag) return
    const day = dayAt(x, y)
    // Off the grid, the chip goes back to where it was; dropping there cancels.
    const range = day && draggedRange(drag.subtask, drag.mode, drag.fromDay, day)
    setPreview((current) =>
      !range ? null : current && sameRange(current.range, range) ? current : { subtaskId: drag.subtask.id, range },
    )
  }, [])

  const trackMouse = useCallback((event: MouseEvent) => trackAt(event.clientX, event.clientY), [trackAt])
  const trackTouch = useCallback(
    (event: Event) => {
      const touch = (event as TouchEvent).touches[0]
      if (touch) trackAt(touch.clientX, touch.clientY)
    },
    [trackAt],
  )

  const stop = useCallback(() => {
    active.current?.touchTarget?.removeEventListener('touchmove', trackTouch)
    active.current = null
    window.removeEventListener('mousemove', trackMouse)
    delete document.documentElement.dataset.dragging
  }, [trackMouse, trackTouch])

  useEffect(() => stop, [stop])

  function onDragStart(event: DragStartEvent) {
    const info = event.active.data.current as ChipDragData | undefined
    const subtask = info && latest.current.data?.subtasks.find((s) => s.id === info.subtaskId)
    const press = event.activatorEvent
    const touch = 'touches' in press ? (press as TouchEvent).touches[0] : null
    const point = touch ?? (press as MouseEvent)
    const fromDay = dayAt(point.clientX, point.clientY)
    if (!info || !subtask || !fromDay) return
    // Touch events keep going to the element the finger went down on, even
    // after it's redrawn elsewhere and removed from the page, when they no
    // longer reach window. So listen on that element itself.
    const touchTarget = touch ? press.target : null
    active.current = { subtask, mode: info.mode, fromDay, touchTarget }
    setActiveSubtask(subtask)
    setSavedOver(null)
    document.documentElement.dataset.dragging = info.mode === 'move' ? 'move' : 'resize'
    if (touchTarget) touchTarget.addEventListener('touchmove', trackTouch, { passive: true })
    else window.addEventListener('mousemove', trackMouse)
  }

  async function onDragEnd() {
    const drag = active.current
    const { data: before, preview: dropped } = latest.current
    stop()
    setActiveSubtask(null)
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
      setActiveSubtask(null)
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
    activeSubtask,
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
