import type { HttpClient, HttpClientConfig } from "../types";
import { StandardHttpResponse } from "src";

export class CloudscraperHttpClient implements HttpClient {
    private cloudscraper: typeof import("cloudscraper");

    constructor() {
        // Require it here so it's not required unless this client is used
        this.cloudscraper = require("cloudscraper");
    }

    async fetch(url: string, config: HttpClientConfig) {
        const reqOpts: import("cloudscraper").OptionsWithUrl = {
            url,
            "resolveWithFullResponse": true,
            "headers": {
                "content-type": config["content-type"],
            },
        };

        if (config?.cookies) {
            reqOpts.headers["Cookie"] = config.cookies;
        }

        if (config?.body) {
            if (config?.['content-type'] === "application/x-www-form-urlencoded") {
                reqOpts.formData = config.body;
            } else {
                reqOpts.body = config.body;
            }
        }

        let req: import("cloudscraper").Cloudscraper;
        if (config?.method === 'POST') {
            req = this.cloudscraper.post(reqOpts);
        } else {
            req = this.cloudscraper.get(reqOpts);
        }

        const res = (await req) as StandardHttpResponse;
        return res;
    }
}
