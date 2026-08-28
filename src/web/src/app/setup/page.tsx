"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildFatalErrorPageHref,
  shouldShowFatalErrorPage,
  type ApiErrorInfo,
} from "@/shared/api/endpoints-client";
import { LoadingRacePanel } from "@/shared/components/loading-race";
import { AppShell } from "@/shared/layout/app-shell";
import { AuthIdentitiesSettingsView } from "@/shared/settings/views/auth-identities-settings-view";
import { PersonalTimetableSettingsView } from "@/shared/settings/views/personal-timetable-settings-view";
import { ProfileSettingsView } from "@/shared/settings/views/profile-settings-view";
import { WebSettingsView } from "@/shared/settings/views/web-settings-view";
import {
  fetchSetupSnapshot,
  resolveActiveSetupStepId,
  SETUP_STEP_DEFINITIONS,
  type SetupSnapshot,
  type SetupStepId,
} from "@/shared/setup/setup-flow";

type SetupErrorState =
  | ApiErrorInfo
  | { type: "network_error"; message: string };

function stepLabel(stepId: SetupStepId): string {
  const found = SETUP_STEP_DEFINITIONS.find((step) => step.id === stepId);
  return found?.title ?? stepId;
}

export default function SetupFlowPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<SetupErrorState | null>(null);
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null>(null);

  const loadSnapshot = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      const result = await fetchSetupSnapshot();
      if (result.type === "no_auth") {
        router.replace("/login");
        return;
      }

      if (result.type === "error") {
        const setupError = result.error as ApiErrorInfo;
        if (shouldShowFatalErrorPage(setupError)) {
          router.replace(buildFatalErrorPageHref(setupError));
          return;
        }

        setError(result.error);
        if (showLoading) {
          setIsLoading(false);
        }
        return;
      }

      setSnapshot(result.snapshot);
      if (showLoading) {
        setIsLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSnapshot();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSnapshot]);

  const activeStepId = useMemo<SetupStepId>(() => {
    if (!snapshot) {
      return "verify-student";
    }

    return resolveActiveSetupStepId(snapshot);
  }, [snapshot]);

  const activeStepIndex = useMemo(() => {
    const index = SETUP_STEP_DEFINITIONS.findIndex(
      (step) => step.id === activeStepId,
    );
    return index >= 0 ? index + 1 : 1;
  }, [activeStepId]);

  const totalStepCount = SETUP_STEP_DEFINITIONS.length;

  const handleStepMutation = useCallback(() => {
    void loadSnapshot(false);
  }, [loadSnapshot]);

  return (
    <AppShell
      title="セットアップ"
      description="アカウントの初期設定をステップ形式で進めます。"
      requireVerifiedStudent={false}
      requireSetupCompletion={false}
    >
      {isLoading && <LoadingRacePanel message="セットアップ状態を確認中..." />}

      {!isLoading && error && (
        <section className="panel panel-error">
          <h2>セットアップ状態の取得に失敗しました</h2>
          <p>{error.message}</p>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              void loadSnapshot();
            }}
          >
            再試行
          </button>
        </section>
      )}

      {!isLoading && !error && snapshot && (
        <>
          <section className="panel settings-card">
            <h2>
              ステップ {activeStepIndex}/{totalStepCount} :{" "}
              {stepLabel(activeStepId)}
            </h2>
            <p className="settings-note">
              {activeStepId === "web-ui"
                ? "このステップは任意です。必要に応じて設定した後、ホームへ進んでください。"
                : "現在のステップを完了すると次のステップへ進みます。"}
            </p>
          </section>

          {activeStepId === "verify-student" && (
            <AuthIdentitiesSettingsView
              onStatusChange={(status) => {
                if (status.isVerifiedAsStudent) {
                  handleStepMutation();
                }
              }}
            />
          )}

          {activeStepId === "profile" && (
            <ProfileSettingsView
              reloadOnSave={false}
              onSaved={handleStepMutation}
            />
          )}

          {activeStepId === "personal-timetable" && (
            <PersonalTimetableSettingsView
              reloadOnSave={false}
              onSaved={handleStepMutation}
            />
          )}

          {activeStepId === "web-ui" && (
            <>
              <section className="panel settings-card">
                <h2>最終ステップ（任意）</h2>
                <p className="settings-note">
                  ホームUI設定は後からでも変更できます。スキップしてホームへ進むことも可能です。
                </p>
                <div className="hero-actions">
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => {
                      router.replace("/home");
                    }}
                  >
                    スキップしてホームへ
                  </button>
                </div>
              </section>

              <WebSettingsView
                reloadOnSave={false}
                onSaved={handleStepMutation}
              />

              <section className="panel">
                <div className="hero-actions">
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      router.replace("/home");
                    }}
                  >
                    セットアップを完了してホームへ
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
