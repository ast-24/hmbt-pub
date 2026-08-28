type SaveDiscardBarProps = {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function SaveDiscardBar({
  isDirty,
  isSaving,
  onSave,
  onCancel,
}: SaveDiscardBarProps) {
  if (!isDirty) {
    return null;
  }

  return (
    <section className="save-discard-bar" aria-label="変更操作">
      <p>変更があります。保存するか、キャンセルして再読み込みしてください。</p>
      <div className="save-discard-bar__actions">
        <button
          type="button"
          className="button ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="button primary"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}
