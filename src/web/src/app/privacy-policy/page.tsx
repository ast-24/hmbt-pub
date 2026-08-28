import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <main className="welcome-page">
      <section className="hero-card">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>プライバシーポリシー</h1>
        <p>
          本ポリシーは、はちまきBOT v5 for
          web（以下「本アプリ」）における利用者情報の取り扱いを定めるものです。
        </p>
        <div className="hero-actions">
          <Link href="/terms-of-service" className="button ghost">
            利用規約へ
          </Link>
          <Link href="/" className="button ghost">
            トップへ
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2>1. 取得する情報</h2>
        <p>
          本アプリは、ログインに必要な認証情報、プロフィール情報、表示設定、予定表・時間割・カフェメニュー表示に必要な情報など、サービス提供に必要な範囲で情報を取得します。
        </p>
      </section>

      <section className="panel">
        <h2>2. 利用目的</h2>
        <p>
          取得した情報は、認証、画面表示、機能提供、障害対応、セキュリティ対策のために利用します。
        </p>
      </section>

      <section className="panel">
        <h2>3. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得した情報を本人の同意なく第三者へ提供しません。
        </p>
      </section>

      <section className="panel">
        <h2>4. セキュリティ</h2>
        <p>
          本アプリは、不正アクセス防止その他の合理的な安全管理措置を講じ、取得情報の漏えい・滅失・改ざん防止に努めます。
        </p>
      </section>

      <section className="panel">
        <h2>5. 開示・訂正等</h2>
        <p>
          本人から保有情報に関する開示・訂正・利用停止等の申し出があった場合は、合理的な範囲で対応します。
        </p>
      </section>

      <section className="panel">
        <h2>6. 改定</h2>
        <p>
          本ポリシーは、必要に応じて改定されることがあります。改定後は本ページに掲載した時点で効力を生じます。
        </p>
        <p>制定日: 2026年4月7日</p>
      </section>
    </main>
  );
}
