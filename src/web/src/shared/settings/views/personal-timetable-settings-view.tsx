"use client";

import { api, knowledge, models } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiGetUsersUserIdTimetable,
  apiPutUsersUserIdTimetable,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { resolveCourseDisplayName } from "@/shared/knowledge/safe-lookup";
import { RoomPicker } from "@/shared/components/room-picker";
import { SaveDiscardBar } from "@/shared/components/save-discard-bar";
import { AppShell } from "@/shared/layout/app-shell";
import {
  COURSE_OPTIONS,
  draftToPersonalTimetable,
  type PersonalSelectionDraft,
  type PersonalTimetableDraft,
  personalTimetableToDraft,
  serializePersonalDraft,
} from "@/shared/settings/timetable-draft";

export type PersonalTimetableSettingsViewProps = {
  reloadOnSave?: boolean;
  onSaved?: () => void;
  onCompletionChange?: (completed: boolean) => void;
};

function hasConfiguredPersonalTimetable(
  draft: PersonalTimetableDraft | null,
): boolean {
  if (!draft) {
    return false;
  }

  return draft.some((selection) => selection.course !== null);
}

const TIED_SELECTION_PAIR: Record<
  models.schedule.TimetableSelectionID,
  models.schedule.TimetableSelectionID
> = {
  [models.schedule.TimetableSelectionID.A]:
    models.schedule.TimetableSelectionID.B,
  [models.schedule.TimetableSelectionID.B]:
    models.schedule.TimetableSelectionID.A,
  [models.schedule.TimetableSelectionID.C]:
    models.schedule.TimetableSelectionID.D,
  [models.schedule.TimetableSelectionID.D]:
    models.schedule.TimetableSelectionID.C,
  [models.schedule.TimetableSelectionID.E]:
    models.schedule.TimetableSelectionID.F,
  [models.schedule.TimetableSelectionID.F]:
    models.schedule.TimetableSelectionID.E,
  [models.schedule.TimetableSelectionID.G]:
    models.schedule.TimetableSelectionID.H,
  [models.schedule.TimetableSelectionID.H]:
    models.schedule.TimetableSelectionID.G,
  [models.schedule.TimetableSelectionID.I]:
    models.schedule.TimetableSelectionID.J,
  [models.schedule.TimetableSelectionID.J]:
    models.schedule.TimetableSelectionID.I,
};

const TYING_SELECTIVE_COURSE_SET = new Set<knowledge.course.CourseID>(
  knowledge.course.tyingSelectiveCoursePairs,
);

function resolvePersonalTimetableLoadErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "個人時間割データが見つかりませんでした。再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolvePersonalTimetableSaveErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.TimetableDecodeErrorCode.InvalidPersonalSession:
    case api.errors.TimetableDecodeErrorCode.InvalidPersonalCourse:
    case api.errors.TimetableDecodeErrorCode.InvalidPersonalRoom:
    case api.errors.TimetableDecodeErrorCode.InvalidSelectionKey:
    case api.errors.TimetableDecodeErrorCode.InvalidPeriodList:
      return "時間割データの形式が不正です。授業と教室の入力内容を確認してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "更新対象の個人時間割が見つかりませんでした。再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "送信内容が不正です。入力内容を確認して再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export function PersonalTimetableSettingsView({
  reloadOnSave = true,
  onSaved,
  onCompletionChange,
}: PersonalTimetableSettingsViewProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [saveErrorDialog, setSaveErrorDialog] = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] =
    useState<PersonalTimetableDraft | null>(null);
  const [draft, setDraft] = useState<PersonalTimetableDraft | null>(null);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveErrorDialog(null);

    const result = await apiGetUsersUserIdTimetable("me");
    if (isNoAuthApiResult(result)) {
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.replace(buildFatalErrorPageHref(apiError));
        return;
      }

      const message = resolvePersonalTimetableLoadErrorMessage(
        result.type === "http_error" ? result.error.code : apiError?.code,
        apiError?.message ?? "個人時間割の取得に失敗しました",
      );
      setError(
        apiError
          ? {
              ...apiError,
              message,
            }
          : {
              type: "network_error",
              message,
            },
      );
      setIsLoading(false);
      return;
    }

    const loadedDraft = personalTimetableToDraft(
      result.data.timetable ?? new Map(),
    );
    setOriginalDraft(loadedDraft);
    setDraft(loadedDraft);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadPage]);

  useEffect(() => {
    onCompletionChange?.(hasConfiguredPersonalTimetable(draft));
  }, [draft, onCompletionChange]);

  const isDirty = useMemo(() => {
    if (!originalDraft || !draft) {
      return false;
    }

    return (
      serializePersonalDraft(originalDraft) !== serializePersonalDraft(draft)
    );
  }, [draft, originalDraft]);

  const updateSelection = (
    selectionIndex: number,
    updater: (selection: PersonalSelectionDraft) => PersonalSelectionDraft,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const next = [...prev];
      next[selectionIndex] = updater(next[selectionIndex]);
      return next;
    });
  };

  const updateSelectionCourse = (
    selectionIndex: number,
    nextCourse: knowledge.course.CourseID | null,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const next = [...prev];
      const currentSelection = next[selectionIndex];
      if (!currentSelection) {
        return prev;
      }

      next[selectionIndex] = {
        ...currentSelection,
        course: nextCourse,
        roomId: nextCourse === null ? "" : currentSelection.roomId,
      };

      if (nextCourse === null || !TYING_SELECTIVE_COURSE_SET.has(nextCourse)) {
        return next;
      }

      const pairedSelectionId =
        TIED_SELECTION_PAIR[currentSelection.selectionId];
      const pairedIndex = next.findIndex(
        (selection) => selection.selectionId === pairedSelectionId,
      );
      if (pairedIndex < 0) {
        return next;
      }

      const pairedSelection = next[pairedIndex];
      if (pairedSelection.course !== null) {
        return next;
      }

      next[pairedIndex] = {
        ...pairedSelection,
        course: nextCourse,
      };

      return next;
    });
  };

  const saveTimetable = async () => {
    if (!draft) {
      return;
    }

    setIsSaving(true);
    setSaveErrorDialog(null);

    const result = await apiPutUsersUserIdTimetable("me", {
      timetable: draftToPersonalTimetable(draft),
    });

    if (isNoAuthApiResult(result)) {
      setIsSaving(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSaving(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setSaveErrorDialog(
        resolvePersonalTimetableSaveErrorMessage(
          result.type === "http_error" ? result.error.code : apiError?.code,
          apiError?.message ?? "個人時間割の保存に失敗しました",
        ),
      );
      return;
    }

    setOriginalDraft(draft);
    setDraft(draft);
    setIsSaving(false);
    onSaved?.();

    if (reloadOnSave) {
      window.location.reload();
    }
  };

  return (
    <>
      {isLoading && (
        <section className="panel">
          <p>読み込み中...</p>
        </section>
      )}

      {!isLoading && error && (
        <section className="panel panel-error">
          <h2>個人時間割の読み込みに失敗しました</h2>
          <p>{error.message}</p>
          {(error.type === "unauthorized" || error.type === "forbidden") && (
            <Link href="/login" className="button primary">
              ログインページへ
            </Link>
          )}
        </section>
      )}

      {!isLoading &&
        !error &&
        draft &&
        !hasConfiguredPersonalTimetable(draft) && (
          <section className="panel panel-error">
            <h2>個人時間割が未設定です</h2>
            <p>
              現在、選択IDに授業が1件も設定されていません。授業情報を入力して保存してください。
            </p>
          </section>
        )}

      {!isLoading && !error && draft && (
        <section className="panel settings-card">
          <h2>個人時間割</h2>
          <p className="settings-note">
            科目選択IDごとに履修科目を設定します。空きコマの場合は「空きコマ」を選んでください。
          </p>
          <p className="settings-note">
            4単位(選択ID2コマ分)の科目は、対応するペア選択IDが未入力なら自動で同じ科目を補完します。
          </p>

          <div className="timetable-editor">
            {draft.map((selection, selectionIndex) => (
              <article
                className="timetable-day-card"
                key={selection.selectionId}
              >
                <header className="timetable-day-card__header">
                  <strong>選択 {selection.selectionId}</strong>
                </header>

                <section className="period-editor-row">
                  <div className="period-editor-row__grid">
                    <label className="form-field">
                      <FormFieldLabel>科目</FormFieldLabel>
                      <select
                        value={selection.course ?? "__empty__"}
                        onChange={(event) => {
                          const next = event.target.value;
                          updateSelectionCourse(
                            selectionIndex,
                            next === "__empty__"
                              ? null
                              : (next as knowledge.course.CourseID),
                          );
                        }}
                      >
                        <option value="__empty__">空きコマ</option>
                        {COURSE_OPTIONS.map((courseId) => (
                          <option key={courseId} value={courseId}>
                            {resolveCourseDisplayName(
                              courseId,
                              `不明科目(${courseId})`,
                            )}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selection.course !== null && (
                      <label className="form-field">
                        <FormFieldLabel>教室</FormFieldLabel>
                        <RoomPicker
                          value={selection.roomId}
                          onChange={(nextRoomId) => {
                            updateSelection(selectionIndex, (current) => ({
                              ...current,
                              roomId: nextRoomId,
                            }));
                          }}
                        />
                      </label>
                    )}
                  </div>
                </section>
              </article>
            ))}
          </div>
        </section>
      )}

      <SaveDiscardBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={() => {
          void saveTimetable();
        }}
        onCancel={() => {
          if (reloadOnSave) {
            window.location.reload();
            return;
          }
          void loadPage();
        }}
      />

      {saveErrorDialog && (
        <ErrorDialog
          title="保存に失敗しました"
          message={saveErrorDialog}
          onClose={() => {
            setSaveErrorDialog(null);
          }}
        />
      )}
    </>
  );
}

export default function PersonalTimetableSettingsPage() {
  return (
    <AppShell
      title="個人時間割"
      description="選択ID(A-J)ごとに授業を編集できます。未設定の選択IDは空きコマとして扱われます。"
    >
      <PersonalTimetableSettingsView />
    </AppShell>
  );
}
