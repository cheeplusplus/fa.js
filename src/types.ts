// Type definitions

export interface ClientConfig {
  cookies?: string;
  throwErrors?: boolean;
  disableRetry?: boolean;
  httpClient?: HttpClient;
}

export interface HttpClient {
  fetch(url: string, config?: HttpClientConfig): Promise<StandardHttpResponse>;
}

export interface HttpClientConfig {
  cookies?: string;
  method?: "GET" | "POST";
  body?: { [key: string]: string | number | (string | number)[] };
  "content-type"?: string;
}

export interface StandardHttpResponse {
  statusCode: number;
  body: string;
}

// FA types

export type FAID = string | number;

export interface CommentText {
  id: number;
  body_text: string;
  body_html: string;
}

export interface Comment extends CommentText {
  self_link: string;
  user_name: string;
  user_url: string;
  user_thumb_url: string;
  when: Date;
}

export interface SubmissionListing {
  id: number;
  self_link: string;
  title: string;
  artist_name: string;
  thumb_url: string;
  when: Date;
}

export interface Submissions {
  self_link: string;
  submissions: SubmissionListing[];
}

export interface SubmissionPage extends Submissions {
  previousPage: string;
  nextPage: string;
}

export interface Submission {
  id: number;
  self_link: string;
  type: "image" | "flash" | "story" | "music";
  title: string;
  thumb_url: string;
  content_url: string;
  artist_name: string;
  artist_url: string;
  artist_thumb_url: string;
  body_text: string;
  body_html: string;
  when: Date;
  keywords: string;
  nav_items: number[];
  comments: Comment[];
}

export interface Navigation {
  previous?: number;
  next?: number;
}

export interface UserPage {
  user_name: string; // Fancy version of username string
  self_link: string;
  user_thumb_url: string;
  header_text: string;
  header_html: string;
  statistics_text: string;
  statistics_html: string;
  featured_submission?: {
    id: number;
    self_link: string;
    title: string;
    thumb_url: string;
  };
  latest_submissions: {
    id: number;
    self_link: string;
    // "title": string; // TODO: Pull these out of the page's submission_data variable
    thumb_url: string;
    when: Date;
  }[];
  favorites: {
    id: number;
    self_link: string;
    // "title": string;
    // "artist_name": string;
    thumb_url: string;
    when: Date;
  }[];
  top_journal?: {
    id: number;
    self_link: string;
    title: string;
    body_text: string;
    body_html: string;
    when: Date;
    comment_count: number;
  };
  profile_id?: {
    id: number;
    self_link: string;
    thumb_url: string;
    when: Date;
  };
  artist_information: { title: string; value: string }[];
  contact_information: { service: string; link: string; value: string }[];
  shouts: {
    id: number;
    user_name: string;
    user_url: string;
    user_thumb_url: string;
    body_text: string;
    body_html: string;
    when: Date;
  }[];
}

export interface Messages {
  my_username: string;
  watches: {
    id: number;
    user_name: string;
    user_url: string;
    user_thumb_url: string;
    when: Date;
  }[];
  comments: {
    id: number;
    submission_id: number;
    submission_title: string;
    submission_url: string;
    user_name: string;
    user_url: string;
    when: Date;
  }[];
  journal_comments: {
    id: number;
    title: string;
    url: string;
    journal_id: number;
    user_name: string;
    user_url: string;
    when: Date;
  }[];
  shouts: {
    id: number;
    user_name: string;
    user_url: string;
    when: Date;
  }[];
  favorites: {
    id: number;
    submission_id: number;
    submission_title: string;
    submission_url: string;
    user_name: string;
    user_url: string;
    when: Date;
  }[];
  journals: {
    id: number;
    journal_title: string;
    journal_url: string;
    user_name: string;
    user_url: string;
    when: Date;
  }[];
}

export interface Watchlist {
  self_link: string;
  user_name: string;
  users: {
    user_name: string;
    user_url: string;
  }[];
  nextPage?: string;
  previousPage?: string;
}

export interface Journal {
  id: number;
  self_link: string;
  title: string;
  user_name: string;
  user_url: string;
  user_thumb_url: string;
  body_text: string;
  body_html: string;
  when: Date;
  comments: Comment[];
}

export interface Journals {
  self_link: string;
  user_name: string;
  journals: {
    id: number;
    self_link: string;
    title: string;
    body_text: string;
    body_html: string;
    when: Date;
    comment_count: number;
  }[];
  nextPage?: string;
  previousPage?: string;
}

export interface Notes {
  notes: {
    id: number;
    self_link: string;
    title: string;
    user_name: string;
    user_url: string;
    unread: boolean;
    when: Date;
  }[];
}

export interface Note {
  id: number;
  self_link: string;
  title: string;
  user_name: string;
  user_url: string;
  body_text: string;
  body_html: string;
  when: Date;
}

export type NoteMoveAction = "unread" | "restore" | "archive" | "trash";

export interface SubmissionStatistic {
  id: number;
  submission_title: string;
  submission_url: string;
  thumb_url: string;
  when: Date;
  views: number;
  favorites: number;
  comments: number;
  keywords: string[];
}

export interface SubmissionStatistics {
  statistics: SubmissionStatistic[];
}

type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> &
  U[keyof U];

export interface SearchQueryParams {
  perpage: SearchQueryBody["perpage"];
  order_by: SearchQueryBody["order-by"];
  order_dir: SearchQueryBody["order-direction"];
  range: SearchQueryBody["range"];
  ratings: AtLeastOne<{
    general: boolean;
    mature: boolean;
    adult: boolean;
  }>;
  types: AtLeastOne<{
    art: boolean;
    flash: boolean;
    photo: boolean;
    music: boolean;
    story: boolean;
    poetry: boolean;
  }>;
  mode: SearchQueryBody["mode"];
}

export type SearchQueryBody = {
  q: string;
  page: number;
  perpage: 24 | 48 | 72;
  "order-by": "relevancy" | "date" | "popularity";
  "order-direction": "desc" | "asc";
  do_search: "Search";
  range:
    | "24hours"
    | "72hours"
    | "30days"
    | "90days"
    | "1year"
    | "3years"
    | "5years"
    | "all";
  "rating-general"?: "on";
  "rating-mature"?: "on";
  "rating-adult"?: "on";
  "type-art"?: "on";
  "type-flash"?: "on";
  "type-photo"?: "on";
  "type-music"?: "on";
  "type-story"?: "on";
  "type-poetry"?: "on";
  mode: "any" | "all" | "extended";
};

export interface SearchPage {
  submissions: SubmissionListing[];
  more: boolean;
}

// Meta

export interface TypedScrapeOptionList<T> {
  listItem: string;
  data?: TypedScrapeOptions<T>;
  convert?: (value: any) => any;
  how?: string | ((element: cheerio.Selector) => any);
}

// tslint:disable-next-line: array-type
type Unarray<T> = T extends Array<infer U> ? U : T;

type TypedScrapeOptions<T> =
  | {
      [P in keyof T]:
        | string
        | TypedScrapeOptionList<Unarray<T[P]>>
        | import("scrape-it").ScrapeOptionElement;
    }
  | { value?: any };

export interface DualScrapeOptions<T> {
  classic: TypedScrapeOptions<T>;
  beta: TypedScrapeOptions<T>;
  configuration?: FetchConfig;
}

export type FetchConfig = Pick<
  HttpClientConfig,
  "method" | "body" | "content-type"
>;
