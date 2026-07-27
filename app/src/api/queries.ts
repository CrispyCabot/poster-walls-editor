import type { CreateWallInput, Project, Wall } from '@pwe/shared';
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
