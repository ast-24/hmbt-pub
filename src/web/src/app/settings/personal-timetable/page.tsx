"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { PersonalTimetableSettingsView } from "@/shared/settings/views/personal-timetable-settings-view";

export default function PersonalTimetableSettingsPage() {
  return (
    <AppShell
      title="個人時間割"
      description="選択ID(A-J)ごとに授業を編集できます。未設定の選択IDは空きコマとして扱われます。"
    >
      <PersonalTimetableSettingsView />
    </AppShell>
  );
}
