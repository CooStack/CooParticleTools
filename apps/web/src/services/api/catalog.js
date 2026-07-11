import { http } from './http.js';

export function fetchTools() {
  return http('/catalog/tools');
}

export function fetchTemplates(tool) {
  return http(`/catalog/templates?tool=${encodeURIComponent(tool)}`);
}
