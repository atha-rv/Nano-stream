import { notFound } from 'next/navigation';
import { AppShell } from '~/components/foundation/app-shell';

export const metadata = { robots: { index: false, follow: false } };
export default function PreviewLayout({ children }: React.PropsWithChildren) {
  if (process.env.TEMPLATE_PREVIEW_ENABLED !== 'true') notFound();
  return <AppShell preview>{children}</AppShell>;
}
