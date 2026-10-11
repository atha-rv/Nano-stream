'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Folder, UserRound } from 'lucide-react';
import { cn } from '@kit/ui/utils';

export function AppNavigation({ preview }: { preview: boolean }) {
  const pathname = usePathname();
  const base = preview ? '/preview' : '/home';
  const items = [
    { href: base, label: 'Workspace', Icon: Folder },
    { href: `${base}/billing`, label: 'Billing', Icon: CreditCard },
    {
      href: preview ? `${base}/account` : `${base}/settings`,
      label: 'Account',
      Icon: UserRound,
    },
  ];
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-wrap gap-x-3 sm:gap-x-7"
    >
      {items.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          data-test={`nav-${label.toLowerCase()}`}
          className={cn(
            'flex min-h-[48px] items-center gap-2 border-b-2 px-1 text-sm font-medium',
            pathname === href
              ? 'border-primary text-primary'
              : 'text-muted-foreground border-transparent hover:text-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
