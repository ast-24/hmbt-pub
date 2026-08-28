"use client";

import { api, knowledge, models } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  executeBatchCalls,
  apiGetAuthUserIdentities,
  apiGetAuthUserMe,
  apiPostAuthUserIdentities,
  apiPostAuthUserLegacyRegister,
  apiPostAuthUserLegacyStart,
  buildAuthUserOidcGoogleStartUrl,
  buildAuthUserOidcLineStartUrl,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  pickBatchResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { AppShell } from "@/shared/layout/app-shell";

type LegacyStep = "credentials" | "otp";
type AddMethod = "legacy" | "google_oidc" | "line_oidc";

type LegacyLinkDraft = {
  email: string;
  password: string;
  step: LegacyStep;
  expiresAt: number;
};

export type AuthIdentitiesSettingsViewProps = {
  onStatusChange?: (status: { isVerifiedAsStudent: boolean }) => void;
};

const PASSWORD_REQUIREMENT_MESSAGE = `パスワードは${knowledge.auth.PASSWORD_REQUIREMENT_MESSAGE}`;
const LEGACY_LINK_DRAFT_KEY = "hmbt_v5_web_legacy_link_draft";
const LEGACY_LINK_DRAFT_TTL_MS = 60 * 60 * 1000;

function loadLegacyLinkDraft(): LegacyLinkDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_LINK_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<LegacyLinkDraft>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      (parsed.step !== "credentials" && parsed.step !== "otp")
    ) {
      window.localStorage.removeItem(LEGACY_LINK_DRAFT_KEY);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(LEGACY_LINK_DRAFT_KEY);
      return null;
    }

    const step: LegacyStep =
      parsed.step === "otp" && parsed.email.trim() && parsed.password
        ? "otp"
        : "credentials";

    return {
      email: parsed.email,
      password: parsed.password,
      step,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    window.localStorage.removeItem(LEGACY_LINK_DRAFT_KEY);
    return null;
  }
}

function saveLegacyLinkDraft(draft: Omit<LegacyLinkDraft, "expiresAt">): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: LegacyLinkDraft = {
    ...draft,
    expiresAt: Date.now() + LEGACY_LINK_DRAFT_TTL_MS,
  };

  window.localStorage.setItem(LEGACY_LINK_DRAFT_KEY, JSON.stringify(payload));
}

function clearLegacyLinkDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(LEGACY_LINK_DRAFT_KEY);
}

function identifierSortOrder(identifier: models.user.UserIdentifier): number {
  switch (identifier.type) {
    case "legacy":
      return 0;
    case "google_oidc":
      return 1;
    case "line_oidc":
      return 2;
  }
}

function sortIdentifiers(
  identifiers: models.user.UserIdentifier[],
): models.user.UserIdentifier[] {
  return [...identifiers].sort(
    (a, b) => identifierSortOrder(a) - identifierSortOrder(b),
  );
}

function identifierKey(identifier: models.user.UserIdentifier): string {
  switch (identifier.type) {
    case "legacy":
      return `legacy:${identifier.email}`;
    case "google_oidc":
      return `google_oidc:${identifier.sub}`;
    case "line_oidc":
      return `line_oidc:${identifier.sub}`;
  }
}

function identifierTitle(identifier: models.user.UserIdentifier): string {
  switch (identifier.type) {
    case "legacy":
      return "メールアドレスとパスワード";
    case "google_oidc":
      return "Googleアカウント";
    case "line_oidc":
      return "LINEアカウント";
  }
}

function identifierDescription(identifier: models.user.UserIdentifier): string {
  switch (identifier.type) {
    case "legacy":
      return `メール: ${identifier.email}`;
    case "google_oidc": {
      const email = identifier.email.mapOr("メール未取得", (value) => value);
      const emailVerified = identifier.email_verified_as_owner
        ? "メール所有確認済み"
        : "メール所有未確認";
      const org = identifier.org.mapOr("", (value) => `組織: ${value}`);
      return org
        ? `${email} / ${emailVerified} / ${org}`
        : `${email} / ${emailVerified}`;
    }
    case "line_oidc": {
      const verified = identifier.verified_as_student_in_v4
        ? "生徒確認済み"
        : "生徒確認は未完了";
      const linkedEmail = identifier.linked_email_in_v4.mapOr(
        "連携済みメールはありません",
        (value) => `連携済みメール: ${value}`,
      );
      return `${verified} / ${linkedEmail}`;
    }
  }
}

function toIdentifierSpec(
  identifier: models.user.UserIdentifier,
): models.user.UserIdentifierSpec {
  switch (identifier.type) {
    case "legacy":
      return {
        type: "legacy",
        email: identifier.email,
      };
    case "google_oidc":
      return {
        type: "google_oidc",
        sub: identifier.sub,
      };
    case "line_oidc":
      return {
        type: "line_oidc",
        sub: identifier.sub,
      };
  }
}

function resolveIdentityDeleteErrorMessage(
  result: Awaited<ReturnType<typeof apiPostAuthUserIdentities>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.AuthUserIdentitiesPostErrorCode
      .LastIdentityRemovalForbidden:
      return "認証情報は最低1つ残しておく必要があります。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveAuthStatusErrorMessage(
  result: Awaited<ReturnType<typeof apiGetAuthUserMe>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveIdentityListErrorMessage(
  result: Awaited<ReturnType<typeof apiGetAuthUserIdentities>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.UserDataErrorCode.UserNotFound:
      return "ユーザ情報が見つかりませんでした。再ログインして再試行してください。";
    case api.errors.UserDataErrorCode.UserProfileIncomplete:
      return "プロフィール情報が不足しています。プロフィール設定を確認してください。";
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が完了していません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveLegacyLinkStartErrorMessage(
  result: Awaited<ReturnType<typeof apiPostAuthUserLegacyStart>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.AuthUserLegacyStartErrorCode.MissingEmailOrPassword:
      return "メールアドレスとパスワードを入力してください。";
    case api.errors.AuthUserLegacyStartErrorCode.InvalidEmailFormat:
      return "メールアドレスの形式が正しくありません。";
    case api.errors.AuthUserLegacyStartErrorCode.InvalidPasswordFormat:
      return "パスワードの形式が正しくありません。";
    case api.errors.AuthUserLegacyStartErrorCode.TooManyLoginFailures:
      return "ログイン試行回数が上限に達しました。時間をおいて再試行してください。";
    case api.errors.AuthUserLegacyStartErrorCode
      .TooManyVerificationRequestsByEmail:
      return "同じメールアドレスへの認証要求が多すぎます。時間をおいて再試行してください。";
    case api.errors.AuthUserLegacyStartErrorCode
      .TooManyVerificationRequestsByIp:
      return "この端末からの認証要求が多すぎます。時間をおいて再試行してください。";
    case api.errors.AuthUserLegacyStartErrorCode.InvalidCredentials:
      return "メールアドレスまたはパスワードが正しくありません。";
    case api.errors.AuthUserLegacyStartErrorCode.CredentialAlreadyLinked:
      return "この認証情報は既に連携済みです。";
    case api.errors.AuthEmailErrorCode.EmailFromNotConfigured:
    case api.errors.AuthEmailErrorCode.MailConfigIncomplete:
    case api.errors.AuthEmailErrorCode.SendFailed:
    case api.errors.AuthEmailErrorCode.OAuthCredentialsMissing:
    case api.errors.AuthEmailErrorCode.OAuthTokenRefreshFailed:
      return "認証メールの送信に失敗しました。しばらく待って再試行してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveLegacyLinkRegisterErrorMessage(
  result: Awaited<ReturnType<typeof apiPostAuthUserLegacyRegister>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.AuthUserLegacyRegisterErrorCode.MissingRequiredFields:
      return "メールアドレス・パスワード・ワンタイムトークンを入力してください。";
    case api.errors.AuthUserLegacyRegisterErrorCode.InvalidEmailFormat:
      return "メールアドレスの形式が正しくありません。";
    case api.errors.AuthUserLegacyRegisterErrorCode.InvalidPasswordFormat:
      return "パスワードの形式が正しくありません。";
    case api.errors.AuthUserLegacyRegisterErrorCode
      .InvalidVerificationTokenFormat:
      return "ワンタイムトークンの形式が正しくありません。";
    case api.errors.AuthUserLegacyRegisterErrorCode
      .InvalidOrExpiredVerificationToken:
      return "ワンタイムトークンが無効、または有効期限切れです。連携を再開してください。";
    case api.errors.AuthUserLegacyRegisterErrorCode.CredentialAlreadyLinked:
      return "この認証情報は既に連携済みです。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export function AuthIdentitiesSettingsView({
  onStatusChange,
}: AuthIdentitiesSettingsViewProps) {
  const router = useRouter();
  const [initialLegacyDraft] = useState<LegacyLinkDraft | null>(() =>
    loadLegacyLinkDraft(),
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiErrorInfo | null>(null);

  const [isVerifiedAsStudent, setIsVerifiedAsStudent] =
    useState<boolean>(false);
  const [identifiers, setIdentifiers] = useState<models.user.UserIdentifier[]>(
    [],
  );

  const [addMethod, setAddMethod] = useState<AddMethod>("legacy");
  const [legacyStep, setLegacyStep] = useState<LegacyStep>(
    initialLegacyDraft?.step ?? "credentials",
  );
  const [legacyEmail, setLegacyEmail] = useState<string>(
    initialLegacyDraft?.email ?? "",
  );
  const [legacyPassword, setLegacyPassword] = useState<string>(
    initialLegacyDraft?.password ?? "",
  );
  const [legacyOtp, setLegacyOtp] = useState<string>("");

  const [isLegacySubmitting, setIsLegacySubmitting] = useState<boolean>(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [actionErrorDialog, setActionErrorDialog] = useState<string | null>(
    null,
  );
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    onStatusChange?.({ isVerifiedAsStudent });
  }, [isVerifiedAsStudent, onStatusChange]);

  useEffect(() => {
    if (addMethod !== "legacy") {
      return;
    }

    if (
      legacyStep === "credentials" &&
      legacyEmail.trim().length === 0 &&
      legacyPassword.length === 0
    ) {
      clearLegacyLinkDraft();
      return;
    }

    saveLegacyLinkDraft({
      email: legacyEmail,
      password: legacyPassword,
      step: legacyStep,
    });
  }, [addMethod, legacyEmail, legacyPassword, legacyStep]);

  const resetLegacyLinkInput = () => {
    setLegacyStep("credentials");
    setLegacyEmail("");
    setLegacyPassword("");
    setLegacyOtp("");
    setActionSuccess(null);
    clearLegacyLinkDraft();
  };

  const loadAuthState = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      const batchResults = await executeBatchCalls([
        {
          key: "auth-me",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.AuthUserMeGet
            ],
          pathParams: {},
          fallbackMessage: "認証ステータスの取得に失敗しました",
          stubCall: () => apiGetAuthUserMe(),
        },
        {
          key: "identities",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.AuthUserIdentitiesGet
            ],
          pathParams: {},
          fallbackMessage: "認証情報一覧の取得に失敗しました",
          stubCall: () => apiGetAuthUserIdentities(),
        },
      ]);

      const authMeResult = pickBatchResult<
        api.endpoints.ApiAuthUserMeGetRes,
        api.endpoints.ApiAuthUserMeGetErr
      >(batchResults, "auth-me", "認証ステータスの取得に失敗しました");
      const identitiesResult = pickBatchResult<
        api.endpoints.ApiAuthUserIdentitiesGetRes,
        api.endpoints.ApiAuthUserIdentitiesGetErr
      >(batchResults, "identities", "認証情報一覧の取得に失敗しました");

      if (
        isNoAuthApiResult(authMeResult) ||
        isNoAuthApiResult(identitiesResult)
      ) {
        router.replace("/login");
        return;
      }

      const meError = handleApiError(authMeResult);
      if (meError || authMeResult.type !== "success") {
        if (meError && shouldShowFatalErrorPage(meError)) {
          router.replace(buildFatalErrorPageHref(meError));
          return;
        }

        setError(
          meError
            ? {
                ...meError,
                message: resolveAuthStatusErrorMessage(
                  authMeResult,
                  meError.message,
                ),
              }
            : {
                type: "network_error",
                message: "認証ステータスの取得に失敗しました",
              },
        );
        if (showLoading) {
          setIsLoading(false);
        }
        return;
      }

      const identitiesError = handleApiError(identitiesResult);
      if (identitiesError || identitiesResult.type !== "success") {
        if (identitiesError && shouldShowFatalErrorPage(identitiesError)) {
          router.replace(buildFatalErrorPageHref(identitiesError));
          return;
        }

        setError(
          identitiesError
            ? {
                ...identitiesError,
                message: resolveIdentityListErrorMessage(
                  identitiesResult,
                  identitiesError.message,
                ),
              }
            : {
                type: "network_error",
                message: "認証情報一覧の取得に失敗しました",
              },
        );
        if (showLoading) {
          setIsLoading(false);
        }
        return;
      }

      setIsVerifiedAsStudent(authMeResult.data.is_verified_as_student);
      setIdentifiers(sortIdentifiers(identitiesResult.data.identifiers));

      if (showLoading) {
        setIsLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAuthState();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadAuthState]);

  const hasLegacyCredential = useMemo(
    () =>
      legacyEmail.trim().length > 0 &&
      knowledge.auth.isValidPassword(legacyPassword),
    [legacyEmail, legacyPassword],
  );

  const isLegacyPasswordWeak = useMemo(
    () =>
      legacyPassword.length > 0 &&
      !knowledge.auth.isValidPassword(legacyPassword),
    [legacyPassword],
  );

  const removeIdentity = async (identifier: models.user.UserIdentifier) => {
    const key = identifierKey(identifier);
    setDeletingKey(key);
    setActionErrorDialog(null);
    setActionSuccess(null);

    const result = await apiPostAuthUserIdentities({
      identifier_spec: toIdentifierSpec(identifier),
    });

    if (isNoAuthApiResult(result)) {
      setDeletingKey(null);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setDeletingKey(null);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setActionErrorDialog(
        resolveIdentityDeleteErrorMessage(
          result,
          apiError?.message ?? "認証情報の削除に失敗しました",
        ),
      );
      return;
    }

    await loadAuthState(false);
    setDeletingKey(null);
    setActionSuccess("認証情報を削除しました");
  };

  const startLegacyLink = async () => {
    const normalizedEmail = legacyEmail.trim();
    if (!normalizedEmail || !legacyPassword) {
      setActionErrorDialog("メールアドレスとパスワードを入力してください");
      return;
    }

    if (!knowledge.auth.isValidPassword(legacyPassword)) {
      setActionErrorDialog(PASSWORD_REQUIREMENT_MESSAGE);
      return;
    }

    setIsLegacySubmitting(true);
    setActionErrorDialog(null);
    setActionSuccess(null);

    const result = await apiPostAuthUserLegacyStart(
      {
        email: normalizedEmail,
        password: legacyPassword,
      },
      true,
    );

    if (isNoAuthApiResult(result)) {
      setIsLegacySubmitting(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsLegacySubmitting(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setActionErrorDialog(
        resolveLegacyLinkStartErrorMessage(
          result,
          apiError?.message ?? "認証情報追加の開始に失敗しました",
        ),
      );
      return;
    }

    setIsLegacySubmitting(false);

    if (result.data.requires_registration) {
      setLegacyStep("otp");
      setLegacyOtp("");
      setActionSuccess("ワンタイムトークンを入力してください");
      return;
    }

    clearLegacyLinkDraft();
    await loadAuthState(false);
    setActionSuccess("認証情報を追加しました");
  };

  const completeLegacyLink = async () => {
    const normalizedEmail = legacyEmail.trim();
    const normalizedOtp = legacyOtp.trim();

    if (!knowledge.auth.isValidPassword(legacyPassword)) {
      setActionErrorDialog(PASSWORD_REQUIREMENT_MESSAGE);
      return;
    }

    if (!normalizedOtp) {
      setActionErrorDialog("ワンタイムトークンを入力してください");
      return;
    }

    setIsLegacySubmitting(true);
    setActionErrorDialog(null);
    setActionSuccess(null);

    const result = await apiPostAuthUserLegacyRegister({
      email: normalizedEmail,
      password: legacyPassword,
      otp: normalizedOtp,
    });

    if (isNoAuthApiResult(result)) {
      setIsLegacySubmitting(false);
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsLegacySubmitting(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setActionErrorDialog(
        resolveLegacyLinkRegisterErrorMessage(
          result,
          apiError?.message ?? "トークン認証に失敗しました",
        ),
      );
      return;
    }

    setLegacyStep("credentials");
    setLegacyOtp("");
    setIsLegacySubmitting(false);
    clearLegacyLinkDraft();

    await loadAuthState(false);
    setActionSuccess("認証情報を追加しました");
  };

  const startOidcLink = (
    method: Extract<AddMethod, "google_oidc" | "line_oidc">,
  ) => {
    const url =
      method === "google_oidc"
        ? buildAuthUserOidcGoogleStartUrl(true)
        : buildAuthUserOidcLineStartUrl(true);
    window.location.assign(url);
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
          <h2>認証情報の取得に失敗しました</h2>
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
          <section
            className={`panel settings-card ${isVerifiedAsStudent ? "" : "panel-error"}`}
          >
            <h2>生徒確認の状態</h2>
            <p>
              {isVerifiedAsStudent
                ? "生徒確認は完了しています。"
                : "生徒確認はまだ完了していません。"}
            </p>
            {!isVerifiedAsStudent && (
              <p>
                <strong>
                  学校メールアドレスでの追加、または旧Verで認証済みだった
                  LINEアカウントの追加が必要です。
                </strong>
              </p>
            )}
          </section>

          <section className="panel settings-card">
            <h2>登録済み認証情報</h2>
            {identifiers.length === 0 ? (
              <p className="settings-note">
                登録されている認証情報はありません。
              </p>
            ) : (
              <ul className="list-editor">
                {identifiers.map((identifier) => {
                  const key = identifierKey(identifier);
                  return (
                    <li className="list-editor__item" key={key}>
                      <div className="list-editor__row">
                        <div>
                          <strong>{identifierTitle(identifier)}</strong>
                          <p className="settings-note">
                            {identifierDescription(identifier)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="button ghost danger"
                          disabled={deletingKey === key}
                          onClick={() => {
                            void removeIdentity(identifier);
                          }}
                        >
                          {deletingKey === key ? "削除中..." : "削除"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel settings-card">
            <h2>認証情報を追加</h2>
            <p className="settings-note">
              追加したいログイン方法を選んでください。
            </p>

            <div className="settings-form">
              <fieldset className="radio-group">
                <legend>
                  <FormFieldLabel required>追加方式</FormFieldLabel>
                </legend>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="auth-add-method"
                    value="legacy"
                    checked={addMethod === "legacy"}
                    onChange={() => {
                      setAddMethod("legacy");
                      setActionSuccess(null);
                    }}
                  />
                  <span>メールアドレスとパスワード</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="auth-add-method"
                    value="google_oidc"
                    checked={addMethod === "google_oidc"}
                    onChange={() => {
                      setAddMethod("google_oidc");
                      setActionSuccess(null);
                    }}
                  />
                  <span>Googleアカウント</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="auth-add-method"
                    value="line_oidc"
                    checked={addMethod === "line_oidc"}
                    onChange={() => {
                      setAddMethod("line_oidc");
                      setActionSuccess(null);
                    }}
                  />
                  <span>LINEアカウント</span>
                </label>
              </fieldset>

              {addMethod === "legacy" ? (
                <>
                  {legacyStep === "credentials" ? (
                    <>
                      <label className="form-field">
                        <FormFieldLabel required>メールアドレス</FormFieldLabel>
                        <input
                          type="email"
                          value={legacyEmail}
                          onChange={(event) => {
                            setLegacyEmail(event.target.value);
                          }}
                          autoComplete="username"
                          disabled={isLegacySubmitting}
                        />
                      </label>

                      <label className="form-field">
                        <FormFieldLabel required>パスワード</FormFieldLabel>
                        <input
                          type="password"
                          value={legacyPassword}
                          onChange={(event) => {
                            setLegacyPassword(event.target.value);
                          }}
                          autoComplete="current-password"
                          disabled={isLegacySubmitting}
                        />
                        <p
                          className={
                            isLegacyPasswordWeak
                              ? "form-field__error"
                              : "settings-note"
                          }
                        >
                          {PASSWORD_REQUIREMENT_MESSAGE}
                        </p>
                      </label>

                      <div className="hero-actions">
                        <button
                          type="button"
                          className="button primary"
                          disabled={isLegacySubmitting || !hasLegacyCredential}
                          onClick={() => {
                            void startLegacyLink();
                          }}
                        >
                          {isLegacySubmitting ? "処理中..." : "追加を開始"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="settings-note">
                        メールに届いた確認コードを入力してください。送信先メールアドレス:{" "}
                        <strong>{legacyEmail.trim() || "(未入力)"}</strong>
                      </p>
                      <label className="form-field">
                        <FormFieldLabel required>
                          ワンタイムトークン
                        </FormFieldLabel>
                        <input
                          type="text"
                          value={legacyOtp}
                          onChange={(event) => {
                            setLegacyOtp(event.target.value);
                          }}
                          autoComplete="one-time-code"
                          disabled={isLegacySubmitting}
                        />
                      </label>

                      <div className="hero-actions">
                        <button
                          type="button"
                          className="button ghost"
                          disabled={isLegacySubmitting}
                          onClick={() => {
                            setLegacyStep("credentials");
                            setLegacyOtp("");
                          }}
                        >
                          メール入力に戻る
                        </button>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={isLegacySubmitting}
                          onClick={resetLegacyLinkInput}
                        >
                          入力をリセット
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          disabled={isLegacySubmitting}
                          onClick={() => {
                            void completeLegacyLink();
                          }}
                        >
                          {isLegacySubmitting
                            ? "認証中..."
                            : "確認コードを送信して追加"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  {addMethod === "google_oidc" && (
                    <p className="settings-note">
                      学校のGoogleアカウントは教育委員会の制限により使用不可です。
                    </p>
                  )}
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        startOidcLink(addMethod);
                      }}
                    >
                      {addMethod === "google_oidc"
                        ? "Googleアカウントの追加を開始"
                        : "LINEアカウントの追加を開始"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>

          {actionSuccess && (
            <section className="panel">
              <p>{actionSuccess}</p>
            </section>
          )}
        </>
      )}

      {actionErrorDialog && (
        <ErrorDialog
          title="操作に失敗しました"
          message={actionErrorDialog}
          onClose={() => {
            setActionErrorDialog(null);
          }}
        />
      )}
    </>
  );
}

export default function AuthIdentitiesSettingsPage() {
  return (
    <AppShell
      title="ログイン方法"
      description="このアカウントで使うログイン方法を追加・削除できます。"
      requireVerifiedStudent={false}
    >
      <AuthIdentitiesSettingsView />
    </AppShell>
  );
}
