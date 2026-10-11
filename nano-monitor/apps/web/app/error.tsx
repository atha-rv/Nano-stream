'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@kit/ui/button';
import { AppLogo } from '~/components/app-logo';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('Page could not be rendered.', { digest: error.digest });
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-[20px] py-12">
      <AppLogo className="mb-10 self-start" />
      <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl">
        We couldn’t load this page
      </h1>
      <p className="text-muted-foreground mt-3 text-base">
        Try again. If the problem continues, return to your workspace.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={retry} data-test="retry-page">
          Try again
        </Button>
        <Link
          href="/"
          className={buttonVariants({ variant: 'outline' })}
          data-test="error-return-home"
        >
          Return to workspace
        </Link>
      </div>
    </main>
  );
}
