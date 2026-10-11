'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, Plus, ChevronRight, Trash2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Textarea } from '@kit/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@kit/ui/dialog';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@kit/ui/form';
import type { Project } from '~/lib/foundation.types';
import { ProjectSchema } from '~/lib/projects.schema';
import {
  createProjectAction,
  deleteProjectAction,
} from '~/lib/server/project-actions';

const storageKey = 'foundation:preview:projects:v1';
const samples: Project[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'preview',
    name: 'Product notes',
    description: 'A place for the small ideas worth keeping.',
    created_at: '2026-10-01T12:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: 'preview',
    name: 'Reading list',
    description: 'Books, essays, and things to come back to.',
    created_at: '2026-09-29T12:00:00Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: 'preview',
    name: 'Weekend ideas',
    description: 'Room for something new.',
    created_at: '2026-09-27T12:00:00Z',
  },
];

export function Workspace({
  preview = false,
  initialProjects = [],
  initialError,
}: {
  preview?: boolean;
  initialProjects?: Project[];
  initialError?: string;
}) {
  const router = useRouter();
  const newProjectButton = useRef<HTMLButtonElement>(null);
  const createReturnFocus = useRef<HTMLElement | null>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const [projects, setProjects] = useState(initialProjects);
  const [ready, setReady] = useState(!preview);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState('');
  const form = useForm({
    resolver: zodResolver(ProjectSchema),
    defaultValues: { name: '', description: '' },
  });

  useEffect(() => {
    if (!preview) {
      setProjects(initialProjects);
      setError(initialError);
    }
  }, [preview, initialProjects, initialError]);
  useEffect(() => {
    if (!preview) return;
    try {
      const saved = localStorage.getItem(storageKey);
      const candidate: unknown = saved ? JSON.parse(saved) : samples;
      if (
        !Array.isArray(candidate) ||
        !candidate.every(
          (item) =>
            item &&
            ProjectSchema.safeParse(item).success &&
            typeof item.id === 'string' &&
            typeof item.created_at === 'string',
        )
      )
        throw new Error('Invalid preview data');
      setProjects(candidate as Project[]);
    } catch {
      setError(
        'Saved preview data could not be read. You can still explore the sample projects.',
      );
      setProjects(samples);
    }
    setReady(true);
  }, [preview]);

  function persist(next: Project[]) {
    if (preview) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        throw new Error(
          'Browser storage is unavailable. Your changes have not been saved.',
        );
      }
    }
    setProjects(next);
  }
  async function create(values: { name: string; description: string }) {
    setBusy(true);
    setError(undefined);
    try {
      const result = preview
        ? {
            project: {
              ...values,
              id: crypto.randomUUID(),
              user_id: 'preview',
              created_at: new Date().toISOString(),
            },
          }
        : await createProjectAction(values);
      if ('error' in result) throw new Error(result.error);
      if (!result.project)
        throw new Error('The project could not be saved. Try again.');
      persist([result.project, ...projects]);
      setCreateOpen(false);
      form.reset();
      setNotice('Project saved.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The project could not be saved. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!preview) {
        const result = await deleteProjectAction(selected.id);
        if ('error' in result) throw new Error(result.error);
      }
      persist(projects.filter((project) => project.id !== selected.id));
      setSelected(null);
      setConfirmDelete(false);
      setNotice('Project deleted.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The project could not be deleted. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your projects
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Create a project to keep related work together.
          </p>
        </div>
        <Button
          ref={newProjectButton}
          data-test="new-project"
          className="min-h-11 gap-2 px-4"
          onClick={(event) => {
            createReturnFocus.current = event.currentTarget;
            setCreateOpen(true);
            setError(undefined);
            setNotice('');
          }}
          disabled={!ready}
        >
          <Plus className="size-4" aria-hidden />
          New project
        </Button>
      </div>
      {error && !createOpen && !selected && (
        <div
          role="alert"
          className="bg-card mb-5 rounded-xl border p-4 text-sm"
        >
          <p>{error}</p>
          {!preview && (
            <Button
              variant="outline"
              className="mt-3"
              data-test="retry-projects"
              onClick={() => router.refresh()}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      <p
        role="status"
        className={notice ? 'text-primary mb-4 text-sm' : 'sr-only'}
      >
        {notice}
      </p>
      {!ready ? (
        <p role="status">Loading your projects…</p>
      ) : projects.length ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              type="button"
              data-test="project-card"
              aria-haspopup="dialog"
              key={project.id}
              onClick={(event) => {
                detailReturnFocus.current = event.currentTarget;
                setSelected(project);
                setConfirmDelete(false);
                setError(undefined);
              }}
              className="bg-card hover:border-primary/50 hover:bg-accent/20 group relative grid grid-cols-[40px_minmax(0,1fr)_16px] items-start gap-[12px] rounded-xl border p-[16px] text-left transition-colors sm:flex sm:min-h-52 sm:flex-col sm:gap-0 sm:p-5"
            >
              <span className="bg-accent text-accent-foreground flex size-[40px] shrink-0 items-center justify-center rounded-lg sm:size-11">
                <Folder className="size-5" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col sm:mt-5">
                <span className="text-base font-semibold wrap-anywhere sm:text-lg">
                  {project.name}
                </span>
                <span className="text-muted-foreground mt-1 line-clamp-2 text-sm wrap-anywhere">
                  {project.description || 'No description yet.'}
                </span>
                <span className="text-muted-foreground mt-3 text-xs wrap-anywhere sm:mt-auto sm:pt-5">
                  Created{' '}
                  {new Date(project.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </span>
              <ChevronRight
                className="text-muted-foreground size-[16px] self-center sm:absolute sm:top-5 sm:right-5"
                aria-hidden
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-card flex flex-col items-center rounded-2xl border px-6 py-16 text-center">
          <Folder className="text-primary mb-4 size-8" aria-hidden />
          <h2 className="text-xl font-semibold">Start with one project</h2>
          <p className="text-muted-foreground mt-2 max-w-sm text-sm">
            Give it a name. You can add a short description if you like.
          </p>
          <Button
            className="mt-6 px-4"
            data-test="empty-create"
            onClick={(event) => {
              createReturnFocus.current = event.currentTarget;
              setCreateOpen(true);
              setError(undefined);
              setNotice('');
            }}
          >
            Create a project
          </Button>
        </div>
      )}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!busy) setCreateOpen(open);
        }}
      >
        <DialogContent
          finalFocus={createReturnFocus}
          className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-md"
          showCloseButton={!busy}
        >
          <DialogHeader className="pr-[56px]">
            <DialogTitle className="wrap-anywhere">New project</DialogTitle>
            <DialogDescription>
              Start with a name and an optional description.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(create)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoFocus
                        maxLength={80}
                        placeholder="e.g. Reading list"
                        data-test="project-name"
                        disabled={busy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description{' '}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        maxLength={400}
                        rows={3}
                        data-test="project-description"
                        disabled={busy}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  data-test="cancel-create"
                  disabled={busy}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" data-test="save-project" disabled={busy}>
                  {busy ? 'Saving…' : 'Create project'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <DialogContent
          finalFocus={() =>
            detailReturnFocus.current?.isConnected
              ? detailReturnFocus.current
              : newProjectButton.current
          }
          className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-md"
          showCloseButton={!busy}
        >
          <DialogHeader className="pr-[56px]">
            <DialogTitle className="wrap-anywhere">
              {confirmDelete ? 'Delete this project?' : selected?.name}
            </DialogTitle>
            <DialogDescription className="wrap-anywhere">
              {confirmDelete
                ? 'The project will be permanently deleted. This cannot be undone.'
                : selected?.description || 'No description yet.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            {confirmDelete ? (
              <>
                <Button
                  variant="outline"
                  data-test="cancel-delete"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep project
                </Button>
                <Button
                  variant="destructive"
                  data-test="confirm-delete"
                  disabled={busy}
                  onClick={remove}
                >
                  {busy ? 'Deleting…' : 'Delete project'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  data-test="delete-project"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  data-test="close-project"
                  onClick={() => setSelected(null)}
                >
                  Done
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
