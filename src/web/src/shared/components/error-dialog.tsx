type ErrorDialogProps = {
  title?: string;
  message: string;
  onClose: () => void;
};

export function ErrorDialog({
  title = "エラーが発生しました",
  message,
  onClose,
}: ErrorDialogProps) {
  return (
    <div
      className="error-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="error-dialog__backdrop"
        aria-label="エラーダイアログを閉じる"
        onClick={onClose}
      />
      <section className="error-dialog__panel">
        <header className="error-dialog__header">
          <h3>{title}</h3>
        </header>
        <p className="error-dialog__message">{message}</p>
        <div className="error-dialog__actions">
          <button type="button" className="button primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}
