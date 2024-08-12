import * as cheerio from "cheerio";
import scrape from "scrape-it";
import { checkErrors, FurAffinityError } from "./errors";
import { FetchHttpClient } from "./httpclients";
import {
  colonPostMatchRegex,
  colonPreMatchRegex,
  delay,
  ensureIdIsNumber,
  fixFaUrl,
  getJournalPath,
  getViewPath,
  parensMatchRegex,
  parensNumberMatchRegex,
  pick,
  pickCheckboxValue,
  pickDateFromThumbnail,
  pickFigureId,
  pickFormValue,
  pickImage,
  pickLink,
  pickStaticValue,
  pickWhenFromSpan,
  pickWithRegex,
  SELECTOR_JOURNAL,
  SELECTOR_THUMB,
  SELECTOR_USER,
  SELECTOR_VIEW,
  SITE_ROOT,
} from "./utils";
import type {
  HttpClient,
  ClientConfig,
  UserPage,
  Journals,
  FAID,
  Submission,
  Messages,
  Journal,
  Notes,
  Note,
  NoteMoveAction,
  SubmissionStatistics,
  CommentText,
  TypedScrapeOptionList,
  Comment,
  SearchQueryParams,
  SubmissionListing,
  SearchPage,
  SearchQueryBody,
  SubmissionPage,
  FetchConfig,
  DualScrapeOptions,
  Watchlist,
} from "./types";

// TODO: Rate limiting and backoff error handling
// TODO: Handle removed submissions/journals/etc

export class FurAffinityClient {
  public static LAST_SEEN_SITE_VERSION: string;

  private cookies?: string;
  private disableRetry?: boolean;
  private httpClient: HttpClient;

  constructor(config?: string | ClientConfig) {
    if (typeof config === "string") {
      this.cookies = config;
      this.disableRetry = false;
    } else if (typeof config === "object") {
      this.cookies = config.cookies ?? undefined;
      this.disableRetry = config.disableRetry ?? false;
      if (config.httpClient) {
        this.httpClient = config.httpClient;
      }
    }

    if (!this.httpClient) {
      this.httpClient = new FetchHttpClient();
    }
  }

  getSubmissions() {
    return this.scrapeSubmissionPages("/msg/submissions/");
  }

  getSubmissionsPage(nextUrl: string = "/msg/submissions/") {
    return this.scrapeSubmissionsPage(nextUrl);
  }

  getUserGallery(username: string) {
    return this.scrapeUserGalleryPages(`/gallery/${username}/`, "gallery");
  }

  getUserGalleryPage(username: string, page: string | number) {
    return this.scrapeUserGalleryPage(
      `/gallery/${username}/${page}/`,
      "gallery"
    );
  }

  getUserScraps(username: string) {
    return this.scrapeUserGalleryPages(`/scraps/${username}/`, "scraps");
  }

  getUserScrapsPage(username: string, page: string | number) {
    return this.scrapeUserGalleryPage(`/scraps/${username}/${page}/`, "scraps");
  }

  getUserFavorites(username: string) {
    return this.scrapeUserGalleryPages(`/favorites/${username}/`, "favorites");
  }

  getUserFavoritesPage(username: string, page: string | number) {
    return this.scrapeUserGalleryPage(
      `/favorites/${username}/${page}/`,
      "favorites"
    );
  }

  async getUserPage(username: string) {
    const path = `/user/${username}/`;
    const body = await this.fetch(path, undefined);

    const base = this.scrape<
      Omit<UserPage, "featured_submission" | "top_journal" | "profile_id">
    >(body, {
      classic: {
        self_link: pickStaticValue(path),
        user_name: {
          selector: "#page-userpage table.maintable > tbody tr td.lead b",
          convert: (text: string) => {
            if (text?.startsWith("~")) {
              return text.substr(1);
            }
            return text;
          },
        },
        user_thumb_url: pickImage(
          `#page-userpage ${SELECTOR_USER} > img.avatar`
        ),
        header_text:
          "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(1)",
        header_html: {
          selector:
            "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(1)",
          how: "html",
        },
        statistics_text:
          "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td",
        statistics_html: {
          selector:
            "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td",
          how: "html",
        },
        latest_submissions: {
          listItem: "#gallery-latest-submissions figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            thumb_url: pickImage(`${SELECTOR_VIEW} img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} img`),
          },
        },
        favorites: {
          listItem: "#gallery-latest-favorites figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            thumb_url: pickImage(`${SELECTOR_VIEW} img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} img`),
          },
        },
        artist_information: {
          listItem: "table > tbody > tr > td.user-info div.user-info-item",
          data: {
            title: "strong",
            value: pickWithRegex(colonPostMatchRegex),
          },
        },
        contact_information: {
          listItem:
            "table > tbody > tr > td.user-contacts .classic-contact-info-item",
          data: {
            service: pickWithRegex(
              colonPreMatchRegex,
              ".contact-service-name > strong"
            ),
            link: pickLink(),
            value: {
              convert: (val: string, elem: cheerio.Cheerio) => {
                const children = elem.children();

                if (children[1]) {
                  return elem.children().eq(1).text();
                }

                return elem.children()[0]?.next?.data?.trim();
              },
            },
          },
        },
        shouts: {
          listItem: "table[id*='shout-']",
          data: {
            id: {
              attr: "id",
              convert: (value: string) => {
                return parseInt(value.split("-")[1]);
              },
            },
            user_name: `.from-header > ${SELECTOR_USER}`,
            user_url: pickLink(`.from-header > ${SELECTOR_USER}`),
            user_thumb_url: pickImage(`${SELECTOR_USER} > img.avatar`),
            body_text: "div.no_overflow",
            body_html: {
              selector: "div.no_overflow",
              how: "html",
            },
            when: pickWhenFromSpan("td > span.popup_date"),
          },
        },
      },
      beta: {
        self_link: pickStaticValue(path),
        user_name: {
          selector:
            "#pageid-userpage userpage-nav-header > userpage-nav-user-details > h1 > username",
          convert: (text: string) => {
            if (text?.trim()?.startsWith("~")) {
              return text.trim().substr(1);
            }
            return text;
          },
        },
        user_thumb_url: pickImage(
          `#pageid-userpage userpage-nav-header > userpage-nav-avatar > ${SELECTOR_USER} > img`
        ),
        header_text:
          "#page-userpage .userpage-layout-profile-container div.userpage-profile",
        header_html: {
          selector:
            "#page-userpage .userpage-layout-profile-container div.userpage-profile",
          how: "html",
        },
        statistics_text:
          "section.userpage-right-column:nth-child(1) div.section-body div.table",
        statistics_html: {
          selector:
            "section.userpage-right-column:nth-child(1) div.section-body div.table",
          how: "html",
        },
        latest_submissions: {
          listItem: "#gallery-latest-submissions figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            thumb_url: pickImage(`${SELECTOR_VIEW} img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} > img`),
          },
        },
        favorites: {
          listItem: "#gallery-latest-favorites figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            thumb_url: pickImage(`${SELECTOR_VIEW} img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} > img`),
          },
        },
        artist_information: {
          listItem: "#userpage-contact-item div.table-row",
          data: {
            title: "strong",
            value: {
              convert: (val: string, elem: cheerio.Cheerio) => {
                const children = elem.children();

                if (children[2]) {
                  // URL
                  return children.eq(2).text();
                }

                if (children[1]) {
                  // Text
                  return children[1].next?.data?.trim();
                }

                return children[0]?.next?.data?.trim();
              },
            },
          },
        },
        contact_information: {
          listItem:
            "#userpage-contact div.user-contact-item div.user-contact-user-info",
          data: {
            service: "strong",
            link: pickLink(),
            value: {
              convert: (val: string, elem: cheerio.Cheerio) => {
                const children = elem.children();

                if (children[2]) {
                  // URL
                  return children.eq(2).text();
                }

                if (children[1]) {
                  // Text
                  return children[1].next?.data?.trim();
                }

                return children[0]?.next?.data?.trim();
              },
            },
          },
        },
        shouts: {
          listItem: `#page-userpage section.userpage-right-column div.comment_container`,
          data: {
            id: {
              selector: "a[id*='shout-'].comment_anchor",
              attr: "id",
              convert: (value: string) => {
                return parseInt(value.split("-")[1]);
              },
            },
            user_name: `comment-username ${SELECTOR_USER} > h3`,
            user_url: pickLink(`comment-username ${SELECTOR_USER}`),
            user_thumb_url: pickImage(
              `comment-container > div.avatar > ${SELECTOR_USER} > img`
            ),
            body_text: "comment-user-text.comment_text",
            body_html: {
              selector: "comment-user-text.comment_text",
              how: "html",
            },
            when: pickWhenFromSpan("comment-date > span.popup_date"),
          },
        },
      },
    });

    const featuredSubmissionCellBeta =
      "section.userpage-left-column:nth-child(1) div.section-body";
    const featuredSubmission = this.scrape<UserPage["featured_submission"]>(
      body,
      {
        classic: {
          id: {
            selector: "#featured-submission b",
            attr: "id",
            convert: (s: string) => parseInt(s.split("_")[1]),
          },
          self_link: pickLink(`#featured-submission ${SELECTOR_VIEW}`),
          title: "#featured-submission b > span",
          thumb_url: pickImage(`#featured-submission ${SELECTOR_VIEW} > img`),
        },
        beta: {
          id: {
            selector: `${featuredSubmissionCellBeta} ${SELECTOR_VIEW}`,
            attr: "href",
            convert: getViewPath,
          },
          self_link: pickLink(`${featuredSubmissionCellBeta} ${SELECTOR_VIEW}`),
          title: `${featuredSubmissionCellBeta} div.userpage-featured-title ${SELECTOR_VIEW}`,
          thumb_url: pickImage(
            `${featuredSubmissionCellBeta} ${SELECTOR_VIEW} > img`
          ),
        },
      }
    );

    const topJournalCellClassic =
      "#page-userpage > tbody > tr:nth-child(2) > td:nth-child(2) > table:nth-child(1)";
    const topJournalCellBeta = "section.userpage-right-column:nth-child(2)";
    const topJournal = this.scrape<UserPage["top_journal"]>(body, {
      classic: {
        id: {
          selector: `${topJournalCellClassic} b > ${SELECTOR_JOURNAL}`,
          attr: "href",
          convert: getJournalPath,
        },
        self_link: pickLink(`${topJournalCellClassic} b > ${SELECTOR_JOURNAL}`),
        title: `${topJournalCellClassic} b > ${SELECTOR_JOURNAL}`,
        body_text: `${topJournalCellClassic} .journal-body`,
        body_html: {
          selector: `${topJournalCellClassic} .journal-body`,
          how: "html",
        },
        when: pickWhenFromSpan(`${topJournalCellClassic} td > span.popup_date`),
        comment_count: pickWithRegex(
          parensMatchRegex,
          `${topJournalCellClassic} ${SELECTOR_JOURNAL}:contains("Comments")`,
          undefined,
          undefined,
          true
        ),
      },
      beta: {
        id: {
          selector: `${topJournalCellBeta} ${SELECTOR_JOURNAL}`,
          attr: "href",
          convert: getJournalPath,
        },
        self_link: pickLink(`${topJournalCellBeta} ${SELECTOR_JOURNAL}`),
        title: `${topJournalCellBeta} .section-body > h2`,
        body_text: `${topJournalCellBeta} .section-body > div.user-submitted-links`,
        body_html: {
          selector: `${topJournalCellBeta} .section-body > div.user-submitted-links`,
          how: "html",
        },
        when: pickWhenFromSpan(
          `${topJournalCellBeta} .section-body span.popup_date`
        ),
        comment_count: pickWithRegex(
          parensNumberMatchRegex,
          `${topJournalCellBeta} ${SELECTOR_JOURNAL} span`,
          undefined,
          undefined,
          true
        ),
      },
    });

    const profileIdCellBeta = `section.userpage-right-column:nth-child(3) .section-submission`;
    const profileId = this.scrape<UserPage["profile_id"]>(body, {
      classic: {
        id: {
          selector: `#profilepic-submission ${SELECTOR_VIEW}`,
          attr: "href",
          convert: getViewPath,
        },
        self_link: pickLink(`#profilepic-submission ${SELECTOR_VIEW}`),
        thumb_url: pickImage(`#profilepic-submission ${SELECTOR_VIEW} > img`),
        when: pickDateFromThumbnail(
          `#profilepic-submission ${SELECTOR_VIEW} > img`
        ),
      },
      beta: {
        id: {
          selector: `${profileIdCellBeta} ${SELECTOR_VIEW}`,
          attr: "href",
          convert: getViewPath,
        },
        self_link: pickLink(`${profileIdCellBeta} ${SELECTOR_VIEW}`),
        thumb_url: pickImage(`${profileIdCellBeta} ${SELECTOR_VIEW} > img`),
        when: pickDateFromThumbnail(
          `${profileIdCellBeta} ${SELECTOR_VIEW} > img`
        ),
      },
    });

    return {
      ...base,
      featured_submission: featuredSubmission?.id ? topJournal : undefined,
      top_journal: topJournal?.id ? topJournal : undefined,
      profile_id: profileId?.id ? profileId : undefined,
    } as UserPage;
  }

  getUserJournals(username: string) {
    return this.scrapeUserJournalPages(username, `/journals/${username}`);
  }

  getUserJournalsPage(username: string, page: string | number) {
    return this.scrapeUserJournalPage(
      username,
      `/journals/${username}/${page}`
    );
  }

  protected scrapeUserJournalPage(username: string, path: string) {
    return this.fetchAndScrape<Journals>(path, {
      classic: {
        self_link: pickStaticValue(path),
        user_name: pickStaticValue(username),
        journals: {
          listItem: "table.page-journals-list table.maintable[id*='jid:']",
          data: {
            id: {
              attr: "id",
              convert: (s: string) => parseInt(s.split(":")[1]),
            },
            self_link: pickLink(SELECTOR_JOURNAL),
            title: `tbody > tr > td > div.no_overflow ${SELECTOR_JOURNAL}`,
            body_text: "tbody > tr > td > div.no_overflow.alt1",
            body_html: {
              selector: "tbody > tr > td > div.no_overflow.alt1",
              how: "html",
            },
            when: pickWhenFromSpan("td > span.popup_date"),
            comment_count: pickWithRegex(
              parensMatchRegex,
              `${SELECTOR_JOURNAL}:contains("Comments")`,
              undefined,
              undefined,
              true
            ),
          },
        },
        nextPage: pickLink("div.pagination a.older"),
        previousPage: pickLink("div.pagination a.recent"),
      },
      beta: {
        self_link: pickStaticValue(path),
        user_name: pickStaticValue(username),
        journals: {
          listItem: "#columnpage .content section[id*='jid:']",
          data: {
            id: {
              attr: "id",
              convert: (s: string) => parseInt(s.split(":")[1]),
            },
            self_link: pickLink(SELECTOR_JOURNAL),
            title: ".section-header h2",
            body_text: ".section-body div.journal-body",
            body_html: {
              selector: ".section-body div.journal-body",
              how: "html",
            },
            when: pickWhenFromSpan(".section-header span.popup_date"),
            comment_count: {
              selector: `${SELECTOR_JOURNAL} > span.font-large`,
              convert: ensureIdIsNumber,
            },
          },
        },
        nextPage: pickFormValue(
          "div.sidebar form:has(>button:contains('Older'))"
        ),
        previousPage: pickFormValue(
          "div.sidebar form:has(>button:contains('Newer'))"
        ),
      },
    });
  }

  protected async *scrapeUserJournalPages(
    username: string,
    url: string
  ): AsyncGenerator<Journals["journals"][0][], unknown, unknown> {
    while (true) {
      const page = await this.scrapeUserJournalPage(username, url);

      if (page.nextPage) {
        yield page.journals;
        url = page.nextPage;
      } else if (page.journals.length > 0) {
        return yield page.journals;
      } else {
        return;
      }
    }
  }

  public getUserIsWatching(username: string) {
    return this.scrapeUserWatchPages(username, `/watchlist/by/${username}/`);
  }

  public getUserIsWatchingPage(username: string, page: string | number) {
    return this.scrapeUserWatchPage(
      username,
      `/watchlist/by/${username}/${page}/`
    );
  }

  public getUserIsWatchedBy(username: string) {
    return this.scrapeUserWatchPages(username, `/watchlist/to/${username}/`);
  }

  public getUserIsWatchedByPage(username: string, page: string | number) {
    return this.scrapeUserWatchPage(
      username,
      `/watchlist/to/${username}/${page}/`
    );
  }

  protected scrapeUserWatchPage(username: string, url: string) {
    return this.fetchAndScrape<Watchlist>(url, {
      classic: {
        self_link: pickStaticValue(url),
        user_name: pickStaticValue(username),
        users: {
          listItem: `#userpage-budlist > tbody > tr > td`,
          data: {
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
          },
        },
        nextPage: pickFormValue("form:has(>button:contains('Next'))"),
        previousPage: pickFormValue("form:has(>button:contains('Last'))"),
      },
      beta: {
        self_link: pickStaticValue(url),
        user_name: pickStaticValue(username),
        users: {
          listItem: "div.watch-list .watch-row",
          data: {
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
          },
        },
        nextPage: pickFormValue(
          "div.section-footer form:has(>button:contains('Next'))"
        ),
        previousPage: pickFormValue(
          "div.section-footer form:has(>button:contains('Back'))"
        ),
      },
    });
  }

  protected async *scrapeUserWatchPages(
    username: string,
    url: string
  ): AsyncGenerator<Watchlist["users"], unknown, unknown> {
    while (true) {
      const page = await this.scrapeUserWatchPage(username, url);

      if (page.nextPage && page.nextPage !== url) {
        yield page.users;
        url = page.nextPage;
      } else if (page.users.length > 0) {
        return yield page.users;
      } else {
        return;
      }
    }
  }

  async getSubmission(id: FAID) {
    function getSubmissionType(element: cheerio.Cheerio) {
      if (element.attr("src")) {
        const src = element.attr("src");
        if (!src) {
          return "unknown";
        } else if (src.includes("/stories/") || src.includes("poetry")) {
          return "story";
        } else if (src.includes("/music/")) {
          return "music";
        } else {
          return "image";
        }
      } else {
        // probably flash
        const obj = element.find("object");
        if (obj) {
          return "flash";
        }
      }
      return "unknown";
    }

    const path = `/view/${id}/`;
    return this.fetchAndScrape<Submission>(path, {
      classic: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(path),
        type: {
          selector: "#submissionImg",
          convert: ((v: string, element: cheerio.Cheerio) => {
            return getSubmissionType(element);
          }) as any,
        },
        title: "#page-submission div.classic-submission-title.information > h2",
        thumb_url: pickImage("#submissionImg", "data-preview-src"),
        content_url: {
          selector: "#page-submission",
          convert: ((v: string, element: cheerio.Cheerio) => {
            let result: string | undefined;
            const typeFinderRoot = element.find("#submissionImg");
            const type = getSubmissionType(typeFinderRoot);
            if (type === "image") {
              result = typeFinderRoot.attr("data-fullview-src");
            } else if (type === "story") {
              const slink = element.find(
                "#text-container a[href*='/stories/']"
              );
              result = slink.attr("href");
            } else if (type === "music") {
              const slink = element.find(
                ".audio-player-container audio.audio-player"
              );
              result = slink.attr("src");
            } else if (type === "flash") {
              const slink = element.find("object");
              result = slink.attr("data");
            }

            if (result) {
              return fixFaUrl(result);
            }
            return undefined;
          }) as any,
        },
        artist_name: `#page-submission div.classic-submission-title.information > ${SELECTOR_USER}`,
        artist_url: pickLink(
          `#page-submission div.classic-submission-title.information > ${SELECTOR_USER}`
        ),
        artist_thumb_url: pickImage(
          `#page-submission div.classic-submissiont-title.avatar ${SELECTOR_USER} > img`
        ),
        body_text:
          "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
        body_html: {
          selector:
            "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
          how: "html",
        },
        when: pickWhenFromSpan(
          "#page-submission td.stats-container span.popup_date"
        ),
        keywords: {
          listItem: "#page-submission #keywords > a",
          data: {
            value: "",
          },
          convert: (c: { value: string }) => c.value,
        },
        nav_items: {
          listItem: `#page-submission div.minigallery-container ${SELECTOR_VIEW}`,
          data: {
            value: {
              attr: "href",
              convert: getViewPath,
            },
          },
          convert: (c: { value: number }) => c.value,
        },
        comments: this.getCommentsObj("#comments-submission", "classic"),
      },
      beta: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(path),
        type: {
          selector: "#submissionImg",
          convert: ((v: string, element: cheerio.Cheerio) => {
            return getSubmissionType(element);
          }) as any,
        },
        title: "#submission_page div.submission-title p",
        thumb_url: pickImage("#submissionImg", "data-preview-src"),
        content_url: {
          selector: "#submission_page",
          convert: ((v: string, element: cheerio.Cheerio) => {
            let result: string | undefined;
            const typeFinderRoot = element.find("#submissionImg");
            const type = getSubmissionType(typeFinderRoot);
            if (type === "image") {
              result = typeFinderRoot.attr("data-fullview-src");
            } else if (type === "story") {
              const slink = element.find(
                "#submission-content a[href*='/stories/']"
              );
              result = slink.attr("href");
            } else if (type === "music") {
              const slink = element.find(
                ".audio-player-container audio.audio-player"
              );
              result = slink.attr("src");
            } else if (type === "flash") {
              const slink = element.find("object");
              result = slink.attr("data");
            }

            if (result) {
              return fixFaUrl(result);
            }
            return undefined;
          }) as any,
        },
        artist_name: `#submission_page .submission-id-container ${SELECTOR_USER}`,
        artist_url: pickLink(
          `#submission_page .submission-id-container ${SELECTOR_USER}`
        ),
        artist_thumb_url: pickImage(
          `#submission_page .submission-id-avatar ${SELECTOR_USER} > img`
        ),
        body_text: "#submission_page div.submission-description",
        body_html: {
          selector: "#submission_page div.submission-description",
          how: "html",
        },
        when: pickWhenFromSpan(
          "#submission_page .submission-id-container span.popup_date"
        ),
        keywords: {
          listItem:
            "#submission_page div.submission-sidebar section.tags-row > span.tags > a",
          data: {
            value: "",
          },
          convert: (c: { value: string }) => c.value,
        },
        nav_items: {
          listItem: `#submission_page section.minigallery-more div.preview-gallery ${SELECTOR_VIEW}`,
          data: {
            value: {
              attr: "href",
              convert: getViewPath,
            },
          },
          convert: (c: { value: number }) => c.value,
        },
        comments: this.getCommentsObj("#comments-submission", "beta"),
      },
    });
  }

  getMessages() {
    return this.fetchAndScrape<Messages>(`/msg/others/`, {
      classic: {
        my_username: {
          selector: "a#my-username",
          convert: (s: string) => s && s.replace("~", ""),
        },
        watches: {
          listItem: "ul#watches > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            user_name: "div > span",
            user_url: pickLink(),
            user_thumb_url: pickImage(),
            when: pickWhenFromSpan("div > small > span"),
          },
        },
        comments: {
          listItem: "ul#comments > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            submission_id: {
              selector: SELECTOR_VIEW,
              attr: "href",
              convert: getViewPath,
            },
            submission_title: SELECTOR_VIEW,
            submission_url: pickLink(SELECTOR_VIEW),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span"),
          },
        },
        journal_comments: {
          listItem:
            "fieldset#messages-comments-journal > ul.message-stream > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            title: SELECTOR_JOURNAL,
            url: pickLink(SELECTOR_JOURNAL),
            journal_id: {
              selector: SELECTOR_JOURNAL,
              attr: "href",
              convert: getJournalPath,
            },
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span"),
          },
        },
        shouts: {
          listItem:
            "fieldset#messages-shouts > ul.message-stream > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span"),
          },
        },
        favorites: {
          listItem: "ul#favorites > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            submission_id: {
              selector: SELECTOR_VIEW,
              attr: "href",
              convert: getViewPath,
            },
            submission_title: SELECTOR_VIEW,
            submission_url: pickLink(SELECTOR_VIEW),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span"),
          },
        },
        journals: {
          listItem: "ul#journals > li:not(.section-controls)",
          data: {
            id: pickCheckboxValue(),
            journal_title: SELECTOR_JOURNAL,
            journal_url: pickLink(SELECTOR_JOURNAL),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span"),
          },
        },
      },
      beta: {
        my_username: `.mobile-navigation article.mobile-menu h2 > ${SELECTOR_USER}`,
        watches: {
          listItem: "#messages-watches ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            user_name: "div.info > span:nth-child(1)",
            user_url: pickLink(SELECTOR_USER),
            user_thumb_url: pickImage("img.avatar"),
            when: pickWhenFromSpan("div.info span.popup_date"),
          },
        },
        comments: {
          listItem: "#messages-comments-submission ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            submission_id: {
              selector: SELECTOR_VIEW,
              attr: "href",
              convert: getViewPath,
            },
            submission_title: SELECTOR_VIEW,
            submission_url: pickLink(SELECTOR_VIEW),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span.popup_date"),
          },
        },
        journal_comments: {
          listItem: "#messages-comments-journal ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            title: SELECTOR_JOURNAL,
            url: pickLink(SELECTOR_JOURNAL),
            journal_id: {
              selector: SELECTOR_JOURNAL,
              attr: "href",
              convert: getJournalPath,
            },
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span.popup_date"),
          },
        },
        shouts: {
          listItem: "#messages-shouts ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span.popup_date"),
          },
        },
        favorites: {
          listItem: "#messages-favorites ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            submission_id: {
              selector: SELECTOR_VIEW,
              attr: "href",
              convert: getViewPath,
            },
            submission_title: {
              selector: SELECTOR_VIEW,
              convert: (str: string) => {
                if (str && str.startsWith(`"`) && str.endsWith(`"`)) {
                  str = str.substr(1, str.length - 2);
                }
                return str;
              },
            },
            submission_url: pickLink(SELECTOR_VIEW),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span.popup_date"),
          },
        },
        journals: {
          listItem: "#messages-journals ul.message-stream > li",
          data: {
            id: pickCheckboxValue(),
            journal_title: SELECTOR_JOURNAL,
            journal_url: pickLink(SELECTOR_JOURNAL),
            user_name: SELECTOR_USER,
            user_url: pickLink(SELECTOR_USER),
            when: pickWhenFromSpan("span.popup_date"),
          },
        },
      },
    });
  }

  getJournal(id: FAID) {
    const path = `/journal/${id}/`;
    return this.fetchAndScrape<Journal>(path, {
      classic: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(path),
        title: "#page-journal td.journal-title-box > b > font > div",
        user_name: `#page-journal td.journal-title-box ${SELECTOR_USER}`,
        user_url: pickLink(
          `#page-journal td.journal-title-box ${SELECTOR_USER}`
        ),
        user_thumb_url: pickImage(
          `#page-journal td.avatar-box ${SELECTOR_USER} > img`
        ),
        body_text: "div.journal-body",
        body_html: {
          selector: "div.journal-body",
          how: "html",
        },
        when: pickWhenFromSpan(
          "#page-journal td.journal-title-box span.popup_date"
        ),
        comments: this.getCommentsObj("#page-comments", "classic"),
      },
      beta: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(path),
        title: ".content .section-header h2.journal-title",
        user_name: {
          selector:
            "userpage-nav-header > userpage-nav-user-details > h1 > username",
          convert: (text: string) => {
            if (text?.trim()?.startsWith("~")) {
              return text.trim().substr(1);
            }
            return text;
          },
        },
        user_url: pickLink(
          `userpage-nav-header > userpage-nav-avatar > ${SELECTOR_USER}.current`
        ),
        user_thumb_url: pickImage(
          `userpage-nav-header > userpage-nav-avatar > ${SELECTOR_USER}.current > img`
        ),
        body_text: ".content .journal-item div.journal-content",
        body_html: {
          selector: ".content .journal-item div.journal-content",
          how: "html",
        },
        when: pickWhenFromSpan(".content .section-header span.popup_date"),
        comments: this.getCommentsObj("#comments-journal", "beta"),
      },
    });
  }

  getNotes() {
    return this.fetchAndScrape<Notes>(`/msg/pms/`, {
      classic: {
        notes: {
          listItem: "#notes-list > tbody > tr.note",
          data: {
            id: pickCheckboxValue(),
            self_link: pickLink("td.subject > a"),
            title: "td.subject > a",
            user_name: "td.col-from > a",
            user_url: pickLink("td.col-from > a"),
            unread: {
              selector: "td.subject > a",
              attr: "class",
              convert: (s: string) => !!(s && s.indexOf("unread") > -1),
            },
            when: pickWhenFromSpan("td:nth-child(3) > span"),
          },
        },
      },
      beta: {
        notes: {
          listItem: "#notes-list > div.message-center-pms-note-list-view",
          data: {
            id: pickCheckboxValue(),
            self_link: pickLink('a[href*="/msg/pms/"]'),
            title: "div.note-list-subject",
            user_name: `.note-list-sender ${SELECTOR_USER}`,
            user_url: pickLink(`.note-list-sender ${SELECTOR_USER}`),
            unread: {
              selector: "div.note-list-subject",
              attr: "class",
              convert: (s: string) => !!(s && s.indexOf("unread") > -1),
            },
            when: pickWhenFromSpan(".note-list-senddate span.popup_date"),
          },
        },
      },
    });
  }

  async getNote(id: FAID) {
    const pickNoWarningText = (val: string, elem: cheerio.Cheerio) => {
      elem.children("div.noteWarningMessage").remove();
      return elem.text()?.trim();
    };
    const pickNoWarningHtml = (val: string, elem: cheerio.Cheerio) => {
      elem.children("div.noteWarningMessage").remove();
      return elem.html()?.trim();
    };

    // TODO: Remove note warning text
    const path = `/msg/pms/1/${id}/`; // we get better HTML here but harder to tell if invalid output
    const note = await this.fetchAndScrape<Note>(path, {
      classic: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(`/viewmessage/${id}/`),
        title: "#pms-form td.note-view-container td.head em.title",
        user_name:
          "#pms-form td.note-view-container td.head em:nth-child(2) > a",
        user_url: pickLink(
          "#pms-form td.note-view-container td.head em:nth-child(2) > a"
        ),
        body_text: {
          selector: "#pms-form td.note-view-container td.text",
          convert: pickNoWarningText as any,
        },
        body_html: {
          selector: "#pms-form td.note-view-container td.text",
          convert: pickNoWarningHtml as any,
        },
        when: pickWhenFromSpan(
          "#pms-form td.note-view-container td.date span.popup_date"
        ),
      },
      beta: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        self_link: pickStaticValue(path),
        title: "#message > .section-header > h2",
        user_name: `#message > .section-header .addresses > ${SELECTOR_USER}:nth-child(1) strong`,
        user_url: pickLink(
          `#message > .section-header .avatar > ${SELECTOR_USER}`
        ),
        body_text: {
          selector: "#message .section-body div.user-submitted-links",
          convert: pickNoWarningText as any,
        },
        body_html: {
          selector: "#message .section-body div.user-submitted-links",
          convert: pickNoWarningHtml as any,
        },
        when: pickWhenFromSpan("#message .addresses span.popup_date"),
      },
    });

    // Special-case missing notes - not ideal
    if (
      !note.title &&
      !note.user_name &&
      !note.user_url &&
      !note.body_text &&
      !note.body_html
    ) {
      throw new FurAffinityError("Note not found.", 404, SITE_ROOT + path, "");
    }

    return note;
  }

  async moveNote(ids: FAID | FAID[], moveTo: NoteMoveAction) {
    await this.fetch(`/msg/pms/`, {
      method: "POST",
      body: {
        manage_notes: 1,
        move_to: moveTo,
        "items[]": ids,
      },
      "content-type": "application/x-www-form-urlencoded",
    });
  }

  async *getSubmissionStats(username: string) {
    let pageNum = 1;
    while (true) {
      const page = await this.getSubmissionStatsPage(username, pageNum);

      if (page.statistics.length > 0) {
        yield page;
      } else {
        return;
      }

      pageNum++;
    }
  }

  getSubmissionStatsPage(username: string, page: number = 1) {
    const pickText = (val: string, elem: cheerio.Cheerio) => {
      const pluckedVal = elem
        .contents()
        .filter((i, e) => e.type === "text")
        .text()
        .trim();
      return parseInt(pluckedVal || "0", 10);
    };
    const textToInt = (val: string) => {
      return parseInt(val.trim() || "0", 10);
    };

    return this.fetchAndScrape<SubmissionStatistics>(
      `/stats/${username}/submissions/${page}/`,
      {
        classic: {
          statistics: {
            listItem: "table.maintable table.submissions>tbody>tr",
            data: {
              id: {
                selector: `td.info ${SELECTOR_VIEW}`,
                attr: "href",
                convert: getViewPath,
              },
              submission_title: `dt > ${SELECTOR_VIEW}`,
              submission_url: pickLink(`dt > ${SELECTOR_VIEW}`),
              thumb_url: pickImage(SELECTOR_THUMB),
              when: pickWhenFromSpan("td.info span.popup_date"),
              views: {
                selector: `td.info dd:nth-child(2)`,
                convert: pickText as any,
              },
              favorites: {
                selector: "td.info dd:nth-child(3) > a",
                convert: textToInt,
              },
              comments: {
                selector: `td.info dd:nth-child(4)`,
                convert: pickText as any,
              },
              keywords: {
                listItem: `td.info dd:nth-child(5) div.keywords > a`,
                data: {
                  value: "",
                },
                convert: (c: { value: string }) => c.value,
              },
            },
          },
        },
        beta: {
          statistics: {
            listItem: "#standardpage div.stats-page",
            data: {
              id: {
                selector: `.stats-page-submission-image ${SELECTOR_VIEW}`,
                attr: "href",
                convert: getViewPath,
              },
              submission_title: `.stats-page-submission-details > ${SELECTOR_VIEW} > h3`,
              submission_url: pickLink(SELECTOR_VIEW),
              thumb_url: pickImage(SELECTOR_THUMB),
              when: pickWhenFromSpan(
                ".stats-page-submission-details span.popup_date"
              ),
              views: {
                selector: `.submission-stats-container > .views > span:nth-child(1)`,
                convert: textToInt,
              },
              favorites: {
                selector: `.submission-stats-container > .favorites > a > span`,
                convert: textToInt,
              },
              comments: {
                selector: `.submission-stats-container > .comments > span:nth-child(1)`,
                convert: textToInt,
              },
              keywords: {
                listItem: `.stats-page-submission-details span.tags > a`,
                data: {
                  value: "",
                },
                convert: (c: { value: string }) => c.value,
              },
            },
          },
        },
      }
    );
  }

  getCommentText(id: FAID, origin: "submission" | "journal") {
    return this.fetchAndScrape<CommentText>(`/replyto/${origin}/${id}`, {
      classic: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        body_text:
          "#pageid-reply-to form[name='myform'] table.maintable > tbody > tr:nth-child(2) > td",
        body_html: {
          selector:
            "#pageid-reply-to form[name='myform'] table.maintable > tbody > tr:nth-child(2) > td",
          how: "html",
        },
      },
      beta: {
        id: pickStaticValue(ensureIdIsNumber(id)),
        body_text:
          "#site-content > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
        body_html: {
          selector:
            "#site-content > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
          how: "html",
        },
      },
    });
  }

  protected getCommentsObj(
    selector: string,
    mode: "classic" | "beta"
  ): TypedScrapeOptionList<Comment> {
    const structure: {
      classic: TypedScrapeOptionList<Comment>;
      beta: TypedScrapeOptionList<Comment>;
    } = {
      classic: {
        listItem: `${selector} table.container-comment`,
        data: {
          id: {
            attr: "id",
            convert: (s: string) => parseInt(s.split(":")[1]),
          },
          self_link: pickLink("a.comment-link"),
          user_name:
            "tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > b",
          user_url: pickLink(
            "tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > ul > li:nth-child(1) > a"
          ),
          user_thumb_url: pickImage("img.avatar"),
          body_text: "div.message-text",
          body_html: {
            selector: "div.message-text",
            how: "html",
          },
          timestamp: {
            attr: "data-timestamp",
            convert: (s: string) => new Date(parseInt(s) * 1000),
          },
          when: pickWhenFromSpan(
            "tbody > tr:nth-child(2) > th:nth-child(2) > h4 > span"
          ),
        },
      },
      beta: {
        listItem: `${selector} div.comment_container`,
        data: {
          id: {
            selector: "a.comment_anchor",
            attr: "id",
            convert: (s: string) => parseInt(s.split(":")[1]),
          },
          self_link: pickLink("a.comment-link"),
          user_name: `comment-username .comment_username`,
          user_url: pickLink(`.avatar > ${SELECTOR_USER}`),
          user_thumb_url: pickImage(
            `.avatar > ${SELECTOR_USER} > img.comment_useravatar`
          ),
          body_text: "comment-user-text > div",
          body_html: {
            selector: "comment-user-text > div",
            how: "html",
          },
          timestamp: {
            attr: "data-timestamp",
            convert: (s: string) => new Date(parseInt(s) * 1000),
          },
          when: pickWhenFromSpan("comment-date > span.popup_date"),
        },
      },
    };

    return structure[mode];
  }

  async *search(
    query: string,
    params?: Partial<SearchQueryParams>
  ): AsyncGenerator<SubmissionListing[], unknown, unknown> {
    let pageNum = 0;
    while (true) {
      pageNum++;
      const page = await this.getSearchPage(query, params, pageNum);

      if (page.more) {
        yield page.submissions;
      } else if (page.submissions.length > 0) {
        return yield page.submissions;
      } else {
        return;
      }
    }
  }

  async getSearchPage(
    query: string,
    params?: Partial<SearchQueryParams>,
    page: number = 1
  ) {
    return this.fetchAndScrape<SearchPage>(`/search/`, {
      classic: {
        submissions: {
          listItem: "#gallery-search-results figure.t-image",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            title: `figcaption ${SELECTOR_VIEW}`,
            artist_name: `figcaption ${SELECTOR_USER}`,
            thumb_url: pickImage(SELECTOR_THUMB),
            when: pickDateFromThumbnail(SELECTOR_THUMB),
          },
        },
        more: {
          selector:
            "fieldset#search-results button[type='submit'][name='next_page']",
          convert: (a) => !!a,
        },
      },
      beta: {
        submissions: {
          listItem: "#gallery-search-results figure.t-image",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            title: `figcaption ${SELECTOR_VIEW}`,
            artist_name: `figcaption ${SELECTOR_USER}`,
            thumb_url: pickImage(SELECTOR_THUMB),
            when: pickDateFromThumbnail(SELECTOR_THUMB),
          },
        },
        more: {
          selector:
            "div#search-results button[type='submit'][name='next_page']",
          convert: (a) => !!a,
        },
      },
      configuration: {
        method: "POST",
        body: this.generateSearchBody(query, params, page),
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }

  protected generateSearchBody(
    query: string,
    params?: Partial<SearchQueryParams>,
    page: number = 1
  ): SearchQueryBody {
    // Populate defaults
    const body: SearchQueryBody = {
      q: query,
      page: page,
      perpage: params?.perpage || 72,
      "order-by": params?.order_by || "relevancy",
      "order-direction": params?.order_dir || "desc",
      do_search: "Search",
      range: params?.range || "5years",
      mode: params?.mode || "extended",
    };

    if (params?.ratings) {
      if (params.ratings.general) body["rating-general"] = "on";
      if (params.ratings.mature) body["rating-mature"] = "on";
      if (params.ratings.adult) body["rating-adult"] = "on";
    } else {
      // Default is general
      body["rating-general"] = "on";
    }

    if (params?.types) {
      if (params.types.art) body["type-art"] = "on";
      if (params.types.flash) body["type-flash"] = "on";
      if (params.types.photo) body["type-photo"] = "on";
      if (params.types.music) body["type-music"] = "on";
      if (params.types.story) body["type-story"] = "on";
      if (params.types.poetry) body["type-poetry"] = "on";
    } else {
      // Default are everything
      body["type-art"] = "on";
      body["type-flash"] = "on";
      body["type-photo"] = "on";
      body["type-music"] = "on";
      body["type-story"] = "on";
      body["type-poetry"] = "on";
    }

    return body;
  }

  protected async *scrapeSubmissionPages(
    url: string
  ): AsyncGenerator<SubmissionListing[], unknown, unknown> {
    while (true) {
      const page = await this.scrapeSubmissionsPage(url);

      if (page.nextPage) {
        yield page.submissions;
        url = page.nextPage;
      } else if (page.submissions.length > 0) {
        return yield page.submissions;
      } else {
        return;
      }
    }
  }

  protected scrapeSubmissionsPage(path: string) {
    return this.fetchAndScrape<SubmissionPage>(path, {
      classic: {
        self_link: pickStaticValue(path),
        submissions: {
          listItem: "figure.t-image",
          data: {
            id: pickCheckboxValue(),
            self_link: pickLink("b > u > a"),
            title: "figcaption > label > p:nth-child(2) > a",
            artist_name: "figcaption > label > p:nth-child(3) > a",
            thumb_url: pickImage("b > u > a > img"),
            when: pickDateFromThumbnail("b > u > a > img"),
          },
        },
        nextPage: {
          selector: "#messages-form .navigation a[class*='more']:not(.prev)",
          attr: "href",
        },
        previousPage: {
          selector: "#messages-form .navigation a[class*='more'].prev",
          attr: "href",
        },
      },
      beta: {
        self_link: pickStaticValue(path),
        submissions: {
          listItem: "#messagecenter-submissions figure.t-image",
          data: {
            id: pickCheckboxValue(),
            self_link: pickLink(SELECTOR_VIEW),
            title: `figcaption label p ${SELECTOR_VIEW}`,
            artist_name: `figcaption label p ${SELECTOR_USER}`,
            thumb_url: pickImage(`${SELECTOR_VIEW} > img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} > img`),
          },
        },
        nextPage: {
          selector:
            "#messagecenter-new-submissions div > a[class*='more']:not(.prev)",
          attr: "href",
        },
        previousPage: {
          selector:
            "#messagecenter-new-submissions div > a[class*='more'].prev",
          attr: "href",
        },
      },
    });
  }

  protected async *scrapeUserGalleryPages(
    url: string,
    pageType: "gallery" | "scraps" | "favorites"
  ): AsyncGenerator<SubmissionListing[], unknown, unknown> {
    while (true) {
      const page = await this.scrapeUserGalleryPage(url, pageType);

      if (page.nextPage) {
        yield page.submissions;
        url = page.nextPage;
      } else if (page.submissions.length > 0) {
        return yield page.submissions;
      } else {
        return;
      }
    }
  }

  protected scrapeUserGalleryPage(
    path: string,
    pageType: "gallery" | "scraps" | "favorites"
  ) {
    return this.fetchAndScrape<SubmissionPage>(path, {
      classic: {
        self_link: pickStaticValue(path),
        submissions: {
          listItem: "section.gallery figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink("b > u > a"),
            title: pick("figcaption > p:nth-child(1) > a", "title"),
            artist_name: pick("figcaption > p:nth-child(2) > a", "title"),
            thumb_url: pickImage("b > u > a > img"),
            when: pickDateFromThumbnail("b > u > a > img"),
          },
        },
        nextPage: pickLink("a.button-link.right"),
        previousPage: pickLink("a.button-link.left"),
      },
      beta: {
        self_link: pickStaticValue(path),
        submissions: {
          listItem: "section.gallery figure[id*='sid-']",
          data: {
            id: pickFigureId(),
            self_link: pickLink(SELECTOR_VIEW),
            title: `figcaption p:nth-child(1) ${SELECTOR_VIEW}`,
            artist_name: `figcaption p:nth-child(2) ${SELECTOR_USER}`,
            thumb_url: pickImage(`${SELECTOR_VIEW} > img`),
            when: pickDateFromThumbnail(`${SELECTOR_VIEW} > img`),
          },
        },
        nextPage:
          pageType === "gallery"
            ? pickFormValue("form:has(>button:contains('Next'))")
            : pickLink(".pagination a.button.right"),
        previousPage:
          pageType === "gallery"
            ? pickFormValue("form:has(>button:contains('Prev'))")
            : pickLink(".pagination a.button.left"),
      },
    });
  }

  private determineSiteVersion(doc: cheerio.Root): string {
    const scraped = scrape.scrapeHTML<{ path: string }>(doc, {
      path: {
        selector: "body",
        attr: "data-static-path",
      },
    });

    if (scraped && scraped.path === "/themes/beta") {
      return "beta";
    }

    return "classic";
  }

  private async fetch(
    path: string,
    config?: FetchConfig,
    attempt = 1
  ): Promise<string> {
    const url = `${SITE_ROOT}${path}`;
    const res = await this.httpClient.fetch(url, {
      ...config,
      cookies: this.cookies,
    });

    const status = checkErrors(res);
    if (status !== 200) {
      // For server errors, attempt retry w/ exponential backoff
      if (!this.disableRetry && status >= 500 && attempt <= 6) {
        // 2^6=64 so 60sec
        await delay(Math.pow(2, attempt) * 1000);
        return await this.fetch(url, config, attempt + 1);
      }

      let body = res.body;
      try {
        body = cheerio.load(body)("body").text();
      } catch (err) {
        // nop
      }
      throw new FurAffinityError(
        "Got error from FurAffinity",
        status,
        url,
        body
      );
    }

    return res.body;
  }

  private scrape<T>(body: string, options: DualScrapeOptions<T>): T {
    const doc = cheerio.load(body);

    const siteVersion = this.determineSiteVersion(doc);
    FurAffinityClient.LAST_SEEN_SITE_VERSION = siteVersion;

    let useOptions = options.classic;
    if (siteVersion === "beta") {
      useOptions = options.beta;
    }

    const scraped = scrape.scrapeHTML<T>(doc, useOptions);
    return scraped;
  }

  private async fetchAndScrape<T>(
    path: string,
    options: DualScrapeOptions<T>
  ): Promise<T> {
    const body = await this.fetch(path, options.configuration);
    return this.scrape<T>(body, options);
  }
}
