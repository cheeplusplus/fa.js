import { ACCT_PROFILE_USER, THEME_PROFILE_USER, themedIt } from "./shared";

describe("messages", () => {
  describe("submissions", () => {
    themedIt("fetches submissions page", async (client, theme) => {
      // This test basically doesn't work because it can change too much
      const expectedSelfLink = "/msg/submissions/";

      const actual = await client.getSubmissionsPage();
      expect(actual.self_link).toEqual(expectedSelfLink);
      expect(actual.submissions).toBeDefined();
      expect(actual.nextPage).toBeDefined();
      expect(actual.nextPage).not.toEqual(expectedSelfLink);
      expect(actual.previousPage).toBeNull();
    });
  });

  describe("others", () => {
    themedIt("fetches other messages", async (client, theme) => {
      // This test basically doesn't work because it can change too much
      const actual = await client.getMessages();
      expect(actual.my_username).toEqual(THEME_PROFILE_USER(theme));
      expect(actual.watches).toBeDefined();
      expect(actual.comments).toBeDefined();
      expect(actual.journal_comments).toBeDefined();
      expect(actual.shouts).toBeDefined();
      expect(actual.favorites).toBeDefined();
      expect(actual.journals).toBeDefined();
    });
  });
});
