import { hasApiBaseUrl, http } from './http.js';

export function canFetchBilibiliStat() {
  return hasApiBaseUrl();
}

export function fetchBilibiliStat() {
  return http('/social/bilibili/stat');
}
