import { HttpClient } from "../types";

export class FetchHttpClient implements HttpClient {
    async fetch(url: string, cookies?: string) {
        const reqOpts: RequestInit = {
            "method": "GET",
            "mode": "no-cors"
        };

        if (cookies) {
            reqOpts.headers = {
                "Cookie": cookies
            };
        } else {
            reqOpts.credentials = "include";
        }

        const res = await fetch(url, reqOpts);
        return {
            "statusCode": res.status,
            "body": await res.text(),
        };
    }
}
