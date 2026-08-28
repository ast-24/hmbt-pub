import { api } from "@ast24/hmbt-v5-lib";
import { type Context, type Hono } from "hono";

import { toErrorResponse } from "../http";

export type RouteHandler = (c: Context) => Promise<Response>;

export type EndpointRegistrar = (
  endpoint: api.endpoints.APIEndpoint,
  handler: RouteHandler,
) => void;

function wrap(handler: RouteHandler): (c: Context) => Promise<Response> {
  return async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      return await toErrorResponse(c, error);
    }
  };
}

export function createEndpointRegistrar(app: Hono): EndpointRegistrar {
  return (endpoint, handler) => {
    const endpointDef = api.endpoints.API_ENDPOINTS[endpoint];
    const path = api.endpoints.intoHonoPath(endpointDef);
    const wrapped = wrap(handler);

    switch (endpointDef.method) {
      case "GET":
        app.get(path, wrapped);
        break;
      case "POST":
        app.post(path, wrapped);
        break;
      case "PUT":
        app.put(path, wrapped);
        break;
      case "DELETE":
        app.delete(path, wrapped);
        break;
    }
  };
}
