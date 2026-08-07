/**
 * Money parsing. Guards F-02.
 *
 * Two defects were fixed here and one non-defect was nearly "fixed" by mistake, so
 * all three are pinned:
 *
 *   - `12,34-` is a debit. Trailing minus is how many Dutch and German exports write
 *     one, and reading it as positive files every expense in the file as income.
 *   - Three or more decimals mean the column mapping is wrong. Refuse, do not guess.
 *   - `1.005` is €1005, not one euro and a half-cent. A lone group of three is Dutch
 *     thousands, deliberately. Anyone "fixing" that will fail this file.
 */

import { check, checkThrows, report, section } from './lib/check.mjs';
import { importSource } from './lib/schema.mjs';

const { parseMoneyToCents, formatMoney, centsToInputString } = await importSource(
  'src/lib/money.ts',
);

const parses = (input, expected) => check(`${JSON.stringify(input)} → ${expected}`, parseMoneyToCents(input), expected);

section('Trailing minus is a debit, not income');
parses('12.34-', -1234);
parses('1.234,56-', -123456);
parses('0,99-', -99);
parses('12,34 -', -1234);

section('Too many decimals is a wrong column, not a small number');
parses('1.2345', null);
parses('0.12345', null);
parses('12,3456', null);

section('A lone group of three is thousands — deliberate, do not "fix"');
parses('1.005', 100500);
parses('1.234', 123400);
parses('1.234.567', 123456700);
parses('12,345,678', 1234567800);

section('Both decimal conventions');
parses('1.234,56', 123456);
parses('1,234.56', 123456);
parses('-1.234,56', -123456);
parses('€ 12,50', 1250);

section('Ordinary amounts');
parses('0.29', 29);
parses('19.99', 1999);
parses('-3.50', -350);
parses('1234.56', 123456);
parses('0.1', 10);
parses('.5', 50);
parses('3.', 300);
parses('0', 0);

section('Refusals');
parses('', null);
parses('   ', null);
parses('abc', null);
parses('-', null);
parses('.', null);

section('No float anywhere in the parse');
let drift = 0;
for (let cents = 0; cents < 200_000; cents++) {
  if (parseMoneyToCents((cents / 100).toFixed(2)) !== cents) drift++;
}
check('every two-decimal value from 0.00 to 1999.99 round-trips', drift, 0);
// Above 2^53/100 a float silently loses integers; a string parse does not.
parses('99999999999.99', 9999999999999);

section('Formatting is the inverse where it should be');
check('centsToInputString(1999)', centsToInputString(1999), '19.99');
check('centsToInputString(-350)', centsToInputString(-350), '3.50');
check('formatMoney is locale-aware', typeof formatMoney(1250, { locale: 'nl-NL' }), 'string');
checkThrows('an unknown currency is rejected rather than silently wrong', () =>
  formatMoney(100, { currency: 'NOTACURRENCY' }),
);

report('money');
