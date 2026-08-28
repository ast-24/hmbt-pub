"use client";

import { AppShell } from "@/shared/layout/app-shell";
import { AuthIdentitiesSettingsView } from "@/shared/settings/views/auth-identities-settings-view";

export default function AuthIdentitiesSettingsPage() {
  return (
    <AppShell
      title="ログイン方法"
      description="このアカウントで使うログイン方法を追加・削除できます。"
      requireVerifiedStudent={false}
    >
      <AuthIdentitiesSettingsView />
    </AppShell>
  );
}
