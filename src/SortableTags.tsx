import { useRef, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { parseTags, reorderTag, toggleTag, type Category } from './domain';

const tagCollision: CollisionDetection = args => {
  const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args);
};

function TagChip({ tag, onRemove }: { tag: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tag });
  return <button ref={setNodeRef} {...attributes} {...listeners} className={`chip selected draggable-tag ${isDragging ? 'drag-source' : ''}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={`${tag} を削除`}
    onContextMenu={e => e.preventDefault()} onClick={onRemove}>
    {tag}<X size={12} aria-hidden="true" />
  </button>;
}

export default function SortableTags({ value, category, onChange }: { value: string; category: Category; onChange: (value: string) => unknown }) {
  const tags = parseTags(value, category);
  const [drag, setDrag] = useState<{ tag: string; value: string; width: number } | null>(null);
  const [message, setMessage] = useState('');
  const suppressClickUntil = useRef(0);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );
  function finish(event?: DragEndEvent) {
    suppressClickUntil.current = Date.now() + 400;
    if (event && drag && value === drag.value && event.over && event.active.id !== event.over.id) {
      const from = tags.indexOf(String(event.active.id)); const to = tags.indexOf(String(event.over.id));
      try {
        onChange(reorderTag(value, category, from, to));
        setMessage(`${event.active.id} を${to + 1}番目へ移動しました`);
      } catch (error) { setMessage((error as Error).message); }
    }
    setDrag(null);
  }
  if (!tags.length) return null;
  return <>
    <p className="input-hint" id={`tag-drag-hint-${category}`}>タップで削除・長押ししてドラッグで並び替え。PCではそのままドラッグできます。</p>
    <DndContext sensors={sensors} collisionDetection={tagCollision}
      accessibility={{ screenReaderInstructions: { draggable: 'タップでタグを削除。タッチでは長押し、マウスではドラッグしてタグを並び替えます。' },
        announcements: { onDragStart: ({ active }) => `${active.id} を移動中`, onDragOver: ({ over }) => over ? `${over.id} の位置へ移動` : undefined, onDragEnd: () => '移動を終了しました', onDragCancel: () => '移動をキャンセルしました' } }}
      onDragStart={({ active }) => { suppressClickUntil.current = Infinity; setMessage(''); setDrag({ tag: String(active.id), value, width: active.rect.current.initial?.width ?? 100 }); }}
      onDragEnd={finish} onDragCancel={() => finish()}>
      <SortableContext items={tags} strategy={rectSortingStrategy}>
        <div className={`chips current-tags sortable-tags ${drag ? 'is-dragging' : ''}`} aria-label="入力済みタグ" aria-describedby={`tag-drag-hint-${category}`}>
          {tags.map(tag => <TagChip key={tag} tag={tag} onRemove={() => {
            if (Date.now() < suppressClickUntil.current) return;
            onChange(toggleTag(value, tag, category));
          }} />)}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>{drag ? <span className="chip selected tag-drag-overlay" style={{ width: drag.width }}>{drag.tag}<X size={12} /></span> : null}</DragOverlay>
    </DndContext>
    <p className="muted" role="status">{message}</p>
  </>;
}
