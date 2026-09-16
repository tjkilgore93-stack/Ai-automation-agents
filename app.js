async function post(path, payload) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

document.querySelector('#lead-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const status = document.querySelector('#lead-status');
  status.textContent = 'Sending...';
  try {
    const result = await post('/api/leads', { email: form.get('email'), consent: form.get('consent') === 'on' });
    status.textContent = result.message;
    event.currentTarget.reset();
  } catch (error) { status.textContent = error.message; }
});

document.querySelector('#checkout-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const status = document.querySelector('#checkout-status');
  status.textContent = 'Preparing secure checkout...';
  try {
    const result = await post('/api/checkout', { email: form.get('email') });
    window.location.href = result.url;
  } catch (error) { status.textContent = error.message; }
});
