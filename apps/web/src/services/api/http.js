import { deploymentProfile } from '../../config/deployment.js';

function normalizeApiBaseUrl(rawValue = '') {
  const text = String(rawValue || '').trim();
  if (!text) return '';
  return text.endsWith('/') ? text.slice(0, -1) : text;
}

function isLocalHostname(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function resolveApiBaseUrl() {
  const configured = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (configured) return configured;

  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return 'http://localhost:3001/api';
  }

  if (deploymentProfile.githubPages) {
    return '';
  }

  return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

export function hasApiBaseUrl() {
  return Boolean(API_BASE_URL);
}

export async function http(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('API backend is not configured for this deployment.');
  }

  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }
  return data;
}
