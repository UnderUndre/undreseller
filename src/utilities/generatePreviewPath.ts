import { PreviewSearchParams } from '@/app/[locale]/next/preview/route'
import { PayloadRequest, CollectionSlug } from 'payload'

// Baseline fix (spec 001-reinit TC-001-001): template referenced a `(frontend)`
// route group and a `posts` collection that do not exist in this checkout —
// this repo serves the storefront from `(app)` and ships pages/products only.
const collectionPrefixMap: Partial<Record<CollectionSlug, string>> = {
  pages: '',
  products: '/products',
}

type Props = {
  collection: keyof typeof collectionPrefixMap
  slug: string
  req: PayloadRequest
}

export const generatePreviewPath = ({ collection, slug }: Props) => {
  if (slug === undefined || slug === null) {
    return null
  }

  // Encode to support slugs with special characters
  const encodedSlug = encodeURIComponent(slug)

  const encodedParams = new URLSearchParams({
    path: `${collectionPrefixMap[collection]}/${encodedSlug}`,
    previewSecret: process.env.PREVIEW_SECRET || '',
  } satisfies PreviewSearchParams)

  const url = `/next/preview?${encodedParams.toString()}`

  return url
}
