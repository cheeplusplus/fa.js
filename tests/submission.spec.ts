import { format } from "date-fns";
import { themedIt } from "./shared";

describe("submission", () => {
  const liveThumbDateStr = format(new Date(), "yyyyMMdd"); // TODO: Figure out exactly when this changes

  themedIt("type 'image' is correctly parsed", async (client, theme) => {
    const actual = await client.getSubmission(58614470);
    expect(actual.id).toEqual(58614470);
    expect(actual.self_link).toEqual("/view/58614470/");
    expect(actual.type).toEqual("image");
    expect(actual.title).toEqual("FA.js test submission 1");
    expect(actual.thumb_url).toEqual(
      "https://t.furaffinity.net/58614470@600-1730007419.jpg"
    );
    expect(actual.content_url).toEqual(
      "https://d.furaffinity.net/art/kauko-fadotjs-test-a/1730007419/1730007419.kauko-fadotjs-test-a_plush_by_tinderhoof.jpg"
    );
    expect(actual.artist_name).toEqual("kauko-fadotjs-test-a");
    expect(actual.artist_url).toEqual("/user/kauko-fadotjs-test-a/");
    expect(actual.artist_thumb_url).toEqual(
      "https://a.furaffinity.net/20241027/kauko-fadotjs-test-a.gif"
    );
    const normalizedBody = actual.body_text.replace(/\s+/g, " ");
    expect(normalizedBody).toEqual(
      `This is a submission for integration testing fa.js This account and art belongs to andrewneo, the artist of the work is tinderhoof. Original upload is here`
    );
    const normalizedHtml = actual.body_html.replace(/\s+/g, " ");
    expect(normalizedHtml).toEqual(
      `This is a submission for integration testing <a class=\"auto_link named_url\" href=\"https://github.com/cheeplusplus/fa.js\">fa.js</a><br> <br> This account and art belongs to <a href=\"/user/andrewneo\" class=\"iconusername\"><img src=\"//a.furaffinity.net/${liveThumbDateStr}/andrewneo.gif\" align=\"middle\" title=\"andrewneo\" alt=\"andrewneo\">&nbsp;andrewneo</a>, the artist of the work is <a href=\"/user/tinderhoof\" class=\"iconusername\"><img src=\"//a.furaffinity.net/${liveThumbDateStr}/tinderhoof.gif\" align=\"middle\" title=\"tinderhoof\" alt=\"tinderhoof\">&nbsp;tinderhoof</a>. <a class=\"auto_link named_url\" href=\"https://www.furaffinity.net/view/23617101/\">Original upload is here</a>`
    );
    expect(actual.when).toEqual(new Date("2024-10-26T22:36:00"));
    expect(actual.keywords).toEqual(["wolf", "plushie", "integration_test"]);
    expect(actual.nav_items).toHaveLength(2);
    expect(actual.comments).toHaveLength(4);
    expect(JSON.stringify(actual.comments)).toEqual(
      // >:( jest why
      JSON.stringify([
        {
          id: 182261884,
          self_link: "#cid:182261884",
          user_name: "kauko-fadotjs-test-a",
          user_url: "/user/kauko-fadotjs-test-a/",
          user_thumb_url: `https://a.furaffinity.net/${liveThumbDateStr}/kauko-fadotjs-test-a.gif`,
          body_text: "Hello this is a comment!",
          body_html: "Hello this is a comment!",
          when: new Date("2024-10-26T22:40:40"),
        },
        {
          id: 182261887,
          self_link: "#cid:182261887",
          user_name: "AndrewNeo",
          user_url: "/user/andrewneo/",
          user_thumb_url: "https://a.furaffinity.net/1563504911/andrewneo.gif",
          body_text: "This is a reply to your comment",
          body_html: "This is a reply to your comment",
          when: new Date("2024-10-26T22:40:52"),
        },
        {
          id: 182261888,
          self_link: "#cid:182261888",
          user_name: "AndrewNeo",
          user_url: "/user/andrewneo/",
          user_thumb_url: "https://a.furaffinity.net/1563504911/andrewneo.gif",
          body_text: "This is a second top level comment with some bbcode",
          body_html: `This is a second top level comment <strong class="bbcode bbcode_b">with some bbcode</strong>`,
          when: new Date("2024-10-26T22:41:08"),
        },
        {
          // This is a hidden comment, which the library should probably detect as such
          id: 182261894,
          self_link: "",
          user_name: "",
          user_url: "",
          user_thumb_url: "",
          body_text: "",
          body_html: null!,
          when: new Date(NaN),
        },
      ])
    );
  });

  themedIt("type 'story' is correctly parsed", async (client, theme) => {
    const actual = await client.getSubmission(58614512);
    expect(actual.id).toEqual(58614512);
    expect(actual.self_link).toEqual("/view/58614512/");
    expect(actual.type).toEqual("story");
    expect(actual.title).toEqual("FA.js test story 1");
    expect(actual.thumb_url).toEqual(
      "https://t.furaffinity.net/58614512@600-1730007915.jpg"
    );
    expect(actual.content_url).toEqual(
      "https://d.furaffinity.net/art/kauko-fadotjs-test-a/stories/1730007915/1730007915.kauko-fadotjs-test-a_story.txt"
    );
    expect(actual.artist_name).toEqual("kauko-fadotjs-test-a");
    expect(actual.artist_url).toEqual("/user/kauko-fadotjs-test-a/");
    expect(actual.artist_thumb_url).toEqual(
      `https://a.furaffinity.net/${liveThumbDateStr}/kauko-fadotjs-test-a.gif`
    );
    const normalizedBody = actual.body_text.replace(/\s+/g, " ");
    expect(normalizedBody).toEqual(
      `This is a "story" for integration testing fa.js This account belongs to andrewneo, this writing was computer generated and no copyright is claimed.`
    );
    const normalizedHtml = actual.body_html.replace(/\s+/g, " ");
    expect(normalizedHtml).toEqual(
      `This is a "story" for integration testing <a class="auto_link named_url" href="https://github.com/cheeplusplus/fa.js">fa.js</a><br> <br> This account belongs to <a href="/user/andrewneo" class="iconusername"><img src="//a.furaffinity.net/${liveThumbDateStr}/andrewneo.gif" align="middle" title="andrewneo" alt="andrewneo">&nbsp;andrewneo</a>, this writing was computer generated and no copyright is claimed.`
    );
    expect(actual.when).toEqual(new Date("2024-10-26T22:45:00"));
    expect(actual.keywords).toEqual(["integration_test", "scifi"]);
    expect(actual.nav_items).toHaveLength(2);
    expect(actual.comments).toHaveLength(0);
  });

  themedIt("type 'music' is correctly parsed", async (client, theme) => {
    const actual = await client.getSubmission(58614563);
    expect(actual.id).toEqual(58614563);
    expect(actual.self_link).toEqual("/view/58614563/");
    expect(actual.type).toEqual("music");
    expect(actual.title).toEqual("FA.js test music 1 (thunderstorm)");
    expect(actual.thumb_url).toEqual(
      "https://t.furaffinity.net/58614563@600-1730008604.jpg"
    );
    expect(actual.content_url).toEqual(
      "https://d.furaffinity.net/art/kauko-fadotjs-test-a/music/1730008604/1730008442.kauko-fadotjs-test-a_rain.mp3"
    );
    expect(actual.artist_name).toEqual("kauko-fadotjs-test-a");
    expect(actual.artist_url).toEqual("/user/kauko-fadotjs-test-a/");
    expect(actual.artist_thumb_url).toEqual(
      `https://a.furaffinity.net/${liveThumbDateStr}/kauko-fadotjs-test-a.gif`
    );
    const normalizedBody = actual.body_text.replace(/\s+/g, " ");
    expect(normalizedBody).toEqual(
      `This is audio for integration testing fa.js This account belongs to andrewneo, this recording was recorded by Kauko.`
    );
    const normalizedHtml = actual.body_html.replace(/\s+/g, " ");
    expect(normalizedHtml).toEqual(
      `This is audio for integration testing <a class="auto_link named_url" href="https://github.com/cheeplusplus/fa.js">fa.js</a><br> <br> This account belongs to <a href="/user/andrewneo" class="iconusername"><img src="//a.furaffinity.net/${liveThumbDateStr}/andrewneo.gif" align="middle" title="andrewneo" alt="andrewneo">&nbsp;andrewneo</a>, this recording was recorded by Kauko.`
    );
    expect(actual.when).toEqual(new Date("2024-10-26T22:54:00"));
    expect(actual.keywords).toEqual([
      "integration_test",
      "music",
      "rain",
      "thunder",
    ]);
    expect(actual.nav_items).toHaveLength(2);
    expect(actual.comments).toHaveLength(0);
  });

  xit("type 'flash' is correctly parsed", () => {
    // This would be cool and all but they're not really supported anymore
  });
});
