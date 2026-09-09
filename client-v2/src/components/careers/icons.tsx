import type { ReactNode, SVGProps } from 'react';

/** Small inline icon set used across careers pages. */
function makeIcon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {path}
      </svg>
    );
  };
}

export const IconSearch = makeIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </>
);

export const IconPin = makeIcon(
  <>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </>
);

export const IconBriefcase = makeIcon(
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
  </>
);

export const IconCoins = makeIcon(
  <>
    <circle cx="9" cy="14" r="6" />
    <circle cx="16" cy="8" r="6" />
    <path d="M15.5 9h1M6 12.5h1" />
  </>
);

export const IconClock = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);

export const IconCalendar = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </>
);

export const IconArrowRight = makeIcon(<path d="M5 12h14m-6-6 6 6-6 6" />);

export const IconChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />);

export const IconPlus = makeIcon(<path d="M12 5v14M5 12h14" />);

export const IconCheck = makeIcon(<path d="m5 13 4 4L19 7" />);

export const IconX = makeIcon(<path d="M6 6l12 12M18 6 6 18" />);

export const IconMenu = makeIcon(<path d="M4 7h16M4 12h16M4 17h16" />);

export const IconMail = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>
);

export const IconPhone = makeIcon(
  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
);

export const IconUsers = makeIcon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5.5a3.5 3.5 0 1 1 0 7" />
    <path d="M18.5 15.4c1.6.6 2.7 1.9 3 3.6" />
  </>
);

export const IconRocket = makeIcon(
  <>
    <path d="M12 3c3.5 0 6 2.5 6 6 0 5-4 9-6 12-2-3-6-7-6-12 0-3.5 2.5-6 6-6Z" />
    <circle cx="12" cy="9" r="2" />
    <path d="M19 6c1-1 2-1 3-3-2 1-2 2-3 3Z" />
  </>
);

export const IconOffice = makeIcon(
  <>
    <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 9h2a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2" />
  </>
);

export const IconShield = makeIcon(
  <>
    <path d="M12 3 4 6v6c0 4.5 3.2 7.4 8 9 4.8-1.6 8-4.5 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </>
);

export const IconUpload = makeIcon(
  <>
    <path d="M12 15V4m0 0L7 9m5-5 5 5" />
    <path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </>
);

export const IconDoc = makeIcon(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </>
);

export const IconLogOut = makeIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </>
);

export const IconChevronRight = makeIcon(<path d="m9 6 6 6-6 6" />);

export const IconBuilding = makeIcon(
  <>
    <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
  </>
);