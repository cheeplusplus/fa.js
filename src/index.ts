import * as cheerio from "cheerio";
import * as scrape from "scrape-it";
import * as superagent from "superagent";

// TODO: Rate limiting and backoff error handling
// TODO: Handle removed submissions/journals/etc

export class FurAffinityClient {
    public static checkErrors(res: superagent.Response): number {
        if (res.status !== 200) {
            return res.status;
        }

        if (res.text.indexOf("This user has voluntarily disabled access to their userpage.") > -1) {
            return 403;
        }

        if (res.text.indexOf("The submission you are trying to find is not in our database.") > -1) {
            return 404;
        }

        if (res.text.indexOf("For more information please check the") > -1) {
            return 500;
        }

        if (res.text.indexOf("The server is currently having difficulty responding to all requests.") > -1) {
            return 503;
        }

        return 200;
    }

    private static SELECTOR_USER = "a[href*=\"/user/\"]";
    private static SELECTOR_VIEW = "a[href*=\"/view/\"]";
    private static SELECTOR_JOURNAL = "a[href*=\"/journal/\"]";

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
            return `https://www.furaffinity.net${str}`;
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

    constructor(private cookies: string) {
    }

    getSubmissions() {
        // TODO: Make this return an iterable like scrapeUserGalleryPages
        return this.scrape<Submissions>("https://www.furaffinity.net/msg/submissions/", {
            "submissions": {
                "listItem": "figure.t-image",
                "data": {
                    "id": FurAffinityClient.pickCheckboxValue(),
                    "title": "figcaption > label > p:nth-child(2) > a",
                    "artist": "figcaption > label > p:nth-child(3) > a",
                    "thumb": FurAffinityClient.pickImage("b > u > a > img"),
                    "url": FurAffinityClient.pickLink("b > u > a")
                }
            }
        });
    }

    getUserGallery(username: string) {
        return this.scrapeUserGalleryPages(`http://www.furaffinity.net/gallery/${username}`);
    }

    getUserScraps(username: string) {
        return this.scrapeUserGalleryPages(`http://www.furaffinity.net/scraps/${username}`);
    }

    getUserFavorites(username: string) {
        return this.scrapeUserGalleryPages(`http://www.furaffinity.net/favorites/${username}`);
    }

    getSubmission(id: FAID) {
        return this.scrape<Submission>(`https://www.furaffinity.net/view/${id}/`, {
            "title": "#page-submission div.classic-submission-title.information > h2",
            "thumb": FurAffinityClient.pickImage("#submissionImg", "data-preview-src"),
            "url": FurAffinityClient.pickImage("#submissionImg", "data-fullview-src"),
            "artist": "#page-submission div.classic-submission-title.information > a",
            "artist_url": FurAffinityClient.pickLink("#page-submission div.classic-submission-title.information > a"),
            "artist_thumb": FurAffinityClient.pickImage("#page-submission div.classic-submissiont-title.avatar > a > img"),
            "body_text": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
            "body_html": {
                "selector": "#page-submission > table > tbody > tr:nth-child(1) > td > table > tbody > tr:nth-child(2) > td > table > tbody > tr:nth-child(2) > td",
                "how": "html"
            },
            "when": "#page-submission td.stats-container span.popup_date",
            "when_title": {
                "selector": "#page-submission td.stats-container span.popup_date",
                "attr": "title"
            },
            "keywords": {
                "listItem": "#page-submission #keywords > a",
                "data": {
                    "value": ""
                }
            },
            "comments": this.getCommentsObj("#comments-submission")
        });
    }

    getMessages() {
        return this.scrape<Messages>("https://www.furaffinity.net/msg/others/", {
            "self_user_name": "a#my-username",
            "self_user_url": FurAffinityClient.pickLink("a#my-username"),
            "watches": {
                "listItem": "ul#watches > li:not(.section-controls)",
                "data": {
                    "id": FurAffinityClient.pickCheckboxValue(),
                    "user_name": "div > span",
                    "user_url": FurAffinityClient.pickLink(),
                    "user_thumb": FurAffinityClient.pickImage(),
                    "when": "div > small > span"
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
                    "when": "span"
                }
            },
            "shouts": {
                "listItem": "fieldset#messages-shouts > ul.message-stream > li:not(.section-controls)",
                "data": {
                    "id": FurAffinityClient.pickCheckboxValue(),
                    "user_name": FurAffinityClient.SELECTOR_USER,
                    "user_url": FurAffinityClient.pickLink(FurAffinityClient.SELECTOR_USER),
                    "when": "span"
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
                    "when": "span"
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
                    "is_stream": {
                        "selector": "",
                        "attr": "class",
                        "convert": (s) => !!(s && s.contains("stream-notification"))
                    },
                    "when": "span"
                }
            }
        });
    }

    getJournal(id: FAID) {
        return this.scrape<Journal>(`https://www.furaffinity.net/journal/${id}/`, {
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
            "comments": this.getCommentsObj("#page-comments")
        });
    }

    getNotes() {
        return this.scrape<Notes>("https://www.furaffinity.net/msg/pms/", {
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
                        "convert": (s) => !!(s && s.indexOf("unread") > -1)
                    },
                    "when": "td:nth-child(3) > span"
                }
            }
        });
    }

    getNote(id: FAID) {
        // TODO: Improve how the body and when are pulled
        return this.scrape<Note>(`https://www.furaffinity.net/viewmessage/${id}/`, {
            "title": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font:nth-child(1) > b",
            "user_name": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font:nth-child(3) > a:nth-child(1)",
            "user_url": FurAffinityClient.pickLink("#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font:nth-child(3) > a:nth-child(1)"),
            "body_text": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
            "body_html": {
                "selector": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td",
                "how": "html"
            },
            "when": {
                "selector": "#pms-form > table.maintable > tbody > tr:nth-child(2) > td > font:nth-child(3)",
                "convert": (s) => {
                    const dateInd = s.indexOf(" On: ");
                    return s.substring(dateInd + 5);
                }
            }
        });
    }

    protected getCommentsObj(selector: string): scrape.ScrapeOptionList {
        return {
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
                "when": "tbody > tr:nth-child(2) > th:nth-child(2) > h4 > span"
            }
        };
    }

    protected async *scrapeUserGalleryPages(url: string) {
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
            "submissions": {
                "listItem": "figure.t-image",
                "data": {
                    "id": FurAffinityClient.pickFigureId(),
                    "title": {
                        "selector": "figcaption > p:nth-child(1) > a",
                        "attr": "title"
                    },
                    "artist": {
                        "selector": "figcaption > p:nth-child(2) > a",
                        "attr": "title"
                    },
                    "thumb": FurAffinityClient.pickImage("b > u > a > img"),
                    "url": FurAffinityClient.pickLink("b > u > a")
                }
            },
            "nextPage": FurAffinityClient.pickLink("a.button-link.right"),
            "previousPage": FurAffinityClient.pickLink("a.button-link.left"),
        });
    }

    private async scrape<T>(url: string, options: scrape.ScrapeOptions, attempt = 1): Promise<T> {
        const req = await superagent.get(url).set("Cookie", this.cookies).ok((res) => true);
        const status = FurAffinityClient.checkErrors(req);
        if (status !== 200) {
            console.warn(`FA error: Got HTTP error ${status} at ${url}`);

            // For server errors, attempt retry w/ exponential backoff
            if (status >= 500 && attempt <= 6) { // 2^6=64 so 60sec
                await FurAffinityClient.delay(Math.pow(2, attempt) * 1000);
                return await this.scrape(url, options, attempt + 1) as T;
            }

            return null;
        }

        const doc = cheerio.load(req.text);
        return scrape.scrapeHTML<T>(doc, options);
    }
}

// Type definitions

export type FAID = string | number;

export interface Comment {
    "id": number;
    "user_name": string;
    "user_url": string;
    "user_thumb": string;
    "body_text": string;
    "body_html": string;
    "timestamp": number;
    "when": string;
}

export interface SubmissionListing {
    "id": number;
    "title": string;
    "artist": string;
    "thumb": string;
    "url": string;
}

export interface Submissions {
    "submissions": SubmissionListing[];
}

export interface SubmissionPage extends Submissions {
    "previousPage": string;
    "nextPage": string;
}

export interface Submission {
    "title": string;
    "thumb": string;
    "url": string;
    "artist": string;
    "artist_url": string;
    "artist_thumb": string;
    "body_text": string;
    "body_html": string;
    "when": string;
    "when_title": string;
    "keywords": string;
    "comments": Comment[];
}

export interface Messages {
    "self_user_name": string;
    "self_user_url": string;
    "watches": Array<{
        "id": number;
        "user_name": string;
        "user_url": string;
        "user_thumb": string;
        "when": string;
    }>;
    "comments": Array<{
        "id": number;
        "title": string;
        "url": string;
        "submission_id": number;
        "user_name": string;
        "user_url": string;
        "when": string;
    }>;
    "shouts": Array<{
        "id": number;
        "user_name": string;
        "user_url": string;
        "when": string;
    }>;
    "favorites": Array<{
        "id": number;
        "title": string;
        "url": string;
        "user_name": string;
        "user_url": string;
        "when": string;
    }>;
    "journals": Array<{
        "id": number;
        "title": string;
        "url": string;
        "user_name": string;
        "user_url": string;
        "is_stream": boolean;
        "when": string;
    }>;
}

export interface Journal {
    "title": string;
    "user_name": string;
    "user_url": string;
    "user_thumb": string;
    "body_text": string;
    "body_html": string;
    "when": string;
    "comments": Comment[];
}

export interface Notes {
    "notes": Array<{
        "id": number;
        "title": string;
        "url": string;
        "user_name": string;
        "user_url": string;
        "unread": boolean;
        "when": string;
    }>;
}

export interface Note {
    "title": string;
    "user_name": string;
    "user_url": string;
    "body_text": string;
    "body_html": string;
    "when": string;
}
