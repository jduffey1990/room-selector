import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * A short explanation attached to a control, opened by tap, click or keyboard.
 *
 * Deliberately not hover-driven. Hover does not exist on a phone, and trip
 * links arrive by text message, so a hover tooltip would hide this content
 * from most of the people who need it. It is a button that toggles a popover:
 * the same interaction with a thumb, a mouse, or a keyboard.
 *
 * Content here explains how the mechanism works. It must never explain how to
 * come out ahead in it -- see the P5 note in CLAUDE.md. Describing what a
 * control does is the goal; coaching a bid is the thing that would break the
 * property the product sells.
 */
export default function Tooltip({ label, children, align = 'center' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    // pointerdown, not click: closing on click would fire after a tap has
    // already re-triggered the button, leaving the popover stuck open.
    const onOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  // At 390px a centred popover next to a right-hand control runs off screen.
  const position = {
    center: 'left-1/2 -translate-x-1/2',
    right: 'right-0',
    left: 'left-0',
  }[align];

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        data-testid="tooltip-trigger"
        className="text-gray-400 hover:text-selecta-teal focus:outline-none focus:ring-2 focus:ring-selecta-teal rounded-full p-0.5"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          data-testid="tooltip-body"
          className={`absolute top-full mt-2 ${position} z-30 w-64 max-w-[80vw] rounded-lg bg-selecta-ink text-white text-xs leading-relaxed p-3 shadow-lg`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
