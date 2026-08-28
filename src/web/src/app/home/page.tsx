"use client";

import { knowledge } from "@ast24/hmbt-v5-lib";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  apiGetUsersUserId,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { LoadingRacePanel } from "@/shared/components/loading-race";
import { AppShell } from "@/shared/layout/app-shell";
import {
  HomeWidgetList,
  type HomeAuthUser,
} from "@/shared/widgets/home-widget-list";

type HomeState = {
  authUser: HomeAuthUser | null;
};

type HomeErrorState =
  | ApiErrorInfo
  | { type: "network_error"; message: string }
  | null;

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<HomeState>({
    authUser: null,
  });
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(true);
  const [isWidgetLoading, setIsWidgetLoading] = useState<boolean>(true);
  const [isUiSettingsButtonVisible, setIsUiSettingsButtonVisible] =
    useState<boolean>(false);
  const [error, setError] = useState<HomeErrorState>(null);

  const loadHome = useCallback(async () => {
    setIsProfileLoading(true);
    setIsWidgetLoading(true);
    setError(null);

    const userResult = await apiGetUsersUserId("me");
    if (isNoAuthApiResult(userResult)) {
      router.replace("/login");
      return;
    }

    const apiError = handleApiError(userResult);
    if (apiError || userResult.type !== "success") {
      const fatalCandidate = apiError as ApiErrorInfo;
      if (shouldShowFatalErrorPage(fatalCandidate)) {
        router.replace(buildFatalErrorPageHref(fatalCandidate));
        return;
      }

      setError(
        apiError ?? {
          type: "network_error",
          message: "プロフィール情報の取得に失敗しました",
        },
      );
      setIsProfileLoading(false);
      return;
    }

    const grade = Number.isInteger(userResult.data.user_info.grade)
      ? (userResult.data.user_info.grade as number)
      : null;
    const homeclass = Number.isInteger(userResult.data.user_info.homeclass)
      ? (userResult.data.user_info.homeclass as knowledge.HomeClassNum)
      : null;

    if (grade === null || homeclass === null) {
      router.replace("/setup");
      return;
    }

    setState({
      authUser: {
        id: "me",
        grade,
        homeclass,
      },
    });
    setIsProfileLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHome();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadHome]);

  const renderErrorUI = () => {
    if (!error) {
      return null;
    }

    return (
      <section className="panel panel-error">
        <h2>ホームの表示準備に失敗しました</h2>
        <p>{error.message}</p>
        <div className="hero-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void loadHome();
            }}
          >
            再読み込み
          </button>
          <Link href="/login" className="button ghost">
            ログインページへ
          </Link>
        </div>
      </section>
    );
  };

  const shouldShowLoading =
    isProfileLoading || (state.authUser !== null && isWidgetLoading);

  return (
    <AppShell title="ホーム" disableInitialGuard>
      {shouldShowLoading && <LoadingRacePanel message="読み込み中..." />}

      {!isProfileLoading && error && renderErrorUI()}

      {!error && state.authUser && (
        <>
          {isUiSettingsButtonVisible && (
            <div className="home-settings-anchor">
              <Link
                href="/settings/web"
                className="button ghost home-settings-link"
                aria-label="ホーム表示設定を開く"
              >
                <span aria-hidden>⚙</span>
                <span>UI設定</span>
              </Link>
            </div>
          )}

          <HomeWidgetList
            authUser={state.authUser}
            onLoadingStateChange={setIsWidgetLoading}
            onUiSettingsButtonVisibilityChange={setIsUiSettingsButtonVisible}
          />
        </>
      )}
    </AppShell>
  );
}
