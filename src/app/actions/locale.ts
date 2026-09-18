'use server';

import { cookies } from 'next/headers';

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  type Locale,
} from '@/lib/locales';

/**
 * Persist the user's interface language.
 *
 * The cookie is read back by `src/i18n/request.ts` on the next render,
 * so callers should follow this with `router.refresh()` to pull the new
 * dictionary. Not httpOnly — nothing sensitive, and keeping it readable
 * leaves the door open for a client-side no-flash boot script later.
 */
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  });
}
