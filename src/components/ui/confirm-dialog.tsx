"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  returnFocusRef,
  onCancel,
  onConfirm,
}: Readonly<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const automaticReturnFocusRef = useRef<HTMLElement | null>(null);
  const closeReasonRef = useRef<"cancel" | "confirm" | null>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      automaticReturnFocusRef.current =
        returnFocusRef?.current ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeReasonRef.current = "cancel";
        onCancel();
      }}
      onClose={() => {
        if (closeReasonRef.current !== "confirm") automaticReturnFocusRef.current?.focus();
        automaticReturnFocusRef.current = null;
        closeReasonRef.current = null;
      }}
      ref={dialogRef}
    >
      <div className="confirm-dialog-panel">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              closeReasonRef.current = "cancel";
              onCancel();
            }}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => {
              closeReasonRef.current = "confirm";
              onConfirm();
            }}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
