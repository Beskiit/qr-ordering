import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍽️</span>
          <span className="font-bold text-lg">QR Ordering</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/demo-cafe/menu" className="text-gray-600 hover:text-gray-900">
            Live demo
          </Link>
          <Link
            href="/admin/login"
            className="rounded-lg border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
          >
            Super admin
          </Link>
        </nav>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-2xl">
          Scan. Order. <span className="text-brand">Enjoy.</span>
        </h1>
        <p className="mt-4 max-w-xl text-gray-600 text-lg">
          A multi-tenant QR ordering platform. Each restaurant gets its own
          branded menu — colors, logo, and all. Customers scan a table QR code
          and order straight from their phone.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/demo-cafe/menu" className="btn-brand">
            Try the demo menu
          </Link>
          <Link
            href="/demo-cafe/login"
            className="rounded-[0.625rem] border border-gray-300 bg-white px-5 py-2.5 font-semibold hover:bg-gray-50"
          >
            Staff login (demo)
          </Link>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3 max-w-4xl text-left">
          {[
            ["📱", "No app needed", "Customers scan the table QR and order from the browser."],
            ["🎨", "Your brand", "Every tenant sets their own colors and logo — the whole storefront adapts."],
            ["⚡", "Live orders", "Staff dashboards update in real time as orders come in."],
          ].map(([icon, title, desc]) => (
            <div key={title} className="card p-5">
              <div className="text-2xl">{icon}</div>
              <h3 className="mt-2 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-gray-400">
        QR Ordering SaaS — Next.js + Supabase
      </footer>
    </main>
  );
}
