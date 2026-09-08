import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateInvoiceAmount, cashRefundDue, returnedPartAmount } from '../src/shared/invoice';

test('invoice discount is distributed exactly across lines', () => {
  const allocation = allocateInvoiceAmount([{ id: 1, lineTotal: 101 }, { id: 2, lineTotal: 99 }], 15);
  assert.equal((allocation.get(1) ?? 0) + (allocation.get(2) ?? 0), 15);
  assert.equal(101 - (allocation.get(1) ?? 0) + 99 - (allocation.get(2) ?? 0), 185);
});

test('partial returns always add up to the exact net line amount', () => {
  const netLine = 997;
  const first = returnedPartAmount(netLine, 3, 0, 1);
  const second = returnedPartAmount(netLine, 3, 1, 1);
  const third = returnedPartAmount(netLine, 3, 2, 1);
  assert.equal(first + second + third, netLine);
});

test('a final return includes every remaining unit of rounding', () => {
  assert.equal(returnedPartAmount(100, 3, 2, 1), 34);
});

test('purchase return only refunds what was actually paid', () => {
  assert.equal(cashRefundDue(25_000, 15_000, 0, 25_000), 15_000);
  assert.equal(cashRefundDue(25_000, 10_000, 0, 25_000), 10_000);
});
