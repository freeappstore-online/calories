import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

interface ModalProps {
  /** id of the element inside the modal that titles it */
  titleId: string;
  onClose: () => void;
  /** Bottom sheet on mobile, centered from `sm` up; otherwise always centered */
  sheet?: boolean;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}

/** Backdrop + dialog shell: Escape and backdrop click close, focus moves in and returns to the opener */
export default function Modal({ titleId, onClose, sheet, className, style, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  if (!opener.current) opener.current = document.activeElement;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>("input, button") ?? el).focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // With nested dialogs only the innermost (last in document order) closes
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] === el) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${sheet ? "items-end sm:items-center" : "items-center"}`}
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>
  );
}
