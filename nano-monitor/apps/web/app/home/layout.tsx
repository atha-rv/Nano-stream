import { Suspense } from 'react';
import { AppShell } from '~/components/foundation/app-shell';
import { ProfileAccountDropdownContainer } from '~/components/personal-account-dropdown-container';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

export default function HomeLayout({ children }: React.PropsWithChildren) {
  return (
    <Suspense
      fallback={
        <p className="p-8" role="status">
          Opening your workspace…
        </p>
      }
    >
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}
async function AuthenticatedShell({ children }: React.PropsWithChildren) {
  const user = await requireUserInServerComponent();
  return (
    <AppShell account={<ProfileAccountDropdownContainer user={user} />}>
      {children}
    </AppShell>
  );
}
