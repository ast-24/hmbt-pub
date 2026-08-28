"use client";

import { api, models } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  executeBatchCalls,
  apiGetGlobalSchedulesYearMonth,
  apiPutGlobalSchedulesYearMonth,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  pickBatchResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { LoadingRacePanel } from "@/shared/components/loading-race";
import { RoomPicker } from "@/shared/components/room-picker";
import { SaveDiscardBar } from "@/shared/components/save-discard-bar";
import { AppShell } from "@/shared/layout/app-shell";
import { buildDaysByMonthFromOldParserCsv } from "@/shared/settings/common-schedule-csv";
import {
  COMMON_BELL_OPTIONS,
  GRADE_KEYS,
  WEEKDAY_OPTIONS,
  createEmptyDayDraft,
  createEmptySessionDraft,
  draftToMonthlySchedule,
  monthlyScheduleToDraft,
  serializeMonthlyScheduleDraft,
  type DayDraft,
  type GradeKey,
  type MonthlyScheduleDraft,
  type OptionalBooleanDraft,
  type SessionDraft,
} from "@/shared/settings/common-schedule-draft";

type YearMonth = {
  year: number;
  month: number;
};

type DayEditorTarget = {
  year: number;
  month: number;
  dayIndex: number;
};

type MonthScheduleState = {
  year: number;
  month: number;
  baseSchedule: Array<models.schedule.OriginalMonSkdDay | null>;
  draft: MonthlyScheduleDraft;
  originalDraftSnapshot: string;
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthInputValue(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dayEntryKey(year: number, month: number, dayIndex: number): string {
  return `${monthKey(year, month)}-${dayIndex}`;
}

function formatYearMonth(year: number, month: number): string {
  return `${year}年${month}月`;
}

function getWeekdayLabel(
  year: number,
  month: number,
  dayNumber: number,
): string {
  const weekday = new Date(Date.UTC(year, month - 1, dayNumber)).getUTCDay();
  return WEEKDAY_LABELS[weekday] ?? "?";
}

function buildTargetMonths(
  year: number,
  month: number,
): [YearMonth, YearMonth] {
  const first = { year, month };
  if (month === 12) {
    return [first, { year: year + 1, month: 1 }];
  }
  return [first, { year, month: month + 1 }];
}

function cloneSessionDraft(session: SessionDraft): SessionDraft {
  return {
    ...session,
  };
}

function normalizeSessionDrafts(sessions: SessionDraft[]): SessionDraft[] {
  const normalized = sessions
    .slice(0, PERIOD_OPTIONS.length)
    .map(cloneSessionDraft);
  while (normalized.length < PERIOD_OPTIONS.length) {
    normalized.push(createEmptySessionDraft());
  }
  return normalized;
}

function cloneDayDraft(day: DayDraft): DayDraft {
  return {
    ...day,
    specialWindows: day.specialWindows.map((windowDraft) => ({
      start: windowDraft.start,
      end: windowDraft.end,
    })),
    grades: {
      1: normalizeSessionDrafts(day.grades[1]),
      2: normalizeSessionDrafts(day.grades[2]),
      3: normalizeSessionDrafts(day.grades[3]),
    },
  };
}

function normalizeDraftLength(
  raw: MonthlyScheduleDraft,
  length: number,
): MonthlyScheduleDraft {
  const normalized = raw.slice(0, length).map(cloneDayDraft);
  while (normalized.length < length) {
    normalized.push(createEmptyDayDraft());
  }
  return normalized;
}

function normalizeScheduleLength(
  raw: Array<models.schedule.OriginalMonSkdDay | null>,
  length: number,
): Array<models.schedule.OriginalMonSkdDay | null> {
  const normalized = raw.slice(0, length);
  while (normalized.length < length) {
    normalized.push(null);
  }
  return normalized;
}

function serializeDraftSnapshot(draft: MonthlyScheduleDraft): string {
  return serializeMonthlyScheduleDraft(draft);
}

function getMonthState(
  states: MonthScheduleState[],
  year: number,
  month: number,
): MonthScheduleState | undefined {
  return states.find((state) => state.year === year && state.month === month);
}

function upsertMonthState(
  states: MonthScheduleState[],
  nextState: MonthScheduleState,
): MonthScheduleState[] {
  const index = states.findIndex(
    (state) => state.year === nextState.year && state.month === nextState.month,
  );

  if (index < 0) {
    return [...states, nextState];
  }

  const cloned = [...states];
  cloned[index] = nextState;
  return cloned;
}

function resolveLoadErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "リクエスト内容が不正です。年月を確認して再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveSaveErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.InvalidRequest:
    case api.errors.CommonApiErrorCode.InvalidJsonBody:
    case api.errors.CommonApiErrorCode.MissingPathParameter:
      return "送信した予定表データの形式が不正です。入力内容を確認してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function toDisplayEventLines(eventsText: string): string[] {
  return eventsText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function toEditableEventLines(eventsText: string): string[] {
  const lines = eventsText.split("\n");
  if (lines.length === 0) {
    return [""];
  }
  return lines;
}

function formatShortenedLabel(day: DayDraft): string {
  switch (day.shortenedType) {
    case "common":
      return `共通(${day.commonBellSchedule})`;
    case "special": {
      const windowCount = day.specialWindows.filter(
        (windowDraft) =>
          windowDraft.start.trim().length > 0 ||
          windowDraft.end.trim().length > 0,
      ).length;
      return `特別(${windowCount}枠)`;
    }
    case "unknown":
      return day.unknownAfternoonStartPeriod.trim().length > 0
        ? `不明(午後${day.unknownAfternoonStartPeriod.trim()}限開始)`
        : "不明";
  }
}

function formatOptionBoolean(value: OptionalBooleanDraft): string {
  switch (value) {
    case "true":
      return "開";
    case "false":
      return "閉";
    case "unset":
      return "未設定";
  }
}

function formatSession(session: SessionDraft): string {
  if (session.kind === "empty") {
    return "空き";
  }

  if (session.kind === "normal") {
    const dayLabel = WEEKDAY_LABELS[session.normalDayofweek] ?? "?";
    return `${dayLabel}${session.normalPeriod}`;
  }

  const name = session.specialName.trim();
  const room = session.specialRoomId.trim();
  if (!name && !room) {
    return "特別(未入力)";
  }

  if (!room) {
    return name || "特別(未入力)";
  }

  return `${name || "名称未入力"} @${room}`;
}

function formatGradeSessions(sessions: SessionDraft[]): string {
  const normalized = normalizeSessionDrafts(sessions);
  if (normalized.every((session) => session.kind === "empty")) {
    return "なし";
  }

  return normalized
    .map((session, index) => `${index + 1}限:${formatSession(session)}`)
    .join(" / ");
}

function mergeImportedCsvDraftDay(
  importedDay: models.schedule.OriginalMonSkdDay,
  currentDay: DayDraft,
): DayDraft {
  const importedDraft =
    monthlyScheduleToDraft([importedDay])[0] ?? createEmptyDayDraft();

  return {
    ...cloneDayDraft(importedDraft),
    enabled: true,
    startTime: currentDay.startTime,
  };
}

function mergeDraftDayWithBase(
  dayDraft: DayDraft,
  baseDay: models.schedule.OriginalMonSkdDay | null,
): models.schedule.OriginalMonSkdDay | null {
  if (!dayDraft.enabled) {
    return null;
  }

  const converted = draftToMonthlySchedule([dayDraft])[0];
  if (converted === null) {
    return null;
  }

  if (!baseDay) {
    return converted;
  }

  const mergedByGrade = baseDay.sess_by_grade.map((sessions) =>
    sessions.slice(),
  );
  while (mergedByGrade.length <= 3) {
    mergedByGrade.push([]);
  }

  mergedByGrade[1] = converted.sess_by_grade[1] ?? [];
  mergedByGrade[2] = converted.sess_by_grade[2] ?? [];
  mergedByGrade[3] = converted.sess_by_grade[3] ?? [];

  return {
    ...baseDay,
    ...converted,
    sess_by_grade: mergedByGrade,
  };
}

export default function CommonScheduleSettingsPage() {
  const router = useRouter();

  const current = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(
    current.getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    current.getMonth() + 1,
  );
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isImportingCsv, setIsImportingCsv] = useState<boolean>(false);

  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [monthStates, setMonthStates] = useState<MonthScheduleState[]>([]);

  const [editingTarget, setEditingTarget] = useState<DayEditorTarget | null>(
    null,
  );
  const [editingGrade, setEditingGrade] = useState<GradeKey>(1);

  const targetMonths = useMemo(
    () => buildTargetMonths(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  );

  const loadSchedules = useCallback(
    async (year: number, month: number) => {
      setIsLoading(true);
      setError(null);
      setDialogMessage(null);
      setStatusMessage(null);

      const months = buildTargetMonths(year, month);
      const batchResults = await executeBatchCalls(
        months.map((target) => ({
          key: monthKey(target.year, target.month),
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.GlobalSchedulesYearMonthGet
            ],
          pathParams: {
            year: target.year,
            month: target.month,
          },
          fallbackMessage: "共通月間予定表の取得に失敗しました",
          stubCall: () =>
            apiGetGlobalSchedulesYearMonth(target.year, target.month),
        })),
      );

      const results = months.map((target) =>
        pickBatchResult<
          api.endpoints.ApiGlobalSchedulesYearMonthGetRes,
          api.endpoints.ApiGlobalSchedulesYearMonthGetErr
        >(
          batchResults,
          monthKey(target.year, target.month),
          "共通月間予定表の取得に失敗しました",
        ),
      );

      for (const result of results) {
        if (isNoAuthApiResult(result)) {
          setIsLoading(false);
          router.replace("/login");
          return;
        }
      }

      const failedResult = results.find((result) => result.type !== "success");
      if (failedResult) {
        const apiError = handleApiError(failedResult);
        if (apiError && shouldShowFatalErrorPage(apiError)) {
          setIsLoading(false);
          router.replace(buildFatalErrorPageHref(apiError));
          return;
        }

        const message = resolveLoadErrorMessage(
          failedResult.type === "http_error"
            ? failedResult.error.code
            : apiError?.code,
          apiError?.message ?? "共通月間予定表の取得に失敗しました",
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

      const loadedStates: MonthScheduleState[] = months.map((target, index) => {
        const result = results[index];
        if (result.type !== "success") {
          throw new Error("Unexpected non-success result");
        }

        const normalizedSchedule = normalizeScheduleLength(
          result.data.skd,
          daysInMonth(target.year, target.month),
        );
        const draft = monthlyScheduleToDraft(normalizedSchedule);

        return {
          year: target.year,
          month: target.month,
          baseSchedule: normalizedSchedule,
          draft,
          originalDraftSnapshot: serializeDraftSnapshot(draft),
        };
      });

      setMonthStates(loadedStates);
      setEditingTarget(null);
      setExpandedDays({});
      setIsLoading(false);
    },
    [router],
  );

  useEffect(() => {
    void loadSchedules(selectedYear, selectedMonth);
  }, [loadSchedules, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!editingTarget) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingTarget(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingTarget]);

  const dirtyMonths = useMemo(() => {
    return targetMonths.filter((target) => {
      const state = getMonthState(monthStates, target.year, target.month);
      if (!state) {
        return false;
      }

      const normalizedDraft = normalizeDraftLength(
        state.draft,
        daysInMonth(target.year, target.month),
      );

      return (
        serializeDraftSnapshot(normalizedDraft) !== state.originalDraftSnapshot
      );
    });
  }, [monthStates, targetMonths]);

  const isDirty = dirtyMonths.length > 0;

  const monthDraftViews = useMemo(() => {
    return targetMonths.map((target) => {
      const state = getMonthState(monthStates, target.year, target.month);
      const draft = normalizeDraftLength(
        state?.draft ?? [],
        daysInMonth(target.year, target.month),
      );

      return {
        target,
        draft,
      };
    });
  }, [monthStates, targetMonths]);

  const editingContext = useMemo(() => {
    if (!editingTarget) {
      return null;
    }

    const state = getMonthState(
      monthStates,
      editingTarget.year,
      editingTarget.month,
    );
    if (!state) {
      return null;
    }

    const dayCount = daysInMonth(editingTarget.year, editingTarget.month);
    const draft = normalizeDraftLength(state.draft, dayCount);
    if (editingTarget.dayIndex < 0 || editingTarget.dayIndex >= draft.length) {
      return null;
    }

    return {
      target: editingTarget,
      dayNumber: editingTarget.dayIndex + 1,
      monthLabel: formatYearMonth(editingTarget.year, editingTarget.month),
      weekdayLabel: getWeekdayLabel(
        editingTarget.year,
        editingTarget.month,
        editingTarget.dayIndex + 1,
      ),
      dayDraft: draft[editingTarget.dayIndex],
    };
  }, [editingTarget, monthStates]);

  const applyDayDraftUpdate = useCallback(
    (target: DayEditorTarget, updater: (dayDraft: DayDraft) => DayDraft) => {
      setMonthStates((states) => {
        const state = getMonthState(states, target.year, target.month);
        if (!state) {
          return states;
        }

        const dayCount = daysInMonth(target.year, target.month);
        const draft = normalizeDraftLength(state.draft, dayCount);
        const currentDay = draft[target.dayIndex] ?? createEmptyDayDraft();
        draft[target.dayIndex] = cloneDayDraft(
          updater(cloneDayDraft(currentDay)),
        );

        return upsertMonthState(states, {
          ...state,
          draft,
        });
      });
    },
    [],
  );

  const updateEditingDay = useCallback(
    (updater: (dayDraft: DayDraft) => DayDraft) => {
      if (!editingTarget) {
        return;
      }

      applyDayDraftUpdate(editingTarget, updater);
    },
    [applyDayDraftUpdate, editingTarget],
  );

  const saveSchedules = async () => {
    setIsSaving(true);
    setDialogMessage(null);
    setStatusMessage(null);

    const months = buildTargetMonths(selectedYear, selectedMonth);
    const monthsToSave = months.filter((target) => {
      const state = getMonthState(monthStates, target.year, target.month);
      if (!state) {
        return false;
      }

      const normalizedDraft = normalizeDraftLength(
        state.draft,
        daysInMonth(target.year, target.month),
      );

      return (
        serializeDraftSnapshot(normalizedDraft) !== state.originalDraftSnapshot
      );
    });

    if (monthsToSave.length === 0) {
      setIsSaving(false);
      setStatusMessage("保存対象の変更はありません。");
      return;
    }

    let workingStates = [...monthStates];
    const savedMonthLabels: string[] = [];

    for (const target of monthsToSave) {
      const currentState = getMonthState(
        workingStates,
        target.year,
        target.month,
      );
      if (!currentState) {
        continue;
      }

      const dayCount = daysInMonth(target.year, target.month);
      const normalizedDraft = normalizeDraftLength(
        currentState.draft,
        dayCount,
      );

      let scheduleToSave: Array<models.schedule.OriginalMonSkdDay | null>;
      try {
        scheduleToSave = normalizedDraft.map((dayDraft, index) =>
          mergeDraftDayWithBase(
            dayDraft,
            currentState.baseSchedule[index] ?? null,
          ),
        );
      } catch (error) {
        setIsSaving(false);
        setDialogMessage(
          `${formatYearMonth(target.year, target.month)}の入力値が不正です: ${
            error instanceof Error
              ? error.message
              : "入力内容を確認してください"
          }`,
        );
        return;
      }

      const result = await apiPutGlobalSchedulesYearMonth(
        target.year,
        target.month,
        {
          skd: scheduleToSave,
        },
      );

      if (isNoAuthApiResult(result)) {
        setMonthStates(workingStates);
        setIsSaving(false);
        router.replace("/login");
        return;
      }

      const apiError = handleApiError(result);
      if (apiError || result.type !== "success") {
        setMonthStates(workingStates);
        setIsSaving(false);

        if (apiError && shouldShowFatalErrorPage(apiError)) {
          router.push(buildFatalErrorPageHref(apiError));
          return;
        }

        const savedSuffix =
          savedMonthLabels.length > 0
            ? ` (${savedMonthLabels.join("・")}は保存済みです)`
            : "";

        setDialogMessage(
          `${resolveSaveErrorMessage(
            result.type === "http_error" ? result.error.code : apiError?.code,
            apiError?.message ?? "共通月間予定表の保存に失敗しました",
          )}${savedSuffix}`,
        );
        return;
      }

      const nextState: MonthScheduleState = {
        ...currentState,
        baseSchedule: normalizeScheduleLength(scheduleToSave, dayCount),
        draft: normalizedDraft,
        originalDraftSnapshot: serializeDraftSnapshot(normalizedDraft),
      };

      workingStates = upsertMonthState(workingStates, nextState);
      savedMonthLabels.push(formatYearMonth(target.year, target.month));
    }

    setMonthStates(workingStates);
    setStatusMessage(
      `${savedMonthLabels.join("・")}の更新を受け付けました。1分以内に適用されます。`,
    );
    setIsSaving(false);
  };

  const importFromCsv = async (file: File) => {
    setIsImportingCsv(true);
    setDialogMessage(null);
    setStatusMessage(null);

    try {
      const csvText = await file.text();
      const importedMonths = buildDaysByMonthFromOldParserCsv(csvText);
      const months = buildTargetMonths(selectedYear, selectedMonth);

      let workingStates = [...monthStates];
      let importedCount = 0;
      const appliedMonthLabels: string[] = [];
      const skippedMonths: number[] = [];

      importedMonths.forEach((importedMonth) => {
        const target = months.find(
          (month) => month.month === importedMonth.month,
        );
        if (!target) {
          skippedMonths.push(importedMonth.month);
          return;
        }

        const currentState = getMonthState(
          workingStates,
          target.year,
          target.month,
        );
        if (!currentState) {
          return;
        }

        const dayCount = daysInMonth(target.year, target.month);
        const mergedDraft = normalizeDraftLength(currentState.draft, dayCount);

        const outOfRangeDays: number[] = [];
        let monthImportedCount = 0;

        importedMonth.days.forEach(({ dayOfMonth, day }) => {
          if (dayOfMonth < 1 || dayOfMonth > dayCount) {
            outOfRangeDays.push(dayOfMonth);
            return;
          }

          const targetIndex = dayOfMonth - 1;
          mergedDraft[targetIndex] = mergeImportedCsvDraftDay(
            day,
            mergedDraft[targetIndex] ?? createEmptyDayDraft(),
          );
          monthImportedCount += 1;
        });

        if (outOfRangeDays.length > 0) {
          const uniqDays = Array.from(new Set(outOfRangeDays)).sort(
            (a, b) => a - b,
          );
          throw new Error(
            `${formatYearMonth(target.year, target.month)}に存在しない日付が含まれています: ${uniqDays.join(", ")}日`,
          );
        }

        workingStates = upsertMonthState(workingStates, {
          ...currentState,
          draft: mergedDraft,
        });

        if (monthImportedCount > 0) {
          importedCount += monthImportedCount;
          appliedMonthLabels.push(formatYearMonth(target.year, target.month));
        }
      });

      if (importedCount === 0) {
        const importedMonthLabels = importedMonths
          .map((entry) => `${entry.month}月`)
          .join(", ");
        throw new Error(
          `表示中の2か月(${months
            .map((month) => formatYearMonth(month.year, month.month))
            .join(
              "・",
            )})に一致するデータがありません。CSV内の月: ${importedMonthLabels || "なし"}`,
        );
      }

      setMonthStates(workingStates);

      const uniqSkippedMonths = Array.from(new Set(skippedMonths)).sort(
        (a, b) => a - b,
      );

      const skippedMessage =
        uniqSkippedMonths.length > 0
          ? ` 対象外の月はスキップしました: ${uniqSkippedMonths.join(", ")}月`
          : "";

      setStatusMessage(
        `CSVを取り込みました。${appliedMonthLabels.join("・")}で${importedCount}日分を反映しています。保存すると確定します。${skippedMessage}`,
      );
    } catch (importError) {
      setDialogMessage(
        importError instanceof Error
          ? `CSV取り込みに失敗しました: ${importError.message}`
          : "CSV取り込みに失敗しました",
      );
    } finally {
      setIsImportingCsv(false);
    }
  };

  const openDayEditor = (year: number, month: number, dayIndex: number) => {
    setEditingGrade(1);
    setEditingTarget({ year, month, dayIndex });
  };

  const toggleDayExpanded = (year: number, month: number, dayIndex: number) => {
    const key = dayEntryKey(year, month, dayIndex);
    setExpandedDays((currentMap) => ({
      ...currentMap,
      [key]: !currentMap[key],
    }));
  };

  const editableEventLines = editingContext
    ? toEditableEventLines(editingContext.dayDraft.eventsText)
    : [];

  const currentGradeSessions =
    editingContext !== null
      ? normalizeSessionDrafts(editingContext.dayDraft.grades[editingGrade])
      : [];

  return (
    <AppShell
      title="共通月間予定(基本は編集不要)"
      description="日ヘッダ展開で内容確認し、日別ポップアップから編集できます。基準月と翌月の2か月分を管理します。"
    >
      {isLoading && <LoadingRacePanel message="共通予定を読み込み中..." />}

      {!isLoading && error && (
        <section className="panel panel-error">
          <h2>共通月間予定表の読み込みに失敗しました</h2>
          <p>{error.message}</p>
          {(error.type === "unauthorized" || error.type === "forbidden") && (
            <Link href="/login" className="button primary">
              ログインページへ
            </Link>
          )}
        </section>
      )}

      {!isLoading && !error && (
        <>
          <section className="panel settings-card">
            <h2>基準年月</h2>
            <div className="inline-controls">
              <label className="form-field">
                <FormFieldLabel required>基準年月</FormFieldLabel>
                <input
                  type="month"
                  value={monthInputValue(selectedYear, selectedMonth)}
                  onChange={(event) => {
                    const value = event.target.value;
                    const match = value.match(/^(\d{4})-(\d{2})$/);
                    if (!match) {
                      return;
                    }
                    setSelectedYear(Number.parseInt(match[1], 10));
                    setSelectedMonth(Number.parseInt(match[2], 10));
                  }}
                />
              </label>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  void loadSchedules(selectedYear, selectedMonth);
                }}
              >
                再読み込み
              </button>
            </div>
            <p className="settings-note">
              選択した月と翌月を同時に表示・保存します。
            </p>
            <p className="settings-note">
              表示対象:{" "}
              {targetMonths
                .map((month) => formatYearMonth(month.year, month.month))
                .join("・")}
            </p>
          </section>

          <section className="panel settings-card">
            <h2>CSV取り込み</h2>
            <p className="settings-note">
              1ファイルで複数月をまとめて取り込めます。列順: date.mon, date.day,
              event_hs, change, cafe, study_room, grade1_timetable_1..7,
              grade2_timetable_1..7, grade3_timetable_1..7
            </p>
            <p className="settings-note">
              授業名が 月〜金 + 1〜7 (例: 月2)
              の形式なら、週間時間割参照用の通常授業として取り込みます。
            </p>
            <label className="form-field">
              <FormFieldLabel>CSVファイル</FormFieldLabel>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={isImportingCsv}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  void importFromCsv(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {isImportingCsv && (
              <p className="settings-note">CSVを取り込み中...</p>
            )}
          </section>

          <section className="panel settings-card">
            <h2>現在の値（2か月分）</h2>
            <p className="settings-note">
              日ヘッダをタップすると内容を展開して確認できます。右端の編集ボタンで日別ポップアップを開きます。
            </p>

            {monthDraftViews.map(({ target, draft }) => (
              <div
                key={monthKey(target.year, target.month)}
                className="common-schedule-month-block"
              >
                <h3>{formatYearMonth(target.year, target.month)}</h3>

                <ul className="list-editor common-schedule-day-list">
                  {draft.map((day, dayIndex) => {
                    const dayNumber = dayIndex + 1;
                    const dayLabel = `${dayNumber}日(${getWeekdayLabel(
                      target.year,
                      target.month,
                      dayNumber,
                    )})`;
                    const events = toDisplayEventLines(day.eventsText);
                    const expandedKey = dayEntryKey(
                      target.year,
                      target.month,
                      dayIndex,
                    );
                    const isExpanded = expandedDays[expandedKey] ?? false;

                    return (
                      <li
                        key={dayLabel}
                        className="list-editor__item common-schedule-day-item"
                      >
                        <div className="common-schedule-day-header">
                          <button
                            type="button"
                            className="common-schedule-day-toggle"
                            aria-expanded={isExpanded}
                            onClick={() => {
                              toggleDayExpanded(
                                target.year,
                                target.month,
                                dayIndex,
                              );
                            }}
                          >
                            <strong>{dayLabel}</strong>
                            <span
                              className="common-schedule-day-toggle-icon"
                              aria-hidden
                            >
                              {isExpanded ? "▼" : "▲"}
                            </span>
                          </button>

                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => {
                              openDayEditor(
                                target.year,
                                target.month,
                                dayIndex,
                              );
                            }}
                          >
                            編集
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="common-schedule-day-body">
                            {!day.enabled ? (
                              <p className="settings-note">
                                この日は未設定です。
                              </p>
                            ) : (
                              <>
                                <div className="common-schedule-confirm-grid">
                                  <p>
                                    開始時刻: {day.startTime.trim() || "未設定"}
                                  </p>
                                  <p>時程: {formatShortenedLabel(day)}</p>
                                  <p>
                                    食堂:{" "}
                                    {formatOptionBoolean(day.cafeteriaOpen)}
                                  </p>
                                  <p>
                                    自習室:{" "}
                                    {formatOptionBoolean(day.studyHallOpen)}
                                  </p>
                                </div>

                                <div>
                                  <p className="settings-note">行事予定</p>
                                  {events.length === 0 ? (
                                    <p className="settings-note">なし</p>
                                  ) : (
                                    <ul className="common-schedule-events">
                                      {events.map((eventLine, index) => (
                                        <li key={`${dayLabel}-event-${index}`}>
                                          {eventLine}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                <p className="settings-note">
                                  1年: {formatGradeSessions(day.grades[1])}
                                </p>
                                <p className="settings-note">
                                  2年: {formatGradeSessions(day.grades[2])}
                                </p>
                                <p className="settings-note">
                                  3年: {formatGradeSessions(day.grades[3])}
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          {statusMessage && (
            <section className="panel">
              <p>{statusMessage}</p>
            </section>
          )}
        </>
      )}

      {!editingTarget && (
        <SaveDiscardBar
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={() => {
            void saveSchedules();
          }}
          onCancel={() => {
            void loadSchedules(selectedYear, selectedMonth);
          }}
        />
      )}

      {editingContext && (
        <div
          className="common-schedule-editor-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${editingContext.monthLabel}${editingContext.dayNumber}日の予定編集`}
        >
          <button
            type="button"
            className="common-schedule-editor-modal__backdrop"
            onClick={() => {
              setEditingTarget(null);
            }}
            aria-label="編集ポップアップを閉じる"
          />

          <section className="common-schedule-editor-modal__panel">
            <header className="common-schedule-editor-modal__header">
              <div>
                <h3>
                  {editingContext.monthLabel} {editingContext.dayNumber}日(
                  {editingContext.weekdayLabel})
                </h3>
                <p className="settings-note">
                  ここでの編集は保存するまで確定されません。閉じても入力内容は保持されます。
                </p>
              </div>
            </header>

            <div className="common-schedule-editor-modal__body">
              <label className="common-schedule-enabled-toggle">
                <input
                  type="checkbox"
                  checked={editingContext.dayDraft.enabled}
                  disabled={isSaving}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    updateEditingDay((dayDraft) => ({
                      ...dayDraft,
                      enabled: checked,
                    }));
                  }}
                />
                <span>この日の予定を有効化する</span>
              </label>

              <details className="common-schedule-editor-section" open>
                <summary>時程</summary>
                <div className="common-schedule-editor-section__body">
                  <label className="form-field">
                    <FormFieldLabel>開始時刻 (任意)</FormFieldLabel>
                    <input
                      type="time"
                      value={editingContext.dayDraft.startTime}
                      disabled={!editingContext.dayDraft.enabled || isSaving}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        updateEditingDay((dayDraft) => ({
                          ...dayDraft,
                          startTime: nextValue,
                        }));
                      }}
                    />
                  </label>

                  <label className="form-field">
                    <FormFieldLabel required>時程タイプ</FormFieldLabel>
                    <select
                      value={editingContext.dayDraft.shortenedType}
                      disabled={!editingContext.dayDraft.enabled || isSaving}
                      onChange={(event) => {
                        const nextType = event.target
                          .value as DayDraft["shortenedType"];
                        updateEditingDay((dayDraft) => ({
                          ...dayDraft,
                          shortenedType: nextType,
                        }));
                      }}
                    >
                      <option value="common">common.*</option>
                      <option value="special">special</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </label>

                  {editingContext.dayDraft.shortenedType === "common" && (
                    <label className="form-field">
                      <FormFieldLabel required>共通時程</FormFieldLabel>
                      <select
                        value={editingContext.dayDraft.commonBellSchedule}
                        disabled={!editingContext.dayDraft.enabled || isSaving}
                        onChange={(event) => {
                          const nextBell = event.target
                            .value as (typeof COMMON_BELL_OPTIONS)[number];
                          updateEditingDay((dayDraft) => ({
                            ...dayDraft,
                            commonBellSchedule: nextBell,
                          }));
                        }}
                      >
                        {COMMON_BELL_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {editingContext.dayDraft.shortenedType === "special" && (
                    <div className="common-schedule-window-list">
                      <p className="settings-note">
                        特別時程は開始・終了の時刻ペアを複数登録できます。
                      </p>
                      {editingContext.dayDraft.specialWindows.map(
                        (windowDraft, windowIndex) => (
                          <div
                            className="common-schedule-window-row"
                            key={`window-${windowIndex}`}
                          >
                            <label className="form-field">
                              <FormFieldLabel>開始</FormFieldLabel>
                              <input
                                type="time"
                                value={windowDraft.start}
                                disabled={
                                  !editingContext.dayDraft.enabled || isSaving
                                }
                                onChange={(event) => {
                                  const nextStart = event.target.value;
                                  updateEditingDay((dayDraft) => {
                                    const nextWindows =
                                      dayDraft.specialWindows.map(
                                        (windowDraftInner, index) => {
                                          if (index !== windowIndex) {
                                            return {
                                              ...windowDraftInner,
                                            };
                                          }

                                          return {
                                            ...windowDraftInner,
                                            start: nextStart,
                                          };
                                        },
                                      );

                                    return {
                                      ...dayDraft,
                                      specialWindows: nextWindows,
                                    };
                                  });
                                }}
                              />
                            </label>

                            <label className="form-field">
                              <FormFieldLabel>終了</FormFieldLabel>
                              <input
                                type="time"
                                value={windowDraft.end}
                                disabled={
                                  !editingContext.dayDraft.enabled || isSaving
                                }
                                onChange={(event) => {
                                  const nextEnd = event.target.value;
                                  updateEditingDay((dayDraft) => {
                                    const nextWindows =
                                      dayDraft.specialWindows.map(
                                        (windowDraftInner, index) => {
                                          if (index !== windowIndex) {
                                            return {
                                              ...windowDraftInner,
                                            };
                                          }

                                          return {
                                            ...windowDraftInner,
                                            end: nextEnd,
                                          };
                                        },
                                      );

                                    return {
                                      ...dayDraft,
                                      specialWindows: nextWindows,
                                    };
                                  });
                                }}
                              />
                            </label>

                            <button
                              type="button"
                              className="button ghost"
                              disabled={
                                !editingContext.dayDraft.enabled ||
                                isSaving ||
                                editingContext.dayDraft.specialWindows.length <=
                                  1
                              }
                              onClick={() => {
                                updateEditingDay((dayDraft) => {
                                  const nextWindows =
                                    dayDraft.specialWindows.filter(
                                      (_window, index) => index !== windowIndex,
                                    );

                                  return {
                                    ...dayDraft,
                                    specialWindows:
                                      nextWindows.length > 0
                                        ? nextWindows
                                        : [{ start: "", end: "" }],
                                  };
                                });
                              }}
                            >
                              -
                            </button>
                          </div>
                        ),
                      )}

                      <button
                        type="button"
                        className="button ghost"
                        disabled={!editingContext.dayDraft.enabled || isSaving}
                        onClick={() => {
                          updateEditingDay((dayDraft) => ({
                            ...dayDraft,
                            specialWindows: [
                              ...dayDraft.specialWindows.map((windowDraft) => ({
                                ...windowDraft,
                              })),
                              { start: "", end: "" },
                            ],
                          }));
                        }}
                      >
                        + 枠を追加
                      </button>
                    </div>
                  )}

                  {editingContext.dayDraft.shortenedType === "unknown" && (
                    <label className="form-field">
                      <FormFieldLabel>午後開始時限 (任意)</FormFieldLabel>
                      <select
                        value={
                          editingContext.dayDraft.unknownAfternoonStartPeriod
                        }
                        disabled={!editingContext.dayDraft.enabled || isSaving}
                        onChange={(event) => {
                          const nextPeriod = event.target.value;
                          updateEditingDay((dayDraft) => ({
                            ...dayDraft,
                            unknownAfternoonStartPeriod: nextPeriod,
                          }));
                        }}
                      >
                        <option value="">未設定</option>
                        {PERIOD_OPTIONS.map((period) => (
                          <option key={period} value={String(period)}>
                            {period}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </details>

              <details className="common-schedule-editor-section" open>
                <summary>行事予定</summary>
                <div className="common-schedule-editor-section__body">
                  <p className="settings-note">
                    1行につき1つのイベントを入力します。
                  </p>

                  <div className="common-schedule-event-list">
                    {editableEventLines.map((line, lineIndex) => (
                      <div
                        className="common-schedule-event-row"
                        key={`event-line-${lineIndex}`}
                      >
                        <input
                          type="text"
                          value={line}
                          disabled={
                            !editingContext.dayDraft.enabled || isSaving
                          }
                          onChange={(event) => {
                            const nextLine = event.target.value;
                            updateEditingDay((dayDraft) => {
                              const nextLines = toEditableEventLines(
                                dayDraft.eventsText,
                              );
                              nextLines[lineIndex] = nextLine;

                              return {
                                ...dayDraft,
                                eventsText: nextLines.join("\n"),
                              };
                            });
                          }}
                        />

                        <button
                          type="button"
                          className="button ghost"
                          disabled={
                            !editingContext.dayDraft.enabled ||
                            isSaving ||
                            editableEventLines.length <= 1
                          }
                          onClick={() => {
                            updateEditingDay((dayDraft) => {
                              const nextLines = toEditableEventLines(
                                dayDraft.eventsText,
                              );
                              nextLines.splice(lineIndex, 1);
                              if (nextLines.length === 0) {
                                nextLines.push("");
                              }

                              return {
                                ...dayDraft,
                                eventsText: nextLines.join("\n"),
                              };
                            });
                          }}
                        >
                          -
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      className="button ghost"
                      disabled={!editingContext.dayDraft.enabled || isSaving}
                      onClick={() => {
                        updateEditingDay((dayDraft) => {
                          const nextLines = toEditableEventLines(
                            dayDraft.eventsText,
                          );
                          nextLines.push("");

                          return {
                            ...dayDraft,
                            eventsText: nextLines.join("\n"),
                          };
                        });
                      }}
                    >
                      + 行を追加
                    </button>
                  </div>
                </div>
              </details>

              <details className="common-schedule-editor-section" open>
                <summary>解放状況</summary>
                <div className="common-schedule-editor-section__body">
                  <label className="form-field">
                    <FormFieldLabel>食堂</FormFieldLabel>
                    <select
                      value={editingContext.dayDraft.cafeteriaOpen}
                      disabled={!editingContext.dayDraft.enabled || isSaving}
                      onChange={(event) => {
                        const nextValue = event.target
                          .value as OptionalBooleanDraft;
                        updateEditingDay((dayDraft) => ({
                          ...dayDraft,
                          cafeteriaOpen: nextValue,
                        }));
                      }}
                    >
                      <option value="unset">未設定</option>
                      <option value="true">開</option>
                      <option value="false">閉</option>
                    </select>
                  </label>

                  <label className="form-field">
                    <FormFieldLabel>自習室</FormFieldLabel>
                    <select
                      value={editingContext.dayDraft.studyHallOpen}
                      disabled={!editingContext.dayDraft.enabled || isSaving}
                      onChange={(event) => {
                        const nextValue = event.target
                          .value as OptionalBooleanDraft;
                        updateEditingDay((dayDraft) => ({
                          ...dayDraft,
                          studyHallOpen: nextValue,
                        }));
                      }}
                    >
                      <option value="unset">未設定</option>
                      <option value="true">開</option>
                      <option value="false">閉</option>
                    </select>
                  </label>
                </div>
              </details>

              <details className="common-schedule-editor-section" open>
                <summary>授業</summary>
                <div className="common-schedule-editor-section__body">
                  <div
                    className="common-schedule-grade-switch"
                    role="tablist"
                    aria-label="編集対象学年"
                  >
                    {GRADE_KEYS.map((grade) => (
                      <button
                        type="button"
                        role="tab"
                        key={grade}
                        aria-selected={editingGrade === grade}
                        className={editingGrade === grade ? "is-active" : ""}
                        onClick={() => {
                          setEditingGrade(grade);
                        }}
                      >
                        {grade}年
                      </button>
                    ))}
                  </div>

                  <div className="period-editor-list">
                    {currentGradeSessions.map((session, periodIndex) => (
                      <section className="period-editor-row" key={periodIndex}>
                        <div className="period-editor-row__header">
                          <strong>{periodIndex + 1}限</strong>
                        </div>

                        <div className="period-editor-row__grid">
                          <label className="form-field">
                            <FormFieldLabel required>区分</FormFieldLabel>
                            <select
                              value={session.kind}
                              disabled={
                                !editingContext.dayDraft.enabled || isSaving
                              }
                              onChange={(event) => {
                                const nextKind = event.target
                                  .value as SessionDraft["kind"];
                                updateEditingDay((dayDraft) => {
                                  const nextSessions = normalizeSessionDrafts(
                                    dayDraft.grades[editingGrade],
                                  );
                                  const currentSession =
                                    nextSessions[periodIndex];

                                  if (nextKind === "empty") {
                                    nextSessions[periodIndex] =
                                      createEmptySessionDraft();
                                  } else if (nextKind === "normal") {
                                    nextSessions[periodIndex] = {
                                      kind: "normal",
                                      normalDayofweek:
                                        currentSession.kind === "normal"
                                          ? currentSession.normalDayofweek
                                          : 1,
                                      normalPeriod:
                                        currentSession.kind === "normal"
                                          ? currentSession.normalPeriod
                                          : 1,
                                      specialName: "",
                                      specialRoomId: "",
                                    };
                                  } else {
                                    nextSessions[periodIndex] = {
                                      kind: "special",
                                      normalDayofweek: 1,
                                      normalPeriod: 1,
                                      specialName:
                                        currentSession.kind === "special"
                                          ? currentSession.specialName
                                          : "",
                                      specialRoomId:
                                        currentSession.kind === "special"
                                          ? currentSession.specialRoomId
                                          : "",
                                    };
                                  }

                                  return {
                                    ...dayDraft,
                                    grades: {
                                      ...dayDraft.grades,
                                      [editingGrade]: nextSessions,
                                    },
                                  };
                                });
                              }}
                            >
                              <option value="empty">空き</option>
                              <option value="normal">normal</option>
                              <option value="special">special</option>
                            </select>
                          </label>

                          {session.kind === "normal" && (
                            <>
                              <label className="form-field">
                                <FormFieldLabel required>曜日</FormFieldLabel>
                                <select
                                  value={session.normalDayofweek}
                                  disabled={
                                    !editingContext.dayDraft.enabled || isSaving
                                  }
                                  onChange={(event) => {
                                    const nextDay = Number.parseInt(
                                      event.target.value,
                                      10,
                                    );
                                    updateEditingDay((dayDraft) => {
                                      const nextSessions =
                                        normalizeSessionDrafts(
                                          dayDraft.grades[editingGrade],
                                        );
                                      const currentSession =
                                        nextSessions[periodIndex];
                                      if (currentSession.kind !== "normal") {
                                        return dayDraft;
                                      }

                                      nextSessions[periodIndex] = {
                                        ...currentSession,
                                        normalDayofweek: (Number.isInteger(
                                          nextDay,
                                        )
                                          ? nextDay
                                          : currentSession.normalDayofweek) as SessionDraft["normalDayofweek"],
                                      };

                                      return {
                                        ...dayDraft,
                                        grades: {
                                          ...dayDraft.grades,
                                          [editingGrade]: nextSessions,
                                        },
                                      };
                                    });
                                  }}
                                >
                                  {WEEKDAY_OPTIONS.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="form-field">
                                <FormFieldLabel required>コマ</FormFieldLabel>
                                <select
                                  value={session.normalPeriod}
                                  disabled={
                                    !editingContext.dayDraft.enabled || isSaving
                                  }
                                  onChange={(event) => {
                                    const nextPeriod = Number.parseInt(
                                      event.target.value,
                                      10,
                                    );
                                    updateEditingDay((dayDraft) => {
                                      const nextSessions =
                                        normalizeSessionDrafts(
                                          dayDraft.grades[editingGrade],
                                        );
                                      const currentSession =
                                        nextSessions[periodIndex];
                                      if (currentSession.kind !== "normal") {
                                        return dayDraft;
                                      }

                                      nextSessions[periodIndex] = {
                                        ...currentSession,
                                        normalPeriod:
                                          Number.isInteger(nextPeriod) &&
                                          nextPeriod >= 1 &&
                                          nextPeriod <= 7
                                            ? nextPeriod
                                            : currentSession.normalPeriod,
                                      };

                                      return {
                                        ...dayDraft,
                                        grades: {
                                          ...dayDraft.grades,
                                          [editingGrade]: nextSessions,
                                        },
                                      };
                                    });
                                  }}
                                >
                                  {PERIOD_OPTIONS.map((period) => (
                                    <option key={period} value={period}>
                                      {period}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          )}

                          {session.kind === "special" && (
                            <>
                              <label className="form-field">
                                <FormFieldLabel required>授業名</FormFieldLabel>
                                <input
                                  type="text"
                                  value={session.specialName}
                                  disabled={
                                    !editingContext.dayDraft.enabled || isSaving
                                  }
                                  onChange={(event) => {
                                    const nextName = event.target.value;
                                    updateEditingDay((dayDraft) => {
                                      const nextSessions =
                                        normalizeSessionDrafts(
                                          dayDraft.grades[editingGrade],
                                        );
                                      const currentSession =
                                        nextSessions[periodIndex];
                                      if (currentSession.kind !== "special") {
                                        return dayDraft;
                                      }

                                      nextSessions[periodIndex] = {
                                        ...currentSession,
                                        specialName: nextName,
                                      };

                                      return {
                                        ...dayDraft,
                                        grades: {
                                          ...dayDraft.grades,
                                          [editingGrade]: nextSessions,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </label>

                              <div className="form-field">
                                <FormFieldLabel>教室</FormFieldLabel>
                                <RoomPicker
                                  value={session.specialRoomId}
                                  disabled={
                                    !editingContext.dayDraft.enabled || isSaving
                                  }
                                  onChange={(nextRoomId) => {
                                    updateEditingDay((dayDraft) => {
                                      const nextSessions =
                                        normalizeSessionDrafts(
                                          dayDraft.grades[editingGrade],
                                        );
                                      const currentSession =
                                        nextSessions[periodIndex];
                                      if (currentSession.kind !== "special") {
                                        return dayDraft;
                                      }

                                      nextSessions[periodIndex] = {
                                        ...currentSession,
                                        specialRoomId: nextRoomId,
                                      };

                                      return {
                                        ...dayDraft,
                                        grades: {
                                          ...dayDraft.grades,
                                          [editingGrade]: nextSessions,
                                        },
                                      };
                                    });
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </details>
            </div>

            <footer className="common-schedule-editor-modal__footer">
              <p className="common-schedule-editor-modal__hint">
                保存確認バーはポップアップを閉じると表示されます。
              </p>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  setEditingTarget(null);
                }}
              >
                閉じる
              </button>
            </footer>
          </section>
        </div>
      )}

      {dialogMessage && (
        <ErrorDialog
          title="処理に失敗しました"
          message={dialogMessage}
          onClose={() => {
            setDialogMessage(null);
          }}
        />
      )}
    </AppShell>
  );
}
