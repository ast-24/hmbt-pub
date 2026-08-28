"use client";

import { useEffect } from "react";

import {
  reportWebErrorToAdminMessenger,
  toErrorMessage,
} from "@/shared/admin-messenger";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

export default function GlobalError({
  error,
  unstable_retry,
}: GlobalErrorProps) {
  useEffect(() => {
    void reportWebErrorToAdminMessenger({
      summary: "Unhandled global error in web app",
      message: toErrorMessage(error),
      stack: error.stack,
      level: "fatal",
      context: {
        digest: error.digest,
      },
    });
  }, [error]);

  return (
    <html lang="ja">
      <body className="min-h-full">
        <main className="page-shell">
          <section className="panel panel-error">
            <h1>予期しないエラーが発生しました</h1>
            <p>
              時間を置いて再試行してください。問題が続く場合は運営に連絡してください。
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  unstable_retry();
                }}
              >
                再試行
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
