"use client";

import { api, cmn } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SaveDiscardBar } from "@/shared/components/save-discard-bar";
import {
  apiGetUsersUserId,
  apiPutUsersUserId,
  buildFatalErrorPageHref,
  handleApiError,
  isValidationApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { AppShell } from "@/shared/layout/app-shell";

type ProfileDraft = {
  name: string;
  grade: number | null;
  homeclass: number | null;
};

type ProfileFieldErrors = Partial<
  Record<"name" | "grade" | "homeclass", string>
>;

export type ProfileSettingsViewProps = {
  reloadOnSave?: boolean;
  onSaved?: () => void;
  onCompletionChange?: (completed: boolean) => void;
};

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

function normalizeHomeclass(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const homeclass = Number(value);
  if (homeclass < 1 || homeclass > 6) {
    return null;
  }

  return homeclass;
}

function isProfileComplete(draft: ProfileDraft | null): boolean {
  if (!draft) {
    return false;
  }

  return (
    normalizeGrade(draft.grade) !== null &&
    normalizeHomeclass(draft.homeclass) !== null
  );
}

function resolveProfileLoadErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィール情報が未設定です。必要項目を入力してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "プロフィール情報が見つかりませんでした。再読み込みして再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveProfileSaveErrorMessage(
  code: string | undefined,
  fallbackMessage: string,
): string {
  switch (code) {
    case api.errors.UsersUserIdPutErrorCode.InvalidName:
      return "表示名の形式が不正です。入力内容を確認してください。";
    case api.errors.UsersUserIdPutErrorCode.InvalidGrade:
      return "学年の値が不正です。入力内容を確認してください。";
    case api.errors.UsersUserIdPutErrorCode.InvalidHomeclass:
      return "クラスの値が不正です。入力内容を確認してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ResourceNotFound:
      return "更新対象のユーザ情報が見つかりませんでした。再読み込みして再試行してください。";
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

export function ProfileSettingsView({
  reloadOnSave = true,
  onSaved,
  onCompletionChange,
}: ProfileSettingsViewProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<ApiErrorInfo | null>(null);
  const [saveErrorDialog, setSaveErrorDialog] = useState<string | null>(null);
  const [saveFieldErrors, setSaveFieldErrors] = useState<ProfileFieldErrors>(
    {},
  );
  const [originalDraft, setOriginalDraft] = useState<ProfileDraft | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSaveErrorDialog(null);

    const result = await apiGetUsersUserId("me");
    if (isNoAuthApiResult(result)) {
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      const message = resolveProfileLoadErrorMessage(
        result.type === "http_error" ? result.error.code : apiError?.code,
        apiError?.message ?? "登録情報の取得に失敗しました",
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

    const nextDraft: ProfileDraft = {
      name: result.data.user_info.name.mapOr("", (value) => value),
      grade: normalizeGrade(result.data.user_info.grade),
      homeclass: normalizeHomeclass(result.data.user_info.homeclass),
    };

    setOriginalDraft(nextDraft);
    setDraft(nextDraft);
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
    onCompletionChange?.(isProfileComplete(draft));
  }, [draft, onCompletionChange]);

  const isDirty = useMemo(() => {
    if (!originalDraft || !draft) {
      return false;
    }

    return (
      originalDraft.name !== draft.name ||
      originalDraft.grade !== draft.grade ||
      originalDraft.homeclass !== draft.homeclass
    );
  }, [draft, originalDraft]);

  const saveProfile = async () => {
    if (!draft) {
      return;
    }

    const normalizedName = draft.name.trim();
    const normalizedGrade = normalizeGrade(draft.grade);
    const normalizedHomeclass = normalizeHomeclass(draft.homeclass);

    setIsSaving(true);
    setSaveErrorDialog(null);
    setSaveFieldErrors({});

    const requiredFieldErrors: ProfileFieldErrors = {};
    if (normalizedGrade === null) {
      requiredFieldErrors.grade = "学年は必須です。";
    }
    if (normalizedHomeclass === null) {
      requiredFieldErrors.homeclass = "クラスは必須です。";
    }
    if (Object.keys(requiredFieldErrors).length > 0) {
      setIsSaving(false);
      setSaveFieldErrors(requiredFieldErrors);
      return;
    }

    const result = await apiPutUsersUserId("me", {
      user_info: {
        name: normalizedName ? cmn.Some(normalizedName) : cmn.None<string>(),
        grade: normalizedGrade,
        homeclass: normalizedHomeclass,
      },
    });

    if (isNoAuthApiResult(result)) {
      setIsSaving(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSaving(false);

      if (isValidationApiError(apiError)) {
        setSaveFieldErrors({
          name: apiError.fieldErrors.name,
          grade: apiError.fieldErrors.grade,
          homeclass: apiError.fieldErrors.homeclass,
        });
        return;
      }

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setSaveErrorDialog(
        resolveProfileSaveErrorMessage(
          result.type === "http_error" ? result.error.code : apiError?.code,
          apiError?.message ?? "登録情報の保存に失敗しました",
        ),
      );
      return;
    }

    const savedDraft: ProfileDraft = {
      name: normalizedName,
      grade: normalizedGrade,
      homeclass: normalizedHomeclass,
    };

    setOriginalDraft(savedDraft);
    setDraft(savedDraft);
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
          <h2>登録情報の読み込みに失敗しました</h2>
          <p>{error.message}</p>
          {(error.type === "unauthorized" || error.type === "forbidden") && (
            <Link href="/login" className="button primary">
              ログインページへ
            </Link>
          )}
        </section>
      )}

      {!isLoading && !error && draft && !isProfileComplete(draft) && (
        <section className="panel panel-error">
          <h2>プロフィール未設定の項目があります</h2>
          <p>
            学年またはクラスが未設定です。時間割表示や授業関連機能に進む前に入力してください。
          </p>
        </section>
      )}

      {!isLoading && !error && draft && (
        <section className="panel settings-card">
          <h2>プロフィール情報</h2>
          <div className="settings-form">
            <label className="form-field">
              <FormFieldLabel>表示名</FormFieldLabel>
              <input
                type="text"
                value={draft.name}
                onChange={(event) => {
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          name: event.target.value,
                        }
                      : prev,
                  );
                  setSaveFieldErrors((prev) => ({
                    ...prev,
                    name: undefined,
                  }));
                }}
                aria-invalid={!!saveFieldErrors.name}
              />
              {saveFieldErrors.name && (
                <p className="form-field__error">{saveFieldErrors.name}</p>
              )}
            </label>

            <div className="form-row">
              <label className="form-field">
                <FormFieldLabel required>学年</FormFieldLabel>
                <select
                  value={draft.grade ?? "__required__"}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const grade =
                      raw === "__required__"
                        ? null
                        : normalizeGrade(Number(raw));
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            grade,
                          }
                        : prev,
                    );
                    setSaveFieldErrors((prev) => ({
                      ...prev,
                      grade: undefined,
                    }));
                  }}
                  aria-invalid={!!saveFieldErrors.grade}
                >
                  <option value="__required__" disabled>
                    選択してください
                  </option>
                  {[1, 2, 3].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}年
                    </option>
                  ))}
                </select>
                {saveFieldErrors.grade && (
                  <p className="form-field__error">{saveFieldErrors.grade}</p>
                )}
              </label>

              <label className="form-field">
                <FormFieldLabel required>クラス</FormFieldLabel>
                <select
                  value={draft.homeclass ?? "__required__"}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const homeclass =
                      raw === "__required__"
                        ? null
                        : normalizeHomeclass(Number(raw));
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            homeclass,
                          }
                        : prev,
                    );
                    setSaveFieldErrors((prev) => ({
                      ...prev,
                      homeclass: undefined,
                    }));
                  }}
                  aria-invalid={!!saveFieldErrors.homeclass}
                >
                  <option value="__required__" disabled>
                    選択してください
                  </option>
                  {[1, 2, 3, 4, 5, 6].map((homeclass) => (
                    <option key={homeclass} value={homeclass}>
                      {homeclass}組
                    </option>
                  ))}
                </select>
                {saveFieldErrors.homeclass && (
                  <p className="form-field__error">
                    {saveFieldErrors.homeclass}
                  </p>
                )}
              </label>
            </div>
          </div>
        </section>
      )}

      <SaveDiscardBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={() => {
          void saveProfile();
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

export default function ProfileSettingsPage() {
  return (
    <AppShell
      title="プロフィール"
      description="表示名・学年・クラスを編集できます。入力した情報は一般公開されません。"
    >
      <ProfileSettingsView />
    </AppShell>
  );
}
