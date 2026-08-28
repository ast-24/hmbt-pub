"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  apiGetAuthUserIdentities,
  apiGetGlobalLineBotUrl,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
} from "@/shared/api/endpoints-client";
import { LoadingRacePanel } from "@/shared/components/loading-race";
import { AppShell } from "@/shared/layout/app-shell";

export default function LineBotGuidePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lineLinked, setLineLinked] = useState<boolean | null>(null);
  const [lineBotUrl, setLineBotUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setLineBotUrl(null);

    const identitiesResult = await apiGetAuthUserIdentities();
    if (isNoAuthApiResult(identitiesResult)) {
      router.replace("/login");
      return;
    }

    const identitiesError = handleApiError(identitiesResult);
    if (identitiesError || identitiesResult.type !== "success") {
      if (identitiesError && shouldShowFatalErrorPage(identitiesError)) {
        router.replace(buildFatalErrorPageHref(identitiesError));
        return;
      }

      setErrorMessage(
        identitiesError?.message ?? "認証連携状態の取得に失敗しました。",
      );
      setIsLoading(false);
      return;
    }

    const hasLineIdentity = identitiesResult.data.identifiers.some(
      (identifier) => identifier.type === "line_oidc",
    );
    setLineLinked(hasLineIdentity);

    if (!hasLineIdentity) {
      setIsLoading(false);
      return;
    }

    const lineBotUrlResult = await apiGetGlobalLineBotUrl();
    if (isNoAuthApiResult(lineBotUrlResult)) {
      router.replace("/login");
      return;
    }

    const lineBotUrlError = handleApiError(lineBotUrlResult);
    if (lineBotUrlError || lineBotUrlResult.type !== "success") {
      if (lineBotUrlError && shouldShowFatalErrorPage(lineBotUrlError)) {
        router.replace(buildFatalErrorPageHref(lineBotUrlError));
        return;
      }

      setErrorMessage(
        lineBotUrlError?.message ?? "LINE BOT URLの取得に失敗しました。",
      );
      setIsLoading(false);
      return;
    }

    const nextUrl = lineBotUrlResult.data.line_bot_url;
    setLineBotUrl(nextUrl);

    if (!nextUrl) {
      setErrorMessage(
        "LINE BOTのURLが設定されていません。時間をおいて再試行するか、運営に連絡してください。",
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    window.location.assign(nextUrl);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  return (
    <AppShell
      title="LINE BOT版へ"
      description="LINE連携状態に応じて、LINE BOT版への案内または遷移を行います。"
      requireVerifiedStudent={false}
      requireSetupCompletion={false}
    >
      {isLoading && <LoadingRacePanel message="LINE連携状態を確認中..." />}

      {!isLoading && errorMessage && (
        <section className="panel panel-error">
          <h2>LINE BOT版へ遷移できませんでした</h2>
          <p>{errorMessage}</p>
          <div className="hero-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => {
                void load();
              }}
            >
              再試行
            </button>
          </div>
        </section>
      )}

      {!isLoading && !errorMessage && lineLinked === false && (
        <section className="panel settings-card">
          <h2>LINEアカウント連携が必要です</h2>
          <p>LINE BOT版へ進むには、先に LINEアカウント連携を行ってください。</p>
          <p className="settings-note">
            メニューの「アカウント &gt; 認証連携」から設定できます。
          </p>
          <div className="hero-actions">
            <Link href="/settings/auth-identities" className="button primary">
              認証連携を開く
            </Link>
          </div>
        </section>
      )}

      {!isLoading && !errorMessage && lineLinked === true && lineBotUrl && (
        <section className="panel settings-card">
          <h2>LINE BOT版へ遷移します</h2>
          <p>自動で移動しない場合は、次のボタンから開いてください。</p>
          <div className="hero-actions">
            <a href={lineBotUrl} className="button primary">
              LINE BOT版を開く
            </a>
          </div>
        </section>
      )}
    </AppShell>
  );
}
