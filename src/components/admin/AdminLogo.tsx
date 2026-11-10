import Image from 'next/image';
import Link from 'next/link';
import { navLogo } from '@/components/layout/navStyles';

/** Same logo lockup as the storefront navbar, plus an "Admin" tag. */
export function AdminLogo({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" aria-label="Force Dowel Company — back to site" onClick={onClick} className="flex items-center gap-3 leading-[0]">
      <Image src="/images/LOGO_Icon-FullColor@512.png" alt="" width={512} height={512} className={navLogo} priority />
      <Image src="/images/LOGO_Wordmark-White@512.png" alt="Force Dowel Company" width={512} height={129} className={navLogo} priority />
      <span className="rounded-full bg-accent px-2.5 py-1 text-xs leading-none font-extrabold tracking-[0.06em] text-black uppercase max-[340px]:hidden">
        Admin
      </span>
    </Link>
  );
}
