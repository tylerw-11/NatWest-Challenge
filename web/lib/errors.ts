/** Error with a plain-language message (reading age 9), thrown by api.ts and mockApi.ts. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public message_plain: string,
  ) {
    super(message_plain);
  }
}
