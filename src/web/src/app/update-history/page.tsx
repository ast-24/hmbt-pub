import Link from "next/link";

export default function UpdateHistoryPage() {
  return (
    <main className="welcome-page">
      <section className="hero-card">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>更新履歴</h1>
        <p>はちまきBOT の主な更新内容を、バージョンごとにまとめています。</p>
        <p>(for web 提供前であるv4以前も含む)</p>
        <div className="hero-actions">
          <Link href="/" className="button ghost">
            トップへ
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2>v5.2(2026)</h2>
        <ul>
          <li>「次の電車」関連機能を追加(復活)</li>
        </ul>
      </section>

      <section className="panel">
        <h2>v5.1(2026)</h2>
        <ul>
          <li>
            個人予定ウィジェットに、表示期間を任意に切り替える機能を追加。
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2>v5(2026/4)</h2>
        <ul>
          <li>科目選択対応に合わせた1年ぶりの大幅アップデート。</li>
          <li>
            これまでの LINE
            BOTに加え、ウィジェットシステムを導入したWebダッシュボードを提供開始。
          </li>
          <li>外部カレンダー連携（iCal URL発行）も対応。</li>
          <li>インフラを Cloudflare + AWS + TiDB という大規模構成に刷新。</li>
        </ul>
      </section>

      <section className="panel">
        <h2>v4(2024/6)</h2>
        <ul>
          <li>LINE BOT のまま、対象を学年全体に拡大</li>
          <li>インフラを AWS に移行し安定化</li>
        </ul>
      </section>

      <section className="panel">
        <h2>v3(2024/6)</h2>
        <ul>
          <li>LINE BOT 版を追加</li>
          <li>ここで はちまきBOT が誕生(以前はi5systemという名称だった)</li>
        </ul>
      </section>

      <section className="panel">
        <h2>v2(2024/5)</h2>
        <ul>
          <li>Discord BOT のまま、時間割通知機能をクラスメイトにも提供開始</li>
        </ul>
      </section>

      <section className="panel">
        <h2>v1(2024/4)</h2>
        <ul>
          <li>Discord BOT のみ、サーバは GAS という最初期バージョン</li>
          <li>自分専用統合通知システムとして運営開始</li>
        </ul>
      </section>
    </main>
  );
}
