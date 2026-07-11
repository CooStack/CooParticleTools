import { deploymentProfile } from '../../config/deployment.js';
import { createLocalProjectRepository } from './local-project-repository.js';
import { createServerProjectRepository } from './server-project-repository.js';

const localRepository = createLocalProjectRepository();
const serverRepository = createServerProjectRepository();

async function runWithFallback(method, args = []) {
  if (deploymentProfile.usesLocalRepository) {
    return localRepository[method](...args);
  }
  try {
    return await serverRepository[method](...args);
  } catch {
    return localRepository[method](...args);
  }
}

export function getProjectRepository() {
  return {
    preferredMode: deploymentProfile.repositoryMode,
    async list(options = {}) {
      return runWithFallback('list', [options]);
    },
    async recent(limit = 8) {
      return runWithFallback('recent', [limit]);
    },
    async get(tool, id) {
      return runWithFallback('get', [tool, id]);
    },
    async save(input = {}) {
      return runWithFallback('save', [input]);
    },
    async remove(tool, id) {
      return runWithFallback('remove', [tool, id]);
    }
  };
}
