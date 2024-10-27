import { FurAffinityClient } from "../src/client";

export const ACCT_TZ = "US/Pacific";

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
  callback: (client: FurAffinityClient, theme: "classic" | "beta") => any
) {
  test.each([["classic"], ["beta"]])(
    `${description} (%s theme)`,
    (theme: "classic" | "beta") => {
      const client = getClient(theme);
      return callback(client, theme);
    }
  );
}
