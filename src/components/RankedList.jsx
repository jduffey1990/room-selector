import { useRef, useState } from 'react';
import { GripVertical, ChevronUp, ChevronDown, X } from 'lucide-react';
import Tooltip from './Tooltip';

/**
 * The ballot's running order, as an actual ordered list.
 *
 * Before this, rank was a number printed on each bed card ("Ranked #3") and
 * the cards themselves stayed sorted by price -- so the one thing a person is
 * being asked to produce, an ordering, was the one thing they could not see.
 * Reordering meant hunting for the right card and tapping a chevron.
 *
 * Three ways to reorder, deliberately, because each covers a case the others
 * miss:
 *   - drag the grip (pointer events, so a thumb works as well as a mouse --
 *     HTML5 drag-and-drop fires nothing on touch, and touch is the common
 *     case here since trip links arrive by text message)
 *   - arrow keys while the grip is focused (drag is unusable with a keyboard
 *     or a screen reader)
 *   - the up/down buttons (precise, and what the e2e harness drives)
 *
 * Movement snaps to whole rows rather than tracking the finger pixel by
 * pixel: the result of a drag has to be a rank, and a preview that can sit
 * between two ranks invites a misdrop on a form about money.
 */
export default function RankedList({ items, onReorder, onRemove }) {
  const listRef = useRef(null);
  // Live drag state that must not trigger re-render on every pointer sample.
  const drag = useRef(null);
  const [dragIndex, setDragIndex] = useState(-1);
  const [targetIndex, setTargetIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState('');

  // Measured, not assumed: row height depends on whether a bed name wraps,
  // which depends on the viewport. A hardcoded constant drifts at 390px.
  const rowPitch = () => {
    const first = listRef.current?.firstElementChild;
    if (!first) return 56;
    const gap = parseFloat(getComputedStyle(listRef.current).rowGap) || 0;
    return first.offsetHeight + gap;
  };

  const move = (from, to) => {
    if (to < 0 || to >= items.length || to === from) return;
    onReorder(from, to);
    setAnnouncement(`${items[from].name} moved to position ${to + 1} of ${items.length}`);
  };

  // Listeners go on the window rather than the grip, and the landing slot is
  // tracked in a ref alongside the state that renders it.
  //
  // Both details are load-bearing, and the first version had neither. Binding
  // move/up to the element (via setPointerCapture) delivered pointerdown and
  // then nothing, so every drag ended where it started -- silently, since a
  // no-op reorder looks identical to a deliberate one. Window listeners also
  // fix the real-world version of the same bug: a finger that slides off the
  // narrow grip mid-drag, which at 390px is most of them. The ref exists
  // because the pointerup handler would otherwise read the target slot from a
  // closure captured before the moves happened.
  const landing = useRef(-1);

  const handlePointerDown = (e, index) => {
    // Ignore secondary buttons; let the browser keep its own context menu.
    if (e.button > 0) return;
    // Stops the press selecting the bed name as text while dragging.
    e.preventDefault();

    const d = { index, startY: e.clientY, pitch: rowPitch() };
    drag.current = d;
    landing.current = index;
    setDragIndex(index);
    setTargetIndex(index);

    const onMove = (ev) => {
      const shifted = Math.round((ev.clientY - d.startY) / d.pitch);
      const next = Math.max(0, Math.min(items.length - 1, d.index + shifted));
      landing.current = next;
      setTargetIndex(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const to = landing.current;
      drag.current = null;
      landing.current = -1;
      setDragIndex(-1);
      setTargetIndex(-1);
      if (to >= 0 && to !== d.index) move(d.index, to);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Where a row sits while a drag is in flight. The dragged row travels to
  // its target slot; everything it passes over slides one place the other way.
  const offsetRows = (index) => {
    if (dragIndex === -1 || targetIndex === -1) return 0;
    if (index === dragIndex) return targetIndex - dragIndex;
    if (dragIndex < targetIndex && index > dragIndex && index <= targetIndex) return -1;
    if (dragIndex > targetIndex && index < dragIndex && index >= targetIndex) return 1;
    return 0;
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-selecta-paper rounded-lg shadow-selecta border-2 border-selecta-ink/10 p-6 mb-6">
      <h2 className="font-display text-xl font-bold text-selecta-ink mb-1 flex items-center gap-2">
        Your ranking
        <Tooltip label="How should I rank these?">
          Order them the way you genuinely prefer them. Only include beds you
          would actually accept — leaving one off is a real answer, and honest
          ranking is what makes the final result defensible.
        </Tooltip>
      </h2>
      <p className="text-sm text-selecta-slate mb-4">
        Best first. Drag a bed by its handle, or use the arrows.
      </p>

      <ul ref={listRef} className="flex flex-col gap-2" data-testid="ranked-list">
        {items.map((item, index) => {
          const shift = offsetRows(index);
          const isDragging = index === dragIndex;
          return (
            <li
              key={item.id}
              data-testid="ranked-row"
              style={{
                transform: shift ? `translateY(calc(${shift} * (100% + 0.5rem)))` : undefined,
                transition: isDragging ? 'none' : 'transform 150ms ease',
              }}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-white ${
                isDragging
                  ? 'border-selecta-teal ring-2 ring-selecta-teal/40 shadow-lg relative z-10'
                  : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => handlePointerDown(e, index)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); move(index, index - 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(index, index + 1); }
                }}
                // touch-none stops the browser scrolling the page instead of
                // handing us the drag -- without it, a vertical drag on mobile
                // scrolls and the row never moves.
                className="touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 -m-1 rounded focus:outline-none focus:ring-2 focus:ring-selecta-teal"
                aria-label={`Reorder ${item.name}, position ${index + 1} of ${items.length}. Use arrow keys to move.`}
              >
                <GripVertical className="w-5 h-5" />
              </button>

              <span className="font-mono text-sm text-selecta-slate w-6 shrink-0">
                {index + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                {item.name}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.name} up`}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.name} down`}
                  className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.name} from your ranking`}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Drag and arrow-key moves are both silent to a screen reader
          otherwise -- the row moves, nothing is spoken. */}
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
