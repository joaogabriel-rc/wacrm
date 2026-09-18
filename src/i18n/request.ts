import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from '@/lib/locales';

export default getRequestConfig(async () => {
  // The user's pick (a cookie set by the Appearance panel) wins over
  // the deployment-wide NEXT_PUBLIC_APP_LOCALE default. Resolved here,
  // on the server, so the right dictionary is in the very first render
  // — a client-side swap would flash the wrong language on every load.
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    // Fallback to English if the dictionary for the requested locale doesn't exist yet
    messages = (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
  }

  return {
    locale,
    messages
  };
});
