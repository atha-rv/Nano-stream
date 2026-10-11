import Link from 'next/link';
import { UserRound, ShieldCheck, KeyRound } from 'lucide-react';
import { buttonVariants } from '@kit/ui/button';

export default function PreviewAccount() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Your account
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Sign in to manage your personal details and security.
      </p>
      <div className="bg-card mt-6 max-w-2xl rounded-xl border p-[20px] sm:p-[24px]">
        <UserRound className="text-primary mb-5 size-7" aria-hidden />
        <h2 className="text-xl font-semibold">Make it yours</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          This preview has no signed-in account. Profile changes, password
          updates, and account deletion use your real account.
        </p>
        <div className="text-muted-foreground my-6 flex flex-wrap gap-5 text-sm">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden />
            Account security
          </span>
          <span className="flex items-center gap-2">
            <KeyRound className="size-4" aria-hidden />
            Password recovery
          </span>
        </div>
        <Link
          href="/auth/sign-in"
          data-test="account-sign-in"
          className={buttonVariants({ className: 'min-h-11 px-4' })}
        >
          Sign in
        </Link>
      </div>
    </>
  );
}
