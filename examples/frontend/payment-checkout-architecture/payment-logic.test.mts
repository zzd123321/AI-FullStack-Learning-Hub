import assert from 'node:assert/strict';
import { addMoney, parseDecimalMoney } from './money.ts';
import { reducePayment } from './payment-state.ts';
import { parsePaymentReturn, returnClaimsSuccess } from './return-contract.ts';

const price = parseDecimalMoney('19.90', 'cny', 2);
const shipping = parseDecimalMoney('5', 'CNY', 2);
assert.deepEqual(addMoney(price, shipping), {
  currency: 'CNY', minor: 2490n, fractionDigits: 2,
});
assert.throws(() => parseDecimalMoney('1.005', 'CNY', 2));
assert.throws(() => parseDecimalMoney('-1', 'CNY', 2));
assert.throws(() => parseDecimalMoney('1', 'not-a-currency', 2));

const paid = { phase: 'paid' as const, version: 4, paymentId: 'pay_12345678' };
assert.deepEqual(reducePayment({ phase: 'processing', version: 3 }, {
  type: 'server-snapshot', snapshot: paid,
}), paid);
assert.deepEqual(reducePayment(paid, {
  type: 'server-snapshot', snapshot: { phase: 'processing', version: 3 },
}), paid);
assert.deepEqual(reducePayment(paid, { type: 'create-started' }), paid);

const returned = new URL('https://shop.example/pay/return?payment_id=pay_12345678&state=abcdefghijklmnopqrst&success=true');
assert.deepEqual(parsePaymentReturn(returned), {
  paymentId: 'pay_12345678', transactionState: 'abcdefghijklmnopqrst',
});
assert.equal(returnClaimsSuccess(returned), false);
console.log('payment checkout examples passed');
