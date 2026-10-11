'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import type { FoundationDatabase } from '~/lib/foundation.types';
import { ProjectSchema } from '~/lib/projects.schema';

export async function createProjectAction(input: unknown) {
  const parsed = ProjectSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the project details.',
    };
  const client = getSupabaseServerClient<FoundationDatabase>();
  const identity = await requireUser(client);
  if (identity.error) return { error: 'Sign in again to save your project.' };
  const { data, error } = await client
    .from('projects')
    .insert({ ...parsed.data, user_id: identity.data.sub })
    .select('*')
    .single();
  if (error)
    return {
      error:
        'The project could not be saved. Your details are still here; try again.',
    };
  revalidatePath('/home');
  return { project: data };
}

export async function deleteProjectAction(id: string) {
  if (!z.uuid().safeParse(id).success)
    return { error: 'This project could not be found.' };
  const client = getSupabaseServerClient<FoundationDatabase>();
  const identity = await requireUser(client);
  if (identity.error) return { error: 'Sign in again to delete this project.' };
  const { data, error } = await client
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', identity.data.sub)
    .select('id');
  if (error || !data?.length)
    return { error: 'The project could not be deleted. Try again.' };
  revalidatePath('/home');
  return { success: true };
}
