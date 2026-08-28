import Link from "next/link";

export default function Home() {
  return (
    <main className="welcome-page">
      <section className="crawler-fallback" aria-label="クローラー向け情報">
        <h2>はちまきBOT v5 for web</h2>
        <p>
          学校生活で使う時間割・授業メモ・カフェメニュー等の情報を確認できるWebアプリです。
        </p>
        <p>
          <a href="/privacy-policy">プライバシーポリシー</a>
          {" | "}
          <a href="/terms-of-service">利用規約</a>
        </p>
      </section>

      <section className="hero-card">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>学校生活の情報を、ひとつのホーム画面に集約する。</h1>
        <p>
          はちまきBOTは、時間割・授業メモ・カフェメニューなど、学校生活で使う情報をまとめて確認できるアプリです。
        </p>

        <div className="hero-actions">
          <Link href="/home" className="button primary">
            Web版を開く
          </Link>
        </div>

        <nav className="hero-links" aria-label="ポリシーリンク">
          <Link href="/terms-of-service">利用規約</Link>
          <Link href="/privacy-policy">プライバシーポリシー</Link>
        </nav>
      </section>

      <section className="panel settings-card landing-features">
        <h2>主な機能</h2>
        <ul className="landing-features__list">
          <li>LINE版: 週予定・個人時間割・カフェメニューをトークから確認</li>
          <li>
            外部カレンダー連携: iCal URL発行でGoogle/Appleカレンダーに同期
          </li>
          <li>選択科目の適用: 個人時間割を設定するとクラス時間割へ自動反映</li>
          <li>授業メモ/デイリーメモ: 授業ごとと日ごとのメモをWebで編集</li>
        </ul>
      </section>
    </main>
  );
}
