/**
 * The smallest thing that can be called a test harness.
 *
 * There is no test runner in this project, and these checks exist to guard the
 * handful of rules that are expensive to get wrong — money arithmetic, import
 * dedupe, and the aggregates a transfer must not touch. They run on Node alone.
 */

let failures = 0;
let total = 0;

export function section(title) {
  console.log(`\n${title}`);
}

/** Asserts by value, comparing structurally so rows and arrays can be passed. */
export function check(label, actual, expected) {
  total++;
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) failures++;
  const shown = typeof actual === 'string' ? actual : JSON.stringify(actual);
  console.log(
    `  ${same ? 'ok  ' : 'FAIL'} ${label}${same ? '' : `\n         got ${shown}\n         want ${JSON.stringify(expected)}`}`,
  );
}

/** Asserts that `work` throws — the refusals matter as much as the results. */
export function checkThrows(label, work) {
  total++;
  try {
    work();
    failures++;
    console.log(`  FAIL ${label}\n         nothing was thrown`);
  } catch {
    console.log(`  ok   ${label}`);
  }
}

/**
 * Asserts that `work` rejects, and that it says the expected thing.
 *
 * The async twin of `checkThrows`. Crypto refusals are all asynchronous, and a
 * refusal that arrives with the wrong message is a refusal the user cannot act
 * on, so the message is part of the assertion rather than an afterthought.
 */
export async function checkRejects(label, work, expectedFragment) {
  total++;
  try {
    await work();
    failures++;
    console.log(`  FAIL ${label}\n         nothing was thrown`);
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    if (expectedFragment && !message.includes(expectedFragment)) {
      failures++;
      console.log(
        `  FAIL ${label}\n         got  ${message}\n         want a message containing ${JSON.stringify(expectedFragment)}`,
      );
      return;
    }
    console.log(`  ok   ${label}`);
  }
}

/** Prints the tally and exits non-zero if anything failed. */
export function report(name) {
  console.log(
    `\n${name}: ${total - failures}/${total} passed${failures > 0 ? ` — ${failures} FAILED` : ''}`,
  );
  process.exit(failures > 0 ? 1 : 0);
}
