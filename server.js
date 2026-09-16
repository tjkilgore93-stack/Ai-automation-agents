import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const dataFile = join(dataDir, 'store.json');
const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const product = {
  name: 'AI Agent Automation Bootcamp',
  price: '$297',
  description: 'Build and launch one reliable AI-agent workflow for your creator business.'
};

async function loadStore() {
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const store = { leads: [], orders: [] };
    await saveStore(store);
    return store;
  }
}

async function saveStore(store) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(store, null, 2));
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  if (raw.length > 100_000) throw new Error('Request body is too large');
  return JSON.parse(raw || '{}');
}

function envReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

function isEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function createCheckoutSession(email) {
  if (!envReady()) return { demo: true, url: `${baseUrl}/success.html?demo=1&email=${encodeURIComponent(email)}` };
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    customer_email: email,
    success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#checkout`,
    'metadata[product]': product.name
  });
  const result = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  if (!result.ok) throw new Error(`Stripe checkout failed: ${result.status}`);
  return result.json();
}

function verifyStripeSignature(raw, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=')));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`).digest('hex');
  const actual = Buffer.from(parts.v1 || '', 'utf8');
  const calculated = Buffer.from(expected, 'utf8');
  return actual.length === calculated.length && timingSafeEqual(actual, calculated);
}

function accessToken(email) {
  const secret = process.env.COURSE_ACCESS_SECRET || 'local-development-secret';
  return createHmac('sha256', secret).update(email.toLowerCase()).digest('hex');
}

async function sendCourseEmail(email, token) {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) return false;
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: [email],
      subject: `Your ${product.name} access`,
      html: `<p>Welcome to ${product.name}.</p><p><a href="${baseUrl}/course.html?email=${encodeURIComponent(email)}&token=${token}">Start the course</a></p><p>Keep this email for access.</p>`
    })
  });
  return result.ok;
}

async function sendLeadEmail(email) {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) return false;
  const unsubscribe = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${accessToken(email)}`;
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: [email],
      subject: 'Your AI automation scorecard',
      html: `<p>Use this scorecard to choose one repeatable task to automate this week.</p><p>Reply with your task and we will help you think through the workflow.</p><p><a href="${unsubscribe}">Unsubscribe</a></p>`
    })
  });
  return result.ok;
}

async function handleLead(request, response) {
  const input = await body(request);
  const email = String(input.email || '').trim().toLowerCase();
  if (!isEmail(email)) return json(response, 400, { error: 'Enter a valid email address.' });
  if (input.consent !== true) return json(response, 400, { error: 'Consent is required to receive the scorecard.' });
  const store = await loadStore();
  if (store.leads.some((lead) => lead.email === email && lead.unsubscribedAt)) {
    return json(response, 409, { error: 'This address is unsubscribed. Use a different address to opt in.' });
  }
  if (!store.leads.some((lead) => lead.email === email)) {
    store.leads.push({ id: randomUUID(), email, consentAt: new Date().toISOString(), source: String(input.source || 'landing-page') });
    await saveStore(store);
  }
  await sendLeadEmail(email);
  return json(response, 201, { ok: true, message: 'Check your inbox for the scorecard and next steps.' });
}

async function handleCheckout(request, response) {
  const input = await body(request);
  const email = String(input.email || '').trim().toLowerCase();
  if (!isEmail(email)) return json(response, 400, { error: 'Enter a valid email address.' });
  const session = await createCheckoutSession(email);
  if (session.demo) return json(response, 200, session);
  return json(response, 200, { url: session.url });
}

async function handleWebhook(request, response) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const signature = request.headers['stripe-signature'];
  if (!verifyStripeSignature(raw, signature)) return json(response, 400, { error: 'Invalid webhook signature.' });
  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;
    if (email) {
      const store = await loadStore();
      if (!store.orders.some((order) => order.sessionId === session.id)) {
        const token = accessToken(email);
        store.orders.push({ sessionId: session.id, email, paidAt: new Date().toISOString(), product: product.name });
        await saveStore(store);
        await sendCourseEmail(email, token);
      }
    }
  }
  return json(response, 200, { received: true });
}

async function handleCourseAccess(url, response) {
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const token = String(url.searchParams.get('token') || '');
  if (!isEmail(email) || token !== accessToken(email)) return json(response, 401, { error: 'Invalid course access.' });
  const store = await loadStore();
  const order = store.orders.find((item) => item.email === email);
  if (!order) return json(response, 403, { error: 'A completed purchase is required.' });
  return json(response, 200, { ok: true, product: order.product, email });
}

async function handleUnsubscribe(url, response) {
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const token = String(url.searchParams.get('token') || '');
  if (!isEmail(email) || token !== accessToken(email)) return json(response, 401, { error: 'Invalid unsubscribe link.' });
  const store = await loadStore();
  const lead = store.leads.find((item) => item.email === email);
  if (lead) lead.unsubscribedAt = new Date().toISOString();
  await saveStore(store);
  return json(response, 200, { ok: true, message: 'You have been unsubscribed.' });
}

async function staticFile(pathname, response) {
  const fileName = pathname === '/' ? 'index.html' : pathname.slice(1);
  const requested = normalize(join(publicDir, fileName));
  const repositoryUpload = normalize(join(root, fileName));
  try {
    let candidate = requested;
    let content;
    try {
      content = await readFile(candidate);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      candidate = repositoryUpload;
      content = await readFile(candidate);
    }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    response.writeHead(200, { 'Content-Type': `${types[extname(candidate)] || 'application/octet-stream'}; charset=utf-8' });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') return json(response, 404, { error: 'Not found' });
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, baseUrl);
    if (request.method === 'POST' && url.pathname === '/api/leads') return await handleLead(request, response);
    if (request.method === 'POST' && url.pathname === '/api/checkout') return await handleCheckout(request, response);
    if (request.method === 'POST' && url.pathname === '/api/stripe/webhook') return await handleWebhook(request, response);
    if (request.method === 'GET' && url.pathname === '/api/health') return json(response, 200, { ok: true, paymentsConfigured: envReady(), emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.FROM_EMAIL) });
    if (request.method === 'GET' && url.pathname === '/api/course-access') return await handleCourseAccess(url, response);
    if (request.method === 'GET' && url.pathname === '/api/unsubscribe') return await handleUnsubscribe(url, response);
    if (request.method === 'GET') return await staticFile(url.pathname, response);
    return json(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: 'The request could not be completed.' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, () => console.log(`Funnel running at ${baseUrl}`));
}

export { server, accessToken, verifyStripeSignature };
