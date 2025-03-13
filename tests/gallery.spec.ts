import { getDateFromEpoch } from "./matchers";
import { themedIt, ThumbMatcher } from "./shared";

const expectedGallerySubmission = {
  id: 48551340,
  self_link: "/view/48551340/",
  title: "Ref: Preyfar",
  artist_name: "Dragoneer",
  thumb_url: expect.stringMatching(ThumbMatcher),
};

const expectedScrapsSubmission = {
  id: 9653045,
  self_link: "/view/9653045/",
  title: "My lil' Copilots",
  artist_name: "Dragoneer",
  thumb_url: expect.stringMatching(ThumbMatcher),
};

const expectedFavesSubmission = {
  id: 56389000,
  self_link: "/view/56389000/",
  title: "Dragoneer sfw",
  artist_name: "CatrineBluesky",
  thumb_url: expect.stringMatching(ThumbMatcher),
};

const expectedJournal = {
  id: 10112718,
  self_link: "/journal/10112718/",
  title: "2022 Checking In",
  body_text: expect.stringMatching("As I said. Hell of a year."),
  body_html: expect.stringMatching("As I said. Hell of a year."),
};

describe("user galleries", () => {
  describe("gallery", () => {
    themedIt("specific page loads correctly", async (client, theme) => {
      const expectedSelfLink = "/gallery/dragoneer/2/";

      const actual = await client.getUserGalleryPage("dragoneer", 2);
      expect(actual.self_link).toEqual(expectedSelfLink);
      expect(actual.submissions).toHaveLength(48); // technically depends on account config
      expect(actual.nextPage).toBeDefined();
      expect(actual.nextPage).not.toEqual(expectedSelfLink);
      expect(actual.previousPage).toBeDefined();
      expect(actual.previousPage).not.toEqual(expectedSelfLink);

      expect(actual.submissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining(expectedGallerySubmission),
        ]),
      );
    });

    themedIt(
      "walks through multiple pages correctly",
      async (client, theme) => {
        let pageCount = 0;
        for await (const submissions of client.getUserGallery("dragoneer")) {
          pageCount++;
          expect(submissions.length).toBeGreaterThanOrEqual(1);

          if (pageCount === 2) {
            expect(submissions).toEqual(
              expect.arrayContaining([
                expect.objectContaining(expectedGallerySubmission),
              ]),
            );
          }
        }

        expect(pageCount).toEqual(6);
      },
    );
  });

  describe("scraps", () => {
    themedIt("specific page loads correctly", async (client, theme) => {
      const expectedSelfLink = "/scraps/dragoneer/2/";

      const actual = await client.getUserScrapsPage("dragoneer", 2);
      expect(actual.self_link).toEqual(expectedSelfLink);
      expect(actual.submissions).toHaveLength(48); // technically depends on account config
      expect(actual.nextPage).toBeDefined();
      expect(actual.nextPage).not.toEqual(expectedSelfLink);
      expect(actual.previousPage).toBeDefined();
      expect(actual.previousPage).not.toEqual(expectedSelfLink);

      expect(actual.submissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining(expectedScrapsSubmission),
        ]),
      );
    });

    themedIt(
      "walks through multiple pages correctly",
      async (client, theme) => {
        let pageCount = 0;
        for await (const submissions of client.getUserScraps("dragoneer")) {
          pageCount++;
          expect(submissions.length).toBeGreaterThanOrEqual(1);

          if (pageCount === 2) {
            expect(submissions).toEqual(
              expect.arrayContaining([
                expect.objectContaining(expectedScrapsSubmission),
              ]),
            );
          }
        }

        expect(pageCount).toEqual(4);
      },
    );
  });

  describe("favorites", () => {
    themedIt("specific page loads correctly", async (client, theme) => {
      const expectedSelfLink = "/favorites/dragoneer/1622776532/next/";

      const actual = await client.getUserFavoritesPage(
        "dragoneer",
        "1622776532/next",
      );
      expect(actual.self_link).toEqual(expectedSelfLink);
      expect(actual.submissions).toHaveLength(48); // technically depends on account config
      expect(actual.nextPage).toBeDefined();
      expect(actual.nextPage).not.toEqual(expectedSelfLink);
      expect(actual.previousPage).toBeDefined();
      expect(actual.previousPage).not.toEqual(expectedSelfLink);

      expect(actual.submissions).toEqual(
        expect.arrayContaining([
          expect.objectContaining(expectedFavesSubmission),
        ]),
      );
    });

    themedIt(
      "walks through multiple pages correctly",
      async (client, theme) => {
        let pageCount = 0;
        for await (const submissions of client.getUserFavorites("dragoneer")) {
          pageCount++;
          expect(submissions.length).toBeGreaterThanOrEqual(1);

          if (pageCount === 2) {
            expect(submissions).toEqual(
              expect.arrayContaining([
                expect.objectContaining(expectedFavesSubmission),
              ]),
            );
          }

          // Cut off early
          if (pageCount > 2) {
            break;
          }
        }

        // Cut off early
        expect(pageCount).toEqual(3);
      },
    );
  });

  describe("journals", () => {
    themedIt("specific page loads correctly", async (client, theme) => {
      const expectedSelfLink = "/journals/dragoneer/2";

      const actual = await client.getUserJournalsPage("dragoneer", 2);
      expect(actual.self_link).toEqual(expectedSelfLink);
      expect(actual.journals).toHaveLength(25);
      expect(actual.nextPage).toBeDefined();
      expect(actual.nextPage).not.toEqual(expectedSelfLink);
      expect(actual.previousPage).toBeDefined();
      expect(actual.previousPage).not.toEqual(expectedSelfLink);

      expect(actual.journals).toEqual(
        expect.arrayContaining([expect.objectContaining(expectedJournal)]),
      );
    });

    themedIt(
      "walks through multiple pages correctly",
      async (client, theme) => {
        let pageCount = 0;
        for await (const journals of client.getUserJournals("dragoneer")) {
          pageCount++;
          expect(journals.length).toBeGreaterThanOrEqual(1);

          if (pageCount === 2) {
            expect(journals).toEqual(
              expect.arrayContaining([
                expect.objectContaining(expectedJournal),
              ]),
            );
          }

          // Cut off early
          if (pageCount > 2) {
            break;
          }
        }

        // Cut off early
        expect(pageCount).toEqual(3);
      },
    );
  });
});
