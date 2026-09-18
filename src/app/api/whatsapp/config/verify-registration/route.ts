import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  getSubscribedApps,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'

/**
 * GET /api/whatsapp/config/verify-registration
 *
 * Diagnostic endpoint — confirms the user's saved phone number is
 * actually reachable on Meta's side. Solves the failure mode that
 * surfaced the multi-number bug originally: "UI says Connected but
 * Meta isn't delivering events."
 *
 * The checks run independently so the UI can show which step passes
 * and which fails:
 *
 *   1. phone_info  — GET /{phone_number_id} succeeds
 *   2. waba_subscription — our app appears in
 *                    GET /{waba_id}/subscribed_apps
 *   3. registered_at — local timestamp set by POST /config when
 *                    /register last succeeded; NULL means the
 *                    number was saved but never actually subscribed
 *   4. server_accepts_webhooks — META_APP_SECRET is present. Meta
 *                    signs every webhook POST with it and the route
 *                    fails closed, so without it each delivery is
 *                    rejected 401 and no message ever lands.
 *   5. app_webhook_* — the app's own webhook registration: is a
 *                    callback URL set, does it point at THIS
 *                    deployment, and is `messages` among the
 *                    subscribed fields.
 *
 * 4 and 5 are the ones that matter when every Meta-side check is green
 * and the inbox is still empty: 1–3 describe Meta's state, and the
 * failure lives on the last hop into this server.
 *
 * Returns 200 in every case so the UI can render diagnostic detail
 * rather than a generic error toast. The combined `live` flag is
 * what the UI badges on.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // whatsapp_config is one-row-per-account post-017. Resolve the
  // caller's account_id so a teammate who joined an existing account
  // sees the same registration state as the admin who set it up.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const accountId = profile?.account_id as string | undefined
  if (!accountId) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'Your profile is not linked to an account.',
    })
  }

  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!config) {
    return NextResponse.json({
      live: false,
      checks: { config_exists: false },
      message: 'No WhatsApp configuration saved yet.',
    })
  }

  let accessToken: string
  try {
    accessToken = decrypt(config.access_token)
  } catch {
    return NextResponse.json({
      live: false,
      checks: {
        config_exists: true,
        token_decryptable: false,
      },
      message:
        'Stored access token can\'t be decrypted — likely ENCRYPTION_KEY changed. Re-enter the token to repair.',
    })
  }

  const checks: {
    config_exists: boolean
    token_decryptable: boolean
    phone_metadata_ok: boolean
    waba_subscribed_to_app: boolean | null
    locally_marked_registered: boolean
    server_accepts_webhooks: boolean
    app_webhook_configured: boolean | null
    app_webhook_points_here: boolean | null
    app_subscribed_to_messages: boolean | null
  } = {
    config_exists: true,
    token_decryptable: true,
    phone_metadata_ok: false,
    waba_subscribed_to_app: null,
    locally_marked_registered: config.registered_at != null,
    server_accepts_webhooks: false,
    app_webhook_configured: null,
    app_webhook_points_here: null,
    app_subscribed_to_messages: null,
  }
  const errors: string[] = []

  // 1. Phone metadata
  try {
    await verifyPhoneNumber({
      phoneNumberId: config.phone_number_id,
      accessToken,
    })
    checks.phone_metadata_ok = true
  } catch (err) {
    errors.push(
      `Phone metadata check failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 2. WABA subscription — only meaningful if we have a waba_id
  if (config.waba_id) {
    try {
      const subs = await getSubscribedApps({
        wabaId: config.waba_id,
        accessToken,
      })
      // Meta returns the apps subscribed to this WABA. If the list
      // is non-empty, OUR app is in there (the access_token we used
      // belongs to our app — Meta wouldn't return data for an app
      // the token can't see). Treat any entry as success.
      checks.waba_subscribed_to_app = subs.length > 0
      if (!checks.waba_subscribed_to_app) {
        errors.push(
          'WABA has no subscribed apps. Re-save the configuration to subscribe.',
        )
      }
    } catch (err) {
      errors.push(
        `WABA subscription check failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  } else {
    errors.push(
      'No WABA ID on file — webhooks can\'t be wired without it. Add it in the form and re-save.',
    )
  }

  // 3. Can this server accept a delivery at all?
  //
  // Meta HMAC-signs every webhook POST with the app secret, and
  // lib/whatsapp/webhook-signature.ts fails closed by design. A missing
  // secret therefore rejects 100% of inbound messages with a 401 while
  // every Meta-side check above still reports green — the number really
  // is registered, the WABA really is subscribed, and the events really
  // are being sent. They just bounce at the door.
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  checks.server_accepts_webhooks = Boolean(appSecret)

  if (!appSecret) {
    errors.push(
      'META_APP_SECRET is not set on this server. Meta signs every webhook ' +
        'delivery with it, and the webhook rejects unsigned requests, so no ' +
        'inbound message can reach the inbox until it is configured. Add it ' +
        'to your hosting environment variables (Meta → App settings → Basic ' +
        '→ App secret) and redeploy.',
    )

    // Names only, never values. A secret that was added under a slightly
    // wrong name — a typo, a stray space, a NEXT_PUBLIC_ prefix — is
    // indistinguishable from one that was never added at all, and on a
    // hosted platform there is no shell to go and look. Listing what the
    // runtime actually sees separates the two in one click.
    const metaVars = Object.keys(process.env)
      .filter((k) => /META/i.test(k))
      .sort()
    errors.push(
      metaVars.length
        ? `META-related variables this server can see: ${metaVars.join(', ')}. ` +
            'If the secret is in that list under another name, rename it to ' +
            'META_APP_SECRET exactly.'
        : 'This server sees no META-related environment variable at all, so ' +
            'the value was never applied to the running deployment. On Vercel, ' +
            'adding a variable does not affect deployments that are already ' +
            'live — redeploy after saving it, and check it is enabled for the ' +
            'Production environment.',
    )
  } else if (!appId) {
    errors.push(
      'NEXT_PUBLIC_META_APP_ID is not set, so the app webhook registration ' +
        'could not be checked.',
    )
  } else {
    // 4. The app's own webhook registration. Read with an app access
    // token (`{id}|{secret}`) — this is app-level config, not WABA-level,
    // so the user's access token can't see it.
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${appId}/subscriptions` +
          `?access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      )
      const payload = (await res.json()) as {
        data?: Array<{
          object?: string
          callback_url?: string
          active?: boolean
          fields?: Array<{ name?: string } | string>
        }>
        error?: { message?: string }
      }

      if (payload.error) {
        errors.push(`App webhook check failed: ${payload.error.message}`)
      } else {
        const wa = (payload.data ?? []).find(
          (o) => o.object === 'whatsapp_business_account',
        )
        checks.app_webhook_configured = Boolean(wa?.callback_url)

        if (!wa) {
          errors.push(
            'This Meta app has no webhook registered for ' +
              'whatsapp_business_account. Set the callback URL and verify ' +
              'token in Meta → WhatsApp → Configuration.',
          )
        } else {
          const fields = (wa.fields ?? []).map((f) =>
            typeof f === 'string' ? f : (f.name ?? ''),
          )
          checks.app_subscribed_to_messages = fields.includes('messages')
          if (!checks.app_subscribed_to_messages) {
            errors.push(
              'The app webhook is not subscribed to the `messages` field, so ' +
                'Meta sends no inbound messages. Subscribe to it in Meta → ' +
                'WhatsApp → Configuration → Webhook fields.',
            )
          }

          // A callback URL pointing at another deployment (a tunnel left
          // over from local development is the usual one) sends every
          // event somewhere else, with nothing here to show for it.
          const expected = new URL('/api/whatsapp/webhook', request.url).href
          checks.app_webhook_points_here = wa.callback_url === expected
          if (!checks.app_webhook_points_here) {
            errors.push(
              `The app webhook points at ${wa.callback_url ?? '(none)'}, not ` +
                `${expected}. Events are being delivered to that address ` +
                'instead of this one.',
            )
          }
        }
      }
    } catch (err) {
      errors.push(
        `App webhook check failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const live =
    checks.phone_metadata_ok &&
    (checks.waba_subscribed_to_app ?? false) &&
    checks.locally_marked_registered &&
    checks.server_accepts_webhooks &&
    (checks.app_subscribed_to_messages ?? false)

  return NextResponse.json({
    live,
    checks,
    errors,
    last_registration_error: config.last_registration_error ?? null,
    registered_at: config.registered_at ?? null,
    subscribed_apps_at: config.subscribed_apps_at ?? null,
  })
}
