import type { StandardHttpResponse } from "./types";

const ERROR_MATCHERS: { [errorText: string]: number } = {
  "Please log in": 401,
  "You are allowed to views the statistics of your own account alone": 403,
  "This user has voluntarily disabled access to their userpage": 403,
  "is not in our database": 404,
  "was not found in our database": 404,
  "been deleted or is not yours": 404,
  "This user cannot be found": 404,
  "For more information please check the": 500,
  "The server is currently having difficulty responding to all requests.": 503,
};

export function checkErrors(res: StandardHttpResponse): number {
  if (res.statusCode !== 200) {
    return res.statusCode;
  }

  for (const errMsg in ERROR_MATCHERS) {
    const errStatus = ERROR_MATCHERS[errMsg];
    if (res.body.includes(errMsg)) {
      return errStatus;
    }
  }

  return 200;
}

export class FurAffinityError extends Error {
  constructor(
    message: string,
    private status: number,
    private url: string,
    private body: string
  ) {
    super(message);
  }
}
