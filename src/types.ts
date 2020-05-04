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
    "when_title": string;
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
    "id": number;
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
    "nav_items": number[];
    "comments": Comment[];
}

export interface Navigation {
    "previous"?: number;
    "next"?: number;
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
        "when_title": string;
    }>;
    "comments": Array<{
        "id": number;
        "title": string;
        "url": string;
        "submission_id": number;
        "user_name": string;
        "user_url": string;
        "when": string;
        "when_title": string;
    }>;
    "shouts": Array<{
        "id": number;
        "user_name": string;
        "user_url": string;
        "when": string;
        "when_title": string;
    }>;
    "favorites": Array<{
        "id": number;
        "title": string;
        "url": string;
        "user_name": string;
        "user_url": string;
        "when": string;
        "when_title": string;
    }>;
    "journals": Array<{
        "id": number;
        "title": string;
        "url": string;
        "user_name": string;
        "user_url": string;
        "when": string;
        "when_title": string;
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
    "when_title": string;
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
        "when_title": string;
    }>;
}

export interface Note {
    "title": string;
    "user_name": string;
    "user_url": string;
    "body_text": string;
    "body_html": string;
    "when": string;
    "when_title"?: string;
}

// Meta

export interface TypedScrapeOptionList<T> {
    listItem: string;
    data?: TypedScrapeOptions<T>;
    convert?: (value: any) => any;
}

type Unarray<T> = T extends Array<infer U> ? U : T;

type TypedScrapeOptions<T> = {
    [P in keyof T]: string | TypedScrapeOptionList<Unarray<T[P]>> | import("scrape-it").ScrapeOptionElement;
} | { value?: any };

export interface DualScrapeOptions<T> {
    classic: TypedScrapeOptions<T>;
    beta: TypedScrapeOptions<T>;
}
