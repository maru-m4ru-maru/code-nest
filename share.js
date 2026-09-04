const SHARE_API = 'https://code-nest-worker.maru-0727.workers.dev';

export async function shareNotebook(data) {
  const res = await fetch(`${SHARE_API}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) throw new Error('Share failed');
  const result = await res.json();

  return `${SHARE_API}${result.url}`;
}
