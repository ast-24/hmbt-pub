import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <main className="welcome-page">
      <section className="hero-card">
        <p className="page-kicker">はちまきBOT v5 for web</p>
        <h1>利用規約</h1>
        <p>
          この利用規約（以下「本規約」）は、はちまきBOT v5 for
          web（以下「本アプリ」）の利用条件を定めるものです。
        </p>
        <div className="hero-actions">
          <Link href="/privacy-policy" className="button ghost">
            プライバシーポリシーへ
          </Link>
          <Link href="/" className="button ghost">
            トップへ
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2>1. 適用</h2>
        <p>
          本規約は、本アプリの利用に関する一切の関係に適用されます。利用者は本規約に同意のうえ、本アプリを利用するものとします。
        </p>
      </section>

      <section className="panel">
        <h2>2. 情報の取り扱い</h2>
        <p>
          本アプリで扱うデータには学校内部情報が含まれる場合があります。利用者は、閲覧した情報を外部へ公開・転載・共有・漏えいさせてはなりません。
        </p>
      </section>

      <section className="panel">
        <h2>3. 禁止事項</h2>
        <p>利用者は、以下の行為を行ってはなりません。</p>
        <ul>
          <li>法令または公序良俗に違反する行為</li>
          <li>
            不正アクセス、脆弱性探索、過剰リクエスト送信、改ざんなどのサイバー攻撃行為
          </li>
          <li>本アプリまたは関連システムの運営を妨害する行為</li>
          <li>他者のアカウントや認証情報を不正に利用する行為</li>
          <li>取得情報を第三者に提供・販売・公開する行為</li>
        </ul>
      </section>

      <section className="panel">
        <h2>4. サービス変更・停止</h2>
        <p>
          運営者は、保守、障害対応、セキュリティ対応その他の理由により、事前通知なく本アプリの全部または一部を変更・停止できるものとします。
        </p>
      </section>

      <section className="panel">
        <h2>5. 免責</h2>
        <p>
          本アプリに掲載される時間割、予定、カフェメニューその他の情報は、入力・更新時期その他の事情により、実際の内容と一致しない場合があります。運営者は、掲載情報の正確性、完全性、有用性および最新性について保証するものではありません。
        </p>
        <p>
          運営者は、本アプリの利用または掲載情報に起因して利用者または第三者に生じた不利益・損害について、法令上許される範囲で責任を負いません。利用者の操作、認証情報管理不備、端末紛失、第三者攻撃等による情報流出については、運営者は責任を負いません。本アプリ経由で情報が流出した場合であっても同様とします。
        </p>
      </section>

      <section className="panel">
        <h2>6. 規約変更</h2>
        <p>
          本規約は、必要に応じて変更されることがあります。変更後の規約は本ページに掲載した時点で効力を生じます。
        </p>
        <p>制定日: 2026年4月7日</p>
      </section>
    </main>
  );
}
