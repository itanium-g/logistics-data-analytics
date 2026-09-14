import { useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject, SyntheticEvent } from "react";

export interface ModalDialogProps {
  readonly open: boolean;
  readonly headingId: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onDismiss: () => void;
  readonly className?: string;
  readonly children: ReactNode;
}

interface BodyLockSnapshot {
  readonly overflow: string;
  readonly paddingRight: string;
}

let bodyLockCount = 0;
let bodyLockSnapshot: BodyLockSnapshot | null = null;

function focusElement(element: HTMLElement | null | undefined): void {
  if (element !== null && element !== undefined && document.contains(element)) {
    element.focus();
  }
}

/**
 * Native dialog presentation shared by mobile navigation and the assistant.
 * The controlled `open` prop drives showModal/close; it is never rendered as
 * an HTML open attribute before showModal runs.
 */
export function ModalDialog({
  open,
  headingId,
  initialFocusRef,
  returnFocusRef,
  onDismiss,
  className = "",
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOpen = useRef(false);
  const ownsBodyLock = useRef(false);

  const releaseScrollLock = (): void => {
    if (!ownsBodyLock.current) return;
    ownsBodyLock.current = false;
    bodyLockCount = Math.max(0, bodyLockCount - 1);
    if (bodyLockCount > 0) return;
    const snapshot = bodyLockSnapshot;
    if (snapshot !== null) {
      document.body.style.overflow = snapshot.overflow;
      document.body.style.paddingRight = snapshot.paddingRight;
    }
    bodyLockSnapshot = null;
  };

  const acquireScrollLock = (): void => {
    if (ownsBodyLock.current) return;
    if (bodyLockCount === 0) {
      bodyLockSnapshot = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
      };
    }
    ownsBodyLock.current = true;
    bodyLockCount += 1;
    document.body.style.overflow = "hidden";
  };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          // jsdom and older embedded browsers may not implement dialog yet.
          // This fallback runs only after the controlled state is open.
          dialog.setAttribute("open", "");
        }
      }
      acquireScrollLock();
      previousOpen.current = true;
      const focus = (): void => focusElement(initialFocusRef?.current ?? dialog);
      if (typeof window.requestAnimationFrame === "function") {
        const frame = window.requestAnimationFrame(focus);
        return () => window.cancelAnimationFrame(frame);
      }
      focus();
      return;
    }

    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    releaseScrollLock();
    if (previousOpen.current) {
      previousOpen.current = false;
      focusElement(returnFocusRef?.current);
    }
  }, [initialFocusRef, open, returnFocusRef]);

  useEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog !== null) {
        if (typeof dialog.close === "function" && dialog.open) dialog.close();
        else dialog?.removeAttribute("open");
      }
      releaseScrollLock();
      previousOpen.current = false;
    },
    [],
  );

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>): void => {
    event.preventDefault();
    onDismiss();
  };

  const onDialogClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) onDismiss();
  };

  return (
    <dialog
      ref={dialogRef}
      className={`modal-dialog ${className}`.trim()}
      aria-labelledby={headingId}
      onCancel={onCancel}
      onClick={onDialogClick}
    >
      {children}
    </dialog>
  );
}
