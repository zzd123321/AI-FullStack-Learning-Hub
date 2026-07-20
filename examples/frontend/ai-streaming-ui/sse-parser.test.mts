import assert from 'node:assert/strict';
import { ServerSentEventParser } from './sse-parser.ts';

const parser = new ServerSentEventParser();
assert.deepEqual(parser.push('\uFEFFevent: delta\r\ndata: {"text":"你'), []);
assert.deepEqual(parser.push('好"}\r\nid: 7\r\n\r\n'), [{
  event: 'delta', data: '{"text":"你好"}', id: '7',
}]);
assert.deepEqual(parser.push(': heartbeat\n\ndata: first\ndata: second\n\n'), [{
  event: 'message', data: 'first\nsecond', id: null,
}]);
assert.deepEqual(parser.push('data: split-cr\r'), []);
assert.deepEqual(parser.push('\n\r\n'), [{ event: 'message', data: 'split-cr', id: null }]);
parser.finish();
assert.throws(() => {
  const incomplete = new ServerSentEventParser();
  incomplete.push('data: incomplete');
  incomplete.finish();
});

assert.throws(() => {
  const bounded = new ServerSentEventParser(8);
  bounded.push('data: payload-without-a-boundary');
}, /buffer limit/);

console.log('SSE parser examples passed');
