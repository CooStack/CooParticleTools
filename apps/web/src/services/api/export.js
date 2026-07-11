import { http } from './http.js';

export function exportKotlin(payload) {
  return http('/export/kotlin', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
