import { getDateFromEpoch } from "./matchers";
import { getLiveThumbnailDate, themedIt } from "./shared";

describe("journal", () => {
  const liveThumbDateStr = getLiveThumbnailDate();

  themedIt("getJournal fetched correctly", async (client, theme) => {
    // TODO: Use a journal on the test account
    const actual = await client.getJournal(10112718);
    expect(actual.self_link).toEqual("/journal/10112718/");
    expect(actual.title).toEqual("2022 Checking In");
    expect(actual.user_name).toEqual("Dragoneer");
    expect(actual.user_url).toEqual("/user/dragoneer/");
    expect(actual.user_thumb_url).toEqual(
      `https://a.furaffinity.net/1668743460/dragoneer.gif`,
    );
    expect(actual.body_text).toEqual(
      expect.stringContaining("As I said. Hell of a year."),
    );
    expect(actual.body_html).toEqual(
      expect.stringContaining("As I said. Hell of a year."),
    );
    // 2022-01-24T19:43:00Z
    expect(actual.when).toBeWithinOneMinuteOf(getDateFromEpoch(1643053380000));
    expect(actual.comments.length).toBeGreaterThan(0);
  });
});
