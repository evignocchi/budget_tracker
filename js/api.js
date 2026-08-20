async function apiFetch(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
  };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);

  const res = await fetch(path, opts);

  if (res.status === 401 && !path.includes('/api/auth/')) {
    window.location.href = '/login.html';
    return new Promise(() => {});
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message = (data && data.error) || `Errore ${res.status}`;
    throw new Error(message);
  }

  return data;
}
