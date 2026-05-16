// Header — vinyl record shop branding
export default function Header({ query, onQuery }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper-warm/85 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1380px] grid-cols-[auto_1fr_auto] items-center gap-8 px-8 py-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full border border-ink bg-accent">
            <span className="block h-2.5 w-2.5 rounded-full bg-paper-warm shadow-[0_0_0_4px_var(--color-accent),0_0_0_5px_var(--color-ink)]" />
          </div>
          <div>
            <div className="font-mono text-sm font-semibold tracking-[0.5px] text-ink">FİLM ELEŞTİRMENİ</div>
            <div className="font-mono text-[10px] tracking-[0.3px] text-ink-mute">A small record shop for cinema · Est. 2025</div>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2.5 rounded-full border border-line bg-white/35 px-4 py-2 focus-within:border-ink focus-within:bg-white/55">
          <span className="font-mono text-[11px] tracking-[0.5px] text-ink-mute">FIND →</span>
          <input
            className="flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-mute"
            placeholder="başlık, yönetmen veya tür…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => onQuery("")} className="text-lg text-ink-mute hover:text-ink">×</button>
          )}
        </div>

        {/* Nav */}
        <nav className="hidden gap-5 md:flex">
          {["RAFLAR", "MODLAR", "DEFTERIM"].map(item => (
            <span key={item} className="cursor-pointer font-mono text-[11px] tracking-[1px] text-ink-soft hover:text-accent">{item}</span>
          ))}
        </nav>
      </div>
    </header>
  );
}
