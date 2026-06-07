import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Wrap a vertical list of items so each row can be reordered by dragging
 * its handle. Works on mouse, touch (long-press), and keyboard.
 *
 *   <SortableList items={rows} getId={r => r.id} onReorder={next => save(next)} disabled={!canEdit}>
 *     {(row, dragProps) => <Row {...dragProps} row={row} />}
 *   </SortableList>
 *
 * `dragProps` is { handleListeners, isDragging }. Spread `handleListeners`
 * onto the drag-handle button to make it the grab target. If you want the
 * whole row to be draggable, you can leave the handle off and spread
 * the listeners on the row instead.
 */
export default function SortableList({ items, getId, onReorder, disabled = false, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Touch needs a long-press to start so taps still work for non-drag actions.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (disabled) {
    return (
      <>
        {items.map((item) => (
          <RowFrame key={getId(item)}>
            {children(item, { handleListeners: {}, isDragging: false })}
          </RowFrame>
        ))}
      </>
    )
  }

  function handleEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const fromIndex = items.findIndex(i => getId(i) === active.id)
    const toIndex   = items.findIndex(i => getId(i) === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    onReorder(arrayMove(items, fromIndex, toIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        {items.map(item => (
          <SortableRow key={getId(item)} id={getId(item)}>
            {(dragProps) => children(item, dragProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ handleListeners: listeners, isDragging })}
    </div>
  )
}

function RowFrame({ children }) {
  return <div>{children}</div>
}

/**
 * A standard drag-handle button you can drop into any row. Spread
 * `listeners` from the SortableList child callback.
 */
export function DragHandle({ listeners, className = '' }) {
  return (
    <button
      type="button"
      className={`text-ink-300 hover:text-ink-700 touch-none cursor-grab active:cursor-grabbing flex-shrink-0 ${className}`}
      aria-label="Drag to reorder"
      {...listeners}
    >
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="5"  cy="4"  r="1.2" />
        <circle cx="11" cy="4"  r="1.2" />
        <circle cx="5"  cy="8"  r="1.2" />
        <circle cx="11" cy="8"  r="1.2" />
        <circle cx="5"  cy="12" r="1.2" />
        <circle cx="11" cy="12" r="1.2" />
      </svg>
    </button>
  )
}
