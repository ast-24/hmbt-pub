"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { WebSettingsView } from "@/shared/settings/views/web-settings-view";

export default function WebSettingsPage() {
  return (
    <AppShell
      title="ホーム画面の表示"
      description="テーマやウィジェットの並び順を変更できます。"
    >
      <WebSettingsView />
    </AppShell>
  );
}
