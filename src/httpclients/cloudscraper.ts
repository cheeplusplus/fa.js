import { HttpClient } from "../types";

export class CloudscraperHttpClient implements HttpClient {
    private cloudscraper: typeof import("cloudscraper");

    constructor() {
        // Require it here so it's not required unless this client is used
        this.cloudscraper = require("cloudscraper");
    }

    async fetch(url: string, cookies?: string) {
        const reqOpts: { url: string, headers?: {}, resolveWithFullResponse?: boolean; } = { url, "resolveWithFullResponse": true };

        if (cookies) {
            reqOpts.headers = {
                "Cookie": cookies
            };
        }

        const res: import("request").Response = await this.cloudscraper.get(reqOpts);
        return res;
    }
}
