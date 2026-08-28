"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { ClassTimetableSettingsView } from "@/shared/settings/views/class-timetable-settings-view";

export default function ClassTimetableSettingsPage() {
  return (
    <AppShell
      title="クラス時間割"
      description="クラス全体の時間割を編集できます。各コマを通常授業または選択IDで設定できます。"
    >
      <ClassTimetableSettingsView />
    </AppShell>
  );
}
