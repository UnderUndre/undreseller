import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { getSafeRedirect } from 'payload/shared'
import { timingSafeEqual } from 'node:crypto'

import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

import configPromise from '@payload-config'

export type PreviewSearchParams = {
  path: string
  previewSecret: string
}

/** Timing-safe secret compare (canon 007 FR-707): buffer length-guard +
 * timingSafeEqual; fail-closed when PREVIEW_SECRET is unset. */
function previewSecretMatches(provided: string | null): boolean {
  const expected = process.env.PREVIEW_SECRET
  if (!provided || !expected) return false
  const a = Buffer.from(provided, 'utf-8')
  const b = Buffer.from(expected, 'utf-8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  const { searchParams } = new URL(req.url)

  const path = searchParams.get('path')
  const previewSecret = searchParams.get('previewSecret')

  if (!previewSecretMatches(previewSecret)) {
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  if (!path) {
    return new Response('Insufficient search params', { status: 404 })
  }

  const safePath = getSafeRedirect({ fallbackTo: '', redirectTo: path })

  if (!safePath) {
    return new Response('This endpoint can only be used for relative previews', { status: 500 })
  }

  let user

  try {
    user = await payload.auth({
      req: req as unknown as PayloadRequest,
      headers: req.headers,
    })
  } catch (error) {
    payload.logger.error({ err: error }, 'Error verifying token for live preview')
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  const draft = await draftMode()

  if (!user) {
    draft.disable()
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  // You can add additional checks here to see if the user is allowed to preview this page

  draft.enable()

  redirect(safePath)
}
