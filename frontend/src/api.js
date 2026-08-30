async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro na comunicação com o servidor.');
  }
  return data;
}

export const api = {
  state: () => request('/api/state'),
  vote: (body) =>
    request('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  promote: (body) =>
    request('/api/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  chargeStatus: (reference) => request(`/api/charge/${reference}`),
  simulate: (reference) =>
    request(`/api/charge/${reference}/simulate`, { method: 'POST' }),
  comments: () => request('/api/comments'),
  postComment: (body) =>
    request('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
