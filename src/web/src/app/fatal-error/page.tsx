"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function firstParam(value: string | null): string | undefined {
  return value ?? undefined;
}

function resolveReturnPath(value: string | undefined): string {
  if (!value) {
    return "/home";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/home";
  }

  if (value.startsWith("/fatal-error")) {
    return "/home";
  }

  return value;
}

function FatalErrorPageContent() {
  const searchParams = useSearchParams();
  const status = firstParam(searchParams.get("status")) ?? "500";
  const code = firstParam(searchParams.get("code")) ?? "INTERNAL_SERVER_ERROR";
  const message =
    firstParam(searchParams.get("message")) ??
    "問題が発生しました。時間をおいて再試行してください。";
  const returnPath = resolveReturnPath(firstParam(searchParams.get("from")));

  return (
    <main className="welcome-page">
      <section className="hero-card panel-error">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>処理を続行できませんでした</h1>
        <p>
          しばらくしてから再試行してください。繰り返し発生する場合は、下の情報を添えて管理者へ連絡してください。
        </p>
      </section>

      <section className="panel panel-error">
        <h2>サポート連絡用の情報</h2>
        <p>
          <strong>状態コード:</strong> {status}
        </p>
        <p>
          <strong>エラーコード:</strong> {code}
        </p>
        <p>
          <strong>メッセージ:</strong> {message}
        </p>
      </section>

      <section className="panel">
        <div className="hero-actions">
          <Link href={returnPath} className="button primary">
            元のページに戻る
          </Link>
          <Link href="/home" className="button ghost">
            ホームへ
          </Link>
          <Link href="/login" className="button ghost">
            ログインへ
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function FatalErrorPage() {
  return (
    <Suspense fallback={<FatalErrorPageContentFallback />}>
      <FatalErrorPageContent />
    </Suspense>
  );
}

function FatalErrorPageContentFallback() {
  return (
    <main className="welcome-page">
      <section className="hero-card panel-error">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>処理を続行できませんでした</h1>
        <p>
          しばらくしてから再試行してください。繰り返し発生する場合は、下の情報を添えて管理者へ連絡してください。
        </p>
      </section>

      <section className="panel panel-error">
        <h2>サポート連絡用の情報</h2>
        <p>
          <strong>状態コード:</strong> 500
        </p>
        <p>
          <strong>エラーコード:</strong> INTERNAL_SERVER_ERROR
        </p>
        <p>
          <strong>メッセージ:</strong>
          問題が発生しました。時間をおいて再試行してください。
        </p>
      </section>

      <section className="panel">
        <div className="hero-actions">
          <Link href="/home" className="button primary">
            元のページに戻る
          </Link>
          <Link href="/home" className="button ghost">
            ホームへ
          </Link>
          <Link href="/login" className="button ghost">
            ログインへ
          </Link>
        </div>
      </section>
    </main>
  );
}
