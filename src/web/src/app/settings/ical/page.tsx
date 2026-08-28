"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { IcalSettingsView } from "@/shared/settings/views/ical-settings-view";

export default function IcalSettingsPage() {
  return (
    <AppShell
      title="外部カレンダー連携"
      description="連携用のカレンダーURL(iCal)を発行して管理できます。"
    >
      <IcalSettingsView />
    </AppShell>
  );
}
