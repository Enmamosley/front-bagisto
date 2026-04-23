import { cache as reactCache } from "react";
import { GRAPHQL_URL } from "@/utils/constants";
import {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  from,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { getSession } from "next-auth/react";
import { getCartToken } from "@/utils/getCartToken";
import { BagistoSession } from "@/types/types";



let sessionCache: { session: BagistoSession | null; timestamp: number } | null = null;
const SESSION_CACHE_TTL = 5000;

const getSessionForRequest = reactCache(async () => {
  return (await getSession()) as BagistoSession | null;
});

async function getCachedSession(): Promise<BagistoSession | null> {
  if (typeof window === "undefined") {
    return getSessionForRequest();
  }

  const now = Date.now();

  if (sessionCache && now - sessionCache.timestamp < SESSION_CACHE_TTL) {
    return sessionCache.session;
  }
  const session = (await getSession()) as BagistoSession | null;
  sessionCache = { session, timestamp: now };
  return session;
}

function resolveGraphqlUri(ssrMode: boolean): string {
  const clientUri = "/api/graphql";

  if (!ssrMode) {
    return clientUri;
  }

  const configuredUri =
    process.env.GRAPHQL_URL ||
    process.env.BAGISTO_GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    GRAPHQL_URL;

  if (configuredUri && /^https?:\/\//i.test(configuredUri)) {
    return configuredUri;
  }

  const serverBaseUrl =
    process.env.NEXT_PUBLIC_NEXT_AUTH_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.DEPLOY_URL ||
    `http://localhost:${process.env.PORT || "3000"}`;

  try {
    return new URL(configuredUri || clientUri, serverBaseUrl).toString();
  } catch {
    return new URL(clientUri, `http://localhost:${process.env.PORT || "3000"}`).toString();
  }
}

function createApolloClient() {
  const ssrMode = typeof window === "undefined";
  const cache = new InMemoryCache();
  const uri = resolveGraphqlUri(ssrMode);

  const httpLink = new HttpLink({
    uri,
    credentials: "include",
  });

  const authLink = setContext(async (_, { headers }) => {
    if (ssrMode) {
      const storefrontKey =
        process.env.BAGISTO_STOREFRONT_KEY ||
        process.env.NEXT_PUBLIC_BAGISTO_STOREFRONT_KEY ||
        "";

      return {
        headers: {
          ...headers,
          "X-STOREFRONT-KEY": storefrontKey,
        },
      };
    }

    const session = await getCachedSession();
    const userToken = session?.user?.accessToken;
    const guestToken = !userToken ? getCartToken() : null;
    const token = userToken || guestToken;

    return {
      headers: {
        ...headers,
        ...(token && { Authorization: `Bearer ${token}` }),
        "Content-Type": "application/json",
      },
    };
  });

  const link = from([authLink, httpLink]);

  return new ApolloClient({
    ssrMode,
    link,
    cache,
    defaultOptions: {
      watchQuery: {
        fetchPolicy: ssrMode ? "network-only" : "cache-first",
        nextFetchPolicy: ssrMode ? "network-only" : "cache-first",
      },
      query: {
        fetchPolicy: ssrMode ? "network-only" : "cache-first",
      },
    },
  });
}

const getClient = reactCache(createApolloClient);

export default function initializeApollo() {
  if (typeof window === "undefined") {
    return getClient();
  }
  return createApolloClient();
}
