import { themedIt } from "./shared";
import { FurAffinityClient } from "../src";

describe("library", () => {
  // this test is mostly just to make sure we're using the right client cookies, but it's good to make sure this works anyway
  themedIt("correctly detects used theme", async (client, theme) => {
    // Something needs to be fetched for this field to be populated
    const userPage = await client.getUserPage("kauko-fadotjs-test-a");
    expect(userPage.user_name).toEqual("kauko-fadotjs-test-a");

    expect(FurAffinityClient.LAST_SEEN_SITE_VERSION).toEqual(theme);
  });
});
