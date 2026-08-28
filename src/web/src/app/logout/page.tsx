"use client";

import { api } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  apiDeleteAuthUserLogout,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
} from "@/shared/api/endpoints-client";
import { ErrorDialog } from "@/shared/components/error-dialog";
import { AppShell } from "@/shared/layout/app-shell";

function resolveLogoutErrorMessage(
  result: Awaited<ReturnType<typeof apiDeleteAuthUserLogout>>,
  fallbackMessage: string,
): string {
  if (result.type !== "http_error") {
    return fallbackMessage;
  }

  switch (result.error.code) {
    case api.errors.CommonApiErrorCode.NoAccessToken:
      return "ログイン情報が見つかりません。再ログインしてください。";
    case api.errors.CommonApiErrorCode.NotVerifiedStudent:
      return "生徒確認が未完了のため処理できません。ログイン方法を確認してください。";
    case api.errors.CommonApiErrorCode.ServiceUnavailable:
      return "ログアウト処理が混み合っています。時間をおいて再試行してください。";
    default:
      return fallbackMessage;
  }
}

export default function LogoutPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const runLogout = async () => {
    setIsSubmitting(true);
    setErrorDialog(null);

    const result = await apiDeleteAuthUserLogout();

    if (isNoAuthApiResult(result)) {
      setIsCompleted(true);
      setIsSubmitting(false);
      return;
    }

    const apiError = handleApiError(result);
    if (apiError || result.type !== "success") {
      setIsSubmitting(false);

      if (apiError && shouldShowFatalErrorPage(apiError)) {
        router.push(buildFatalErrorPageHref(apiError));
        return;
      }

      setErrorDialog(
        resolveLogoutErrorMessage(
          result,
          apiError?.message ?? "ログアウトに失敗しました",
        ),
      );
      return;
    }

    setIsCompleted(true);
    setIsSubmitting(false);
  };

  return (
    <AppShell
      title="ログアウト"
      description="現在のログイン状態を解除します。"
      requireVerifiedStudent={false}
      requireSetupCompletion={false}
      disableInitialGuard
    >
      <section className="panel settings-card">
        {!isCompleted ? (
          <>
            <h2>ログアウトしますか？</h2>
            <p className="settings-note">
              この端末でのログイン状態を解除します。再度利用するには、もう一度ログインしてください。
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="button ghost danger"
                disabled={isSubmitting}
                onClick={() => {
                  void runLogout();
                }}
              >
                {isSubmitting ? "ログアウト中..." : "ログアウトする"}
              </button>
              <Link href="/home" className="button ghost">
                キャンセル
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2>ログアウトしました</h2>
            <p className="settings-note">
              セッションを終了しました。必要なときに再ログインしてください。
            </p>
            <div className="hero-actions">
              <Link href="/" className="button primary">
                トップへ戻る
              </Link>
              <Link href="/login" className="button ghost">
                ログインページへ
              </Link>
            </div>
          </>
        )}
      </section>

      {errorDialog && (
        <ErrorDialog
          title="ログアウトに失敗しました"
          message={errorDialog}
          onClose={() => {
            setErrorDialog(null);
          }}
        />
      )}
    </AppShell>
  );
}
