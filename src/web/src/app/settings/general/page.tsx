"use client";

import Link from "next/link";
import { AppShell } from "@/shared/layout/app-shell";

export default function GeneralSettingsPage() {
  return (
    <AppShell title="詳細設定" description="現在詳細設定項目はありません。">
      <section className="panel settings-card">
        <h2>現在詳細設定項目はありません</h2>
        <p className="settings-note">
          必要な設定は各機能の専用画面から行ってください。
        </p>
        <div className="hero-actions">
          <Link href="/settings/profile" className="button ghost">
            プロフィール設定へ
          </Link>
          <Link href="/settings/web" className="button ghost">
            ホーム画面設定へ
          </Link>
          <Link href="/settings/personal-timetable" className="button ghost">
            個人時間割設定へ
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
