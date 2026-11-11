import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './QuotaLedger.module.scss';

const GAP = 8;
const VIEWPORT_MARGIN = 16;
const MAX_WIDTH = 680;

/** Keep the native disclosure trigger; position its content against that trigger. */
export function QuotaDetails({ label, children }: PropsWithChildren<{ label: string }>) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => {
    if (detailsRef.current) detailsRef.current.open = false;
    setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    let frame: number | null = null;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        close();
        return;
      }
      const width = Math.min(MAX_WIDTH, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
      panel.style.width = `${width}px`;
      const below = Math.max(0, viewportHeight - rect.bottom - GAP - VIEWPORT_MARGIN);
      const above = Math.max(0, rect.top - GAP - VIEWPORT_MARGIN);
      const desiredHeight = Math.min(panel.scrollHeight + 2, viewportHeight * 0.65);
      const downward = below >= desiredHeight || below >= above;
      panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(rect.right - width, viewportWidth - width - VIEWPORT_MARGIN))}px`;
      panel.style.maxHeight = `${Math.min(viewportHeight * 0.65, downward ? below : above)}px`;
      panel.style.top = downward ? `${rect.bottom + GAP}px` : 'auto';
      panel.style.bottom = downward ? 'auto' : `${viewportHeight - rect.top + GAP}px`;
    };
    const schedulePosition = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updatePosition();
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (detailsRef.current?.contains(event.target) || panelRef.current?.contains(event.target))
        return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    const observer = new ResizeObserver(schedulePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (panelRef.current) observer.observe(panelRef.current);
    updatePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [open, close]);

  return (
    <details
      ref={detailsRef}
      className={styles.details}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        ref={triggerRef}
        id={id}
        aria-label={label}
        title={label}
        aria-controls={`${id}-panel`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3" cy="8" r="1.25" fill="currentColor" />
          <circle cx="8" cy="8" r="1.25" fill="currentColor" />
          <circle cx="13" cy="8" r="1.25" fill="currentColor" />
        </svg>
      </summary>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            id={`${id}-panel`}
            role="region"
            aria-labelledby={id}
            className={styles.detailsBody}
          >
            {children}
          </div>,
          document.body
        )}
    </details>
  );
}
