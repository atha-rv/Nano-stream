import { Suspense } from 'react';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';
import type { FoundationDatabase } from '~/lib/foundation.types';
import { Workspace } from '~/components/foundation/workspace';

export default function HomePage() {
  return (
    <Suspense fallback={<p role="status">Loading your workspace…</p>}>
      <Projects />
    </Suspense>
  );
}
async function Projects() {
  await requireUserInServerComponent();
  const client = getSupabaseServerClient<FoundationDatabase>();
  const { data, error } = await client
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  return (
    <Workspace
      initialProjects={data ?? []}
      initialError={
        error ? 'Your projects could not be loaded. Try again.' : undefined
      }
    />
  );
}
