import { cn } from '@/lib/cn';

/** Shared by the storefront navbar and the admin header so both read as one family. Below 900px the nav collapses into a drawer. */
export const navLinkStyles =
  "relative inline-flex items-center gap-1.5 bg-transparent p-0 text-base leading-none font-extrabold text-white opacity-95 after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-0 after:bg-current after:opacity-70 after:transition-[width] after:duration-200 hover:text-accent-light hover:opacity-100 hover:after:w-full max-[900px]:w-full max-[900px]:justify-between max-[900px]:px-1 max-[900px]:py-[13px] max-[900px]:text-[17px] max-[900px]:after:hidden";
export const navActiveLinkStyles = 'text-accent opacity-100 after:w-full';

export const navLogo = 'h-[42px] w-auto object-contain max-[900px]:h-7 max-[340px]:h-[22px]';

/** The link group: a row on desktop, a full-width drawer under the header on mobile. */
export const navDrawer = (open: boolean) =>
  cn(
    'flex items-center justify-center gap-[22px]',
    'max-[900px]:absolute max-[900px]:inset-x-0 max-[900px]:top-full max-[900px]:max-h-[calc(100vh-var(--header-h))] max-[900px]:flex-col max-[900px]:items-stretch max-[900px]:justify-start max-[900px]:gap-0.5 max-[900px]:overflow-y-auto max-[900px]:border-b max-[900px]:border-white/12 max-[900px]:bg-brand-ink max-[900px]:p-4 max-[900px]:shadow-[0_16px_28px_rgb(0_0_0/0.22)]',
    !open && 'max-[900px]:hidden',
  );
