"use client";

import { api, models } from "@ast24/hmbt-v5-lib";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  executeBatchCalls,
  apiDeleteUsersUserIdIcalGradeFeedsFeedId,
  apiDeleteUsersUserIdIcalPersonalFeedsFeedId,
  apiGetUsersUserId,
  apiGetUsersUserIdIcalGradeFeeds,
  apiGetUsersUserIdIcalPersonalFeeds,
  apiPostUsersUserIdIcalGradeFeeds,
  apiPostUsersUserIdIcalPersonalFeeds,
  apiPostUsersUserIdIcalPersonalFeedsFeedIdRegenerate,
  apiPutUsersUserIdIcalPersonalFeedsFeedId,
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

type FeedScopeType = "personal" | "grade";
type GuideTab = "google" | "apple";

type AnyIcalFeed = models.ical.PersonalIcalFeed | models.ical.GradeIcalFeed;

type AnyIcalFormatType =
  | models.ical.PersonalIcalFeedFormatType
  | models.ical.GradeIcalFeedFormatType;

type FeedDraft = {
  titleTemplate: string;
  descriptionTemplate: string;
  scheduleScope: models.ical.IcalFeedScheduleScopeOption;
  isEnabled: boolean;
};

type CreateDraft = {
  formatType: AnyIcalFormatType;
  titleTemplate: string;
  descriptionTemplate: string;
  scheduleScope: models.ical.IcalFeedScheduleScopeOption;
  isEnabled: boolean;
};

const TIME_DISPLAY_ACCURACY_NOTE =
  "※短縮時程などの影響で、表示時刻が実際とずれる場合があります。";

const FORMAT_LABEL: Record<AnyIcalFormatType, string> = {
  [models.ical.PersonalIcalFeedFormatType.PersonalSessions]:
    "個人予定詳細(1コマ単位)",
  [models.ical.PersonalIcalFeedFormatType.PersonalFullDay]:
    "個人予定概要(1日単位)",
  [models.ical.GradeIcalFeedFormatType.GradeFullDay]: "学年共通予定",
  [models.ical.GradeIcalFeedFormatType.GradeSchoolDay]: "学年共通予定(登校日)",
  [models.ical.GradeIcalFeedFormatType.GradeAfternoonDay]:
    "学年共通予定(午後授業日)",
  [models.ical.GradeIcalFeedFormatType.GradeEvents]: "学年共通予定(行事)",
};

function stripHachimakiBotPrefix(value: string): string {
  return value.replace(/^はちまきBOT\s*/, "").trim();
}

function resolveFeedDisplayTitle(feed: AnyIcalFeed): string {
  const raw = typeof feed.calendar_name === "string" ? feed.calendar_name : "";
  const normalized = stripHachimakiBotPrefix(raw);
  if (normalized.length > 0) {
    return normalized;
  }
  return FORMAT_LABEL[feed.format_type];
}

const UNIFIED_FORMAT_OPTIONS: ReadonlyArray<{
  scopeType: FeedScopeType;
  formatType: AnyIcalFormatType;
}> = [
  {
    scopeType: "personal",
    formatType: models.ical.PersonalIcalFeedFormatType.PersonalSessions,
  },
  {
    scopeType: "personal",
    formatType: models.ical.PersonalIcalFeedFormatType.PersonalFullDay,
  },
  {
    scopeType: "grade",
    formatType: models.ical.GradeIcalFeedFormatType.GradeSchoolDay,
  },
  {
    scopeType: "grade",
    formatType: models.ical.GradeIcalFeedFormatType.GradeAfternoonDay,
  },
  {
    scopeType: "grade",
    formatType: models.ical.GradeIcalFeedFormatType.GradeEvents,
  },
];

const SCHEDULE_SCOPE_LABEL: Record<
  models.ical.IcalFeedScheduleScopeOption,
  string
> = {
  [models.ical.IcalFeedScheduleScopeOption.All]: "すべて",
  [models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly]:
    "時間割と不一致のコマだけ",
  [models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly]:
    "時間割と不一致のコマがある日だけ",
};

function isPersonalFeed(
  feed: AnyIcalFeed,
): feed is models.ical.PersonalIcalFeed {
  return "owner_user_id" in feed;
}

function isPersonalFormat(
  formatType: AnyIcalFormatType,
): formatType is models.ical.PersonalIcalFeedFormatType {
  return (
    formatType === models.ical.PersonalIcalFeedFormatType.PersonalSessions ||
    formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay
  );
}

function normalizeGrade(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }
  const grade = Number(value);
  if (grade < 1 || grade > 3) {
    return null;
  }
  return grade;
}

function scopeTypeFromFormat(formatType: AnyIcalFormatType): FeedScopeType {
  return isPersonalFormat(formatType) ? "personal" : "grade";
}

function resolveDefaultTemplates(formatType: AnyIcalFormatType): {
  title: string;
  description: string;
} {
  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay) {
    return {
      title: models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_TITLE_TEMPLATE,
      description:
        models.ical.PERSONAL_ICAL_FULL_DAY_DEFAULT_DESCRIPTION_TEMPLATE,
    };
  }

  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalSessions) {
    return {
      title: models.ical.PERSONAL_ICAL_DEFAULT_TITLE_TEMPLATE,
      description: models.ical.PERSONAL_ICAL_DEFAULT_DESCRIPTION_TEMPLATE,
    };
  }

  return {
    title: "",
    description: "",
  };
}

function resolveScheduleScopeChoices(
  formatType: AnyIcalFormatType,
): models.ical.IcalFeedScheduleScopeOption[] {
  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalSessions) {
    return [
      models.ical.IcalFeedScheduleScopeOption.All,
      models.ical.IcalFeedScheduleScopeOption.MismatchSessionsOnly,
      models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly,
    ];
  }

  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay) {
    return [
      models.ical.IcalFeedScheduleScopeOption.All,
      models.ical.IcalFeedScheduleScopeOption.DaysWithMismatchOnly,
    ];
  }

  return [models.ical.IcalFeedScheduleScopeOption.All];
}

function resolveValidScheduleScope(
  formatType: AnyIcalFormatType,
  scope: models.ical.IcalFeedScheduleScopeOption,
): models.ical.IcalFeedScheduleScopeOption {
  const choices = resolveScheduleScopeChoices(formatType);
  return choices.includes(scope) ? scope : choices[0];
}

function resolvePersonalTitleTemplateCandidates(
  formatType: models.ical.PersonalIcalFeedFormatType,
): readonly string[] {
  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay) {
    return models.ical.PERSONAL_ICAL_FULL_DAY_TITLE_TEMPLATE_CANDIDATES;
  }

  return models.ical.PERSONAL_ICAL_TITLE_TEMPLATE_CANDIDATES;
}

function resolvePersonalDescriptionTemplateCandidates(
  formatType: models.ical.PersonalIcalFeedFormatType,
): readonly string[] {
  if (formatType === models.ical.PersonalIcalFeedFormatType.PersonalFullDay) {
    return models.ical.PERSONAL_ICAL_FULL_DAY_DESCRIPTION_TEMPLATE_CANDIDATES;
  }

  return models.ical.PERSONAL_ICAL_DESCRIPTION_TEMPLATE_CANDIDATES;
}

function toFeedDraft(feed: AnyIcalFeed): FeedDraft {
  if (isPersonalFeed(feed)) {
    const defaults = resolveDefaultTemplates(feed.format_type);
    const titleTemplate =
      typeof feed.title_template === "string" &&
      feed.title_template.trim().length > 0
        ? feed.title_template
        : defaults.title;
    const descriptionTemplate =
      typeof feed.description_template === "string" &&
      feed.description_template.trim().length > 0
        ? feed.description_template
        : defaults.description;

    return {
      titleTemplate,
      descriptionTemplate,
      scheduleScope: resolveValidScheduleScope(
        feed.format_type,
        feed.options.schedule_scope,
      ),
      isEnabled: feed.is_enabled,
    };
  }

  return {
    titleTemplate:
      typeof feed.title_template === "string" ? feed.title_template : "",
    descriptionTemplate:
      typeof feed.description_template === "string"
        ? feed.description_template
        : "",
    scheduleScope: models.ical.IcalFeedScheduleScopeOption.All,
    isEnabled: feed.is_enabled,
  };
}

function parseDateLike(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function formatDateTime(value: unknown): string {
  const parsed = parseDateLike(value);
  if (!parsed) {
    return "未生成";
  }
  return parsed.toLocaleString("ja-JP");
}

function resolveErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒認証が必要です。認証設定を確認してください。";
    case api.errors.IcalFeedErrorCode.InvalidCalendarName:
      return "カレンダー名が不正です。1〜120文字で入力してください。";
    case api.errors.IcalFeedErrorCode.InvalidTemplate:
      return "予定タイトルまたは予定本文の形式が不正です。";
    case api.errors.IcalFeedErrorCode.InvalidFormatType:
      return "配信フォーマットの指定が不正です。";
    case api.errors.IcalFeedErrorCode.InvalidScopeType:
      return "配信対象の指定が不正です。";
    case api.errors.IcalFeedErrorCode.InvalidTargetGrade:
      return "学年の指定が不正です。";
    case api.errors.IcalFeedErrorCode.FeedNotFound:
      return "指定されたカレンダーURL(iCal)が見つかりません。";
    case api.errors.IcalFeedErrorCode.FeedForbidden:
      return "このカレンダーURL(iCal)にはアクセスできません。";
    case api.errors.IcalFeedErrorCode.FeedStorageNotConfigured:
      return "iCalストレージ設定が未完了です。管理者に連絡してください。";
    case api.errors.IcalFeedErrorCode.FeedGenerationFailed:
      return "カレンダーURL(iCal)の生成に失敗しました。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export function IcalSettingsView() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userGrade, setUserGrade] = useState<number | null>(null);
  const [feeds, setFeeds] = useState<AnyIcalFeed[]>([]);
  const [feedDrafts, setFeedDrafts] = useState<Record<number, FeedDraft>>({});
  const [pageError, setPageError] = useState<ApiErrorInfo | null>(null);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [busyFeedId, setBusyFeedId] = useState<number | null>(null);
  const [deleteTargetFeed, setDeleteTargetFeed] = useState<AnyIcalFeed | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [guideTab, setGuideTab] = useState<GuideTab>("google");
  const [isVariableDialogOpen, setIsVariableDialogOpen] =
    useState<boolean>(false);

  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    formatType: models.ical.PersonalIcalFeedFormatType.PersonalSessions,
    titleTemplate: models.ical.PERSONAL_ICAL_DEFAULT_TITLE_TEMPLATE,
    descriptionTemplate: models.ical.PERSONAL_ICAL_DEFAULT_DESCRIPTION_TEMPLATE,
    scheduleScope: models.ical.IcalFeedScheduleScopeOption.All,
    isEnabled: true,
  });

  const loadFeeds = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);

    const batchResults = await executeBatchCalls([
      {
        key: "user",
        endpoint:
          api.endpoints.API_ENDPOINTS[api.endpoints.APIEndpoint.UsersUserIdGet],
        pathParams: { userId: "me" },
        fallbackMessage: "ユーザ情報の取得に失敗しました",
        stubCall: () => apiGetUsersUserId("me"),
      },
      {
        key: "personal-feeds",
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalPersonalFeedsGet
          ],
        pathParams: { userId: "me" },
        fallbackMessage: "個人カレンダーURL(iCal)の取得に失敗しました",
        stubCall: () => apiGetUsersUserIdIcalPersonalFeeds("me"),
      },
      {
        key: "grade-feeds",
        endpoint:
          api.endpoints.API_ENDPOINTS[
            api.endpoints.APIEndpoint.UsersUserIdIcalGradeFeedsGet
          ],
        pathParams: { userId: "me" },
        fallbackMessage: "学年カレンダーURL(iCal)の取得に失敗しました",
        stubCall: () => apiGetUsersUserIdIcalGradeFeeds("me"),
      },
    ]);

    const userResult = pickBatchResult<
      api.endpoints.ApiUsersUserIdGetRes,
      api.endpoints.ApiUsersUserIdGetErr
    >(batchResults, "user", "ユーザ情報の取得に失敗しました");
    const personalResult = pickBatchResult<
      api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetRes,
      api.endpoints.ApiUsersUserIdIcalPersonalFeedsGetErr
    >(
      batchResults,
      "personal-feeds",
      "個人カレンダーURL(iCal)の取得に失敗しました",
    );
    const gradeResult = pickBatchResult<
      api.endpoints.ApiUsersUserIdIcalGradeFeedsGetRes,
      api.endpoints.ApiUsersUserIdIcalGradeFeedsGetErr
    >(
      batchResults,
      "grade-feeds",
      "学年カレンダーURL(iCal)の取得に失敗しました",
    );

    if (
      isNoAuthApiResult(userResult) ||
      isNoAuthApiResult(personalResult) ||
      isNoAuthApiResult(gradeResult)
    ) {
      router.replace("/login");
      return;
    }

    if (userResult.type !== "success") {
      const apiError = handleApiError(userResult);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.replace(buildFatalErrorPageHref(apiError));
        return;
      }

      setPageError(
        apiError ?? {
          type: "network_error",
          message: "ユーザ情報の取得に失敗しました",
        },
      );
      setIsLoading(false);
      return;
    }

    if (personalResult.type !== "success" || gradeResult.type !== "success") {
      const failedResult =
        personalResult.type !== "success" ? personalResult : gradeResult;
      const apiError = handleApiError(failedResult);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.replace(buildFatalErrorPageHref(apiError));
        return;
      }

      setPageError(
        apiError
          ? {
              ...apiError,
              message: resolveErrorMessage(
                apiError.code,
                apiError.message ?? "カレンダーURL(iCal)の取得に失敗しました",
              ),
            }
          : {
              type: "network_error",
              message: "カレンダーURL(iCal)の取得に失敗しました",
            },
      );
      setIsLoading(false);
      return;
    }

    setUserGrade(normalizeGrade(userResult.data.user_info.grade));

    const mergedFeeds = [
      ...personalResult.data.feeds,
      ...gradeResult.data.feeds,
    ]
      .slice()
      .sort((left, right) => right.id - left.id);

    setFeeds(mergedFeeds);
    const nextDrafts: Record<number, FeedDraft> = {};
    mergedFeeds.forEach((feed) => {
      nextDrafts[feed.id] = toFeedDraft(feed);
    });
    setFeedDrafts(nextDrafts);

    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFeeds();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadFeeds]);

  useEffect(() => {
    if (!isVariableDialogOpen) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isVariableDialogOpen]);

  const createScopeType = scopeTypeFromFormat(createDraft.formatType);
  const createScheduleScopeChoices = resolveScheduleScopeChoices(
    createDraft.formatType,
  );
  const createPersonalFormatType = isPersonalFormat(createDraft.formatType)
    ? createDraft.formatType
    : null;
  const createTitleTemplateCandidates = createPersonalFormatType
    ? resolvePersonalTitleTemplateCandidates(createPersonalFormatType)
    : [];
  const createDescriptionTemplateCandidates = createPersonalFormatType
    ? resolvePersonalDescriptionTemplateCandidates(createPersonalFormatType)
    : [];

  const canCreate = useMemo(() => {
    if (createScopeType === "grade") {
      return userGrade !== null;
    }
    return true;
  }, [createScopeType, userGrade]);

  const createFeed = async () => {
    if (!canCreate) {
      setDialogMessage("必須項目を入力してください。");
      return;
    }

    setIsCreating(true);

    const result =
      createScopeType === "personal"
        ? await (() => {
            const formatType =
              createDraft.formatType as models.ical.PersonalIcalFeedFormatType;
            return apiPostUsersUserIdIcalPersonalFeeds("me", {
              format_type: formatType,
              calendar_name:
                models.ical.resolvePersonalIcalCalendarName(formatType),
              title_template: createDraft.titleTemplate.trim() || null,
              description_template:
                createDraft.descriptionTemplate.trim() || null,
              options: {
                schedule_scope: resolveValidScheduleScope(
                  formatType,
                  createDraft.scheduleScope,
                ),
              },
              is_enabled: createDraft.isEnabled,
            });
          })()
        : await (() => {
            const formatType =
              createDraft.formatType as models.ical.GradeIcalFeedFormatType;
            return apiPostUsersUserIdIcalGradeFeeds("me", {
              target_grade: userGrade as number,
              format_type: formatType,
              calendar_name: models.ical.resolveGradeIcalCalendarName(
                userGrade as number,
                formatType,
              ),
              title_template: null,
              description_template: null,
              options: {
                schedule_scope: models.ical.IcalFeedScheduleScopeOption.All,
              },
              is_enabled: true,
            });
          })();

    if (isNoAuthApiResult(result)) {
      setIsCreating(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsCreating(false);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setDialogMessage(
        resolveErrorMessage(
          apiError?.code,
          apiError?.message ?? "カレンダーURL(iCal)の発行に失敗しました",
        ),
      );
      return;
    }

    setCreateDraft((prev) => ({
      ...prev,
      titleTemplate: resolveDefaultTemplates(prev.formatType).title,
      descriptionTemplate: resolveDefaultTemplates(prev.formatType).description,
      scheduleScope: resolveValidScheduleScope(
        prev.formatType,
        prev.scheduleScope,
      ),
    }));
    setIsCreating(false);
    await loadFeeds();
  };

  const savePersonalFeed = async (feed: models.ical.PersonalIcalFeed) => {
    const draft = feedDrafts[feed.id];
    if (!draft) {
      return;
    }

    setBusyFeedId(feed.id);

    const result = await apiPutUsersUserIdIcalPersonalFeedsFeedId(
      "me",
      feed.id,
      {
        calendar_name: models.ical.resolvePersonalIcalCalendarName(
          feed.format_type,
        ),
        title_template: draft.titleTemplate.trim() || null,
        description_template: draft.descriptionTemplate.trim() || null,
        options: {
          schedule_scope: resolveValidScheduleScope(
            feed.format_type,
            draft.scheduleScope,
          ),
        },
        is_enabled: draft.isEnabled,
      },
    );

    if (isNoAuthApiResult(result)) {
      setBusyFeedId(null);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setBusyFeedId(null);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setDialogMessage(
        resolveErrorMessage(
          apiError?.code,
          apiError?.message ?? "カレンダーURL(iCal)の更新に失敗しました",
        ),
      );
      return;
    }

    setBusyFeedId(null);
    await loadFeeds();
  };

  const regeneratePersonalFeed = async (feed: models.ical.PersonalIcalFeed) => {
    setBusyFeedId(feed.id);
    const result = await apiPostUsersUserIdIcalPersonalFeedsFeedIdRegenerate(
      "me",
      feed.id,
    );

    if (isNoAuthApiResult(result)) {
      setBusyFeedId(null);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setBusyFeedId(null);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setDialogMessage(
        resolveErrorMessage(
          apiError?.code,
          apiError?.message ?? "カレンダーURL(iCal)の再生成に失敗しました",
        ),
      );
      return;
    }

    setBusyFeedId(null);
    await loadFeeds();
  };

  const deleteFeed = async (feed: AnyIcalFeed) => {
    setBusyFeedId(feed.id);
    const result = isPersonalFeed(feed)
      ? await apiDeleteUsersUserIdIcalPersonalFeedsFeedId("me", feed.id)
      : await apiDeleteUsersUserIdIcalGradeFeedsFeedId("me", feed.id);

    if (isNoAuthApiResult(result)) {
      setBusyFeedId(null);
      setDeleteTargetFeed(null);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setBusyFeedId(null);
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        setDeleteTargetFeed(null);
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setDialogMessage(
        resolveErrorMessage(
          apiError?.code,
          apiError?.message ?? "カレンダーURL(iCal)の削除に失敗しました",
        ),
      );
      return;
    }

    setBusyFeedId(null);
    setDeleteTargetFeed(null);
    await loadFeeds();
  };

  const copyPublicUrl = async (publicUrl: string) => {
    if (!navigator.clipboard?.writeText) {
      setDialogMessage("この環境ではURLコピーに対応していません。");
      return;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      setDialogMessage("URLのコピーに失敗しました。手動でコピーしてください。");
    }
  };

  const copyVariable = async (variable: string) => {
    if (!navigator.clipboard?.writeText) {
      setDialogMessage("この環境ではコピーに対応していません。");
      return;
    }

    try {
      await navigator.clipboard.writeText(variable);
      setCopiedVariable(variable);
      window.setTimeout(() => {
        setCopiedVariable((prev) => (prev === variable ? null : prev));
      }, 1300);
    } catch {
      setDialogMessage(
        "変数のコピーに失敗しました。手動でコピーしてください。",
      );
    }
  };

  return (
    <>
      {isLoading && (
        <LoadingRacePanel message="外部カレンダー連携を読み込み中..." />
      )}

      {!isLoading && pageError && (
        <section className="panel panel-error">
          <h2>外部カレンダー連携の読み込みに失敗しました</h2>
          <p>{pageError.message}</p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void loadFeeds();
            }}
          >
            再試行
          </button>
        </section>
      )}

      {!isLoading && !pageError && (
        <>
          <section className="panel settings-card">
            <details className="ical-guide">
              <summary>連携方法</summary>
              <div className="ical-guide__body">
                <div
                  className="ical-guide__tabs"
                  role="tablist"
                  aria-label="連携方法の切替"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={guideTab === "google"}
                    className={`ical-guide__tab ${guideTab === "google" ? "is-active" : ""}`}
                    onClick={() => {
                      setGuideTab("google");
                    }}
                  >
                    Googleカレンダー
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={guideTab === "apple"}
                    className={`ical-guide__tab ${guideTab === "apple" ? "is-active" : ""}`}
                    onClick={() => {
                      setGuideTab("apple");
                    }}
                  >
                    Appleカレンダー
                  </button>
                </div>

                {guideTab === "google" ? (
                  <ol className="ical-guide__steps">
                    <li>
                      1. 発行済みの<span>カレンダーURL(iCal)</span>
                      をコピーします。
                    </li>
                    <li>2. PCのWeb版でGoogleカレンダーの設定を開きます。</li>
                    <li>
                      3. 「カレンダーを追加」から「URLで追加」を選びます。
                    </li>
                    <li>
                      4. コピーした<span>カレンダーURL(iCal)</span>
                      を貼り付けて追加します。
                    </li>
                    <li>
                      5.
                      スマホでGoogleカレンダーの設定を開いて該当カレンダーの同期をONにします。
                    </li>
                    <li>
                      6.
                      カレンダー画面へ戻ってサイドバーから該当カレンダーを表示ONにします。
                    </li>
                  </ol>
                ) : (
                  <ol className="ical-guide__steps">
                    <li>
                      1. 発行済みの<span>カレンダーURL(iCal)</span>
                      をコピーします。
                    </li>
                    <li>
                      2. カレンダー設定から「購読カレンダーを追加」を選びます。
                    </li>
                    <li>
                      3. コピーした<span>カレンダーURL(iCal)</span>
                      を貼り付けて保存します。
                    </li>
                    <li>
                      ※開発者はAndroid勢なので間違っている可能性があります。
                    </li>
                    <li>正しい方法をご存知の方は教えてください！</li>
                  </ol>
                )}
              </div>
            </details>
          </section>

          <section className="panel settings-card">
            <h2>新しいカレンダーURL(iCal)を発行</h2>
            <p className="settings-note">
              発行したURLを外部カレンダーに購読登録できます。個人形式では予定タイトル・予定本文のカスタムが可能です。
            </p>

            <div className="settings-form">
              <label className="form-field">
                <FormFieldLabel required>配信フォーマット</FormFieldLabel>
                <select
                  value={createDraft.formatType}
                  onChange={(event) => {
                    const nextFormat = event.target.value as AnyIcalFormatType;
                    const defaults = resolveDefaultTemplates(nextFormat);
                    setCreateDraft((prev) => ({
                      ...prev,
                      formatType: nextFormat,
                      titleTemplate: defaults.title,
                      descriptionTemplate: defaults.description,
                      scheduleScope: resolveValidScheduleScope(
                        nextFormat,
                        prev.scheduleScope,
                      ),
                    }));
                  }}
                >
                  {UNIFIED_FORMAT_OPTIONS.map((option) => (
                    <option key={option.formatType} value={option.formatType}>
                      {FORMAT_LABEL[option.formatType]}
                    </option>
                  ))}
                </select>
              </label>

              {createDraft.formatType ===
                models.ical.PersonalIcalFeedFormatType.PersonalSessions && (
                <p className="settings-note">{TIME_DISPLAY_ACCURACY_NOTE}</p>
              )}

              {createScopeType === "personal" && (
                <div className="hero-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      setIsVariableDialogOpen(true);
                    }}
                  >
                    使える変数
                  </button>
                </div>
              )}

              {createScopeType === "personal" ? (
                <>
                  <label className="form-field">
                    <FormFieldLabel required>予定タイトル</FormFieldLabel>
                    <input
                      type="text"
                      list="ical-title-template-candidates"
                      value={createDraft.titleTemplate}
                      onChange={(event) => {
                        setCreateDraft((prev) => ({
                          ...prev,
                          titleTemplate: event.target.value,
                        }));
                      }}
                    />
                  </label>

                  <label className="form-field">
                    <FormFieldLabel required>予定本文</FormFieldLabel>
                    <textarea
                      rows={4}
                      value={createDraft.descriptionTemplate}
                      onChange={(event) => {
                        setCreateDraft((prev) => ({
                          ...prev,
                          descriptionTemplate: event.target.value,
                        }));
                      }}
                    />
                  </label>

                  <label className="form-field">
                    <FormFieldLabel required>含める予定</FormFieldLabel>
                    <select
                      value={resolveValidScheduleScope(
                        createDraft.formatType,
                        createDraft.scheduleScope,
                      )}
                      onChange={(event) => {
                        setCreateDraft((prev) => ({
                          ...prev,
                          scheduleScope: resolveValidScheduleScope(
                            prev.formatType,
                            event.target
                              .value as models.ical.IcalFeedScheduleScopeOption,
                          ),
                        }));
                      }}
                    >
                      {createScheduleScopeChoices.map((scope) => (
                        <option key={scope} value={scope}>
                          {SCHEDULE_SCOPE_LABEL[scope]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <datalist id="ical-title-template-candidates">
                    {createTitleTemplateCandidates.map((candidate) => (
                      <option key={candidate} value={candidate} />
                    ))}
                  </datalist>

                  <datalist id="ical-description-template-candidates">
                    {createDescriptionTemplateCandidates.map((candidate) => (
                      <option key={candidate} value={candidate} />
                    ))}
                  </datalist>
                </>
              ) : (
                <>
                  <p className="settings-note">
                    学年共通は自分の学年
                    {userGrade === null ? "(未設定)" : `(${userGrade}年)`}
                    固定です。予定タイトル・予定本文は編集できません。
                  </p>
                </>
              )}

              {createScopeType === "personal" ? (
                <label className="form-check">
                  <input
                    type="checkbox"
                    checked={createDraft.isEnabled}
                    onChange={(event) => {
                      setCreateDraft((prev) => ({
                        ...prev,
                        isEnabled: event.target.checked,
                      }));
                    }}
                  />
                  作成後に即時生成する
                </label>
              ) : (
                <p className="settings-note">
                  学年共通は常に即時生成されます（既存がある場合は新規発行されません）。
                </p>
              )}

              <div className="hero-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={!canCreate || isCreating}
                  onClick={() => {
                    void createFeed();
                  }}
                >
                  {isCreating ? "発行中..." : "カレンダーURL(iCal)を発行"}
                </button>
              </div>
            </div>
          </section>

          <section className="panel settings-card">
            <h2>発行済みカレンダーURL(iCal)</h2>

            {feeds.length === 0 && (
              <p className="settings-note">
                まだカレンダーURL(iCal)は発行されていません。
              </p>
            )}

            <div className="ical-feed-list">
              {feeds.map((feed) => {
                const draft = feedDrafts[feed.id] ?? toFeedDraft(feed);
                const isBusy = busyFeedId === feed.id;
                const personal = isPersonalFeed(feed);
                const personalTitleCandidates = personal
                  ? resolvePersonalTitleTemplateCandidates(feed.format_type)
                  : [];
                const personalScheduleScopeChoices = personal
                  ? resolveScheduleScopeChoices(feed.format_type)
                  : [];
                return (
                  <article
                    key={feed.id}
                    className="settings-form ical-feed-item"
                  >
                    <h3>{resolveFeedDisplayTitle(feed)}</h3>

                    <label className="form-field">
                      <FormFieldLabel required>URL</FormFieldLabel>
                      <div className="ical-url-field">
                        <input
                          type="text"
                          value={feed.public_url}
                          readOnly
                          onFocus={(event) => {
                            event.currentTarget.select();
                          }}
                        />
                        <button
                          type="button"
                          className="button ghost"
                          disabled={isBusy}
                          onClick={() => {
                            void copyPublicUrl(feed.public_url);
                          }}
                        >
                          コピー
                        </button>
                      </div>
                    </label>

                    {feed.generation_error && (
                      <p className="settings-note">
                        最終生成エラー: {feed.generation_error}
                      </p>
                    )}

                    <p className="settings-note">
                      最終生成: {formatDateTime(feed.last_generated_at)} /
                      最終更新: {formatDateTime(feed.updated_at)}
                    </p>

                    {personal ? (
                      <>
                        <div className="hero-actions">
                          <button
                            type="button"
                            className="button ghost"
                            onClick={() => {
                              setIsVariableDialogOpen(true);
                            }}
                          >
                            使える変数
                          </button>
                        </div>

                        <label className="form-field">
                          <FormFieldLabel required>予定タイトル</FormFieldLabel>
                          <input
                            type="text"
                            list={`ical-title-template-candidates-${feed.id}`}
                            value={draft.titleTemplate}
                            onChange={(event) => {
                              setFeedDrafts((prev) => ({
                                ...prev,
                                [feed.id]: {
                                  ...draft,
                                  titleTemplate: event.target.value,
                                },
                              }));
                            }}
                          />
                        </label>

                        <label className="form-field">
                          <FormFieldLabel required>予定本文</FormFieldLabel>
                          <textarea
                            rows={4}
                            value={draft.descriptionTemplate}
                            onChange={(event) => {
                              setFeedDrafts((prev) => ({
                                ...prev,
                                [feed.id]: {
                                  ...draft,
                                  descriptionTemplate: event.target.value,
                                },
                              }));
                            }}
                          />
                        </label>

                        <label className="form-field">
                          <FormFieldLabel required>含める予定</FormFieldLabel>
                          <select
                            value={resolveValidScheduleScope(
                              feed.format_type,
                              draft.scheduleScope,
                            )}
                            onChange={(event) => {
                              setFeedDrafts((prev) => ({
                                ...prev,
                                [feed.id]: {
                                  ...draft,
                                  scheduleScope: resolveValidScheduleScope(
                                    feed.format_type,
                                    event.target
                                      .value as models.ical.IcalFeedScheduleScopeOption,
                                  ),
                                },
                              }));
                            }}
                          >
                            {personalScheduleScopeChoices.map((scope) => (
                              <option key={scope} value={scope}>
                                {SCHEDULE_SCOPE_LABEL[scope]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <datalist
                          id={`ical-title-template-candidates-${feed.id}`}
                        >
                          {personalTitleCandidates.map((candidate) => (
                            <option key={candidate} value={candidate} />
                          ))}
                        </datalist>

                        <label className="form-check">
                          <input
                            type="checkbox"
                            checked={draft.isEnabled}
                            onChange={(event) => {
                              setFeedDrafts((prev) => ({
                                ...prev,
                                [feed.id]: {
                                  ...draft,
                                  isEnabled: event.target.checked,
                                },
                              }));
                            }}
                          />
                          有効化
                        </label>

                        <div className="hero-actions">
                          <button
                            type="button"
                            className="button primary"
                            disabled={isBusy}
                            onClick={() => {
                              void savePersonalFeed(feed);
                            }}
                          >
                            {isBusy ? "保存中..." : "保存"}
                          </button>

                          <button
                            type="button"
                            className="button ghost"
                            disabled={isBusy || !draft.isEnabled}
                            onClick={() => {
                              void regeneratePersonalFeed(feed);
                            }}
                          >
                            再生成
                          </button>

                          <button
                            type="button"
                            className="button danger"
                            disabled={isBusy}
                            onClick={() => {
                              setDeleteTargetFeed(feed);
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="hero-actions">
                          <button
                            type="button"
                            className="button danger"
                            disabled={isBusy}
                            onClick={() => {
                              setDeleteTargetFeed(feed);
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {dialogMessage && (
        <ErrorDialog
          message={dialogMessage}
          onClose={() => {
            setDialogMessage(null);
          }}
        />
      )}

      {deleteTargetFeed && (
        <div
          className="error-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="iCal削除確認"
        >
          <button
            type="button"
            className="error-dialog__backdrop"
            aria-label="削除確認を閉じる"
            onClick={() => {
              if (busyFeedId === deleteTargetFeed.id) {
                return;
              }
              setDeleteTargetFeed(null);
            }}
          />
          <section className="error-dialog__panel">
            <header className="error-dialog__header">
              <h3>カレンダーURL(iCal)を削除しますか？</h3>
            </header>
            <p className="error-dialog__message">
              {isPersonalFeed(deleteTargetFeed)
                ? "この個人カレンダーURL(iCal)を削除します。"
                : "この学年共通カレンダーURL(iCal)を削除します。"}
            </p>
            <div className="error-dialog__actions">
              <button
                type="button"
                className="button ghost"
                disabled={busyFeedId === deleteTargetFeed.id}
                onClick={() => {
                  setDeleteTargetFeed(null);
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="button danger"
                disabled={busyFeedId === deleteTargetFeed.id}
                onClick={() => {
                  void deleteFeed(deleteTargetFeed);
                }}
              >
                {busyFeedId === deleteTargetFeed.id ? "削除中..." : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}

      {isVariableDialogOpen && (
        <div
          className="error-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="使える変数"
        >
          <button
            type="button"
            className="error-dialog__backdrop"
            aria-label="使える変数ダイアログを閉じる"
            onClick={() => {
              setIsVariableDialogOpen(false);
            }}
          />
          <section className="error-dialog__panel ical-variable-dialog__panel">
            <button
              type="button"
              className="error-dialog__close"
              aria-label="閉じる"
              onClick={() => {
                setIsVariableDialogOpen(false);
              }}
            >
              ×
            </button>
            <header className="error-dialog__header">
              <h3>使える変数</h3>
            </header>
            <p className="settings-note">
              個人形式の予定タイトル・予定本文で利用できます。
            </p>
            <div className="ical-variable-dialog__body">
              <ul className="ical-variable-list">
                {models.ical.PERSONAL_ICAL_TEMPLATE_VARIABLES.map((item) => (
                  <li key={item.variable}>
                    <div className="ical-variable-list__row">
                      <code>{item.variable}</code>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => {
                          void copyVariable(item.variable);
                        }}
                      >
                        {copiedVariable === item.variable
                          ? "コピー済み"
                          : "コピー"}
                      </button>
                    </div>
                    <span>{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="error-dialog__actions">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setIsVariableDialogOpen(false);
                }}
              >
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
