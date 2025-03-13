import { isEqual } from "date-fns";
import { pickFromTimestampData, readDateWhenField } from "../src/utils";

// Note: constant TZ set in jest.config.js

describe("utils", () => {
  describe("readDateWhenField", () => {
    // readDateWhenField has no inherent tz reference so this test doesn't really work
    xit("properly reads the time string", () => {
      const actual = readDateWhenField("Oct 24, 2024 08:01 PM");
      // 1729825260
      // Fri Oct 25 2024 03:01:00 GMT+0000
      // Thu Oct 24 2024 20:01:00 GMT-0700 (Pacific Daylight Time)
      const expected = new Date("2024-10-25T03:01:00Z");

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
      expect(actual!.toUTCString()).toEqual(expected.toUTCString());
      expect(isEqual(actual!, expected)).toBeTruthy();
    });

    it("properly reads the time string with a tz conversion", () => {
      const actual = readDateWhenField("Oct 24, 2024 08:01 PM", "US/Pacific");
      // 1729825260
      // Fri Oct 25 2024 03:01:00 GMT+0000
      // Thu Oct 24 2024 20:01:00 GMT-0700 (Pacific Daylight Time)
      const expected = new Date("2024-10-25T03:01:00Z");

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
      expect(actual!.toUTCString()).toEqual(expected.toUTCString());
      expect(isEqual(actual!, expected)).toBeTruthy();
    });
  });

  describe("pickFromTimestampData", () => {
    it("properly reads unix time", () => {
      const actualWrap = pickFromTimestampData();
      // 1730090412
      // Mon Oct 28 2024 04:40:12 GMT+0000
      // Sun Oct 27 2024 21:40:12 GMT-0700 (Pacific Daylight Time)
      const actual = actualWrap.convert("1730065213");
      const expected = new Date("2024-10-27T21:40:13Z");

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
      expect(isEqual(actual!, expected)).toBeTruthy();
      expect(actual!.toUTCString()).toEqual(expected.toUTCString());
    });

    it("properly reads unix time with a tz conversion", () => {
      const actualWrap = pickFromTimestampData(undefined, "US/Pacific");
      // 1730090412
      // Mon Oct 28 2024 04:40:12 GMT+0000
      // Sun Oct 27 2024 21:40:12 GMT-0700 (Pacific Daylight Time)
      const actual = actualWrap.convert("1730065213");
      const expected = new Date("2024-10-27T21:40:13Z");

      expect(actual).toBeDefined();
      expect(actual).toEqual(expected);
      expect(actual!.toUTCString()).toEqual(expected.toUTCString());
      expect(isEqual(actual!, expected)).toBeTruthy();
    });
  });
});
