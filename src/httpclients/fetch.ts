import type { HttpClient, HttpClientConfig } from "../types";

export class FetchHttpClient implements HttpClient {
  async fetch(url: string, config: HttpClientConfig) {
    const headers = new Headers();

    const reqOpts: RequestInit = {
      method: config?.method || "GET",
      mode: "no-cors",
      credentials: config?.cookies ? "include" : undefined,
      headers,
    };

    if (config?.cookies) {
      headers.set("Cookie", config.cookies);
    }

    if (config?.body) {
      if (config?.["content-type"] === "application/x-www-form-urlencoded") {
        const fd = new FormData();
        for (const k of Object.keys(config.body)) {
          const v = config.body[k];
          if (Array.isArray(v)) {
            // repeat key
            v.forEach((val) => fd.append(k, asStr(val)));
          } else {
            fd.append(k, asStr(v));
          }
        }

        reqOpts.body = fd;
      } else {
        reqOpts.body = JSON.stringify(config.body);
      }
    }

    const res = await fetch(url, reqOpts);
    return {
      statusCode: res.status,
      body: await res.text(),
    };
  }
}

function asStr(value: string | number) {
  if (typeof value === "number") {
    return value.toString();
  } else {
    return value;
  }
}
