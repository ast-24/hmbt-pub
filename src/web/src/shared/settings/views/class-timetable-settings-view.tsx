"use client";

import { api, knowledge } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  apiGetGradesGradeHomeClassesHomeClassNumTimetable,
  apiGetUsersUserId,
  apiPutGradesGradeHomeClassesHomeClassNumTimetable,
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
  type ClassPeriodDraft,
  type ClassTimetableDraft,
  classTimetableToDraft,
  COURSE_OPTIONS,
  draftToClassTimetable,
  SELECTION_OPTIONS,
  serializeClassDraft,
  WEEKDAY_LABEL,
} from "@/shared/settings/timetable-draft";

export type ClassTimetableSettingsViewProps = {
  reloadOnSave?: boolean;
  onSaved?: () => void;
};

function asHomeClassNum(
  value: number | null | undefined,
): knowledge.HomeClassNum | null {
  if (!Number.isInteger(value)) {
    return null;
  }
  const homeClass = Number(value);
  if (homeClass < 1 || homeClass > 6) {
    return null;
  }
  return homeClass as knowledge.HomeClassNum;
}

function asGrade(value: number | null | undefined): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }
  const grade = Number(value);
  if (grade < 1 || grade > 3) {
    return null;
  }
  return grade;
}

function resolveClassTimetableLoadErrorMessage(
  result: Awaited<
    ReturnType<typeof apiGetGradesGradeHomeClassesHomeClassNumTimetable>
  >,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。対象学年とクラスを選んで続行してください。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidGrade:
      return "対象学年が不正です。画面を再読み込みして再試行してください。";
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidHomeClassNum:
      return "対象クラス番号が不正です。画面を再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。セットアップフローで認証連携を行ってください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "時間割サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveClassTimetableUserErrorMessage(
  result: Awaited<ReturnType<typeof apiGetUsersUserId>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。未設定でも対象学年とクラスを選んで編集できます。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。セットアップフローで認証連携を行ってください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "ユーザ情報サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveClassTimetableSaveErrorMessage(
  result: Awaited<
    ReturnType<typeof apiPutGradesGradeHomeClassesHomeClassNumTimetable>
  >,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidGrade:
      return "対象学年が不正です。画面を再読み込みして再試行してください。";
    case api.errors.GradesGradeHomeClassesHomeClassNumTimetableErrorCode
      .InvalidHomeClassNum:
      return "対象クラス番号が不正です。画面を再読み込みして再試行してください。";
    case api.errors.TimetableDecodeErrorCode.InvalidClassSession:
    case api.errors.TimetableDecodeErrorCode.InvalidClassSessionType:
    case api.errors.TimetableDecodeErrorCode.InvalidClassCourse:
    case api.errors.TimetableDecodeErrorCode.InvalidClassSelectionId:
    case api.errors.TimetableDecodeErrorCode.InvalidClassRoomList:
    case api.errors.TimetableDecodeErrorCode.InvalidWeekdayKey:
    case api.errors.TimetableDecodeErrorCode.InvalidPeriodList:
      return "時間割データの形式が不正です。授業と教室の入力内容を確認してください。";
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィールの学年・クラス設定が不足しています。対象学年とクラスを選んで保存してください。";
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    default:
      return fallbackMessage;
  }
}

export function ClassTimetableSettingsView({
  reloadOnSave = true,
  onSaved,
}: ClassTimetableSettingsViewProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [saveErrorDialog, setSaveErrorDialog] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [myGrade, setMyGrade] = useState<number | null>(null);
  const [myHomeClassNum, setMyHomeClassNum] =
    useState<knowledge.HomeClassNum | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedHomeClassNum, setSelectedHomeClassNum] =
    useState<knowledge.HomeClassNum | null>(null);
  const [originalDraft, setOriginalDraft] =
    useState<ClassTimetableDraft | null>(null);
  const [draft, setDraft] = useState<ClassTimetableDraft | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>(
    {},
  );

  const loadDraftByClass = useCallback(
    async (
      targetGrade: number,
      targetHomeClass: knowledge.HomeClassNum,
      usePageError = false,
    ): Promise<ClassTimetableDraft | null> => {
      const timetableResult =
        await apiGetGradesGradeHomeClassesHomeClassNumTimetable(
          targetGrade,
          targetHomeClass,
        );
      if (isNoAuthApiResult(timetableResult)) {
        router.replace("/login");
        return null;
      }

      const apiError = handleApiError(timetableResult);
      if (apiError || timetableResult.type !== "success") {
        if (apiError && shouldShowFatalErrorPage(apiError)) {
          router.push(buildFatalErrorPageHref(apiError));
          return null;
        }

        const message = resolveClassTimetableLoadErrorMessage(
          timetableResult,
          apiError?.message ?? "クラス時間割の取得に失敗しました",
        );
        if (usePageError) {
          setError({
            type: apiError?.type ?? "network_error",
            message,
            status: apiError?.status,
          });
        } else {
          setSaveErrorDialog(message);
        }
        return null;
      }

      return classTimetableToDraft(timetableResult.data.timetable ?? new Map());
    },
    [router],
  );

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveErrorDialog(null);
    setProfileWarning(null);

    const userResult = await apiGetUsersUserId("me");
    if (isNoAuthApiResult(userResult)) {
      router.replace("/login");
      return;
    }

    const userError = handleApiError(userResult);
    if (userError || userResult.type !== "success") {
      if (userError && shouldShowFatalErrorPage(userError)) {
        router.replace(buildFatalErrorPageHref(userError));
        return;
      }

      const message = resolveClassTimetableUserErrorMessage(
        userResult,
        userError?.message ?? "ユーザ情報の取得に失敗しました",
      );
      setError(
        userError
          ? {
              ...userError,
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

    const resolvedHomeClass = asHomeClassNum(
      userResult.data.user_info.homeclass,
    );
    const resolvedGrade = asGrade(userResult.data.user_info.grade);

    const nextSelectedGrade = resolvedGrade ?? 1;
    const nextSelectedHomeClass =
      resolvedHomeClass ?? (1 as knowledge.HomeClassNum);

    const warningMessages: string[] = [];
    if (resolvedGrade === null) {
      warningMessages.push(
        "現在の学年が未設定のため、対象学年は1年を仮選択しています。",
      );
    }
    if (resolvedHomeClass === null) {
      warningMessages.push(
        "現在のクラスが未設定のため、対象クラスは1組を仮選択しています。",
      );
    }
    setProfileWarning(
      warningMessages.length > 0 ? warningMessages.join(" ") : null,
    );

    const loadedDraft = await loadDraftByClass(
      nextSelectedGrade,
      nextSelectedHomeClass,
      true,
    );
    if (!loadedDraft) {
      setIsLoading(false);
      return;
    }

    setMyGrade(resolvedGrade);
    setMyHomeClassNum(resolvedHomeClass);
    setSelectedGrade(nextSelectedGrade);
    setSelectedHomeClassNum(nextSelectedHomeClass);
    setOriginalDraft(loadedDraft);
    setDraft(loadedDraft);
    setCollapsedDays({});
    setIsLoading(false);
  }, [loadDraftByClass, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadPage]);

  const isDirty = useMemo(() => {
    if (!originalDraft || !draft) {
      return false;
    }

    return serializeClassDraft(originalDraft) !== serializeClassDraft(draft);
  }, [draft, originalDraft]);

  const updatePeriod = (
    dayIndex: number,
    periodIndex: number,
    updater: (period: ClassPeriodDraft) => ClassPeriodDraft,
  ) => {
    setDraft((prev) => {
      if (!prev) {
        return prev;
      }

      const next = [...prev];
      next[dayIndex] = {
        ...next[dayIndex],
        periods: next[dayIndex].periods.map((period, index) =>
          index === periodIndex ? updater(period) : period,
        ),
      };
      return next;
    });
  };

  const addRoomSlot = (dayIndex: number, periodIndex: number) => {
    updatePeriod(dayIndex, periodIndex, (current) => ({
      ...current,
      roomIds: [...current.roomIds, ""],
    }));
  };

  const updateRoomSlot = (
    dayIndex: number,
    periodIndex: number,
    roomIndex: number,
    nextRoomId: string,
  ) => {
    updatePeriod(dayIndex, periodIndex, (current) => ({
      ...current,
      roomIds: current.roomIds.map((roomId, index) =>
        index === roomIndex ? nextRoomId : roomId,
      ),
    }));
  };

  const removeRoomSlot = (
    dayIndex: number,
    periodIndex: number,
    roomIndex: number,
  ) => {
    updatePeriod(dayIndex, periodIndex, (current) => ({
      ...current,
      roomIds: current.roomIds.filter((_, index) => index !== roomIndex),
    }));
  };

  const toggleDayCollapse = (weekday: number) => {
    setCollapsedDays((prev) => ({
      ...prev,
      [weekday]: !(prev[weekday] ?? false),
    }));
  };

  const changeTargetClass = async (
    nextGrade: number,
    nextHomeClass: knowledge.HomeClassNum,
  ) => {
    if (nextGrade === selectedGrade && nextHomeClass === selectedHomeClassNum) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSaveErrorDialog(null);

    const loadedDraft = await loadDraftByClass(nextGrade, nextHomeClass, false);
    if (loadedDraft) {
      setSelectedGrade(nextGrade);
      setSelectedHomeClassNum(nextHomeClass);
      setOriginalDraft(loadedDraft);
      setDraft(loadedDraft);
      setCollapsedDays({});
    }

    setIsLoading(false);
  };

  const saveTimetable = async () => {
    if (!draft || !selectedHomeClassNum || !selectedGrade) {
      return;
    }

    setIsSaving(true);
    setSaveErrorDialog(null);

    const result = await apiPutGradesGradeHomeClassesHomeClassNumTimetable(
      selectedGrade,
      selectedHomeClassNum,
      {
        timetable: draftToClassTimetable(draft),
      },
    );

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
        resolveClassTimetableSaveErrorMessage(
          result,
          apiError?.message ?? "クラス時間割の保存に失敗しました",
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
          <h2>クラス時間割の読み込みに失敗しました</h2>
          <p>{error.message}</p>
          {(error.type === "unauthorized" || error.type === "forbidden") && (
            <Link href="/login" className="button primary">
              ログインページへ
            </Link>
          )}
        </section>
      )}

      {!isLoading && !error && profileWarning && (
        <section className="panel panel-error">
          <h2>プロフィール未設定の項目があります</h2>
          <p>{profileWarning}</p>
        </section>
      )}

      {!isLoading && !error && draft && (
        <section className="panel settings-card">
          <h2>クラス共通時間割</h2>
          <p className="settings-note">
            対象学年・クラスを選んで編集できます。各コマは未設定・通常授業・選択コマから選べます。
          </p>

          <div className="form-row">
            <label className="form-field">
              <FormFieldLabel required>対象学年</FormFieldLabel>
              <select
                value={selectedGrade ?? 1}
                onChange={(event) => {
                  const next = asGrade(Number(event.target.value));
                  const currentHomeClass =
                    selectedHomeClassNum ?? (1 as knowledge.HomeClassNum);
                  if (!next) {
                    return;
                  }
                  void changeTargetClass(next, currentHomeClass);
                }}
              >
                {[1, 2, 3].map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}年{myGrade === grade ? " (自分)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <FormFieldLabel required>対象クラス</FormFieldLabel>
              <select
                value={selectedHomeClassNum ?? ""}
                onChange={(event) => {
                  const nextHomeClass = asHomeClassNum(
                    Number(event.target.value),
                  );
                  const currentGrade = selectedGrade ?? 1;
                  if (!nextHomeClass) {
                    return;
                  }
                  void changeTargetClass(currentGrade, nextHomeClass);
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((homeClass) => (
                  <option key={homeClass} value={homeClass}>
                    {homeClass}組{myHomeClassNum === homeClass ? " (自分)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="timetable-editor">
            {draft.map((day, dayIndex) => (
              <article className="timetable-day-card" key={day.weekday}>
                <header className="timetable-day-card__header">
                  <button
                    type="button"
                    className="timetable-day-card__toggle"
                    onClick={() => {
                      toggleDayCollapse(day.weekday);
                    }}
                    aria-expanded={!collapsedDays[day.weekday]}
                  >
                    <span>{WEEKDAY_LABEL[day.weekday]}曜</span>
                    <span
                      className="timetable-day-card__toggle-icon"
                      aria-hidden
                    >
                      {collapsedDays[day.weekday] ? "▲" : "▼"}
                    </span>
                  </button>
                </header>

                {!collapsedDays[day.weekday] && (
                  <div className="period-editor-list">
                    {day.periods.map((period, periodIndex) => (
                      <section className="period-editor-row" key={periodIndex}>
                        <div className="period-editor-row__header">
                          <strong>{periodIndex + 1}限</strong>
                        </div>

                        <div className="period-editor-row__grid">
                          <label className="form-field">
                            <FormFieldLabel required>区分</FormFieldLabel>
                            <select
                              value={period.mode}
                              onChange={(event) => {
                                const next = event.target.value as
                                  | "unset"
                                  | "normal"
                                  | "select";
                                updatePeriod(
                                  dayIndex,
                                  periodIndex,
                                  (current) => ({
                                    ...current,
                                    mode: next,
                                    course:
                                      next === "normal" ? current.course : null,
                                    roomIds:
                                      next === "normal"
                                        ? current.roomIds.length > 0
                                          ? current.roomIds
                                          : [""]
                                        : [""],
                                  }),
                                );
                              }}
                            >
                              <option value="unset">未設定</option>
                              <option value="normal">通常授業</option>
                              <option value="select">選択コマ</option>
                            </select>
                          </label>

                          {period.mode === "normal" && (
                            <div className="form-field">
                              <FormFieldLabel>科目</FormFieldLabel>
                              <select
                                value={period.course ?? "__empty__"}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  updatePeriod(
                                    dayIndex,
                                    periodIndex,
                                    (current) => ({
                                      ...current,
                                      course:
                                        next === "__empty__"
                                          ? null
                                          : (next as knowledge.course.CourseID),
                                    }),
                                  );
                                }}
                              >
                                <option value="__empty__">科目未設定</option>
                                {COURSE_OPTIONS.map((courseId) => (
                                  <option key={courseId} value={courseId}>
                                    {resolveCourseDisplayName(
                                      courseId,
                                      `不明科目(${courseId})`,
                                    )}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {period.mode === "normal" &&
                            period.course !== null && (
                              <div className="form-field">
                                <FormFieldLabel>教室</FormFieldLabel>
                                <div className="room-slot-list">
                                  {period.roomIds.map((roomId, roomIndex) => (
                                    <div
                                      className="room-slot-row"
                                      key={`${day.weekday}-${periodIndex}-${roomIndex}`}
                                    >
                                      <RoomPicker
                                        value={roomId}
                                        onChange={(nextRoomId) => {
                                          updateRoomSlot(
                                            dayIndex,
                                            periodIndex,
                                            roomIndex,
                                            nextRoomId,
                                          );
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="button ghost"
                                        onClick={() => {
                                          removeRoomSlot(
                                            dayIndex,
                                            periodIndex,
                                            roomIndex,
                                          );
                                        }}
                                      >
                                        -
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="button ghost"
                                    onClick={() => {
                                      addRoomSlot(dayIndex, periodIndex);
                                    }}
                                  >
                                    + 教室
                                  </button>
                                </div>
                              </div>
                            )}

                          {period.mode === "select" && (
                            <label className="form-field">
                              <FormFieldLabel required>選択ID</FormFieldLabel>
                              <select
                                value={period.selectionId}
                                onChange={(event) => {
                                  updatePeriod(
                                    dayIndex,
                                    periodIndex,
                                    (current) => ({
                                      ...current,
                                      selectionId: event.target
                                        .value as ClassPeriodDraft["selectionId"],
                                    }),
                                  );
                                }}
                              >
                                {SELECTION_OPTIONS.map((selectionId) => (
                                  <option key={selectionId} value={selectionId}>
                                    {selectionId}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
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

export default function ClassTimetableSettingsPage() {
  return (
    <AppShell
      title="クラス時間割"
      description="クラス全体の時間割を編集できます。各コマを通常授業または選択IDで設定できます。"
    >
      <ClassTimetableSettingsView />
    </AppShell>
  );
}
