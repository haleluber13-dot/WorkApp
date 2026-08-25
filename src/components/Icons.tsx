/** Hand-drawn-ish line icons, 24px grid, inheriting currentColor. No icon library. */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" {...rest}
    >
      {children}
    </svg>
  )
}

/** The Ombak mark: a low sun over a curling wave. Used for the app's identity. */
export const Logo = ({ size = 24, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" {...rest}>
    <defs>
      <linearGradient id="ob-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe08a" /><stop offset="0.5" stopColor="#ffd166" /><stop offset="1" stopColor="#ff7a59" />
      </linearGradient>
      <clipPath id="ob-tile"><rect width="512" height="512" rx="114" /></clipPath>
    </defs>
    <g clipPath="url(#ob-tile)">
      <circle cx="256" cy="236" r="104" fill="url(#ob-sun)" />
      <path d="M-20 372c78-46 132 18 210 18s118-64 196-30 106 26 146 4v168H-20z" fill="currentColor" opacity="0.55" />
      <path d="M-20 410c84-44 138 20 214 20s120-60 194-28 100 22 144 2v152H-20z" fill="currentColor" opacity="0.85" />
      <path d="M36 386c46-26 84 10 128 14" stroke="#8ff0e0" strokeWidth="17" strokeLinecap="round" fill="none" />
    </g>
  </svg>
)

export const IconWave = (p: P) => (
  <Svg {...p}><path d="M2 15c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 3.5-1.6 5 0" /><path d="M2 19.5c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 3.5-1.6 5 0" /><circle cx="12" cy="6.5" r="3.5" /></Svg>
)
export const IconSun = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
)
export const IconMoon = (p: P) => (
  <Svg {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></Svg>
)
export const IconPalm = (p: P) => (
  <Svg {...p}><path d="M12 21c0-5 .5-8 1.5-10.5" /><path d="M13.5 10.5C11 8.5 7.5 8 5 10" /><path d="M13.5 10.5c1-3 4-5 7-4.5" /><path d="M13.5 10.5C13 7 10.5 4 7.5 3.5" /><path d="M13.5 10.5c2.5-.5 5 .5 6.5 2.5" /><path d="M8 21h9" /></Svg>
)
export const IconHome = (p: P) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" /><path d="M9.5 21v-6h5v6" /></Svg>
)
export const IconTimeline = (p: P) => (
  <Svg {...p}><path d="M4 6h11M4 12h16M4 18h8" /><circle cx="18" cy="6" r="2" /><circle cx="14" cy="18" r="2" /></Svg>
)
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></Svg>
)
export const IconWallet = (p: P) => (
  <Svg {...p}><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a1 1 0 0 1 1 1v1.5" /><rect x="3" y="8.5" width="18" height="11.5" rx="2.5" /><path d="M16.5 14.2h2.2" /></Svg>
)
export const IconCoins = (p: P) => (
  <Svg {...p}><ellipse cx="9" cy="6.5" rx="6" ry="2.8" /><path d="M3 6.5v4c0 1.5 2.7 2.8 6 2.8s6-1.3 6-2.8v-4" /><path d="M15 11.6c3.1.2 6 1.4 6 2.8v3.3c0 1.5-2.7 2.8-6 2.8s-6-1.3-6-2.8v-3.6" /></Svg>
)
export const IconReceipt = (p: P) => (
  <Svg {...p}><path d="M6 2.5h12v19l-2.5-1.8-2.5 1.8-2.5-1.8-2.5 1.8L6 19.7Z" /><path d="M9.5 8h5M9.5 12h5" /></Svg>
)
export const IconChart = (p: P) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
)
export const IconSettings = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 14a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.6 4 2 2 0 1 1 14.6 4a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20 10a2 2 0 1 1 0 4Z" /></Svg>
)
export const IconPlus = (p: P) => (<Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>)
export const IconCheck = (p: P) => (<Svg {...p}><path d="M4 12.5 9 17.5 20 6.5" /></Svg>)
export const IconX = (p: P) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>)
export const IconChevronLeft = (p: P) => (<Svg {...p}><path d="M15 5l-7 7 7 7" /></Svg>)
export const IconChevronRight = (p: P) => (<Svg {...p}><path d="M9 5l7 7-7 7" /></Svg>)
export const IconChevronDown = (p: P) => (<Svg {...p}><path d="M5 9l7 7 7-7" /></Svg>)
export const IconPlay = (p: P) => (<Svg {...p}><path d="M7 4.5v15l12-7.5Z" /></Svg>)
export const IconStop = (p: P) => (<Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2.5" /></Svg>)
export const IconTrash = (p: P) => (
  <Svg {...p}><path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /><path d="M10.5 11v6M13.5 11v6" /></Svg>
)
export const IconDownload = (p: P) => (<Svg {...p}><path d="M12 3v12" /><path d="M7.5 10.5 12 15l4.5-4.5" /><path d="M4 20h16" /></Svg>)
export const IconUpload = (p: P) => (<Svg {...p}><path d="M12 15V3" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M4 20h16" /></Svg>)
export const IconTarget = (p: P) => (<Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></Svg>)
export const IconFire = (p: P) => (
  <Svg {...p}><path d="M12 22c3.9 0 6.5-2.6 6.5-6.2 0-4.4-4-6-4.7-10.8-1.9 1.3-3 3-3 5 0 1.3-.8 2-1.6 2-.9 0-1.4-.7-1.5-1.7-1.4 1.6-2.2 3.6-2.2 5.5C5.5 19.4 8.1 22 12 22Z" /></Svg>
)
export const IconAlert = (p: P) => (<Svg {...p}><path d="M12 3.5 22 20H2Z" /><path d="M12 10v4.5M12 17.5v.01" /></Svg>)
export const IconSurf = (p: P) => (
  <Svg {...p}><path d="M3 20c3.5 0 6-1 8.5-3.5S17 9 17 4c-4 1.5-7 4-9.5 7.5S3 18 3 20Z" /><path d="M15 15c2.5 0 4.5 1.5 6 3" /></Svg>
)
export const IconShell = (p: P) => (
  <Svg {...p}><path d="M12 21C7 21 3 17 3 12a9 9 0 0 1 18 0c0 5-4 9-9 9Z" /><path d="M12 21V3M12 21c-2-4-3.5-8-3.5-13M12 21c2-4 3.5-8 3.5-13" /></Svg>
)
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
)
export const IconNote = (p: P) => (
  <Svg {...p}><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></Svg>
)
export const IconCar = (p: P) => (
  <Svg {...p}><path d="M5 17h14" /><path d="M4 17v-4.2l1.8-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.5L20 12.8V17" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /><path d="M4 12.8h16" /></Svg>
)
export const IconFood = (p: P) => (
  <Svg {...p}><path d="M6 3v8a2.5 2.5 0 0 0 5 0V3M8.5 11v10" /><path d="M17 3c-1.5 1.5-2 3.5-2 5.5s.7 3 2 3.5v9" /></Svg>
)
export const IconCamera = (p: P) => (
  <Svg {...p}><rect x="2.5" y="6.5" width="19" height="13" rx="2.5" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6.5l1.2-2h5.6l1.2 2" /></Svg>
)
export const IconInfo = (p: P) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></Svg>)
export const IconSearch = (p: P) => (<Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>)
export const IconCopy = (p: P) => (
  <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" /></Svg>
)
export const IconPrint = (p: P) => (
  <Svg {...p}><path d="M7 9V3.5h10V9" /><rect x="3.5" y="9" width="17" height="7.5" rx="2" /><path d="M7 14h10v6.5H7Z" /></Svg>
)
export const IconBoat = (p: P) => (
  <Svg {...p}><path d="M4 16.5h16l-2 4H6Z" /><path d="M12 16.5V3l7 9.5H5" /></Svg>
)
export const IconPin = (p: P) => (
  <Svg {...p}><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></Svg>
)
export const IconCrosshair = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="1.6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>
)
export const IconExternal = (p: P) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" /></Svg>
)
export const IconSparkle = (p: P) => (
  <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" /></Svg>
)
