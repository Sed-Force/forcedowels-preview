'use client';

import { SignIn } from '@clerk/clerk-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthState } from '@/components/providers/AppProviders';
import { FormStatus } from '@/components/ui/form';

/** Only follow same-origin, path-relative redirect targets (prevents open redirects). */
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

export function LoginPanel() {
  const router = useRouter();
  const target = safeRedirect(useSearchParams().get('redirect'));
  const { isLoaded, isSignedIn } = useAuthState();

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace(target);
  }, [isLoaded, isSignedIn, router, target]);

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <FormStatus kind="error">Sign-in is temporarily unavailable. Please try again shortly.</FormStatus>;
  }

  return (
    <div className="flex min-h-[480px] justify-start" aria-live="polite">
      {!isLoaded && <p className="text-fg-muted">Loading sign-in…</p>}
      {isLoaded && !isSignedIn && (
        <SignIn
          routing="hash"
          fallbackRedirectUrl={target}
          appearance={{
            variables: {
              colorPrimary: '#224d8f',
              colorBackground: 'var(--card)',
              colorText: 'var(--fg)',
              colorInputBackground: 'var(--field)',
              colorInputText: 'var(--fg)',
            },
          }}
        />
      )}
    </div>
  );
}
