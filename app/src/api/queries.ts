import type {
  CreatePosterInput,
  CreateWallInput,
  Placement,
  Poster,
  Project,
  Wall,
} from '@pwe/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider.js';
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

/** Throws if called while signed out; every hook here is used behind a guard. */
function useToken(): string {
  const { accessToken } = useAuth();
  if (accessToken === null) throw new Error('not signed in');
  return accessToken;
}

export function useProjects() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiFetch<{ projects: ProjectSummary[] }>('/projects', token),
  });
}

export function useProject(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () =>
      apiFetch<{ project: Project & { version: number }; walls: Wall[] }>(
        `/projects/${id}`,
        token,
      ),
  });
}

export function useCreateProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ project: Project }>('/projects', token, {
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
      apiFetch<void>(`/projects/${id}`, token, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useAddWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wall: CreateWallInput) =>
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls`, token, {
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
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls/${wallId}`, token, {
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
      apiFetch<void>(`/projects/${projectId}/walls/${wallId}`, token, {
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
    queryFn: () =>
      apiFetch<{ posters: Poster[] }>(`/projects/${projectId}/posters`, token),
  });
}

export function useAddPoster(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poster: CreatePosterInput) =>
      apiFetch<{ poster: Poster }>(`/projects/${projectId}/posters`, token, {
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
      apiFetch<void>(`/projects/${projectId}/posters/${posterId}`, token, {
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
    }>(`/projects/${projectId}/posters/upload-url`, token, {
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
    enabled: wallId !== undefined,
    queryFn: () =>
      apiFetch<{ placements: Placement[] }>(
        `/projects/${projectId}/walls/${wallId}/placements`,
        token,
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
        token,
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
