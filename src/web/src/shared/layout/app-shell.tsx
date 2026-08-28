"use client";

import { api } from "@ast24/hmbt-v5-lib";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  executeBatchCalls,
  apiGetAuthUserMe,
  apiGetUsersUserId,
  buildFatalErrorPageHref,
  handleApiError,
  isNoAuthApiResult,
  pickBatchResult,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { fetchSetupSnapshot, isSetupRequired } from "@/shared/setup/setup-flow";

type AppShellProps = {
  title: string;
  description?: string;
  requireVerifiedStudent?: boolean;
  requireSetupCompletion?: boolean;
  disableInitialGuard?: boolean;
  children: React.ReactNode;
};

type AppNavItem = {
  href: string;
  label: string;
  danger?: boolean;
};

type AppNavGroup = {
  title: string;
  items: AppNavItem[];
};

const APP_NAV_GROUPS: AppNavGroup[] = [
  {
    title: "メイン",
    items: [
      { href: "/home", label: "ホーム" },
      { href: "/settings/cafe-menu-upload", label: "カフェメニュー投稿" },
    ],
  },
  {
    title: "個人設定",
    items: [
      { href: "/settings/personal-timetable", label: "個人時間割" },
      { href: "/settings/ical", label: "外部カレンダー連携" },
      { href: "/settings/web", label: "ホーム表示設定" },
      { href: "/settings/general", label: "詳細設定" },
    ],
  },
  {
    title: "アカウント",
    items: [
      { href: "/settings/profile", label: "プロフィール" },
      { href: "/settings/auth-identities", label: "認証連携" },
    ],
  },
  {
    title: "学校データ（共通）",
    items: [
      { href: "/settings/class-timetable", label: "クラス時間割" },
      { href: "/settings/common-schedule", label: "共通月間予定" },
    ],
  },
  {
    title: "その他",
    items: [
      { href: "/line-bot", label: "LINE BOT版へ" },
      { href: "/update-history", label: "更新履歴" },
      { href: "/privacy-policy", label: "プライバシーポリシー" },
      { href: "/terms-of-service", label: "利用規約" },
      { href: "/logout", label: "ログアウト", danger: true },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }
  return pathname.startsWith(`${href}/`);
}

export function AppShell({
  title,
  description,
  requireVerifiedStudent = true,
  requireSetupCompletion = true,
  disableInitialGuard = false,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const lastScrollYRef = useRef<number>(0);

  useEffect(() => {
    if (disableInitialGuard) {
      return;
    }

    let cancelled = false;

    const guardAndLoadTheme = async () => {
      const batchResults = await executeBatchCalls([
        {
          key: "auth",
          endpoint:
            api.endpoints.API_ENDPOINTS[
              api.endpoints.APIEndpoint.AuthUserMeGet
            ],
          pathParams: {},
          fallbackMessage: "認証情報の取得に失敗しました",
          stubCall: () => apiGetAuthUserMe(),
        },
        ...(requireSetupCompletion
          ? [
              {
                key: "user",
                endpoint:
                  api.endpoints.API_ENDPOINTS[
                    api.endpoints.APIEndpoint.UsersUserIdGet
                  ],
                pathParams: { userId: "me" },
                fallbackMessage: "ユーザ情報の取得に失敗しました",
                stubCall: () => apiGetUsersUserId("me"),
              },
            ]
          : []),
      ]);

      const authResult = pickBatchResult<
        api.endpoints.ApiAuthUserMeGetRes,
        api.endpoints.ApiAuthUserMeGetErr
      >(batchResults, "auth", "認証情報の取得に失敗しました");

      if (cancelled) {
        return;
      }

      if (isNoAuthApiResult(authResult)) {
        router.replace("/login");
        return;
      }

      const authError = handleApiError(authResult);
      if (authError || authResult.type !== "success") {
        if (authError?.type === "unauthorized") {
          router.replace("/login");
          return;
        }

        if (authError?.type === "forbidden") {
          router.replace(requireSetupCompletion ? "/setup" : "/login");
          return;
        }

        if (authError && shouldShowFatalErrorPage(authError)) {
          router.replace(buildFatalErrorPageHref(authError));
          return;
        }

        return;
      }

      if (!authResult.data.has_session || !authResult.data.has_access_token) {
        router.replace("/login");
        return;
      }

      if (requireVerifiedStudent && !authResult.data.is_verified_as_student) {
        router.replace("/setup");
        return;
      }

      const prefetchedUserResult = requireSetupCompletion
        ? pickBatchResult<
            api.endpoints.ApiUsersUserIdGetRes,
            api.endpoints.ApiUsersUserIdGetErr
          >(batchResults, "user", "ユーザ情報の取得に失敗しました")
        : undefined;

      const setupSnapshotResult = requireSetupCompletion
        ? await fetchSetupSnapshot({
            authResult,
            userResult: prefetchedUserResult,
          })
        : null;

      if (cancelled) {
        return;
      }

      if (requireSetupCompletion) {
        const resolvedSetupSnapshotResult = setupSnapshotResult;

        if (
          !resolvedSetupSnapshotResult ||
          resolvedSetupSnapshotResult.type === "no_auth"
        ) {
          router.replace("/login");
          return;
        }

        if (resolvedSetupSnapshotResult.type === "error") {
          const setupError = resolvedSetupSnapshotResult.error as ApiErrorInfo;
          if (shouldShowFatalErrorPage(setupError)) {
            router.replace(buildFatalErrorPageHref(setupError));
            return;
          }
        } else if (
          isSetupRequired(resolvedSetupSnapshotResult.snapshot) &&
          pathname !== "/setup"
        ) {
          router.replace("/setup");
          return;
        }
      }
    };

    void guardAndLoadTheme();

    return () => {
      cancelled = true;
    };
  }, [
    disableInitialGuard,
    pathname,
    requireSetupCompletion,
    requireVerifiedStudent,
    router,
  ]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        setIsHeaderVisible(true);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    let ticking = false;
    const threshold = 8;

    const onScroll = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const previousY = lastScrollYRef.current;
        const deltaY = currentY - previousY;

        if (currentY <= 12) {
          setIsHeaderVisible(true);
          lastScrollYRef.current = currentY;
          ticking = false;
          return;
        }

        if (!isMenuOpen && Math.abs(deltaY) > threshold) {
          if (deltaY > 0) {
            setIsHeaderVisible(false);
          } else {
            setIsHeaderVisible(true);
          }
        }

        lastScrollYRef.current = currentY;
        ticking = false;
      });
    };

    lastScrollYRef.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [isMenuOpen]);

  return (
    <main className="app-page">
      <header
        className={`app-page__header ${isHeaderVisible ? "" : "is-hidden"}`}
      >
        <div className="app-page__header-inner">
          <div className="app-page__heading">
            <div className="app-page__title-row">
              <Link href="/home" aria-label="ホームへ移動">
                <Image
                  src="/assets/appicon.png"
                  alt="はちまきBOT"
                  width={28}
                  height={28}
                  className="app-page__app-icon"
                  priority
                />
              </Link>
              <div className="app-page__title-text">
                <p className="page-kicker">はちまきBOT v5 for web</p>
                <h1>{title}</h1>
              </div>
            </div>
          </div>

          <div className="app-menu-wrap">
            <button
              type="button"
              className={`hamburger-button ${isMenuOpen ? "is-open" : ""}`}
              aria-label={
                isMenuOpen ? "ページメニューを閉じる" : "ページメニューを開く"
              }
              aria-expanded={isMenuOpen}
              onClick={() => {
                setIsHeaderVisible(true);
                setIsMenuOpen((prev) => !prev);
              }}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div
        className={`app-menu-drawer ${isMenuOpen ? "is-open" : ""}`}
        aria-hidden={!isMenuOpen}
        onClick={() => {
          setIsMenuOpen(false);
          setIsHeaderVisible(true);
        }}
      >
        <nav
          className="app-menu-drawer__panel"
          aria-label="アプリ内ページ移動"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <div className="app-menu-drawer__content">
            <div className="app-menu-drawer__groups">
              {APP_NAV_GROUPS.map((group) => (
                <section className="app-menu-drawer__section" key={group.title}>
                  <h2 className="app-menu-drawer__section-title">
                    {group.title}
                  </h2>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`app-menu-drawer__link ${
                            isActivePath(pathname, item.href)
                              ? "is-current"
                              : ""
                          } ${item.danger ? "app-menu-drawer__link--logout" : ""}`}
                          onClick={() => {
                            setIsHeaderVisible(true);
                            setIsMenuOpen(false);
                          }}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </nav>
      </div>

      {description && (
        <section className="panel app-page__description-card">
          <p>{description}</p>
        </section>
      )}

      {children}
    </main>
  );
}
