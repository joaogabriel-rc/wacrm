import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Receives the short-lived code returned by the Meta Embedded Signup
 * popup, exchanges it for an access token, and resolves the WABA ID
 * and phone numbers shared by the user during the signup flow.
 *
 * The caller is expected to then call POST /api/whatsapp/config with
 * the resolved credentials to persist and register them.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // `waba_id` / `phone_number_id` come from the session info Meta
    // posts back to the browser during Embedded Signup. They name
    // exactly what the user picked, so when present they beat anything
    // inferred below. Both are optional: older clients, and flows where
    // the postMessage never arrived, still fall back to inference.
    const { code, waba_id: pickedWabaId, phone_number_id: pickedPhoneId } =
      await request.json()
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: 'Meta app credentials not configured on the server.' },
        { status: 500 }
      )
    }

    // 1. Exchange the short-lived code for an access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        `client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
    )
    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      console.error('[embedded-signup] Token exchange failed:', tokenData)
      return NextResponse.json(
        {
          error: 'Falha ao trocar código por token de acesso.',
          details: tokenData.error?.message ?? 'Unknown error',
        },
        { status: 400 }
      )
    }

    const accessToken: string = tokenData.access_token

    // 2. Inspect token granular scopes to find which WABA was shared
    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?` +
        `input_token=${encodeURIComponent(accessToken)}&` +
        `access_token=${appId}|${appSecret}`
    )
    const debugData = await debugRes.json()

    let wabaId: string | null = pickedWabaId ?? null
    const granularScopes: Array<{ scope: string; target_ids?: string[] }> =
      debugData.data?.granular_scopes ?? []

    for (const scope of granularScopes) {
      if (wabaId) break
      if (
        (scope.scope === 'whatsapp_business_management' ||
          scope.scope === 'whatsapp_business_messaging') &&
        scope.target_ids?.length
      ) {
        wabaId = scope.target_ids[0]
        break
      }
    }

    // Fallback: traverse business portfolios
    if (!wabaId) {
      const bizRes = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?` +
          `fields=whatsapp_business_accounts{id,name}&` +
          `access_token=${encodeURIComponent(accessToken)}`
      )
      const bizData = await bizRes.json()
      const firstWaba =
        bizData.data?.[0]?.whatsapp_business_accounts?.data?.[0]
      if (firstWaba?.id) wabaId = firstWaba.id
    }

    if (!wabaId) {
      return NextResponse.json(
        {
          error:
            'Nenhuma conta WhatsApp Business encontrada. Certifique-se de selecionar uma conta durante o fluxo.',
          debug: { scopes: granularScopes.map((s) => s.scope) },
        },
        { status: 400 }
      )
    }

    // 3. List phone numbers in the resolved WABA
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?` +
        `fields=id,display_phone_number,verified_name,status,quality_rating&` +
        `access_token=${encodeURIComponent(accessToken)}`
    )
    const phoneData = await phoneRes.json()

    // Surface the picked number first so the client doesn't have to
    // guess when the WABA holds several.
    const phoneNumbers: Array<{ id: string }> = phoneData.data ?? []
    const ordered = pickedPhoneId
      ? [
          ...phoneNumbers.filter((p) => p.id === pickedPhoneId),
          ...phoneNumbers.filter((p) => p.id !== pickedPhoneId),
        ]
      : phoneNumbers

    return NextResponse.json({
      access_token: accessToken,
      waba_id: wabaId,
      phone_numbers: ordered,
    })
  } catch (error) {
    console.error('[embedded-signup] Unhandled error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
