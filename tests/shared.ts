import { format } from "date-fns";
import { FurAffinityClient } from "../src/client";
import { tz } from "@date-fns/tz";

export const ACCT_PROFILE_USER = "kauko-fadotjs-test-a"; // always use this for hardcoded values
export const ACCT_TZ = "US/Pacific";
export const THEME_PROFILE_USER = (theme: "classic" | "beta") =>
  theme === "classic" ? "kauko-fadotjs-test-a" : "kauko-fadotjs-test-b";

export const ThumbMatcher =
  /https:\/\/t\.furaffinity\.net\/(\d+)@(\d+)-(\d+)\.jpg/;

function getClient(targetTheme: "classic" | "beta") {
  const cookies =
    targetTheme == "beta"
      ? process.env.FA_BETA_COOKIES
      : process.env.FA_CLASSIC_COOKIES;

  if (!cookies) {
    // This is an integration test
    // Maybe eventually rewrite this so we can run just the beta tests when logged out
    throw new Error("Missing cookies environment variables!");
  }

  return new FurAffinityClient({ cookies, timezone: ACCT_TZ });
}

export function themedIt(
  description: string,
  callback: (client: FurAffinityClient, theme: "classic" | "beta") => any,
) {
  test.each([["classic"], ["beta"]])(
    `${description} (%s theme)`,
    (theme: "classic" | "beta") => {
      const client = getClient(theme);
      return callback(client, theme);
    },
  );
}

export function getLiveThumbnailDate() {
  return format(new Date(), "yyyyMMdd", { in: tz(ACCT_TZ) });
}

export function normalize(text: string) {
  return text.replace(/\s+/g, " ");
}
