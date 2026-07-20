import assert from 'node:assert/strict';
import { decideRoute, mayStore } from './cache-policy.ts';

const origin = 'https://learn.example';
const request = (url: string, overrides: Partial<Request> = {}) => ({
  url, method: 'GET', mode: 'cors' as RequestMode, destination: '' as RequestDestination,
  ...overrides,
});
assert.equal(decideRoute(request(`${origin}/course`, { mode: 'navigate' }), origin).strategy, 'network-first');
assert.equal(decideRoute(new Request(`${origin}/assets/app.12345678.js`), origin).strategy, 'cache-first');
assert.equal(decideRoute(new Request(`${origin}/api/profile`, { method: 'POST' }), origin).strategy, 'network-only');
assert.equal(decideRoute(new Request('https://cdn.example/image.png'), origin).strategy, 'network-only');
assert.equal(decideRoute(request(`${origin}/avatar.png`, { destination: 'image' }), origin).strategy, 'network-only');
assert.equal(decideRoute(request(`${origin}/public-media/cover.png`, { destination: 'image' }), origin).strategy, 'stale-while-revalidate');
assert.equal(mayStore(new Response('private', { headers: { 'Cache-Control': 'no-store' } })), false);
assert.equal(mayStore(new Response('private', { headers: { 'Cache-Control': 'private, NO-STORE' } })), false);
assert.equal(mayStore(new Response('variable', { headers: { Vary: '*' } })), false);
assert.equal(mayStore(new Response('partial', { status: 206 })), false);
assert.equal(mayStore(new Response('public')), true);
console.log('PWA cache policy examples passed');
