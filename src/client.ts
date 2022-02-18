import * as cheerio from "cheerio";
import * as datefns from "date-fns";
import * as scrape from "scrape-it";
import { FurAffinityError } from "./errors";
import { CloudscraperHttpClient } from "./httpclients";
import type { ClientConfig, Comment, DualScrapeOptions, FAID, HttpClient, Journal, Messages, Navigation, Note, Notes, StandardHttpResponse, Submission, SubmissionPage, TypedScrapeOptionList, Journals, UserPage, CommentText, SearchPage, SearchQueryParams, SearchQueryBody, NoteMoveAction, FetchConfig } from "./types";

// TODO: Rate limiting and backoff error handling
// TODO: Handle removed submissions/journals/etc

const thumbnailRegex = /^\/\/t\.facdn\.net\/(\d+)@(\d+)-(\d+)/;
const parensMatchRegex = /\((\S*?)\)/;
const parensNumberMatchRegex = /\((\d+).*\)/;
const colonPostMatchRegex = /: (.*?)$/;
const colonPreMatchRegex = /^(.*?):$/;
const dateFormats = [
    "MMM do, yyyy hh:mm aa", // Sep 27th, 2021 06:16 AM (standard)
    "MMM do, yyyy, hh:mm aa", // Sep 27th, 2021, 06:16 AM (beta note)
    "MMM do, yyyy hh:mmaa", // Sep 27, 2021 06:16AM (beta note list)
];

export class FurAffinityClient {
    public static SITE_ROOT = "https://www.furaffinity.net";
    public static LAST_SEEN_SITE_VERSION: string;

    /** Determine the navigation directions from a submission. */
    public static getNavigationFromSubmission(submission: Submission): Navigation;
    public static getNavigationFromSubmission(id: FAID, items: number[]): Navigation;
    public static getNavigationFromSubmission(id: FAID | Submission, items?: number[]): Navigation {
        if (typeof id === "object") {
            items = id.nav_items;
            id = id.id;
        }

        if (!items || items.length < 1) {
            return {};
        }

        const allIds = items.sort();

        let prevId = -1;
        let nextId = -1;
        for (const curId of allIds) {
            if (curId > id) {
                nextId = curId;
                break;
            } else {
                prevId = curId;
            }
        }

        const navigation: Navigation = {};

        if (prevId > -1) {
            navigation.previous = prevId;
        }
        if (nextId > -1) {
            navigation.next = nextId;
        }

        return navigation;
    }

    private static readDateWhenField(field: string): Date {
        if (!field) {
            return null;
        }

        // Strip out field prefix
        if (field.startsWith("on ")) {
            field = field.substr(3);
        }

        // Try all known date formats
        for (const format of dateFormats) {
            const parsedDate = datefns.parse(field, format, new Date());
            if (datefns.isValid(parsedDate)) {
                return parsedDate;
            }
        }

        return null;
    }

    private static checkErrors(res: StandardHttpResponse): number {
        if (res.statusCode !== 200) {
            return res.statusCode;
        }

        if (res.body.indexOf("This user has voluntarily disabled access to their userpage.") > -1) {
            return 403;
        }

        if (res.body.indexOf("The submission you are trying to find is not in our database.") > -1) {
            return 404;
        }

        if (res.body.indexOf("The journal you are trying to find is not in our database.") > -1) {
            return 404;
        }

        if (res.body.indexOf("This user cannot be found.") > -1) {
            return 404;
        }

        if (res.body.indexOf("was not found in our database") > -1) {
            return 404;
        }

        if (res.body.indexOf("For more information please check the") > -1) {
            return 500;
        }

        if (res.body.indexOf("The server is currently having difficulty responding to all requests.") > -1) {
            return 503;
        }

        return 200;
    }

    private static SELECTOR_USER = "a[href*=\"/user/\"]";
    private static SELECTOR_VIEW = "a[href*=\"/view/\"]";
    private static SELECTOR_JOURNAL = "a[href*=\"/journal/\"]";
    private static SELECTOR_THUMB = "img[src*=\"//t.furaffinity.net/\"]";

    private static delay(ms: number) {
        return new Promise((r) => {
            setTimeout(r, ms);
        });
    }

    private static fixFaUrl(str: string) {
        if (!str) {
            return str;
        }

        if (str.startsWith("//")) {
            return `https:${str}`;
        } else {
            return str;
        }
    }

    private static getViewPath(str: string) {
        const rr = /\/view\/(\d+)/;
        const matches = rr.exec(str);
        if (!matches || matches.length < 2) {
            return null;
        }
        return parseInt(matches[1]);
    }

    private static getJournalPath(str: string) {
        const rr = /\/journal\/(\d+)/;
        const matches = rr.exec(str);
        if (!matches || matches.length < 2) {
            return null;
        }
        return parseInt(matches[1]);
    }

    private static pick(selector: string, attr: string) {
        return {
            selector,
            attr,
            "convert": FurAffinityClient.fixFaUrl
        };
    }

    private static pickLink(selector: string = "a") {
        return FurAffinityClient.pick(selector, "href");
    }

    private static pickImage(selector: string = "img", attr = "src") {
        return FurAffinityClient.pick(selector, attr);
    }

    private static pickFormValue(selector: string = "form") {
        return FurAffinityClient.pick(selector, "action");
    }

    private static pickCheckboxValue(selector: string = "input[type='checkbox']") {
        return {
            selector,
            "attr": "value",
            "convert": parseInt
        };
    }

    private static pickFigureId() {
        return {
            "attr": "id",
            "convert": (sid: string) => {
                return parseInt(sid.split("-")[1]);
            }
        };
    }

    private static pickDateFromThumbnail(selector: string = "img", attr: string = "src") {
        return {
            selector,
            attr,
            "convert": (source: string) => {
                const res = thumbnailRegex.exec(source);
                if (!res || res.length < 4) {
                    return undefined;
                }

                const timestamp = parseInt(res[3], 10);
                return new Date(timestamp * 1000);
            }
        };
    }

    private static pickWhenFromSpan(selector: string) {
        return {
            selector,
            "how": (source: cheerio.Selector) => {
                // scrape-it has bad typings
                const ss = source as unknown as cheerio.Cheerio;
                const text = ss.text();
                const title = ss.attr("title");

                if (text) {
                    const textVal = FurAffinityClient.readDateWhenField(text);
                    if (textVal) {
                        return textVal;
                    }
                }

                if (title) {
                    const titleVal = FurAffinityClient.readDateWhenField(ss.attr("title"));
                    if (titleVal) {
                        return titleVal;
                    }
                }

                return null;
            },
        };
    }

    private static pickWithRegex(regex: RegExp, selector?: string, attr?: string, position: number = 1, asNumber?: boolean) {
        return {
            selector,
            attr,
            "convert": (text: string) => {
                const res = regex.exec(text);
                if (!res || res.length < position + 1) {
                    return undefined;
                }

                const val = res[position];
                if (asNumber) {
                    return parseInt(val);
                }

                return val;
            }
        };
    }

    private static pickStaticValue<T>(value: T) {
        return {
            "selector": ":root",
            "how": () => value,
        };
    }

    private static ensureIdIsNumber(id: FAID): number {
        if (typeof id === "number") {
            return id;
        }

        return parseInt(id, 10);
    }

    private cookies?: string;
    private throwErrors?: boolean;
    private disableRetry?: boolean;
    private httpClient: HttpClient;

    constructor(config?: string | ClientConfig) {
        if (typeof config === "string") {
            this.cookies = config;
            this.throwErrors = false;
            this.disableRetry = false;
        } else if (typeof config === "object") {
            this.cookies = config.cookies ?? undefined;
            this.throwErrors = config.throwErrors ?? false;
            this.disableRetry = config.disableRetry ?? false;
            this.httpClient = config.httpClient;
        }

        if (!this.httpClient) {
            this.httpClient = new CloudscraperHttpClient();
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
        return this.scrapeUserGalleryPage(`/gallery/${username}/${page}/`, "gallery");
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
        return this.scrapeUserGalleryPage(`/favorites/${username}/${page}/`, "favorites");
    }

    async getUserPage(username: string) {
        const path = `/user/${username}/`;
        const body = await this.fetch(path, undefined);

        const base = this.scrape<Omit<UserPage, 'featured_submission' | 'top_journal' | 'profile_id'>>(body, {
            "classic": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "user_name": {
                    "selector": "#page-userpage table.maintable > tbody tr td.lead b",
                    "convert": (text: string) => {
                        if (text?.startsWith("~")) {
                            return text.substr(1);
                        }
                        return text;
                    }
                },
                "user_class": FurAffinityClient.pickWithRegex(parensMatchRegex, "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(2) > td.lead"),
                "user_thumb_url": FurAffinityClient.pickImage(`#page-userpage ${FurAffinityClient.SELECTOR_USER} > img.avatar`),
                "header_text": "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(1)",
                "header_html": {
                    "selector": "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(1)",
                    "how": "html"
                },
                "statistics_text": "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td",
                "statistics_html": {
                    "selector": "#page-userpage > tbody > tr:nth-child(1) > td > table > tbody > tr > td > table > tbody > tr > td > table > tbody > tr:nth-child(3) > td.alt1 > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(2) > td",
                    "how": "html"
                },
                "latest_submissions": {
                    "listItem": "#gallery-latest-submissions figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} img`)
                    }
                },
                "favorites": {
                    "listItem": "#gallery-latest-favorites figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} img`)
                    }
                },
                "artist_information": {
                    "listItem": "table > tbody > tr > td.user-info div.user-info-item",
                    "data": {
                        "title": "strong",
                        "value": FurAffinityClient.pickWithRegex(colonPostMatchRegex)
                    }
                },
                "contact_information": {
                    "listItem": "table > tbody > tr > td.user-contacts .classic-contact-info-item",
                    "data": {
                        "service": FurAffinityClient.pickWithRegex(colonPreMatchRegex, ".contact-service-name > strong"),
                        "link": FurAffinityClient.pickLink(),
                        "value": {
                            "convert": (val: string, elem: any) => {
                                if (elem.children()[1]) {
                                    return elem.children().eq(1).text();
                                }

                                return elem.children()[0].next.data.trim();
                            }
                        }
                    }
                },
                "shouts": {
                    "listItem": "table[id*='shout-']",
                    "data": {
                        "id": {
                            "attr": "id",
                            "convert": (value: string) => {
                                return parseInt(value.split("-")[1]);
                            }
                        },
                        "user_name": `.from-header > ${FurAffinityClient.SELECTOR_USER}`,
                        "user_url": FurAffinityClient.pickLink(`.from-header > ${FurAffinityClient.SELECTOR_USER}`),
                        "user_thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_USER} > img.avatar`),
                        "body_text": "div.no_overflow",
                        "body_html": {
                            "selector": "div.no_overflow",
                            "how": "html"
                        },
                        "when": FurAffinityClient.pickWhenFromSpan("td > span.popup_date"),
                    }
                }
            },
            "beta": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "user_name": {
                    "selector": "#user-profile .user-profile-main .username h2 span",
                    "convert": (text: string) => {
                        if (text?.trim()?.startsWith("~")) {
                            return text.trim().substr(1);
                        }
                        return text;
                    }
                },
                "user_class": FurAffinityClient.pickWithRegex(colonPostMatchRegex, "#user-profile .user-profile-main .username h2 span", "title"),
                "user_thumb_url": FurAffinityClient.pickImage("#user-profile img.user-nav-avatar"),
                "header_text": "#page-userpage .userpage-layout-profile-container div.userpage-profile",
                "header_html": {
                    "selector": "#page-userpage .userpage-layout-profile-container div.userpage-profile",
                    "how": "html"
                },
                "statistics_text": "section.userpage-right-column:nth-child(1) div.section-body div.table",
                "statistics_html": {
                    "selector": "section.userpage-right-column:nth-child(1) div.section-body div.table",
                    "how": "html"
                },
                "latest_submissions": {
                    "listItem": "#gallery-latest-submissions figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} > img`)
                    }
                },
                "favorites": {
                    "listItem": "#gallery-latest-favorites figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} > img`)
                    }
                },
                "artist_information": {
                    "listItem": "#userpage-contact-item div.table-row",
                    "data": {
                        "title": "strong",
                        "value": {
                            "convert": (val: string, elem: any) => {
                                if (elem.children()[2]) {
                                    // URL
                                    return elem.children().eq(2).text();
                                }

                                if (elem.children()[1]) {
                                    // Text
                                    return elem.children()[1].next.data.trim();
                                }

                                return elem.children()[0].next.data.trim();
                            }
                        }
                    }
                },
                "contact_information": {
                    "listItem": "#userpage-contact div.user-contact-item div.user-contact-user-info",
                    "data": {
                        "service": "strong",
                        "link": FurAffinityClient.pickLink(),
                        "value": {
                            "convert": (val: string, elem: any) => {
                                if (elem.children()[2]) {
                                    // URL
                                    return elem.children().eq(2).text();
                                }

                                if (elem.children()[1]) {
                                    // Text
                                    return elem.children()[1].next.data.trim();
                                }

                                return elem.children()[0].next.data.trim();
                            }
                        }
                    }
                },
                "shouts": {
                    "listItem": `#page-userpage section.userpage-right-column:nth-child(4) .comment_container`,
                    "data": {
                        "id": {
                            "selector": "a[id*='shout-'].comment_anchor",
                            "attr": "id",
                            "convert": (value: string) => {
                                return parseInt(value.split("-")[1]);
                            }
                        },
                        "user_name": `.comment_username ${FurAffinityClient.SELECTOR_USER} h3`,
                        "user_url": FurAffinityClient.pickLink(`.comment_username ${FurAffinityClient.SELECTOR_USER}`),
                        "user_thumb_url": FurAffinityClient.pickImage(`img.comment_useravatar`),
                        "body_text": ".shout-base .comment_text",
                        "body_html": {
                            "selector": ".shout-base .comment_text",
                            "how": "html"
                        },
                        "when": FurAffinityClient.pickWhenFromSpan(".shout-date > span.popup_date"),
                    }
                }
            }
        });

        const featuredSubmissionCellBeta = "section.userpage-left-column:nth-child(1) div.section-body";
        const featuredSubmission = this.scrape<UserPage["featured_submission"]>(body, {
            "classic": {
                "id": {
                    "selector": "#featured-submission b",
                    "attr": "id",
                    "convert": (s: string) => parseInt(s.split("_")[1])
                },
                "self_link": FurAffinityClient.pickLink(`#featured-submission ${FurAffinityClient.SELECTOR_VIEW}`),
                "title": "#featured-submission b > span",
                "thumb_url": FurAffinityClient.pickImage(`#featured-submission ${FurAffinityClient.SELECTOR_VIEW} > img`),
            },
            "beta": {
                "id": {
                    "selector": `${featuredSubmissionCellBeta} ${FurAffinityClient.SELECTOR_VIEW}`,
                    "attr": "href",
                    "convert": FurAffinityClient.getViewPath
                },
                "self_link": FurAffinityClient.pickLink(`${featuredSubmissionCellBeta} ${FurAffinityClient.SELECTOR_VIEW}`),
                "title": `${featuredSubmissionCellBeta} div.userpage-featured-title ${FurAffinityClient.SELECTOR_VIEW}`,
                "thumb_url": FurAffinityClient.pickImage(`${featuredSubmissionCellBeta} ${FurAffinityClient.SELECTOR_VIEW} > img`)
            }
        });

        const topJournalCellClassic = "#page-userpage > tbody > tr:nth-child(2) > td:nth-child(2) > table:nth-child(1)";
        const topJournalCellBeta = "section.userpage-right-column:nth-child(2)";
        const topJournal = this.scrape<UserPage["top_journal"]>(body, {
            "classic": {
                "id": {
                    "selector": `${topJournalCellClassic} b > ${FurAffinityClient.SELECTOR_JOURNAL}`,
                    "attr": "href",
                    "convert": FurAffinityClient.getJournalPath
                },
                "self_link": FurAffinityClient.pickLink(`${topJournalCellClassic} b > ${FurAffinityClient.SELECTOR_JOURNAL}`),
                "title": `${topJournalCellClassic} b > ${FurAffinityClient.SELECTOR_JOURNAL}`,
                "body_text": `${topJournalCellClassic} .journal-body`,
                "body_html": {
                    "selector": `${topJournalCellClassic} .journal-body`,
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan(`${topJournalCellClassic} td > span.popup_date`),
                "comment_count": FurAffinityClient.pickWithRegex(parensMatchRegex, `${topJournalCellClassic} ${FurAffinityClient.SELECTOR_JOURNAL}:contains("Comments")`, undefined, undefined, true)
            },
            "beta": {
                "id": {
                    "selector": `${topJournalCellBeta} ${FurAffinityClient.SELECTOR_JOURNAL}`,
                    "attr": "href",
                    "convert": FurAffinityClient.getJournalPath
                },
                "self_link": FurAffinityClient.pickLink(`${topJournalCellBeta} ${FurAffinityClient.SELECTOR_JOURNAL}`),
                "title": `${topJournalCellBeta} .section-body > h2`,
                "body_text": `${topJournalCellBeta} .section-body > div.user-submitted-links`,
                "body_html": {
                    "selector": `${topJournalCellBeta} .section-body > div.user-submitted-links`,
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan(`${topJournalCellBeta} .section-body span.popup_date`),
                "comment_count": FurAffinityClient.pickWithRegex(parensNumberMatchRegex, `${topJournalCellBeta} ${FurAffinityClient.SELECTOR_JOURNAL} span`, undefined, undefined, true)
            }
        });

        const profileIdCellBeta = `section.userpage-right-column:nth-child(3) .section-submission`;
        const profileId = this.scrape<UserPage["profile_id"]>(body, {
            "classic": {
                "id": {
                    "selector": `#profilepic-submission ${FurAffinityClient.SELECTOR_VIEW}`,
                    "attr": "href",
                    "convert": FurAffinityClient.getViewPath
                },
                "self_link": FurAffinityClient.pickLink(`#profilepic-submission ${FurAffinityClient.SELECTOR_VIEW}`),
                "thumb_url": FurAffinityClient.pickImage(`#profilepic-submission ${FurAffinityClient.SELECTOR_VIEW} > img`),
                "when": FurAffinityClient.pickDateFromThumbnail(`#profilepic-submission ${FurAffinityClient.SELECTOR_VIEW} > img`)
            },
            "beta": {
                "id": {
                    "selector": `${profileIdCellBeta} ${FurAffinityClient.SELECTOR_VIEW}`,
                    "attr": "href",
                    "convert": FurAffinityClient.getViewPath
                },
                "self_link": FurAffinityClient.pickLink(`${profileIdCellBeta} ${FurAffinityClient.SELECTOR_VIEW}`),
                "thumb_url": FurAffinityClient.pickImage(`${profileIdCellBeta} ${FurAffinityClient.SELECTOR_VIEW} > img`),
                "when": FurAffinityClient.pickDateFromThumbnail(`${profileIdCellBeta} ${FurAffinityClient.SELECTOR_VIEW} > img`)
            }
        });

        return {
            ...base,
            "featured_submission": featuredSubmission,
            "top_journal": topJournal,
            "profile_id": profileId
        } as UserPage;
    }

    getUserJournals(username: string) {
        const path = `/journals/${username}/`;
        return this.fetchAndScrape<Journals>(path, {
            "classic": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "user_name": FurAffinityClient.pickStaticValue(username),
                "journals": {
                    "listItem": "table.page-journals-list table.maintable[id*='jid:']",
                    "data": {
                        "id": {
                            "attr": "id",
                            "convert": (s: string) => parseInt(s.split(":")[1])
                        },
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "title": `tbody > tr > td > div.no_overflow ${FurAffinityClient.SELECTOR_JOURNAL}`,
                        "body_text": "tbody > tr > td > div.no_overflow.alt1",
                        "body_html": {
                            "selector": "tbody > tr > td > div.no_overflow.alt1",
                            "how": "html"
                        },
                        "when": FurAffinityClient.pickWhenFromSpan("td > span.popup_date"),
                        "comment_count": FurAffinityClient.pickWithRegex(parensMatchRegex, `${FurAffinityClient.SELECTOR_JOURNAL}:contains("Comments")`, undefined, undefined, true),
                    }
                }
            },
            "beta": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "user_name": FurAffinityClient.pickStaticValue(username),
                "journals": {
                    "listItem": "#columnpage .content section[id*='jid:']",
                    "data": {
                        "id": {
                            "attr": "id",
                            "convert": (s: string) => parseInt(s.split(":")[1])
                        },
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "title": ".section-header h2",
                        "body_text": ".section-body div.journal-body",
                        "body_html": {
                            "selector": ".section-body div.journal-body",
                            "how": "html"
                        },
                        "when": FurAffinityClient.pickWhenFromSpan(".section-header span.popup_date"),
                        "comment_count": {
                            "selector": `${FurAffinityClient.SELECTOR_JOURNAL} > span.font-large`,
                            "convert": FurAffinityClient.ensureIdIsNumber
                        }
                    }
                }
            }
        });
    }

    async getSubmission(id: FAID) {
        function getSubmissionType(element: any) {
            if (element.attr("src")) {
                const src = element.attr("src");
                if (src.includes("/stories/") || src.includes("poetry")) {
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
            "classic": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "type": {
                    "selector": "#submissionImg",
                    "convert": ((v: any, element: any) => {
                        return getSubmissionType(element);
                    }) as any
                },
                "title": "#page-submission div.classic-submission-title.information > h2",
                "thumb_url": FurAffinityClient.pickImage("#submissionImg", "data-preview-src"),
                "content_url": {
                    "selector": "#page-submission",
                    "convert": ((v: any, element: any) => {
                        let result: string;
                        const typeFinderRoot = element.find("#submissionImg");
                        const type = getSubmissionType(typeFinderRoot);
                        if (type === "image") {
                            result = typeFinderRoot.attr("data-fullview-src");
                        } else if (type === "story") {
                            const slink = element.find("#text-container a[href*='/stories/']");
                            result = slink.attr("href");
                        } else if (type === "music") {
                            const slink = element.find(".audio-player-container audio.audio-player");
                            result = slink.attr("src");
                        } else if (type === "flash") {
                            const slink = element.find("object");
                            result = slink.attr("data");
                        }

                        if (result) {
                            return FurAffinityClient.fixFaUrl(result);
                        }
                        return undefined;
                    }) as any
                },
                "artist_name": `#page-submission div.classic-submission-title.information > ${FurAffinityClient.SELECTOR_USER}`,
                "artist_url": FurAffinityClient.pickLink(`#page-submission div.classic-submission-title.information > ${FurAffinityClient.SELECTOR_USER}`),
                "artist_thumb_url": FurAffinityClient.pickImage(`#page-submission div.classic-submissiont-title.avatar ${FurAffinityClient.SELECTOR_USER} > img`),
                "body_text": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan("#page-submission td.stats-container span.popup_date"),
                "keywords": {
                    "listItem": "#page-submission #keywords > a",
                    "data": {
                        "value": ""
                    },
                    "convert": (c: { value: string }) => c.value,
                },
                "nav_items": {
                    "listItem": `#page-submission div.minigallery-container ${FurAffinityClient.SELECTOR_VIEW}`,
                    "data": {
                        "value": {
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        }
                    },
                    "convert": (c: { value: number }) => c.value
                },
                "comments": this.getCommentsObj("#comments-submission", "classic")
            },
            "beta": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "type": {
                    "selector": "#submissionImg",
                    "convert": ((v: any, element: any) => {
                        return getSubmissionType(element);
                    }) as any
                },
                "title": "#submission_page div.submission-title p",
                "thumb_url": FurAffinityClient.pickImage("#submissionImg", "data-preview-src"),
                "content_url": {
                    "selector": "#submission_page",
                    "convert": ((v: any, element: any) => {
                        let result: string;
                        const typeFinderRoot = element.find("#submissionImg");
                        const type = getSubmissionType(typeFinderRoot);
                        if (type === "image") {
                            result = typeFinderRoot.attr("data-fullview-src");
                        } else if (type === "story") {
                            const slink = element.find("#submission-content a[href*='/stories/']");
                            result = slink.attr("href");
                        } else if (type === "music") {
                            const slink = element.find(".audio-player-container audio.audio-player");
                            result = slink.attr("src");
                        } else if (type === "flash") {
                            const slink = element.find("object");
                            result = slink.attr("data");
                        }

                        if (result) {
                            return FurAffinityClient.fixFaUrl(result);
                        }
                        return undefined;
                    }) as any
                },
                "artist_name": `#submission_page .submission-id-container ${FurAffinityClient.SELECTOR_USER}`,
                "artist_url": FurAffinityClient.pickLink(`#submission_page .submission-id-container ${FurAffinityClient.SELECTOR_USER}`),
                "artist_thumb_url": FurAffinityClient.pickImage(`#submission_page .submission-id-avatar ${FurAffinityClient.SELECTOR_USER} > img`),
                "body_text": "#submission_page div.submission-description",
                "body_html": {
                    "selector": "#submission_page div.submission-description",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan("#submission_page .submission-id-container span.popup_date"),
                "keywords": {
                    "listItem": "#submission_page div.submission-sidebar section.tags-row > span.tags > a",
                    "data": {
                        "value": ""
                    },
                    "convert": (c: { value: string }) => c.value,
                },
                "nav_items": {
                    "listItem": `#submission_page section.minigallery-more div.preview-gallery ${FurAffinityClient.SELECTOR_VIEW}`,
                    "data": {
                        "value": {
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        }
                    },
                    "convert": (c: { value: number }) => c.value
                },
                "comments": this.getCommentsObj("#comments-submission", "beta")
            }
        });
    }

    getMessages() {
        return this.fetchAndScrape<Messages>(`/msg/others/`, {
            "classic": {
                "my_username": {
                    "selector": "a#my-username",
                    "convert": (s: string) => s && s.replace("~", "")
                },
                "watches": {
                    "listItem": "ul#watches > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": "div > span",
                        "user_url": FurAffinityClient.pickLink(),
                        "user_thumb_url": FurAffinityClient.pickImage(),
                        "when": FurAffinityClient.pickWhenFromSpan("div > small > span"),
                    }
                },
                "comments": {
                    "listItem": "ul#comments > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "submission_title": FurAffinityClient.SELECTOR_VIEW,
                        "submission_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span"),
                    }
                },
                "journal_comments": {
                    "listItem": "fieldset#messages-comments-journal > ul.message-stream > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_JOURNAL,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "journal_id": {
                            "selector": FurAffinityClient.SELECTOR_JOURNAL,
                            "attr": "href",
                            "convert": FurAffinityClient.getJournalPath
                        },
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span"),
                    },
                },
                "shouts": {
                    "listItem": "fieldset#messages-shouts > ul.message-stream > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span"),
                    }
                },
                "favorites": {
                    "listItem": "ul#favorites > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "submission_title": FurAffinityClient.SELECTOR_VIEW,
                        "submission_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span"),
                    }
                },
                "journals": {
                    "listItem": "ul#journals > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "journal_title": FurAffinityClient.SELECTOR_JOURNAL,
                        "journal_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span"),
                    }
                }
            },
            "beta": {
                "my_username": `.mobile-navigation article.mobile-menu h2 > ${FurAffinityClient.SELECTOR_USER}`,
                "watches": {
                    "listItem": "#messages-watches ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": "div.info > span:nth-child(1)",
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "user_thumb_url": FurAffinityClient.pickImage("img.avatar"),
                        "when": FurAffinityClient.pickWhenFromSpan("div.info span.popup_date"),
                    }
                },
                "comments": {
                    "listItem": "#messages-comments-submission ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "submission_title": FurAffinityClient.SELECTOR_VIEW,
                        "submission_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span.popup_date"),
                    }
                },
                "journal_comments": {
                    "listItem": "#messages-comments-journal ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_JOURNAL,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "journal_id": {
                            "selector": FurAffinityClient.SELECTOR_JOURNAL,
                            "attr": "href",
                            "convert": FurAffinityClient.getJournalPath
                        },
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span.popup_date"),
                    }
                },
                "shouts": {
                    "listItem": "#messages-shouts ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span.popup_date"),
                    }
                },
                "favorites": {
                    "listItem": "#messages-favorites ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "submission_title": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "convert": (str: string) => {
                                if (str && str.startsWith(`"`) && str.endsWith(`"`)) {
                                    str = str.substr(1, str.length - 2);
                                }
                                return str;
                            }
                        },
                        "submission_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": `${FurAffinityClient.SELECTOR_USER} > strong`,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span.popup_date"),
                    }
                },
                "journals": {
                    "listItem": "#messages-journals ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "journal_title": FurAffinityClient.SELECTOR_JOURNAL,
                        "journal_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "user_name": `${FurAffinityClient.SELECTOR_USER} > strong`,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": FurAffinityClient.pickWhenFromSpan("span.popup_date"),
                    }
                }
            }
        });
    }

    getJournal(id: FAID) {
        const path = `/journal/${id}/`;
        return this.fetchAndScrape<Journal>(path, {
            "classic": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "title": "#page-journal td.journal-title-box > b > font > div",
                "user_name": `#page-journal td.journal-title-box ${FurAffinityClient.SELECTOR_USER}`,
                "user_url": FurAffinityClient.pickLink(`#page-journal td.journal-title-box ${FurAffinityClient.SELECTOR_USER}`),
                "user_thumb_url": FurAffinityClient.pickImage(`#page-journal td.avatar-box ${FurAffinityClient.SELECTOR_USER} > img`),
                "body_text": "div.journal-body",
                "body_html": {
                    "selector": "div.journal-body",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan("#page-journal td.journal-title-box span.popup_date"),
                "comments": this.getCommentsObj("#page-comments", "classic")
            },
            "beta": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "title": ".content .section-header h2.journal-title",
                "user_name": {
                    "selector": "#user-profile .username h2 span",
                    "convert": (s: string) => s && s.trim().replace("~", "")
                },
                "user_url": FurAffinityClient.pickLink(`#user-profile ${FurAffinityClient.SELECTOR_USER}.current`),
                "user_thumb_url": FurAffinityClient.pickImage(`#user-profile ${FurAffinityClient.SELECTOR_USER}.current > img`),
                "body_text": ".content .journal-item div.journal-content",
                "body_html": {
                    "selector": ".content .journal-item div.journal-content",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan(".content .section-header span.popup_date"),
                "comments": this.getCommentsObj("#comments-journal", "beta")
            }
        });
    }

    getNotes() {
        return this.fetchAndScrape<Notes>(`/msg/pms/`, {
            "classic": {
                "notes": {
                    "listItem": "#notes-list > tbody > tr.note",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "self_link": FurAffinityClient.pickLink("td.subject > a"),
                        "title": "td.subject > a",
                        "user_name": "td.col-from > a",
                        "user_url": FurAffinityClient.pickLink("td.col-from > a"),
                        "unread": {
                            "selector": "td.subject > a",
                            "attr": "class",
                            "convert": (s: string) => !!(s && s.indexOf("unread") > -1)
                        },
                        "when": FurAffinityClient.pickWhenFromSpan("td:nth-child(3) > span"),
                    }
                }
            },
            "beta": {
                "notes": {
                    "listItem": "#notes-list > div.message-center-pms-note-list-view",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "self_link": FurAffinityClient.pickLink("a[href*=\"/msg/pms/\"]"),
                        "title": "div.note-list-subject",
                        "user_name": `.note-list-sender ${FurAffinityClient.SELECTOR_USER}`,
                        "user_url": FurAffinityClient.pickLink(`.note-list-sender ${FurAffinityClient.SELECTOR_USER}`),
                        "unread": {
                            "selector": "div.note-list-subject",
                            "attr": "class",
                            "convert": (s: string) => !!(s && s.indexOf("unread") > -1)
                        },
                        "when": FurAffinityClient.pickWhenFromSpan(".note-list-senddate span.popup_date"),
                    }
                }
            }
        });
    }

    getNote(id: FAID) {
        // TODO: Improve how the body and when are pulled in classic
        const path = `/viewmessage/${id}/`;
        return this.fetchAndScrape<Note>(path, {
            "classic": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "title": "#pms-form > table.maintable > tbody > tr > td > font > b",
                "user_name": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font > a:nth-child(1)",
                "user_url": FurAffinityClient.pickLink("#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font > a:nth-child(1)"),
                "body_text": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan("#pms-form > table.maintable > tbody > tr:nth-child(2) > td span.popup_date"),
            },
            "beta": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "self_link": FurAffinityClient.pickStaticValue(path),
                "title": "#message .addresses h2",
                "user_name": `#message .addresses > ${FurAffinityClient.SELECTOR_USER}:nth-child(2) > strong`,
                "user_url": FurAffinityClient.pickLink(`#message .addresses > ${FurAffinityClient.SELECTOR_USER}:nth-child(2)`),
                "body_text": "#message .section-body div.user-submitted-links",
                "body_html": {
                    "selector": "#message .section-body div.user-submitted-links",
                    "how": "html"
                },
                "when": FurAffinityClient.pickWhenFromSpan("#message .addresses span.popup_date"),
            }
        });
    }

    async moveNote(ids: FAID | FAID[], moveTo: NoteMoveAction) {
        await this.fetch(`/msg/pms/`, {
            "method": "POST",
            "body": {
                "manage_notes": 1,
                "move_to": moveTo,
                "items[]": ids,
            },
            "content-type": "application/x-www-form-urlencoded"
        });
    }

    getCommentText(id: FAID, origin: "submission" | "journal") {
        return this.fetchAndScrape<CommentText>(`/replyto/${origin}/${id}`, {
            "classic": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "body_text": "#pageid-reply-to > div:nth-child(6) > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#pageid-reply-to > div:nth-child(6) > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
                    "how": "html"
                }
            },
            "beta": {
                "id": FurAffinityClient.pickStaticValue(FurAffinityClient.ensureIdIsNumber(id)),
                "body_text": "#site-content > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#site-content > form > table > tbody > tr > td > table:nth-child(1) > tbody > tr:nth-child(2) > td",
                    "how": "html"
                }
            }
        });
    }

    protected getCommentsObj(selector: string, mode: "classic" | "beta"): TypedScrapeOptionList<Comment> {
        const structure: {
            classic: TypedScrapeOptionList<Comment>;
            beta: TypedScrapeOptionList<Comment>;
        } = {
            "classic": {
                "listItem": `${selector} table.container-comment`,
                "data": {
                    "id": {
                        "attr": "id",
                        "convert": (s: string) => parseInt(s.split(":")[1])
                    },
                    "self_link": FurAffinityClient.pickLink("a.comment-link"),
                    "user_name": "tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > b",
                    "user_url": FurAffinityClient.pickLink("tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > ul > li:nth-child(1) > a"),
                    "user_thumb_url": FurAffinityClient.pickImage("img.avatar"),
                    "body_text": "div.message-text",
                    "body_html": {
                        "selector": "div.message-text",
                        "how": "html"
                    },
                    "timestamp": {
                        "attr": "data-timestamp",
                        "convert": (s: string) => new Date(parseInt(s) * 1000)
                    },
                    "when": FurAffinityClient.pickWhenFromSpan("tbody > tr:nth-child(2) > th:nth-child(2) > h4 > span"),
                }
            },
            "beta": {
                "listItem": `${selector} div.comment_container`,
                "data": {
                    "id": {
                        "selector": "a.comment_anchor",
                        "attr": "id",
                        "convert": (s: string) => parseInt(s.split(":")[1])
                    },
                    "self_link": FurAffinityClient.pickLink("a.comment-link"),
                    "user_name": "strong.comment_username > h3",
                    "user_url": FurAffinityClient.pickLink(`.avatar-desktop > ${FurAffinityClient.SELECTOR_USER}`),
                    "user_thumb_url": FurAffinityClient.pickImage(`.avatar-desktop > ${FurAffinityClient.SELECTOR_USER} > img.comment_useravatar`),
                    "body_text": "div.comment_text",
                    "body_html": {
                        "selector": "div.comment_text",
                        "how": "html"
                    },
                    "timestamp": {
                        "attr": "data-timestamp",
                        "convert": (s: string) => new Date(parseInt(s) * 1000)
                    },
                    "when": FurAffinityClient.pickWhenFromSpan(".comment-date span.popup_date"),
                }
            }
        };

        return structure[mode];
    }

    async * search(query: string, params?: Partial<SearchQueryParams>) {
        let pageNum = 0;
        while (true) {
            pageNum++;
            const page = await this.getSearchPage(query, params, pageNum);

            if (page.more) {
                yield page.submissions;
            } else {
                return page.submissions;
            }
        }
    }

    async getSearchPage(query: string, params?: Partial<SearchQueryParams>, page: number = 1) {
        return this.fetchAndScrape<SearchPage>(`/search/`, {
            "classic": {
                "submissions": {
                    "listItem": "#gallery-search-results figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "title": `figcaption ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist_name": `figcaption ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb_url": FurAffinityClient.pickImage(FurAffinityClient.SELECTOR_THUMB),
                        "when": FurAffinityClient.pickDateFromThumbnail(FurAffinityClient.SELECTOR_THUMB)
                    }
                },
                "more": {
                    "selector": "fieldset#search-results button[type='submit'][name='next_page']",
                    "convert": (a) => !!a,
                },
            },
            "beta": {
                "submissions": {
                    "listItem": "#gallery-search-results figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "title": `figcaption ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist_name": `figcaption ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb_url": FurAffinityClient.pickImage(FurAffinityClient.SELECTOR_THUMB),
                        "when": FurAffinityClient.pickDateFromThumbnail(FurAffinityClient.SELECTOR_THUMB),
                    }
                },
                "more": {
                    "selector": "div#search-results button[type='submit'][name='next_page']",
                    "convert": (a) => !!a,
                },
            },
            "configuration": {
                "method": "POST",
                "body": this.generateSearchBody(query, params, page),
                "content-type": "application/x-www-form-urlencoded"
            }
        });
    }

    protected generateSearchBody(query: string, params?: Partial<SearchQueryParams>, page: number = 1): SearchQueryBody {
        // Populate defaults
        const body: SearchQueryBody = {
            "q": query,
            "page": page,
            "perpage": params?.perpage || 72,
            "order-by": params?.order_by || "relevancy",
            "order-direction": params?.order_dir || "desc",
            "do_search": "Search",
            "range": params?.range || "5years",
            "mode": params?.mode || "extended",
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

    protected async * scrapeSubmissionPages(url: string) {
        while (true) {
            const page = await this.scrapeSubmissionsPage(url);

            if (page.nextPage) {
                yield page.submissions;
                url = page.nextPage;
            } else {
                return page.submissions;
            }
        }
    }

    protected async scrapeSubmissionsPage(path: string) {
        return this.fetchAndScrape<SubmissionPage>(path, {
            "classic": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "submissions": {
                    "listItem": "figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "self_link": FurAffinityClient.pickLink("b > u > a"),
                        "title": "figcaption > label > p:nth-child(2) > a",
                        "artist_name": "figcaption > label > p:nth-child(3) > a",
                        "thumb_url": FurAffinityClient.pickImage("b > u > a > img"),
                        "when": FurAffinityClient.pickDateFromThumbnail("b > u > a > img")
                    }
                },
                "nextPage": {
                    "selector": "#messages-form .navigation a[class*='more']:not(.prev)",
                    "attr": "href"
                },
                "previousPage": {
                    "selector": "#messages-form .navigation a[class*='more'].prev",
                    "attr": "href"
                }
            },
            "beta": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "submissions": {
                    "listItem": "#messagecenter-submissions figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "title": `figcaption label p ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist_name": `figcaption label p ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} > img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} > img`),
                    }
                },
                "nextPage": {
                    "selector": "#messagecenter-new-submissions div > a[class*='more']:not(.prev)",
                    "attr": "href"
                },
                "previousPage": {
                    "selector": "#messagecenter-new-submissions div > a[class*='more'].prev",
                    "attr": "href"
                }
            }
        });
    }

    protected async * scrapeUserGalleryPages(url: string, pageType: "gallery" | "scraps" | "favorites") {
        while (true) {
            const page = await this.scrapeUserGalleryPage(url, pageType);

            if (page.nextPage) {
                yield page.submissions;
                url = page.nextPage;
            } else {
                return page.submissions;
            }
        }
    }

    protected scrapeUserGalleryPage(path: string, pageType: "gallery" | "scraps" | "favorites") {
        return this.fetchAndScrape<SubmissionPage>(path, {
            "classic": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "submissions": {
                    "listItem": "section.gallery figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink("b > u > a"),
                        "title": FurAffinityClient.pick("figcaption > p:nth-child(1) > a", "title"),
                        "artist_name": FurAffinityClient.pick("figcaption > p:nth-child(2) > a", "title"),
                        "thumb_url": FurAffinityClient.pickImage("b > u > a > img"),
                        "when": FurAffinityClient.pickDateFromThumbnail("b > u > a > img")
                    }
                },
                "nextPage": FurAffinityClient.pickLink("a.button-link.right"),
                "previousPage": FurAffinityClient.pickLink("a.button-link.left"),
            },
            "beta": {
                "self_link": FurAffinityClient.pickStaticValue(path),
                "submissions": {
                    "listItem": "section.gallery figure[id*='sid-']",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "self_link": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "title": `figcaption p:nth-child(1) ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist_name": `figcaption p:nth-child(2) ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb_url": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} > img`),
                        "when": FurAffinityClient.pickDateFromThumbnail(`${FurAffinityClient.SELECTOR_VIEW} > img`)
                    }
                },
                "nextPage": pageType === "gallery" ? FurAffinityClient.pickFormValue("form:has(>button:contains('Next'))") : FurAffinityClient.pickLink(".pagination a.button.right"),
                "previousPage": pageType === "gallery" ? FurAffinityClient.pickFormValue("form:has(>button:contains('Prev'))") : FurAffinityClient.pickLink(".pagination a.button.left"),
            }
        });
    }

    protected determineSiteVersion(doc: cheerio.Root): string {
        const scraped = scrape.scrapeHTML<{ path: string }>(doc, {
            "path": {
                "selector": "body",
                "attr": "data-static-path",
            }
        });

        if (scraped && scraped.path === "/themes/beta") {
            return "beta";
        }

        return "classic";
    }

    private async fetch(path: string, config: FetchConfig, attempt = 1): Promise<string> {
        const url = `${FurAffinityClient.SITE_ROOT}${path}`;
        const res = await this.httpClient.fetch(url, {
            ...config,
            "cookies": this.cookies,
        });

        const status = FurAffinityClient.checkErrors(res);
        if (status !== 200) {
            if (this.throwErrors && (this.disableRetry || attempt > 6)) {
                throw new FurAffinityError("Got error from FurAffinity", status, url);
            } else {
                console.warn(`FA error: Got HTTP error ${status} at ${url}`);
            }

            // For server errors, attempt retry w/ exponential backoff
            if (!this.disableRetry && status >= 500 && attempt <= 6) { // 2^6=64 so 60sec
                await FurAffinityClient.delay(Math.pow(2, attempt) * 1000);
                return await this.fetch(url, config, attempt + 1);
            }

            return null;
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

    private async fetchAndScrape<T>(path: string, options: DualScrapeOptions<T>): Promise<T> {
        const body = await this.fetch(path, options.configuration);
        return this.scrape<T>(body, options);
    }
}
