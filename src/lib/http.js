export async function httpJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'user-agent': 'BudgetDate/1.0 (+https://puch.ai)',
      accept: 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
