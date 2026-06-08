import { useState, useCallback } from "react";
import { useBizRegistry } from "./useBizRegistry";

export function useBizOverlayShell(userId: string, onCancel: () => void) {
  // Parent conditionally renders — mount means "open." Close triggers onCancel.
  const [isOpen, setIsOpen] = useState(true);
  const [showKeypad, setShowKeypad] = useState(false);
  const { getItems } = useBizRegistry();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setShowKeypad(false);
    onCancel();
  }, [onCancel]);

  const confirm = useCallback(async () => {
    const items = getItems();
    // Run all validate hooks
    for (const item of items) {
      if (item.validate) {
        const err = item.validate();
        if (err) return;
      }
    }
    // Run all onBeforeConfirm hooks
    for (const item of items) {
      if (item.onBeforeConfirm) {
        const ok = await item.onBeforeConfirm("");
        if (!ok) return;
      }
    }
    setShowKeypad(true);
  }, [getItems]);

  const handlePinSuccess = useCallback(
    async (_authData: unknown) => {
      const items = getItems();
      for (const item of items) {
        try {
          await item.onAfterConfirm?.("");
        } catch {
          // per-item error, don't block others
        }
      }
      setShowKeypad(false);
      setIsOpen(false);
    },
    [getItems]
  );

  return { isOpen, showKeypad, open, close, confirm, handlePinSuccess, setShowKeypad };
}
