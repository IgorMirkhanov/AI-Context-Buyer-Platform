import { AsyncLocalStorage } from 'async_hooks';

export type RequestStore = {
  requestId: string;
};

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
