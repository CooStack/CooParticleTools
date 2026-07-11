import { http } from './http.js';

export function fetchProjects(tool = '') {
  const query = tool ? `?tool=${encodeURIComponent(tool)}` : '';
  return http(`/projects${query}`);
}

export function fetchRecentProjects() {
  return http('/projects/recent/list');
}

export function fetchProject(tool, id) {
  return http(`/projects/${encodeURIComponent(tool)}/${encodeURIComponent(id)}`);
}

export function saveProject(payload) {
  return http('/projects/save', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function removeProject(tool, id) {
  return http(`/projects/${encodeURIComponent(tool)}/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}
