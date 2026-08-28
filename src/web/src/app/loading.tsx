import { LoadingRacePanel } from "@/shared/components/loading-race";

export default function GlobalLoading() {
  return (
    <main className="loading-screen">
      <LoadingRacePanel message="読み込み中..." />
    </main>
  );
}
