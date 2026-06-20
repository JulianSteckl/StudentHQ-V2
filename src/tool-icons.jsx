import React from 'react';

const ICONS = {
  claude: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3.5c-1.2 2.4-2.4 4.3-3.6 5.8-1.2 1.5-2.5 2.6-3.9 3.3 1.4.7 2.7 1.8 3.9 3.3 1.2 1.5 2.4 3.4 3.6 5.8.3-2.8.9-5 1.8-6.6.9-1.6 2-2.8 3.3-3.6-1.3-.8-2.4-2-3.3-3.6-.9-1.6-1.5-3.8-1.8-6.6Z" fill="#c65030"/>
    </svg>
  ),
  notion: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" stroke="#555" strokeWidth="1.5"/>
      <path d="M8 7.5h8M8 12h8M8 16.5h5" stroke="#555" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  figma: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="10" y="3" width="4" height="4" rx="2" fill="#9254de"/>
      <rect x="10" y="10" width="4" height="4" rx="2" fill="#0acf83"/>
      <circle cx="12" cy="19" r="2" fill="#1abcfe"/>
      <rect x="5" y="10" width="4" height="4" rx="2" fill="#f24e1e"/>
      <rect x="15" y="10" width="4" height="4" rx="2" fill="#a259ff"/>
    </svg>
  ),
  notebooklm: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="14" height="18" rx="2" fill="#4285f4" opacity="0.15"/>
      <path d="M7 7h10M7 11h10M7 15h7" stroke="#4285f4" strokeWidth="1.6" strokeLinecap="round"/>
      <circle cx="17" cy="17" r="4" fill="#4285f4"/>
      <path d="M16 17.5l1 1 2-2.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  zapier: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 18 12 6l6 12H6Z" fill="#ff4a00"/>
      <path d="M9.5 14h5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  canva: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill="url(#canva-g)"/>
      <path d="M8.5 15c.8-2.5 1.8-4.2 3-5 1.2.8 2.2 2.5 3 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      <defs>
        <linearGradient id="canva-g" x1="4" y1="4" x2="20" y2="20">
          <stop stopColor="#00c4cc"/>
          <stop offset="1" stopColor="#7d2ae8"/>
        </linearGradient>
      </defs>
    </svg>
  ),
  gemini: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3Z" fill="#4285f4"/>
      <path d="M17 14l.9 2.8L21 17.5l-2.8.8L17 21l-.9-2.7-2.8-.8 2.8-.8L17 14Z" fill="#34a853" opacity="0.85"/>
    </svg>
  ),
  link: ({ s }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M10 14a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 1 0-5-5l-1 1"/>
      <path d="M14 10a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 1 0 5 5l1-1"/>
    </svg>
  ),
};

function faviconUrl(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;
  } catch {
    return null;
  }
}

function ToolBrandIcon({ tool, size = 28 }) {
  const key = tool.icon || tool.id;
  const Icon = ICONS[key];
  const radius = Math.round(size * 0.22);
  const boxStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    background: `${tool.color || '#9a9080'}18`,
    border: `1px solid ${tool.color || '#9a9080'}38`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  };

  if (Icon) {
    return (
      <div style={boxStyle}>
        <Icon s={Math.round(size * 0.62)} />
      </div>
    );
  }

  if (tool.custom && tool.url) {
    const fav = faviconUrl(tool.url);
    if (fav) {
      return (
        <div style={boxStyle}>
          <img src={fav} alt="" width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} style={{display:'block', borderRadius:4}} />
        </div>
      );
    }
  }

  return (
    <div style={boxStyle}>
      {tool.custom
        ? <span style={{color: tool.color || '#9a9080', lineHeight:0}}><ICONS.link s={Math.round(size * 0.48)} /></span>
        : <span style={{fontFamily:'ui-monospace, monospace', fontSize: size * 0.38, color: tool.color || '#9a9080', fontWeight:600}}>{tool.name?.[0] || '?'}</span>
      }
    </div>
  );
}

export { ToolBrandIcon, faviconUrl };
