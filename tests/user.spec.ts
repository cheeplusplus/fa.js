import {
  ACCT_PROFILE_USER,
  getLiveThumbnailDate,
  normalize,
  themedIt,
  ThumbMatcher,
} from "./shared";

describe("userpage", () => {
  const liveThumbDateStr = getLiveThumbnailDate();

  themedIt("loads correctly", async (client, theme) => {
    const actual = await client.getUserPage(ACCT_PROFILE_USER);
    expect(actual.user_name).toEqual(ACCT_PROFILE_USER);
    expect(actual.self_link).toEqual(`/user/${ACCT_PROFILE_USER}/`);
    expect(actual.user_thumb_url).toEqual(
      `https://a.furaffinity.net/${liveThumbDateStr}/kauko-fadotjs-test-a.gif`
    );
    // Note: the classic theme has extra crap - eventually this should get cleaned up
    expect(normalize(actual.header_text)).toEqual(
      expect.stringContaining(
        `This is a read-only test account for FA.js Maintained by andrewneo`
      )
    );
    expect(normalize(actual.header_html)).toEqual(
      expect.stringContaining(
        `This is a read-only test account for <a class="auto_link named_url" href="https://github.com/cheeplusplus/fa.js">FA.js</a><br> <br> Maintained by <a href="/user/andrewneo" class="iconusername"><img src="//a.furaffinity.net/${liveThumbDateStr}/andrewneo.gif" align="middle" title="andrewneo" alt="andrewneo">&nbsp;andrewneo</a>`
      )
    );
    // these aren't parsed so just make sure we're in the right place
    expect(normalize(actual.statistics_text)).toEqual(
      expect.stringContaining("Submissions: 3")
    );
    expect(normalize(actual.statistics_html)).toEqual(
      expect.stringContaining("Submissions:</span> 3")
    );
    expect(actual.latest_submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 60183782,
          self_link: "/view/60183782/",
          thumb_url: expect.stringMatching(ThumbMatcher),
        }),
        expect.objectContaining({
          id: 58614563,
          self_link: "/view/58614563/",
          thumb_url: expect.stringMatching(ThumbMatcher),
        }),
        expect.objectContaining({
          id: 58614470,
          self_link: "/view/58614470/",
          thumb_url: expect.stringMatching(ThumbMatcher),
        }),
      ])
    );
    expect(actual.favorites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 9322960,
          self_link: "/view/9322960/",
          thumb_url: expect.stringMatching(ThumbMatcher),
        }),
      ])
    );
  });
});
