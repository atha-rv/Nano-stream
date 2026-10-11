import Link from 'next/link';
import { buttonVariants } from '@kit/ui/button';
import { AppLogo } from '~/components/app-logo';

export const metadata = { title: 'Page not found' };

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-[20px] py-12">
      <AppLogo className="mb-10 self-start" />
      <p className="text-muted-foreground mb-2 text-sm">404</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-3 text-base">
        Check the address, or return to your workspace.
      </p>
      <Link
        href="/"
        className={buttonVariants({
          variant: 'outline',
          className: 'mt-6 self-start',
        })}
        data-test="not-found-return-home"
      >
        Return to workspace
      </Link>
    </main>
  );
}
