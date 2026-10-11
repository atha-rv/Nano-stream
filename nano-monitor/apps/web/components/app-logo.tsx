import Link from 'next/link';
import { Layers2 } from 'lucide-react';
import { cn } from '@kit/ui/utils';
import appConfig from '~/config/app.config';

export function AppLogo({
  href = '/',
  label,
  className,
}: {
  href?: string | null;
  label?: string;
  className?: string;
}) {
  const contents = (
    <>
      <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Layers2 className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 text-lg font-semibold tracking-tight wrap-anywhere">
        {appConfig.name}
      </span>
    </>
  );
  const classes = cn('inline-flex min-h-11 items-center gap-2.5', className);
  return href === null ? (
    <span className={classes}>{contents}</span>
  ) : (
    <Link
      className={classes}
      href={href}
      aria-label={label ?? `${appConfig.name} home`}
    >
      {contents}
    </Link>
  );
}
