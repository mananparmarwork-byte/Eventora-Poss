export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ev-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0C966" />
          <stop offset="1" stopColor="#D9A53A" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#080B12" stroke="#33415A" />
      <g fill="url(#ev-gold)">
        <rect x="18" y="16" width="28" height="6" rx="3" />
        <rect x="18" y="29" width="20" height="6" rx="3" />
        <rect x="18" y="42" width="28" height="6" rx="3" />
      </g>
      <circle cx="47" cy="32" r="3.5" fill="#F7F5EF" />
    </svg>
  );
}

export function Brand({ collapsed = false, subtitle = 'Event OS' }: { collapsed?: boolean; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <LogoMark />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-lg font-semibold tracking-tight text-text">Eventora <span className="text-gold">OS</span></p>
          <p className="truncate text-[11px] text-text-secondary">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
