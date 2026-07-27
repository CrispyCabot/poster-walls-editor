import type {
  CreatePosterInput,
  CreateWallInput,
  Placement,
  Poster,
  Project,
  ProjectPreview,
  Wall,
} from '@pwe/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider.js';
import { getConfig } from '../config.js';
import { apiFetch } from './client.js';

export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
};

export interface ProjectSummary {
  id: string;
  name: string;
  visibility: Project['visibility'];
  updatedAt: string;
}

/**
 * The access token, or null while the session is still being restored.
 *
 * This must never throw. On a page refresh the auth provider starts with no
 * token and resolves asynchronously, so a hook that threw here took the whole
 * route down before the session had a chance to load — which is what made a
 * refresh inside a project render a blank screen. Queries stay disabled until
 * a token exists.
 */
function useToken(): string | null {
  return useAuth().accessToken;
}

/** Mutations only run from a user action, so a missing token is a real fault. */
function required(token: string | null): string {
  if (token === null) throw new Error('Not signed in');
  return token;
}

export function useProjects() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.projects,
    enabled: token !== null,
    queryFn: () => apiFetch<{ projects: ProjectSummary[] }>('/projects', token!),
  });
}

export function useProject(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.project(id),
    enabled: token !== null && id !== '',
    queryFn: () =>
      apiFetch<{ project: Project & { version: number }; walls: Wall[] }>(
        `/projects/${id}`,
        token!,
      ),
  });
}

export function useCreateProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ project: Project }>('/projects', required(token), {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useDeleteProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/projects/${id}`, required(token), { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useAddWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wall: CreateWallInput) =>
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls`, required(token), {
        method: 'POST',
        body: JSON.stringify(wall),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useUpdateWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ wallId, wall }: { wallId: string; wall: CreateWallInput }) =>
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls/${wallId}`, required(token), {
        method: 'PUT',
        body: JSON.stringify(wall),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useRemoveWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wallId: string) =>
      apiFetch<void>(`/projects/${projectId}/walls/${wallId}`, required(token), {
        method: 'DELETE',
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

// --- posters ---------------------------------------------------------------

export function usePosters(projectId: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['projects', projectId, 'posters'] as const,
    enabled: token !== null && projectId !== '',
    queryFn: () =>
      apiFetch<{ posters: Poster[] }>(`/projects/${projectId}/posters`, token!),
  });
}

export function useAddPoster(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poster: CreatePosterInput) =>
      apiFetch<{ poster: Poster }>(`/projects/${projectId}/posters`, required(token), {
        method: 'POST',
        body: JSON.stringify(poster),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'posters'] }),
  });
}

export function useDeletePoster(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (posterId: string) =>
      apiFetch<void>(`/projects/${projectId}/posters/${posterId}`, required(token), {
        method: 'DELETE',
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'posters'] }),
  });
}

/** Uploads straight to S3 with a presigned PUT; resolves to the image key. */
export function useUploadImage(projectId: string) {
  const token = useToken();
  return async (file: File): Promise<string> => {
    const { uploadUrl, imageKey } = await apiFetch<{
      uploadUrl: string;
      imageKey: string;
    }>(`/projects/${projectId}/posters/upload-url`, required(token), {
      method: 'POST',
      body: JSON.stringify({ contentType: file.type }),
    });

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!res.ok) throw new Error(`S3 returned ${res.status}`);

    return imageKey;
  };
}

// --- placements ------------------------------------------------------------

export function usePlacements(projectId: string, wallId: string | undefined) {
  const token = useToken();
  return useQuery({
    queryKey: ['projects', projectId, 'walls', wallId, 'placements'] as const,
    enabled: token !== null && wallId !== undefined,
    queryFn: () =>
      apiFetch<{ placements: Placement[] }>(
        `/projects/${projectId}/walls/${wallId}/placements`,
        token!,
      ),
  });
}

export function useSavePlacements(projectId: string, wallId: string | undefined) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placements: Placement[]) =>
      apiFetch<{ placements: Placement[] }>(
        `/projects/${projectId}/walls/${wallId}/placements`,
        required(token),
        { method: 'PUT', body: JSON.stringify({ placements }) },
      ),
    onSuccess: (data) => {
      qc.setQueryData(
        ['projects', projectId, 'walls', wallId, 'placements'],
        data,
      );
    },
  });
}

export function useUpdatePoster(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ posterId, poster }: { posterId: string; poster: CreatePosterInput }) =>
      apiFetch<{ poster: Poster }>(`/projects/${projectId}/posters/${posterId}`, required(token), {
        method: 'PUT',
        body: JSON.stringify(poster),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'posters'] }),
  });
}

// --- previews & browse -----------------------------------------------------

export function useProjectPreviews() {
  const token = useToken();
  return useQuery({
    queryKey: ['projects', 'previews'] as const,
    enabled: token !== null,
    queryFn: () =>
      apiFetch<{ projects: ProjectPreview[] }>('/projects/previews', token!),
  });
}

export interface BrowseQuery {
  q: string;
  widthIn: string;
  heightIn: string;
  offset: number;
  limit: number;
}

/**
 * Public projects. No token — browsing for ideas does not require an account,
 * and the index this reads only contains projects explicitly made public.
 */
export function useBrowsePublic(query: BrowseQuery) {
  const params = new URLSearchParams();
  if (query.q.trim() !== '') params.set('q', query.q.trim());
  if (query.widthIn.trim() !== '') params.set('widthIn', query.widthIn.trim());
  if (query.heightIn.trim() !== '') params.set('heightIn', query.heightIn.trim());
  params.set('offset', String(query.offset));
  params.set('limit', String(query.limit));

  return useQuery({
    queryKey: ['public', 'projects', params.toString()] as const,
    queryFn: async () => {
      const res = await fetch(`${getConfig().apiUrl}/public/projects?${params}`);
      if (!res.ok) throw new Error(`Browse failed with ${res.status}`);
      return (await res.json()) as {
        projects: ProjectPreview[];
        total: number;
        truncated: boolean;
      };
    },
  });
}

export function useUpdateProject(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; visibility: 'private' | 'public'; version: number }) =>
      apiFetch<{ project: Project }>(`/projects/${projectId}`, required(token), {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', 'previews'] });
      void qc.invalidateQueries({ queryKey: ['public', 'projects'] });
    },
  });
}

export interface ProjectView {
  project: { id: string; name: string; visibility: 'private' | 'public'; updatedAt: string };
  walls: Wall[];
  posters: Poster[];
  placementsByWall: Record<string, Placement[]>;
  isOwner: boolean;
}

/**
 * Loads a project for whoever is looking.
 *
 * Sends the token when there is one, and works without it — a public project
 * opens for signed-out visitors too. `isOwner` in the response is what decides
 * whether the page offers any editing.
 */
export function useProjectView(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: ['projects', id, 'view', token === null ? 'anon' : 'auth'] as const,
    enabled: id !== '',
    queryFn: async () => {
      const res = await fetch(`${getConfig().apiUrl}/projects/${id}/view`, {
        headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(res.status === 404 ? 'Not found' : `Failed with ${res.status}`);
      }
      return (await res.json()) as ProjectView;
    },
  });
}
