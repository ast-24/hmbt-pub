"use client";

import { api } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  apiGetAuthUserMe,
  apiPostAuthUserLegacyRegister,
  apiPostAuthUserLegacyStart,
  buildFatalErrorPageHref,
  buildAuthUserOidcGoogleStartUrl,
  buildAuthUserOidcLineStartUrl,
  handleApiError,
  isValidationApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { FormFieldLabel } from "@/shared/components/form-field-label";
import { LoadingRacePanel } from "@/shared/components/loading-race";

type LegacyStep = "credentials" | "otp";
type LoginFieldErrors = Partial<Record<"email" | "password" | "otp", string>>;

type LegacyLoginDraft = {
  email: string;
  password: string;
  step: LegacyStep;
  expiresAt: number;
};

const LEGACY_LOGIN_DRAFT_KEY = "hmbt_v5_web_legacy_login_draft";
const LEGACY_LOGIN_DRAFT_TTL_MS = 60 * 60 * 1000;

function loadLegacyLoginDraft(): LegacyLoginDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_LOGIN_DRAFT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<LegacyLoginDraft>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      (parsed.step !== "credentials" && parsed.step !== "otp")
    ) {
      window.localStorage.removeItem(LEGACY_LOGIN_DRAFT_KEY);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(LEGACY_LOGIN_DRAFT_KEY);
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
    window.localStorage.removeItem(LEGACY_LOGIN_DRAFT_KEY);
    return null;
  }
}

function saveLegacyLoginDraft(
  draft: Omit<LegacyLoginDraft, "expiresAt">,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: LegacyLoginDraft = {
    ...draft,
    expiresAt: Date.now() + LEGACY_LOGIN_DRAFT_TTL_MS,
  };

  window.localStorage.setItem(LEGACY_LOGIN_DRAFT_KEY, JSON.stringify(payload));
}

function clearLegacyLoginDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(LEGACY_LOGIN_DRAFT_KEY);
}

function resolveAuthCheckErrorMessage(
  result: Awaited<ReturnType<typeof apiGetAuthUserMe>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "アクセストークンが見つかりません。ログインし直してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

function resolveLegacyStartErrorMessage(
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

function resolveLegacyRegisterErrorMessage(
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
      return "ワンタイムトークンが無効、または有効期限切れです。再度ログインを開始してください。";
    case api.errors.AuthUserLegacyRegisterErrorCode.CredentialAlreadyLinked:
      return "この認証情報は既に連携済みです。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "認証サービスが一時的に利用できません。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [initialLegacyDraft] = useState<LegacyLoginDraft | null>(() =>
    loadLegacyLoginDraft(),
  );
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  useEffect(() => {
    if (
      legacyStep === "credentials" &&
      legacyEmail.trim().length === 0 &&
      legacyPassword.length === 0
    ) {
      clearLegacyLoginDraft();
      return;
    }

    saveLegacyLoginDraft({
      email: legacyEmail,
      password: legacyPassword,
      step: legacyStep,
    });
  }, [legacyEmail, legacyPassword, legacyStep]);

  const resetLegacyLoginInput = () => {
    setLegacyStep("credentials");
    setLegacyEmail("");
    setLegacyPassword("");
    setLegacyOtp("");
    setFieldErrors({});
    clearLegacyLoginDraft();
  };

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      const result = await apiGetAuthUserMe();
      if (cancelled) {
        return;
      }

      if (isNoAuthApiResult(result)) {
        setIsCheckingAuth(false);
        return;
      }

      const apiError = handleApiError(result);
      if (apiError || result.type !== "success") {
        if (apiError && shouldShowFatalErrorPage(apiError)) {
          router.replace(buildFatalErrorPageHref(apiError));
          return;
        }

        if (
          apiError?.type === "unauthorized" ||
          apiError?.type === "forbidden"
        ) {
          setIsCheckingAuth(false);
          return;
        }

        setErrorDialog(
          resolveAuthCheckErrorMessage(
            result,
            apiError?.message ?? "認証状態の確認に失敗しました",
          ),
        );
        setIsCheckingAuth(false);
        return;
      }

      if (
        result.type === "success" &&
        result.data.has_session &&
        result.data.has_access_token
      ) {
        router.replace("/home");
        return;
      }

      setIsCheckingAuth(false);
    };

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const startLegacyLogin = async () => {
    const normalizedEmail = legacyEmail.trim();
    if (!normalizedEmail || !legacyPassword) {
      setErrorDialog(null);
      setFieldErrors({
        email: normalizedEmail
          ? undefined
          : "メールアドレスを入力してください。",
        password: legacyPassword ? undefined : "パスワードを入力してください。",
      });
      return;
    }

    setIsSubmitting(true);
    setErrorDialog(null);
    setFieldErrors({});

    const result = await apiPostAuthUserLegacyStart(
      {
        email: normalizedEmail,
        password: legacyPassword,
      },
      false,
    );

    if (isNoAuthApiResult(result)) {
      setIsSubmitting(false);
      setErrorDialog(
        "認証状態を更新できませんでした。時間を空けて再試行してください。",
      );
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSubmitting(false);

      if (isValidationApiError(apiError)) {
        setFieldErrors({
          email: apiError.fieldErrors.email,
          password: apiError.fieldErrors.password,
        });
        return;
      }

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setErrorDialog(
        resolveLegacyStartErrorMessage(
          result,
          apiError?.message ?? "ログイン開始に失敗しました",
        ),
      );
      return;
    }

    setIsSubmitting(false);

    if (result.data.requires_registration) {
      setLegacyStep("otp");
      setLegacyOtp("");
      setFieldErrors({});
      return;
    }

    clearLegacyLoginDraft();
    router.replace("/home");
  };

  const completeLegacyLogin = async () => {
    const normalizedEmail = legacyEmail.trim();
    const normalizedOtp = legacyOtp.trim();

    if (!normalizedOtp) {
      setErrorDialog(null);
      setFieldErrors({ otp: "ワンタイムトークンを入力してください。" });
      return;
    }

    setIsSubmitting(true);
    setErrorDialog(null);
    setFieldErrors({});

    const result = await apiPostAuthUserLegacyRegister({
      email: normalizedEmail,
      password: legacyPassword,
      otp: normalizedOtp,
    });

    if (isNoAuthApiResult(result)) {
      setIsSubmitting(false);
      setErrorDialog(
        "認証状態を更新できませんでした。時間を空けて再試行してください。",
      );
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSubmitting(false);

      if (isValidationApiError(apiError)) {
        setFieldErrors({
          email: apiError.fieldErrors.email,
          password: apiError.fieldErrors.password,
          otp: apiError.fieldErrors.otp,
        });
        return;
      }

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setErrorDialog(
        resolveLegacyRegisterErrorMessage(
          result,
          apiError?.message ?? "トークン認証に失敗しました",
        ),
      );
      return;
    }

    setIsSubmitting(false);
    clearLegacyLoginDraft();
    router.replace("/home");
  };

  const startOidcLogin = (provider: "google" | "line") => {
    const url =
      provider === "google"
        ? buildAuthUserOidcGoogleStartUrl(false)
        : buildAuthUserOidcLineStartUrl(false);
    window.location.assign(url);
  };

  if (isCheckingAuth) {
    return (
      <main className="welcome-page">
        <LoadingRacePanel message="認証状態を確認中..." />
      </main>
    );
  }

  return (
    <main className="welcome-page">
      <section className="hero-card">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>ログイン</h1>
        <p>メールアドレスまたは外部アカウント連携でログインできます。</p>
      </section>

      <section className="panel settings-card">
        <h2>利用規約とプライバシーポリシー</h2>
        <p className="settings-note">
          登録またはログインを行うことで、以下への同意が完了したものとして扱います。
        </p>
        <p className="settings-note login-policy-links">
          <Link href="/terms-of-service">利用規約</Link>
          <span aria-hidden> / </span>
          <Link href="/privacy-policy">プライバシーポリシー</Link>
        </p>
      </section>

      <section className="panel settings-card">
        <h2>メールとパスワードでログイン</h2>

        {legacyStep === "credentials" ? (
          <>
            <div className="settings-form">
              <label className="form-field">
                <FormFieldLabel required>メールアドレス</FormFieldLabel>
                <input
                  type="email"
                  value={legacyEmail}
                  onChange={(event) => {
                    setLegacyEmail(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      email: undefined,
                    }));
                  }}
                  autoComplete="username"
                  placeholder="example@edu.city.yokohama.jp"
                  disabled={isSubmitting}
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <p className="form-field__error">{fieldErrors.email}</p>
                )}
              </label>

              <label className="form-field">
                <FormFieldLabel required>パスワード</FormFieldLabel>
                <input
                  type="password"
                  value={legacyPassword}
                  onChange={(event) => {
                    setLegacyPassword(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }));
                  }}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-invalid={!!fieldErrors.password}
                />
                {fieldErrors.password && (
                  <p className="form-field__error">{fieldErrors.password}</p>
                )}
              </label>
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className="button primary"
                disabled={isSubmitting}
                onClick={() => {
                  void startLegacyLogin();
                }}
              >
                {isSubmitting ? "処理中..." : "ログイン"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="settings-note">
              ワンタイムトークンを入力してください。送信先メールアドレス:{" "}
              <strong>{legacyEmail.trim() || "(未入力)"}</strong>
            </p>

            <div className="settings-form">
              <label className="form-field">
                <FormFieldLabel required>ワンタイムトークン</FormFieldLabel>
                <input
                  type="text"
                  value={legacyOtp}
                  onChange={(event) => {
                    setLegacyOtp(event.target.value);
                    setFieldErrors((prev) => ({
                      ...prev,
                      otp: undefined,
                    }));
                  }}
                  autoComplete="one-time-code"
                  disabled={isSubmitting}
                  aria-invalid={!!fieldErrors.otp}
                />
                {fieldErrors.otp && (
                  <p className="form-field__error">{fieldErrors.otp}</p>
                )}
              </label>
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className="button ghost"
                disabled={isSubmitting}
                onClick={() => {
                  setLegacyStep("credentials");
                  setLegacyOtp("");
                  setFieldErrors({});
                }}
              >
                メール入力に戻る
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={isSubmitting}
                onClick={resetLegacyLoginInput}
              >
                入力をリセット
              </button>
              <button
                type="button"
                className="button primary"
                disabled={isSubmitting}
                onClick={() => {
                  void completeLegacyLogin();
                }}
              >
                {isSubmitting ? "認証中..." : "トークンを送信してログイン"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel settings-card">
        <h2>外部アカウント連携</h2>
        <p className="settings-note">
          ボタンを押すと、それぞれの認証ページへ移動します。
        </p>
        <div className="external-auth-actions">
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              startOidcLogin("google");
            }}
          >
            Googleでログイン
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => {
              startOidcLogin("line");
            }}
          >
            LINEでログイン
          </button>
        </div>
      </section>

      {errorDialog && (
        <ErrorDialog
          title="ログインに失敗しました"
          message={errorDialog}
          onClose={() => {
            setErrorDialog(null);
          }}
        />
      )}
    </main>
  );
}
