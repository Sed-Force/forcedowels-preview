'use client';

import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { CartProvider } from './CartProvider';

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  /** Fresh Clerk session JWT for authenticating API calls, or null for guests. */
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const signedOutState: AuthState = {
  isLoaded: true,
  isSignedIn: false,
  getToken: async () => null,
  signOut: async () => {},
};

const AuthContext = createContext<AuthState>(signedOutState);

/** App-level auth state; works (as a guest) even if Clerk is not configured. */
export const useAuthState = () => useContext(AuthContext);

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const value = useMemo<AuthState>(
    () => ({
      isLoaded,
      isSignedIn: !!isSignedIn,
      getToken: () => getToken({ skipCache: true }),
      signOut: () => signOut(),
    }),
    [isLoaded, isSignedIn, getToken, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    console.error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set — sign-in is disabled.');
    return <CartProvider>{children}</CartProvider>;
  }
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <ClerkAuthBridge>
        <CartProvider>{children}</CartProvider>
      </ClerkAuthBridge>
    </ClerkProvider>
  );
}
