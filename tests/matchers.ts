import { TZDate } from "@date-fns/tz";
import { expect } from "@jest/globals";
import { differenceInSeconds } from "date-fns";
import { ACCT_TZ } from "./shared";

export const getDateFromEpoch = (dt: number) => new TZDate(dt, ACCT_TZ);

interface CustomMatcherResult {
  pass: boolean;
  message: () => string;
}

declare global {
  namespace jest {
    // Register as a Symmetric Matcher
    interface Matchers<R> {
      toBeWithinOneMinuteOf(actual: Date): R;
    }
  }
}

expect.extend({
  toBeWithinOneMinuteOf(actual: Date, expected: Date): CustomMatcherResult {
    const timeDiff = differenceInSeconds(expected, actual);
    let pass = timeDiff < 60;
    let message = () =>
      `${actual} should be within a minute of ${expected}, ` +
      `actual difference: ${timeDiff}s`;

    return { pass, message };
  },
});
