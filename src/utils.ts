import type * as cheerio from "cheerio";
import * as datefns from "date-fns";
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

function readDateWhenField(field: string): Date | null {
  if (!field) {
    return null;
  }

  // Strip out field prefix
  if (field.startsWith("on ")) {
    field = field.substring(3);
  }

  // Try all known date formats
  for (const format of dateFormats) {
    // WARNING: We do not know the timezone we're reading at any given point
    const parsedDate = datefns.parse(field, format, new Date());
    if (datefns.isValid(parsedDate)) {
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

export function pickDateFromThumbnail(
  selector: string = "img",
  attr: string = "src"
) {
  return {
    selector,
    attr,
    convert: (source: string) => {
      const res = thumbnailRegex.exec(source);
      if (!res || res.length < 4) {
        return undefined;
      }

      const timestamp = parseInt(res[3], 10);
      return new Date(timestamp * 1000);
    },
  };
}

export function pickWhenFromSpan(selector: string) {
  return {
    selector,
    how: (source: cheerio.Cheerio<AnyNode>) => {
      const text = source.text();
      const title = source.attr("title");

      if (text) {
        const textVal = readDateWhenField(text);
        if (textVal) {
          return textVal;
        }
      }

      if (title) {
        const titleVal = readDateWhenField(title);
        if (titleVal) {
          return titleVal;
        }
      }

      return null;
    },
  };
}

export function pickFromTimestampData(attr: string = "data-timestamp") {
  return {
    attr,
    convert: (s: string) => datefns.fromUnixTime(parseInt(s)),
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
