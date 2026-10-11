import { Suspense } from 'react';
import Link from 'next/link';
import { AppLogo } from '~/components/app-logo';
import { AppNavigation } from './app-navigation';

export function AppShell({
  children,
  preview = false,
  account,
}: React.PropsWithChildren<{ preview?: boolean; account?: React.ReactNode }>) {
  const base = preview ? '/preview' : '/home';
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="bg-card fixed top-2 left-2 z-50 -translate-y-24 rounded-lg p-3 focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-[20px] pt-3 sm:px-[32px] md:py-2">
          <AppLogo href={base} className="min-w-0 flex-1 md:flex-none" />
          {!preview && <div className="ml-auto md:order-3">{account}</div>}
          <div className="w-full md:ml-auto md:w-auto">
            <Suspense fallback={<div className="h-12" />}>
              <AppNavigation preview={preview} />
            </Suspense>
          </div>
        </div>
      </header>
      {preview && (
        <div className="border-b">
          <div className="text-muted-foreground mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 px-[20px] text-xs sm:px-[32px]">
            <span>Preview · saved only in this browser</span>
            <Link
              href="/auth/sign-in"
              className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
              data-test="connect-account"
            >
              Connect account
            </Link>
          </div>
        </div>
      )}
      <main
        id="main-content"
        className="mx-auto max-w-5xl px-[20px] py-7 sm:px-[32px] sm:py-10"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
