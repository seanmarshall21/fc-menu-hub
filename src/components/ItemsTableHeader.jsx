import { useEffect, useRef, useState } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, useSortable, horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * Thead for the menu items table. Renders a row of <th>s driven by the
 * `columns` config. Non-frozen columns can be drag-reordered. Every column
 * has a resize handle on its right edge.
 *
 *   <ItemsTableHeader
 *     columns={columns}
 *     canEdit={canEdit}
 *     onReorder={(nextIds) => setOrder(nextIds)}
 *     onResize={(id, px)   => setWidth(id, px)}
 *   />
 */
export default function ItemsTableHeader({ columns, canEdit, onReorder, onResize }) {
  const ids = columns.map(c => c.id)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const activeCol = columns.find(c => c.id === active.id)
    const overCol   = columns.find(c => c.id === over.id)
    if (!activeCol || activeCol.frozen || !overCol || overCol.frozen) return
    const fromIdx = ids.indexOf(active.id)
    const toIdx   = ids.indexOf(over.id)
    const nonFrozenOnly = arrayMove(ids, fromIdx, toIdx).filter(id => {
      const c = columns.find(x => x.id === id)
      return c && !c.frozen
    })
    onReorder(nonFrozenOnly)
  }

  return (
    <thead>
      <tr className="border-b border-surface-100 bg-surface-50">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {columns.map(col => (
              <HeaderCell
                key={col.id}
                col={col}
                canEdit={canEdit}
                onResize={(px) => onResize(col.id, px)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </tr>
    </thead>
  )
}

function HeaderCell({ col, canEdit, onResize }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
    disabled: !canEdit || col.frozen,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: col.width,
    minWidth: col.minWidth,
    maxWidth: col.width,
    opacity: isDragging ? 0.5 : 1,
    position: col.frozen ? 'sticky' : 'relative',
    left: col.frozen ? 0 : undefined,
    background: col.frozen ? '#f7f8fa' : undefined,
    zIndex: col.frozen ? 2 : 1,
  }

  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="px-4 py-2.5 text-left text-xs font-medium text-ink-400 select-none"
      scope="col"
    >
      <div className="flex items-center gap-1.5 relative pr-1">
        {/* Drag handle (or just the label for frozen cols) */}
        {canEdit && !col.frozen ? (
          <button
            {...listeners}
            type="button"
            className="text-ink-300 hover:text-ink-700 touch-none cursor-grab active:cursor-grabbing -ml-1 flex-shrink-0"
            aria-label="Drag to reorder column"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="5"  cy="4"  r="1.1" /><circle cx="11" cy="4"  r="1.1" />
              <circle cx="5"  cy="8"  r="1.1" /><circle cx="11" cy="8"  r="1.1" />
              <circle cx="5"  cy="12" r="1.1" /><circle cx="11" cy="12" r="1.1" />
            </svg>
          </button>
        ) : col.frozen ? (
          <span className="text-ink-300 text-[10px] mr-1" title="Pinned">📌</span>
        ) : null}
        <span className="uppercase tracking-wider">{col.label}</span>
      </div>
      {canEdit && (
        <ResizeHandle initialWidth={col.width} minWidth={col.minWidth || 40} onResize={onResize} />
      )}
    </th>
  )
}

function ResizeHandle({ initialWidth, minWidth, onResize }) {
  const startX = useRef(0)
  const startW = useRef(initialWidth)
  const [active, setActive] = useState(false)

  function onPointerDown(e) {
    e.stopPropagation()
    e.preventDefault()
    startX.current = e.clientX
    startW.current = initialWidth
    setActive(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup',   onPointerUp)
  }
  function onPointerMove(e) {
    const dx = e.clientX - startX.current
    const w = Math.max(minWidth, startW.current + dx)
    onResize(w)
  }
  function onPointerUp() {
    setActive(false)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup',   onPointerUp)
  }

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup',   onPointerUp)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span
      onPointerDown={onPointerDown}
      className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize ${active ? 'bg-brand-300' : 'bg-transparent hover:bg-brand-200'}`}
      title="Drag to resize"
      style={{ userSelect: 'none' }}
    />
  )
}
