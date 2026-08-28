"use client";

import type { CSSProperties } from "react";

type LoadingRacePanelProps = {
  message?: string;
};

const RUNNER_COLORS = [
  "#facc15",
  "#ef4444",
  "#3b82f6",
  "#f97316",
  "#22c55e",
  "#ec4899",
];
const RUNNER_DURATION_SCALE = 1.25;

type RunnerSpec = {
  id: number;
  durationSec: number;
  delaySec: number;
  color: string;
};

const DEFAULT_RUNNERS: RunnerSpec[] = [
  {
    id: 0,
    durationSec: 2.8 * RUNNER_DURATION_SCALE,
    delaySec: -1.2 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[0],
  },
  {
    id: 1,
    durationSec: 2.3 * RUNNER_DURATION_SCALE,
    delaySec: -0.6 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[1],
  },
  {
    id: 2,
    durationSec: 3.2 * RUNNER_DURATION_SCALE,
    delaySec: -1.7 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[2],
  },
  {
    id: 3,
    durationSec: 2.5 * RUNNER_DURATION_SCALE,
    delaySec: -1.0 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[3],
  },
  {
    id: 4,
    durationSec: 2.9 * RUNNER_DURATION_SCALE,
    delaySec: -2.1 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[4],
  },
  {
    id: 5,
    durationSec: 2.2 * RUNNER_DURATION_SCALE,
    delaySec: -1.4 * RUNNER_DURATION_SCALE,
    color: RUNNER_COLORS[5],
  },
];

export function LoadingRacePanel({
  message = "読み込み中...",
}: LoadingRacePanelProps) {
  const runners = DEFAULT_RUNNERS;

  return (
    <section className="loading-race-wrap" aria-live="polite" aria-busy="true">
      <div className="loading-race" role="status">
        <p className="loading-race__message">{message}</p>
        <p className="loading-race__hint">データを取得中...</p>
        <div className="loading-race__band" aria-hidden="true">
          <div className="loading-race__progress" />
          {runners.map((runner) => (
            <div
              className="loading-race__runner"
              key={runner.id}
              style={
                {
                  "--runner-duration": `${runner.durationSec.toFixed(2)}s`,
                  "--runner-delay": `${runner.delaySec.toFixed(2)}s`,
                  "--runner-color": runner.color,
                  "--runner-row": `${runner.id}`,
                } as CSSProperties
              }
            >
              <span className="loading-race__head" />
              <span className="loading-race__body" />
              <span className="loading-race__leg loading-race__leg--left" />
              <span className="loading-race__leg loading-race__leg--right" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
