"use client";

import { useState, useRef } from "react";
import { fetchHandler } from "../fetch-handler";
import { GUEST_CART_ID, GUEST_CART_TOKEN, IS_GUEST } from "@/utils/constants";
import { encodeJWT, decodeJWT } from "@/utils/jwt-cookie";
import { setCookie, deleteCookie, getNativeCookie } from "../getCartToken";



// ---------------------------
// Main Hook
// ---------------------------
export const useGuestCartToken = () => {
  const getDecodedGuestSession = () => {
    const cookieToken = getNativeCookie(GUEST_CART_TOKEN);

    if (!cookieToken) {
      return null;
    }

    const isGuest = getNativeCookie(IS_GUEST) !== "false";

    return decodeJWT<{
      sessionToken: string;
      cartId: number;
      isGuest: boolean;
    }>(cookieToken, isGuest);
  };

  const [token, setToken] = useState<string | null>(() => {
    const decoded = getDecodedGuestSession();

    return decoded?.sessionToken ?? null;
  });

  const [cartId, setCartId] = useState<number | null>(() => {
    const decoded = getDecodedGuestSession();

    return decoded?.cartId ?? null;
  });

  const [isReady] = useState(true);

  const isResettingRef = useRef(false);
  const tokenCreatedRef = useRef(false);
  const tokenPromiseRef = useRef<Promise<string | null> | null>(null);

  const createGuestToken = async (): Promise<string | null> => {
    if (tokenPromiseRef.current) return tokenPromiseRef.current;

    tokenPromiseRef.current = (async () => {
      if (tokenCreatedRef.current) {
        // Return existing raw token from cookie
        const cookieVal = getNativeCookie(GUEST_CART_TOKEN);
        if (cookieVal) {
          const isGuest = getNativeCookie(IS_GUEST) !== "false";
          const decoded = decodeJWT<{ sessionToken: string }>(cookieVal, isGuest);
          return decoded?.sessionToken ?? null;
        }
        return null;
      }
      tokenCreatedRef.current = true;

      try {
        const res = await fetchHandler({
          url: "graphql",
          method: "POST",
          body: { operationName: "CreateCart" },
          contentType: true,
        });

        const cart = res?.data?.createCartToken?.cartToken;
        if (!cart) {
          tokenCreatedRef.current = false;
          return null;
        }

        const newToken = encodeJWT({
          sessionToken: cart.sessionToken,
          cartId: cart.id,
          isGuest: cart.isGuest,
        });
        const newCartId = Number(cart.id);

        setCookie(GUEST_CART_TOKEN, newToken);
        setCookie(GUEST_CART_ID, String(newCartId));
        setCookie(IS_GUEST, String(cart?.isGuest));

        // State and return should be the RAW token
        setToken(cart.sessionToken);
        setCartId(newCartId);
        return cart.sessionToken;
      } catch (e) {
        console.error("Error creating guest token:", e);
        tokenCreatedRef.current = false;
        return null;
      } finally {
        tokenPromiseRef.current = null;
      }
    })();

    return tokenPromiseRef.current;


  };

  const resetGuestToken = async () => {
    if (isResettingRef.current) return;
    isResettingRef.current = true;

    tokenCreatedRef.current = false;

    // delete old
    deleteCookie(GUEST_CART_TOKEN);
    deleteCookie(GUEST_CART_ID);

    await createGuestToken();

    isResettingRef.current = false;
  };

  return {
    token,
    cartId,
    isReady,
    createGuestToken,
    resetGuestToken,
    deleteCookie,
  };
};
