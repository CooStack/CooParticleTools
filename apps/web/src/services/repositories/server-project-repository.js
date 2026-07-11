import {
  fetchProject,
  fetchProjects,
  fetchRecentProjects,
  removeProject,
  saveProject
} from '../api/projects.js';

export function createServerProjectRepository() {
  return {
    mode: 'server',
    async list({ tool = '' } = {}) {
      const response = await fetchProjects(tool);
      return response.items || [];
    },
    async recent(limit = 8) {
      const response = await fetchRecentProjects();
      return (response.items || []).slice(0, limit);
    },
    async get(tool, id) {
      return fetchProject(tool, id);
    },
    async save(input = {}) {
      return saveProject(input);
    },
    async remove(tool, id) {
      return removeProject(tool, id);
    }
  };
}
