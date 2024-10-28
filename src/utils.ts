import type * as cheerio from "cheerio";
import * as datefns from "date-fns";
import { tz } from "@date-fns/tz";
import type { AnyNode, Text } from "domhandler";
import type { FAID } from "./types";

const viewRegex = /\/view\/(\d+)/;
const journalRegex = /\/journal\/(\d+)/;
const thumbnailRegex = /^\/\/t\.facdn\.net\/(\d+)@(\d+)-(\d+)/;

export const parensMatchRegex = /\((\S*?)\)/;
export const parensNumberMatchRegex = /\((\d+).*\)/;
export const colonPostMatchRegex = /: (.*?)$/;
export const colonPreMatchRegex = /^(.*?):$/;

const dateFormats = [
  "MMM do, yyyy hh:mm aa", // Sep 27th, 2021 06:16 AM (standard)
  "MMM do, yyyy, hh:mm aa", // Sep 27th, 2021, 06:16 AM (beta note)
  "MMM do, yyyy hh:mmaa", // Sep 27, 2021 06:16AM (beta note list)
];

export const SITE_ROOT = "https://www.furaffinity.net";

export const SELECTOR_USER = 'a[href*="/user/"]';
export const SELECTOR_VIEW = 'a[href*="/view/"]';
export const SELECTOR_JOURNAL = 'a[href*="/journal/"]';
export const SELECTOR_THUMB = 'img[src*="//t.furaffinity.net/"]';

export function readDateWhenField(
  field: string,
  timezone?: string
): Date | null {
  if (!field) {
    return null;
  }

  // Strip out field prefix
  if (field.startsWith("on ")) {
    field = field.substring(3);
  }

  // Try all known date formats
  for (const format of dateFormats) {
    const parsedDate = datefns.parse(
      field,
      format,
      new Date(),
      timezone
        ? {
            in: tz(timezone),
          }
        : undefined
    );
    if (!Number.isNaN(parsedDate) && datefns.isValid(parsedDate)) {
      return parsedDate;
    }
  }

  return null;
}

export function delay(ms: number) {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
}

export function fixFaUrl(str: string) {
  if (!str) {
    return str;
  }

  if (str.startsWith("//")) {
    return `https:${str}`;
  } else {
    return str;
  }
}

export function getViewPath(str: string) {
  const matches = viewRegex.exec(str);
  if (!matches || matches.length < 2) {
    return null;
  }
  return parseInt(matches[1]);
}

export function getJournalPath(str: string) {
  const matches = journalRegex.exec(str);
  if (!matches || matches.length < 2) {
    return null;
  }
  return parseInt(matches[1]);
}

export function pick(selector: string, attr: string) {
  return {
    selector,
    attr,
    convert: fixFaUrl,
  };
}

export function pickLink(selector: string = "a") {
  return pick(selector, "href");
}

export function pickImage(selector: string = "img", attr = "src") {
  return pick(selector, attr);
}

export function pickFormValue(selector: string = "form") {
  return pick(selector, "action");
}

export function pickCheckboxValue(selector: string = "input[type='checkbox']") {
  return {
    selector,
    attr: "value",
    convert: parseInt,
  };
}

export function pickFigureId() {
  return {
    attr: "id",
    convert: (sid: string) => {
      return parseInt(sid.split("-")[1]);
    },
  };
}

export function pickWhenFromSpan(selector: string, timezone?: string) {
  return {
    selector,
    how: (source: cheerio.Cheerio<AnyNode>) => {
      const text = source.text();
      const title = source.attr("title");

      if (text) {
        const textVal = readDateWhenField(text, timezone);
        if (textVal) {
          return textVal;
        }
      }

      if (title) {
        const titleVal = readDateWhenField(title, timezone);
        if (titleVal) {
          return titleVal;
        }
      }

      return null;
    },
  };
}

export function pickFromTimestampData(
  attr: string = "data-timestamp",
  timezone?: string
) {
  return {
    attr,
    convert: (s: string) => {
      const dt = datefns.fromUnixTime(
        parseInt(s),
        timezone ? { in: tz(timezone) } : undefined
      );
      if (!Number.isNaN(dt) && datefns.isValid(dt)) {
        return dt;
      }
      return null;
    },
  };
}

export function pickWithRegex(
  regex: RegExp,
  selector?: string,
  attr?: string,
  position: number = 1,
  asNumber?: boolean
) {
  return {
    selector,
    attr,
    convert: (text: string) => {
      const res = regex.exec(text);
      if (!res || res.length < position + 1) {
        return undefined;
      }

      const val = res[position];
      if (asNumber) {
        return parseInt(val);
      }

      return val;
    },
  };
}

export function pickStaticValue<T>(value: T) {
  return {
    selector: ":root",
    how: () => value,
  };
}

export function ensureIdIsNumber(id: FAID): number {
  if (typeof id === "number") {
    return id;
  }

  return parseInt(id, 10);
}

/** Skip over the first sub element of a node to get the text after it */
export function readElementSkipContent(node: AnyNode): string | null {
  return (node?.next as Text)?.data?.trim();
}
