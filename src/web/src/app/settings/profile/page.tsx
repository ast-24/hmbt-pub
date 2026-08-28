"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { ProfileSettingsView } from "@/shared/settings/views/profile-settings-view";

export default function ProfileSettingsPage() {
  return (
    <AppShell
      title="プロフィール"
      description="表示名・学年・クラスを編集できます。入力した情報は一般公開されません。"
    >
      <ProfileSettingsView />
    </AppShell>
  );
}
