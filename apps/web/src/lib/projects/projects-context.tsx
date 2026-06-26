'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { projectRepository, type ProjectBackend } from './project-repository';
import type { Project, ProjectCreateInput, ProjectUpdateInput } from './types';

interface ProjectsContextValue {
  projects: Project[];
  loading: boolean;
  error: string | null;
  backend: ProjectBackend;
  refreshProjects: () => Promise<void>;
  getProject: (id: string) => Project | null;
  createProject: (input: ProjectCreateInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectUpdateInput) => Promise<Project | null>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const backend = projectRepository.backend();

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await projectRepository.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat proyek.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const createProject = useCallback(async (input: ProjectCreateInput) => {
    const project = await projectRepository.create(input);
    setProjects((current) => [project, ...current].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    return project;
  }, []);

  const updateProject = useCallback(async (id: string, input: ProjectUpdateInput) => {
    const updated = await projectRepository.update(id, input);
    if (updated) {
      setProjects((current) =>
        current.map((project) => (project.id === id ? updated : project)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    }
    return updated;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await projectRepository.delete(id);
    setProjects((current) => current.filter((project) => project.id !== id));
  }, []);

  const getProject = useCallback(
    (id: string) => projects.find((project) => project.id === id) ?? null,
    [projects],
  );

  const value = useMemo<ProjectsContextValue>(
    () => ({
      projects,
      loading,
      error,
      backend,
      refreshProjects,
      getProject,
      createProject,
      updateProject,
      deleteProject,
    }),
    [projects, loading, error, backend, refreshProjects, getProject, createProject, updateProject, deleteProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used inside ProjectsProvider');
  }
  return context;
}
