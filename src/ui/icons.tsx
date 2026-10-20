import type { ReactNode } from "react";

// A small built-in icon set: inline SVG drawn in the text colour, so the strict CSP needs no icon font
// or image files. Decorative only (aria-hidden); the label next to each icon carries the meaning.

function Icon({ children, cls = "icon" }: { children: ReactNode; cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const AddIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Icon>;

export const LedgerIcon = () => (
  <Icon><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></Icon>
);

export const DashboardIcon = () => (
  <Icon><rect x="3" y="12" width="4" height="8" rx="1" /><rect x="10" y="7" width="4" height="13" rx="1" /><rect x="17" y="3" width="4" height="17" rx="1" /></Icon>
);

export const SplitsIcon = () => (
  <Icon><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5.5" /></Icon>
);

export const ForecastIcon = () => <Icon><path d="M3 17l5-5 4 3 8-8" /><path d="M15 7h5v5" /></Icon>;

export const SettingsIcon = () => (
  <Icon>
    <path d="M10.27 4.8L10.72 2.49L13.28 2.49L13.73 4.8L15.87 5.69L17.82 4.37L19.63 6.18L18.31 8.13L19.2 10.27L21.51 10.72L21.51 13.28L19.2 13.73L18.31 15.87L19.63 17.82L17.82 19.63L15.87 18.31L13.73 19.2L13.28 21.51L10.72 21.51L10.27 19.2L8.13 18.31L6.18 19.63L4.37 17.82L5.69 15.87L4.8 13.73L2.49 13.28L2.49 10.72L4.8 10.27L5.69 8.13L4.37 6.18L6.18 4.37L8.13 5.69Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

// Small glyphs in the same stroke as the tab icons: period arrows, back links, row chevrons, close and remove.
export const PrevIcon = () => <Icon cls="icon glyph"><path d="M14.5 6l-6 6 6 6" /></Icon>;
export const NextIcon = () => <Icon cls="icon glyph"><path d="M9.5 6l6 6-6 6" /></Icon>;
export const CloseIcon = () => <Icon cls="icon glyph"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Icon>;
