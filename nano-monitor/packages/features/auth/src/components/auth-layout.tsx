import { cn } from '@kit/ui/utils';

export function AuthLayoutShell({
  children,
  className,
  Logo,
  contentClassName,
}: React.PropsWithChildren<{
  Logo?: React.ComponentType;
  className?: string;
  contentClassName?: string;
}>) {
  return (
    <>
      <div
        className={cn(
          'flex min-h-dvh flex-col items-center justify-center gap-y-8 px-6 pt-28 pb-12',
          className,
        )}
      >
        <div
          className={cn(
            'bg-background flex w-full max-w-[23rem] flex-col gap-y-4',
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>

      <div className="absolute top-8 left-0 flex w-full justify-center lg:top-6 lg:left-8 lg:w-auto">
        {Logo ? <Logo /> : null}
      </div>
    </>
  );
}
