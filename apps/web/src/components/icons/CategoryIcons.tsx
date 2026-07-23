import type { SVGProps } from "react";
import type { ProfessionalCategorySlug } from "@professionisti/shared";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 24, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

function Idraulico(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3a3 3 0 0 0-3 3v1a3 3 0 0 0 1.5 2.6V15a3.5 3.5 0 0 0 7 0V9.6A3 3 0 0 0 16 7V6a3 3 0 0 0-3-3H9Z" />
      <path d="M6 7h6" />
      <path d="M12.5 18.5 21 21" />
    </svg>
  );
}

function Elettricista(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinejoin="round" />
    </svg>
  );
}

function Imbianchino(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="12" height="5" rx="1.3" />
      <path d="M7 9v3.5a1.5 1.5 0 0 0 1.5 1.5H9a1.5 1.5 0 0 1 1.5 1.5V21" />
      <circle cx="10.5" cy="19.5" r="1.5" />
    </svg>
  );
}

function Pulizie(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 3 21 9.5l-2 2-6.5-6.5Z" strokeLinejoin="round" />
      <path d="M13 6.5 4 15.5V20h4.5L17 11.5" />
      <path d="m4 20 2-2" />
    </svg>
  );
}

function Giardiniere(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21c0-6 2-9 7-11-1 6-3 9-7 11Z" strokeLinejoin="round" />
      <path d="M12 21c0-7-2.5-10.5-8-12.5 1 6.5 3.5 10.5 8 12.5Z" strokeLinejoin="round" />
      <path d="M12 13v8" />
    </svg>
  );
}

function Traslochi(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" strokeLinejoin="round" />
      <path d="M3 8.5V16l9 4.5 9-4.5V8.5" />
      <path d="M12 13v7.5" />
    </svg>
  );
}

function Fabbro(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 20 3" />
      <path d="M16 7l3 3" />
      <path d="M18.5 4.5 20 6" />
    </svg>
  );
}

function Climatizzazione(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2v20M4.2 6l15.6 12M4.2 18 19.8 6" />
      <path d="m8.5 4 3.5 3 3.5-3M8.5 20l3.5-3 3.5 3M4.6 9.3l1 3.7-3.7 1M18.1 13l3.7 1-1 3.7M2 12.9l3.7-1M22 11.1l-3.7 1" />
    </svg>
  );
}

function Muratore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 21 15 10l2-2 3 3-2 2L7 24" strokeLinejoin="round" />
      <path d="m13 8 3 3" />
      <rect x="3" y="3" width="7" height="4.5" rx="0.6" />
      <rect x="3" y="10.5" width="3.2" height="4.5" rx="0.6" />
    </svg>
  );
}

function Falegname(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13.5 13.5 3l7.5 7.5L10.5 21Z" strokeLinejoin="round" />
      <path d="m14 8.5-8 8" />
      <circle cx="8.5" cy="15.5" r="0.6" fill="currentColor" />
      <circle cx="10.3" cy="13.7" r="0.6" fill="currentColor" />
      <circle cx="12.1" cy="11.9" r="0.6" fill="currentColor" />
    </svg>
  );
}

function TuttoFare(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="10" width="18" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M3 14h18" />
    </svg>
  );
}

function Oss(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20s-7-4.4-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5c-2.5 4.6-9.5 9-9.5 9Z" strokeLinejoin="round" />
      <path d="M7 12h2l1.5-3 2 6 1.5-3H17" />
    </svg>
  );
}

function Badanti(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8.5" cy="7.5" r="3" />
      <circle cx="17" cy="8.5" r="2.6" />
      <path d="M2.5 20v-1.5A4.5 4.5 0 0 1 7 14h3a4.5 4.5 0 0 1 4.5 4.5V20" />
      <path d="M14.8 14.3A4 4 0 0 1 21.5 17.5V20" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<ProfessionalCategorySlug, (props: IconProps) => JSX.Element> = {
  idraulico: Idraulico,
  elettricista: Elettricista,
  imbianchino: Imbianchino,
  pulizie: Pulizie,
  giardiniere: Giardiniere,
  traslochi: Traslochi,
  fabbro: Fabbro,
  climatizzazione: Climatizzazione,
  muratore: Muratore,
  falegname: Falegname,
  tuttofare: TuttoFare,
  oss: Oss,
  badanti: Badanti,
};

export const CATEGORY_ACCENT: Record<ProfessionalCategorySlug, { bg: string; fg: string }> = {
  idraulico: { bg: "#E3F2FD", fg: "#1565C0" },
  elettricista: { bg: "#FEF3C7", fg: "#B45309" },
  imbianchino: { bg: "#FCE7F3", fg: "#BE185D" },
  pulizie: { bg: "#CCFBF1", fg: "#0F766E" },
  giardiniere: { bg: "#DCFCE7", fg: "#15803D" },
  traslochi: { bg: "#FFEDD5", fg: "#C2410C" },
  fabbro: { bg: "#F1F5F9", fg: "#334155" },
  climatizzazione: { bg: "#CFFAFE", fg: "#0E7490" },
  muratore: { bg: "#FEE2E2", fg: "#B91C1C" },
  falegname: { bg: "#F5E6D3", fg: "#92400E" },
  tuttofare: { bg: "#E0E7FF", fg: "#3730A3" },
  oss: { bg: "#FFE4E6", fg: "#BE123C" },
  badanti: { bg: "#E9D5FF", fg: "#7E22CE" },
};

export function CategoryIcon({ slug, size = 24, color }: { slug: string; size?: number; color?: string }) {
  const Cmp = CATEGORY_ICONS[slug as ProfessionalCategorySlug];
  if (!Cmp) return null;
  return <Cmp size={size} style={color ? { color } : undefined} />;
}
