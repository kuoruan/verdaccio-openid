import { authorizePath, callbackPath } from "./constants";

/**
 * Build the authorize endpoint for a flow.
 *
 * @param id the flow id, omitted for the web UI flow
 * @returns the endpoint path
 */
export function getAuthorizePath(id?: string) {
  return `${authorizePath}${id ? `/${id}` : ""}`;
}

/**
 * Build the callback endpoint for a flow.
 *
 * @param id the flow id, omitted for the web UI flow
 * @returns the endpoint path
 */
export function getCallbackPath(id?: string) {
  return `${callbackPath}${id ? `/${id}` : ""}`;
}
