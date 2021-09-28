import * as cheerio from "cheerio";
import * as scrape from "scrape-it";
import { FurAffinityError } from "./errors";
import { CloudscraperHttpClient } from "./httpclients";
import type { ClientConfig, Comment, DualScrapeOptions, FAID, HttpClient, Journal, Messages, Navigation, Note, Notes, StandardHttpResponse, Submission, SubmissionPage, TypedScrapeOptionList } from "./types";

// TODO: Rate limiting and backoff error handling
// TODO: Handle removed submissions/journals/etc

export class FurAffinityClient {
    public static SITE_ROOT = "https://www.furaffinity.net";

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
    private static SELECTOR_NOTE = "a[href*=\"/msg/pms/\"]";

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
        } else if (str.startsWith("/")) {
            return `${FurAffinityClient.SITE_ROOT}${str}`;
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
                return sid.split("-")[1];
            }
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
        return this.scrapeSubmissionPages(`${FurAffinityClient.SITE_ROOT}/msg/submissions/`);
    }

    getSubmissionsPage(nextUrl: string = `/msg/submissions/`) {
        return this.scrapeSubmissionsPage(`${FurAffinityClient.SITE_ROOT}${nextUrl}`);
    }

    getUserGallery(username: string) {
        return this.scrapeUserGalleryPages(`${FurAffinityClient.SITE_ROOT}/gallery/${username}`);
    }

    getUserGalleryPage(username: string, page: string | number) {
        return this.scrapeUserGalleryPage(`${FurAffinityClient.SITE_ROOT}/gallery/${username}/${page}/`);
    }

    getUserScraps(username: string) {
        return this.scrapeUserGalleryPages(`${FurAffinityClient.SITE_ROOT}/scraps/${username}`);
    }

    getUserScrapsPage(username: string, page: string | number) {
        return this.scrapeUserGalleryPage(`${FurAffinityClient.SITE_ROOT}/scraps/${username}/${page}/`);
    }

    getUserFavorites(username: string) {
        return this.scrapeUserGalleryPages(`${FurAffinityClient.SITE_ROOT}/favorites/${username}`);
    }

    getUserFavoritesPage(username: string, page: string | number) {
        return this.scrapeUserGalleryPage(`${FurAffinityClient.SITE_ROOT}/favorites/${username}/${page}/`);
    }

    async getSubmission(id: FAID) {
        return this.scrape<Submission>(`${FurAffinityClient.SITE_ROOT}/view/${id}/`, {
            "classic": {
                "id": {
                    "selector": "a", // Have to select something
                    "convert": () => FurAffinityClient.ensureIdIsNumber(id),
                },
                "title": "#page-submission div.classic-submission-title.information > h2",
                "thumb": FurAffinityClient.pickImage("#submissionImg", "data-preview-src"),
                "url": FurAffinityClient.pickImage("#submissionImg", "data-fullview-src"),
                "artist": `#page-submission div.classic-submission-title.information > ${FurAffinityClient.SELECTOR_USER}`,
                "artist_url": FurAffinityClient.pickLink(`#page-submission div.classic-submission-title.information > ${FurAffinityClient.SELECTOR_USER}`),
                "artist_thumb": FurAffinityClient.pickImage(`#page-submission div.classic-submissiont-title.avatar ${FurAffinityClient.SELECTOR_USER} > img`),
                "body_text": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
                    "how": "html"
                },
                "when": "#page-submission td.stats-container span.popup_date",
                "when_title": FurAffinityClient.pick("#page-submission td.stats-container span.popup_date", "title"),
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
                "id": {
                    "selector": "a", // Have to select something
                    "convert": () => FurAffinityClient.ensureIdIsNumber(id),
                },
                "title": "#submission_page div.submission-title p",
                "thumb": FurAffinityClient.pickImage("#submissionImg", "data-preview-src"),
                "url": FurAffinityClient.pickImage("#submissionImg", "data-fullview-src"),
                "artist": `#submission_page .submission-id-container ${FurAffinityClient.SELECTOR_USER}`,
                "artist_url": FurAffinityClient.pickLink(`#submission_page .submission-id-container ${FurAffinityClient.SELECTOR_USER}`),
                "artist_thumb": FurAffinityClient.pickImage(`#submission_page .submission-id-avatar ${FurAffinityClient.SELECTOR_USER} > img`),
                "body_text": "#submission_page div.submission-description",
                "body_html": {
                    "selector": "#submission_page div.submission-description",
                    "how": "html"
                },
                "when": "#submission_page .submission-id-container span.popup_date",
                "when_title": FurAffinityClient.pick("#submission_page .submission-id-container span.popup_date", "title"),
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
        return this.scrape<Messages>(`${FurAffinityClient.SITE_ROOT}/msg/others/`, {
            "classic": {
                "self_user_name": {
                    "selector": "a#my-username",
                    "convert": (s: string) => s && s.replace("~", "")
                },
                "self_user_url": FurAffinityClient.pickLink("a#my-username"),
                "watches": {
                    "listItem": "ul#watches > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": "div > span",
                        "user_url": FurAffinityClient.pickLink(),
                        "user_thumb": FurAffinityClient.pickImage(),
                        "when": "div > small > span",
                        "when_title": FurAffinityClient.pick("div > small > span", "title"),
                    }
                },
                "comments": {
                    "listItem": "ul#comments > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_VIEW,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span",
                        "when_title": FurAffinityClient.pick("span", "title"),
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
                        "when": "span",
                        "when_title": FurAffinityClient.pick("span", "title"),
                    }
                },
                "shouts": {
                    "listItem": "fieldset#messages-shouts > ul.message-stream > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span",
                        "when_title": FurAffinityClient.pick("span", "title"),
                    }
                },
                "favorites": {
                    "listItem": "ul#favorites > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_VIEW,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span",
                        "when_title": FurAffinityClient.pick("span", "title"),
                    }
                },
                "journals": {
                    "listItem": "ul#journals > li:not(.section-controls)",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_JOURNAL,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span",
                        "when_title": FurAffinityClient.pick("span", "title"),
                    }
                }
            },
            "beta": {
                "self_user_name": `.mobile-navigation article.mobile-menu h2 > ${FurAffinityClient.SELECTOR_USER}`,
                "self_user_url": FurAffinityClient.pickLink(`.mobile-navigation article.mobile-menu h2 > ${FurAffinityClient.SELECTOR_USER}`),
                "watches": {
                    "listItem": "#messages-watches ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": "div.info > span:nth-child(1)",
                        "user_url": FurAffinityClient.pickLink(`td.avatar ${FurAffinityClient.SELECTOR_USER}`),
                        "user_thumb": FurAffinityClient.pickImage("td.avatar a img"),
                        "when": "div.info span.popup_date",
                        "when_title": FurAffinityClient.pick("div.info span.popup_date", "title"),
                    }
                },
                "comments": {
                    "listItem": "#messages-comments-submission ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_VIEW,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "submission_id": {
                            "selector": FurAffinityClient.SELECTOR_VIEW,
                            "attr": "href",
                            "convert": FurAffinityClient.getViewPath
                        },
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span.popup_date",
                        "when_title": FurAffinityClient.pick("span.popup_date", "title"),
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
                        "when": "span.popup_date",
                        "when_title": FurAffinityClient.pick("span.popup_date", "title"),
                    }
                },
                "shouts": {
                    "listItem": "#messages-shouts ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "user_name": FurAffinityClient.SELECTOR_USER,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span.popup_date",
                        "when_title": FurAffinityClient.pick("span.popup_date", "title"),
                    }
                },
                "favorites": {
                    "listItem": "#messages-favorites ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_VIEW,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW),
                        "user_name": `${FurAffinityClient.SELECTOR_USER} > strong`,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span.popup_date",
                        "when_title": FurAffinityClient.pick("span.popup_date", "title"),
                    }
                },
                "journals": {
                    "listItem": "#messages-journals ul.message-stream > li",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": FurAffinityClient.SELECTOR_JOURNAL,
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_JOURNAL),
                        "user_name": `${FurAffinityClient.SELECTOR_USER} > strong`,
                        "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                        "when": "span.popup_date",
                        "when_title": FurAffinityClient.pick("span.popup_date", "title"),
                    }
                }
            }
        });
    }

    getJournal(id: FAID) {
        return this.scrape<Journal>(`${FurAffinityClient.SITE_ROOT}/journal/${id}/`, {
            "classic": {
                "title": "#page-journal td.journal-title-box > b > font > div",
                "user_name": "#page-journal td.journal-title-box > a",
                "user_url": FurAffinityClient.pickLink("#page-journal td.journal-title-box > a"),
                "user_thumb": FurAffinityClient.pickImage("#page-journal td.avatar-box > a > img"),
                "body_text": "div.journal-body",
                "body_html": {
                    "selector": "div.journal-body",
                    "how": "html"
                },
                "when": "#page-journal td.journal-title-box > span",
                "when_title": FurAffinityClient.pick("#page-journal td.journal-title-box > span", "title"),
                "comments": this.getCommentsObj("#page-comments", "classic")
            },
            "beta": {
                "title": ".content .journal-body-theme h2",
                "user_name": {
                    "selector": "#user-profile .username h2 span",
                    "convert": (s: string) => s && s.trim().replace("~", "")
                },
                "user_url": FurAffinityClient.pickLink(`#user-profile ${FurAffinityClient.SELECTOR_USER}.current`),
                "user_thumb": FurAffinityClient.pickImage(`#user-profile ${FurAffinityClient.SELECTOR_USER}.current > img`),
                "body_text": ".content .journal-content-container div.journal-content",
                "body_html": {
                    "selector": ".content .journal-content-container div.journal-content",
                    "how": "html"
                },
                "when": ".content .journal-body-theme span.popup_date",
                "when_title": FurAffinityClient.pick(".content .journal-body-theme span.popup_date", "title"),
                "comments": this.getCommentsObj("#comments-journal", "beta")
            }
        });
    }

    getNotes() {
        return this.scrape<Notes>(`${FurAffinityClient.SITE_ROOT}/msg/pms/`, {
            "classic": {
                "notes": {
                    "listItem": "#notes-list > tbody > tr.note",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": "td.subject > a",
                        "url": FurAffinityClient.pickLink("td.subject > a"),
                        "user_name": "td.col-from > a",
                        "user_url": FurAffinityClient.pickLink("td.col-from > a"),
                        "unread": {
                            "selector": "td.subject > a",
                            "attr": "class",
                            "convert": (s: string) => !!(s && s.indexOf("unread") > -1)
                        },
                        "when": "td:nth-child(3) > span",
                        "when_title": FurAffinityClient.pick("td:nth-child(3) > span", "title"),
                    }
                }
            },
            "beta": {
                "notes": {
                    "listItem": "#notes-list > div.message-center-pms-note-list-view",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": "div.note-list-subject",
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_NOTE),
                        "user_name": `.note-list-sender ${FurAffinityClient.SELECTOR_USER}`,
                        "user_url": FurAffinityClient.pickLink(`.note-list-sender ${FurAffinityClient.SELECTOR_USER}`),
                        "unread": {
                            "selector": "div.note-list-subject",
                            "attr": "class",
                            "convert": (s: string) => !!(s && s.indexOf("unread") > -1)
                        },
                        "when": ".note-list-senddate span.popup_date",
                        "when_title": FurAffinityClient.pick(".note-list-senddate span.popup_date", "title"),
                    }
                }
            }
        });
    }

    getNote(id: FAID) {
        // TODO: Improve how the body and when are pulled in classic
        return this.scrape<Note>(`${FurAffinityClient.SITE_ROOT}/viewmessage/${id}/`, {
            "classic": {
                "title": "#pms-form > table.maintable > tbody > tr > td > font > b",
                "user_name": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font > a:nth-child(1)",
                "user_url": FurAffinityClient.pickLink("#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font > a:nth-child(1)"),
                "body_text": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
                "body_html": {
                    "selector": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
                    "how": "html"
                },
                "when": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td span.popup_date",
                "when_title": FurAffinityClient.pick("#pms-form > table.maintable > tbody > tr:nth-child(2) > td span.popup_date", "title"),
            },
            "beta": {
                "title": "#message .addresses h2",
                "user_name": `#message .addresses > ${FurAffinityClient.SELECTOR_USER}:nth-child(2) > strong`,
                "user_url": FurAffinityClient.pickLink(`#message .addresses > ${FurAffinityClient.SELECTOR_USER}:nth-child(2)`),
                "body_text": "#message div.link-override",
                "body_html": {
                    "selector": "#message div.link-override",
                    "how": "html"
                },
                "when": "#message .addresses span.popup_date",
                "when_title": FurAffinityClient.pick("#message .addresses span.popup_date", "title"),
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
                    "user_name": "tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > b",
                    "user_url": FurAffinityClient.pickLink("tbody > tr:nth-child(1) > td:nth-child(3) > div > ul > li > ul > li:nth-child(1) > a"),
                    "user_thumb": FurAffinityClient.pickImage("img.avatar"),
                    "body_text": "div.message-text",
                    "body_html": {
                        "selector": "div.message-text",
                        "how": "html"
                    },
                    "timestamp": {
                        "attr": "data-timestamp",
                        "convert": (s: string) => new Date(parseInt(s) * 1000)
                    },
                    "when": "tbody > tr:nth-child(2) > th:nth-child(2) > h4 > span",
                    "when_title": FurAffinityClient.pick("tbody > tr:nth-child(2) > th:nth-child(2) > h4 > span", "title")
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
                    "user_name": "strong.comment_username > h3",
                    "user_url": FurAffinityClient.pickLink(`.avatar-desktop > ${FurAffinityClient.SELECTOR_USER}`),
                    "user_thumb": FurAffinityClient.pickImage(`.avatar-desktop > ${FurAffinityClient.SELECTOR_USER} > img.comment_useravatar`),
                    "body_text": "div.comment_text",
                    "body_html": {
                        "selector": "div.comment_text",
                        "how": "html"
                    },
                    "timestamp": {
                        "attr": "data-timestamp",
                        "convert": (s: string) => new Date(parseInt(s) * 1000)
                    },
                    "when": ".comment-date span.popup_date",
                    "when_title": FurAffinityClient.pick(".comment-date span.popup_date", "title")
                }
            }
        };

        return structure[mode];
    }

    protected async * scrapeSubmissionPages(url: string) {
        while (true) {
            const page = await this.scrapeSubmissionsPage(url);

            yield page.submissions;

            if (page.nextPage) {
                url = page.nextPage;
            } else {
                break;
            }
        }
    }

    protected async scrapeSubmissionsPage(url: string) {
        return this.scrape<SubmissionPage>(url, {
            "classic": {
                "submissions": {
                    "listItem": "figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": "figcaption > label > p:nth-child(2) > a",
                        "artist": "figcaption > label > p:nth-child(3) > a",
                        "thumb": FurAffinityClient.pickImage("b > u > a > img"),
                        "url": FurAffinityClient.pickLink("b > u > a")
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
                "submissions": {
                    "listItem": "#messagecenter-submissions figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickCheckboxValue(),
                        "title": `figcaption label p ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist": `figcaption label p ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} > img`),
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW)
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

    protected async * scrapeUserGalleryPages(url: string) {
        while (true) {
            const page = await this.scrapeUserGalleryPage(url);

            yield page.submissions;

            if (page.nextPage) {
                url = page.nextPage;
            } else {
                break;
            }
        }
    }

    protected scrapeUserGalleryPage(url: string) {
        return this.scrape<SubmissionPage>(url, {
            "classic": {
                "submissions": {
                    "listItem": "figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "title": FurAffinityClient.pick("figcaption > p:nth-child(1) > a", "title"),
                        "artist": FurAffinityClient.pick("figcaption > p:nth-child(2) > a", "title"),
                        "thumb": FurAffinityClient.pickImage("b > u > a > img"),
                        "url": FurAffinityClient.pickLink("b > u > a")
                    }
                },
                "nextPage": FurAffinityClient.pickLink("a.button-link.right"),
                "previousPage": FurAffinityClient.pickLink("a.button-link.left"),
            },
            "beta": {
                "submissions": {
                    "listItem": "section.gallery figure.t-image",
                    "data": {
                        "id": FurAffinityClient.pickFigureId(),
                        "title": `figcaption p:nth-child(1) ${FurAffinityClient.SELECTOR_VIEW}`,
                        "artist": `figcaption p:nth-child(2) ${FurAffinityClient.SELECTOR_USER}`,
                        "thumb": FurAffinityClient.pickImage(`${FurAffinityClient.SELECTOR_VIEW} > img`),
                        "url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_VIEW)
                    }
                },
                "nextPage": FurAffinityClient.pickFormValue("form:has(>button:contains('Next'))"),
                "previousPage": FurAffinityClient.pickFormValue("form:has(>button:contains('Prev'))"),
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

    private async scrape<T>(url: string, options: DualScrapeOptions<T>, attempt = 1): Promise<T> {
        const res = await this.httpClient.fetch(url, this.cookies);

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
                return await this.scrape(url, options, attempt + 1) as T;
            }

            return null;
        }

        const doc = cheerio.load(res.body);

        const siteVersion = this.determineSiteVersion(doc);
        let useOptions = options.classic;
        if (siteVersion === "beta") {
            useOptions = options.beta;
        }

        return scrape.scrapeHTML<T>(doc, useOptions);
    }
}
