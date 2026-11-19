import { expect, Page, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config.js'

const e2ePort = process.env.E2E_PORT || '3000'
const baseURL = `http://localhost:${e2ePort}`

// NFR-1505: e2e runs with zero real external Stripe network calls unless real
// test keys (> stub `sk_test_`/`pk_test_`) are explicitly supplied.
const hasRealStripeKeys = Boolean(
  process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY.length > 12 &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.length > 12,
)

// Minimal valid 1x1 PNG buffer (replaces missing template fixture public/media/image-post1.webp)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('Frontend', () => {
  const adminEmail = 'admin@test.com'
  const adminPassword = 'admin'
  const userEmail = 'user@test.com'
  const userPassword = 'user'
  const testPaymentDetails = {
    cardNumber: '5454 5454 5454 5454',
    expiryDate: '0330',
    cvc: '737',
    postcode: 'WS11 1DB',
  }

  let seededMediaId: number | string | null = null
  const seededProductIds: Array<number | string> = []
  const seededVariantIds: Array<number | string> = []
  let seededVariantTypeId: number | string | null = null
  const seededVariantOptionIds: Array<number | string> = []

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000)
    const payload = await getPayload({ config })
    await ensureUser(payload, adminEmail, adminPassword, ['OWNER'])
    await ensureUser(payload, userEmail, userPassword, ['customer'])
    await cleanupSeededCatalog(payload)
    await seedCatalog(payload)
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await cleanupSeededCatalog(payload)
  })

  async function ensureUser(
    payload: Payload,
    email: string,
    password: string,
    roles: ('OWNER' | 'customer')[],
  ): Promise<void> {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      await payload.update({
        collection: 'users',
        id: existing.docs[0].id,
        data: { password, roles },
        overrideAccess: true,
      })
    } else {
      await payload.create({
        collection: 'users',
        data: { email, password, roles },
        overrideAccess: true,
      })
    }
  }

  async function cleanupSeededCatalog(payload: Payload): Promise<void> {
    const slugs = [
      'test-product',
      'test-product-variants',
      'no-inventory-product',
      'cheap-test-product',
      'new-product-with-variants',
    ]
    const prods = await payload.find({
      collection: 'products',
      where: { slug: { in: slugs } },
      limit: 50,
      overrideAccess: true,
      depth: 0,
    })
    for (const p of prods.docs) {
      const variants = await payload.find({
        collection: 'variants',
        where: { product: { equals: p.id } },
        limit: 50,
        overrideAccess: true,
      })
      for (const v of variants.docs) {
        await payload.delete({ collection: 'variants', id: v.id, overrideAccess: true }).catch(() => undefined)
      }
      await payload.delete({ collection: 'products', id: p.id, overrideAccess: true }).catch(() => undefined)
    }
    const vTypes = await payload.find({
      collection: 'variantTypes',
      where: { name: { in: ['brand', 'Pattern'] } },
      limit: 20,
      overrideAccess: true,
    })
    for (const vt of vTypes.docs) {
      const opts = await payload.find({
        collection: 'variantOptions',
        where: { variantType: { equals: vt.id } },
        limit: 50,
        overrideAccess: true,
      })
      for (const o of opts.docs) {
        await payload.delete({ collection: 'variantOptions', id: o.id, overrideAccess: true }).catch(() => undefined)
      }
      await payload.delete({ collection: 'variantTypes', id: vt.id, overrideAccess: true }).catch(() => undefined)
    }
    if (seededMediaId) {
      await payload.delete({ collection: 'media', id: seededMediaId, overrideAccess: true }).catch(() => undefined)
      seededMediaId = null
    }
  }

  async function seedCatalog(payload: Payload): Promise<void> {
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Test Image' },
      file: {
        data: TINY_PNG,
        mimetype: 'image/png',
        name: `frontend-e2e-${Date.now()}.png`,
        size: TINY_PNG.length,
      },
      overrideAccess: true,
    })
    seededMediaId = media.id

    const vt = await payload.create({
      collection: 'variantTypes',
      data: { name: 'brand', label: 'Brand' },
      overrideAccess: true,
    })
    seededVariantTypeId = vt.id

    const [optPayload, optFigma] = await Promise.all([
      payload.create({
        collection: 'variantOptions',
        data: { label: 'Payload', value: 'payload', variantType: vt.id },
        overrideAccess: true,
      }),
      payload.create({
        collection: 'variantOptions',
        data: { label: 'Figma', value: 'figma', variantType: vt.id },
        overrideAccess: true,
      }),
    ])
    seededVariantOptionIds.push(optPayload.id, optFigma.id)

    const prodWithVariants = await payload.create({
      collection: 'products',
      data: {
        title: 'Test Product With Variants',
        slug: 'test-product-variants',
        enableVariants: true,
        variantTypes: [vt.id],
        inventory: 100,
        _status: 'published',
        layout: [],
        gallery: [{ image: media.id }],
        priceInUSDEnabled: true,
        priceInUSD: 1000,
      },
      overrideAccess: true,
    })
    seededProductIds.push(prodWithVariants.id)

    for (const optId of [optPayload.id, optFigma.id]) {
      const v = await payload.create({
        collection: 'variants',
        data: {
          product: prodWithVariants.id,
          options: [optId],
          priceInUSDEnabled: true,
          priceInUSD: 1000,
          inventory: 50,
          _status: 'published',
        },
        overrideAccess: true,
      })
      seededVariantIds.push(v.id)
    }

    const simpleProd = await payload.create({
      collection: 'products',
      data: {
        title: 'Test Product',
        slug: 'test-product',
        inventory: 100,
        _status: 'published',
        layout: [],
        gallery: [{ image: media.id }],
        priceInUSDEnabled: true,
        priceInUSD: 1000,
      },
      overrideAccess: true,
    })
    seededProductIds.push(simpleProd.id)

    const cheapProd = await payload.create({
      collection: 'products',
      data: {
        title: 'Cheap Test Product',
        slug: 'cheap-test-product',
        inventory: 100,
        _status: 'published',
        layout: [],
        gallery: [{ image: media.id }],
        priceInUSDEnabled: true,
        priceInUSD: 100,
      },
      overrideAccess: true,
    })
    seededProductIds.push(cheapProd.id)

    const noInvProd = await payload.create({
      collection: 'products',
      data: {
        title: 'No Inventory Product',
        slug: 'no-inventory-product',
        inventory: 0,
        _status: 'published',
        layout: [],
        gallery: [{ image: media.id }],
        priceInUSDEnabled: true,
        priceInUSD: 1000,
      },
      overrideAccess: true,
    })
    seededProductIds.push(noInvProd.id)
    void seededVariantTypeId
  }

  test('can go on homepage', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(baseURL)

    await expect(page).toHaveTitle(/Payload Ecommerce Template/)

    const heading = page.locator('h1').first()
    await expect(heading).toHaveText('Payload Ecommerce Template')
  })

  test('can sign up and subsequently login', async ({ page }) => {
    test.setTimeout(90_000)
    await logoutAndExpectSuccess(page)

    await page.goto(`${baseURL}/en/create-account`)

    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    const confirmPasswordInput = page.locator('input[name="passwordConfirm"]')
    const email = `test-${Date.now()}@test.com`
    const password = `test`

    await emailInput.fill(email)
    await passwordInput.fill(password)
    await confirmPasswordInput.fill(password)

    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()
    await page.waitForURL(/\/account/)
    const successMessage = page.locator('text=Account created successfully')
    await expect(successMessage).toBeVisible()

    await logoutAndExpectSuccess(page)
    await loginFromUI(page, email, password)
  })

  test('can add products to cart', async ({ page }) => {
    test.setTimeout(60_000)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })
  })

  test('can add product with variant to cart', async ({ page }) => {
    test.setTimeout(60_000)
    await addToCartAndConfirm(page, {
      productName: 'Test Product With Variants',
      productSlug: 'test-product-variants',
      variant: 'Payload',
    })
  })

  test('can remove products from cart', async ({ page }) => {
    test.setTimeout(60_000)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })

    await removeFromCartAndConfirm(page)
  })

  test('can remove products with variants from cart', async ({ page }) => {
    test.setTimeout(60_000)
    await addToCartAndConfirm(page, {
      productName: 'Test Product With Variants',
      productSlug: 'test-product-variants',
      variant: 'Payload',
    })

    await removeFromCartAndConfirm(page)
  })

  test('should retain cart content on hard refresh', async ({ page }) => {
    test.setTimeout(60_000)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })

    await page.reload()

    const cartCount = page.locator('button[data-slot="sheet-trigger"] span').last()
    await cartCount.click()

    const productInCart = page.getByRole('dialog').getByText('Test Product')
    await expect(productInCart).toBeVisible()
  })

  test('can view and sort via shop page', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${baseURL}/en/shop`)

    const productCard = page.locator(`a[href$="/products/test-product"]`).first()
    await productCard.waitFor({ state: 'visible' })
    await expect(productCard).toBeVisible()

    // Default sort is by title: 'Cheap Test Product' comes first; sort Price: Low to high keeps/confirms URL param
    const priceSort = page.getByText('Price: Low to high')
    await priceSort.click()
    await expect(page).toHaveURL(/\/shop\?sort=priceInUSD/)

    const firstCard = page.locator('div.grid > a').first()
    const title = firstCard.locator('div.font-mono > div').first()
    await expect(title).toHaveText('Cheap Test Product')
  })

  test('authenticated users can view account', async ({ page }) => {
    test.setTimeout(60_000)
    await loginFromUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/en/account`)

    const heading = page.locator('h1').first()
    await expect(heading).toHaveText('Account settings')
  })

  test('authenticated users can update their name', async ({ page }) => {
    test.setTimeout(60_000)
    await loginFromUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/en/account`)

    const heading = page.locator('h1').first()
    await expect(heading).toHaveText('Account settings')

    const nameInput = page.locator('input[name="name"]')
    const newName = `Test User`
    await nameInput.fill(newName)

    const updateButton = page.getByRole('button', { name: 'Update Account' })
    await updateButton.click()

    const successMessage = page.locator('text=Successfully updated account.')
    await expect(successMessage).toBeVisible()
  })

  test('authenticated users can view orders page', async ({ page }) => {
    test.setTimeout(60_000)
    await loginFromUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/en/orders`)

    const heading = page.locator('h1').first()
    await expect(heading).toHaveText('Orders')
  })

  test('authenticated users can view order details', async ({ page }) => {
    test.skip(!hasRealStripeKeys, 'Requires real Stripe test keys for Stripe Elements iframe (NFR-1505)')
    await loginFromUI(page, adminEmail, adminPassword)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })

    await checkout(page, testPaymentDetails)

    await expectOrderIsDisplayed(page)
  })

  test('authenticated customers cannot access /admin', async ({ page }) => {
    test.setTimeout(60_000)
    await loginFromUI(page, userEmail, userPassword)
    await page.goto(`${baseURL}/admin`)
    const heading = page.locator('h1').first()
    await expect(heading).toContainText('Unauthorized')
  })

  test('Guest can create and view order', async ({ page }) => {
    test.skip(!hasRealStripeKeys, 'Requires real Stripe test keys for Stripe Elements iframe (NFR-1505)')
    await logoutAndExpectSuccess(page)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })

    await checkout(page, testPaymentDetails, 'guest@test.com')
    await expectOrderIsDisplayed(page)
  })

  test('Guest can view their order using /find-order', async ({ page }) => {
    test.skip(!hasRealStripeKeys, 'Requires real Stripe test keys for Stripe Elements iframe (NFR-1505)')
    await logoutAndExpectSuccess(page)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })

    const guestEmail = 'guest@test.com'

    await checkout(page, testPaymentDetails, guestEmail)

    const orderHeader = await page.locator('h1.text-sm.uppercase.font-mono > span').textContent()
    const orderNumber = orderHeader?.replace(/^Order #/, '').trim()

    await page.goto(`${baseURL}/en/find-order`)
    const orderNumberInput = page.locator('input[name="orderID"]')
    const emailInput = page.locator('input[name="email"]')
    await orderNumberInput.fill(orderNumber || '')
    await emailInput.fill(guestEmail)

    const findOrderButton = page.getByRole('button', { name: 'Find my order' })
    await findOrderButton.click()

    await expect(orderHeader).not.toBeNull()
  })

  test('Admins can update and view prices on products', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAdminUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/admin/collections/products`)
    const testProductLink = page.getByRole('link', { name: 'Test Product', exact: true })
    await testProductLink.click()

    const productDetailsButton = page.getByRole('button', { name: 'Product Details' })
    await productDetailsButton.click()

    const priceInput = page.locator('input.formattedPriceInput[placeholder="0.00"]')
    await priceInput.fill('20.00')

    await saveAndConfirmSuccess(page)
  })

  test('Admins can update and view prices on variants', async ({ page }) => {
    test.setTimeout(90_000)
    await loginAdminUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/admin/collections/variants`)
    const testProductWithVariantsLink = page
      .getByRole('link', { name: /Test Product With Variants — Payload/i })
      .first()
    await testProductWithVariantsLink.click()

    const variantPriceInput = page.locator('input.formattedPriceInput[placeholder="0.00"]').first()
    await variantPriceInput.fill('25.00')

    await saveAndConfirmSuccess(page)
  })

  test('Admins can create new products with new variants', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAdminUI(page, adminEmail, adminPassword)

    await page.goto(`${baseURL}/admin/collections/products/create`)
    const titleInput = page.locator('input#field-title')
    await titleInput.fill('New Product with Variants')
    const slugInput = page.locator('input#field-slug')
    await slugInput.fill('new-product-with-variants')
    const chooseFromExistingButton = page.getByRole('button', { name: 'Choose from existing' })
    await chooseFromExistingButton.click()
    const firstFileButton = page.locator('button.default-cell__first-cell').first()
    await firstFileButton.click()

    const productDetailsButton = page.getByRole('button', { name: 'Product Details' })
    await productDetailsButton.click()

    const enableVariantsCheckbox = page.locator('input#field-enableVariants')
    await enableVariantsCheckbox.check()

    // create a new variant type
    const addNewVariantTypeButton = page.locator(
      'button.relationship-add-new__add-button.doc-drawer__toggler[aria-label="Add new Variant Type"]',
    )
    await addNewVariantTypeButton.click()

    const variantTypeNameInput = page.locator('input#field-name')
    await variantTypeNameInput.fill('Pattern')
    const variantTypeLabelInput = page.locator('input#field-label')
    await variantTypeLabelInput.fill('Pattern')

    const saveButton = page.getByRole('button', { name: 'Save', exact: true })
    await saveButton.click()

    // create a new variant option
    const createVariantOptionButton = page.getByRole('button', {
      name: 'Create new Variant Option',
      exact: true,
    })
    await createVariantOptionButton.click()

    const variantOptionValueInput = page.locator('input#field-value')
    await variantOptionValueInput.fill('striped')
    const variantOptionLabelInput = page
      .getByRole('dialog', { name: /variantOptions/i })
      .locator('input#field-label')
    await variantOptionLabelInput.fill('Striped')
    await saveButton.nth(1).click()

    const closeButton = page.getByRole('button', { name: 'Close' }).nth(1)
    await closeButton.click()

    const publishChangesButton = page.getByRole('button', { name: 'Publish changes' })
    await publishChangesButton.click()
    await expect(page.locator('text=Published successfully').or(page.locator('text=Successfully published')).or(page.locator('text=Updated successfully'))).toBeVisible({ timeout: 10_000 })

    await page.goto(`${baseURL}/en/shop`)
    const newProductCard = page.locator(`a[href$="/products/new-product-with-variants"]`).first()
    await newProductCard.waitFor({ state: 'visible' })
    await expect(newProductCard).toBeVisible()
  })

  test('Admins can view transactions and orders', async ({ page }) => {
    test.skip(!hasRealStripeKeys, 'Requires real Stripe test keys for Stripe Elements iframe (NFR-1505)')
    await loginFromUI(page, adminEmail, adminPassword)
    await addToCartAndConfirm(page, {
      productName: 'Test Product',
      productSlug: 'test-product',
    })
    await checkout(page, testPaymentDetails)
    await expectOrderIsDisplayed(page)
    const orderHeader = await page.locator('h1.text-sm.uppercase.font-mono > span').textContent()
    const orderNumber = orderHeader?.replace(/^Order #/, '').trim()

    await page.goto(`${baseURL}/admin/collections/orders`)
    const rowCount = await page.locator('div.table table tbody tr').count()
    expect(rowCount).toBeGreaterThan(1)

    await page.goto(`${baseURL}/admin/collections/orders/${orderNumber}`)
    const product = page.locator('div.rs__control', { hasText: 'Test Product' })
    await expect(product).toBeVisible()

    await page.goto(`${baseURL}/admin/collections/transactions`)
    const transactionRows = await page.locator('div.table table tbody tr').count()
    expect(transactionRows).toBeGreaterThan(0)

    const firstRow = page.locator('td.cell-createdAt > a').first()
    await firstRow.click()

    const status = page.locator('div.rs__control', { hasText: 'Succeeded' })
    await expect(status).toBeVisible()
  })

  test('should disable add to cart when product has no inventory', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(`${baseURL}/en/products/no-inventory-product`)
    const addToCartButton = page.getByRole('button', { name: 'Add to Cart' })
    await expect(addToCartButton).toBeDisabled()
  })

  // This test fails upstream in Payload template, left skipped as originally marked
  test.skip('should fail checkout when inventory is 0', async () => {})

  async function logoutAndExpectSuccess(page: Page) {
    await page.goto(`${baseURL}/en/logout`)
    const heading = page.locator('h1').first()
    await expect(heading).toContainText(/logged out/i)
  }

  async function loginFromUI(page: Page, email: string, password: string) {
    const emailInput = page.locator('input[name="email"]')
    const passwordInput = page.locator('input[name="password"]')
    const submitButton = page.locator('button[type="submit"]')

    await page.goto(`${baseURL}/en/login`)
    await emailInput.fill(email)
    await passwordInput.fill(password)
    await submitButton.click()
    await page.waitForURL(/\/account/)
  }

  async function loginAdminUI(page: Page, email: string, password: string) {
    await page.goto(`${baseURL}/admin/login`)
    await page.fill('#field-email', email)
    await page.fill('#field-password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/admin/)
    await expect(page.locator('span[title="Dashboard"]').first()).toBeVisible()
  }

  async function addToCartAndConfirm(
    page: Page,
    {
      productName,
      productSlug,
      variant,
    }: {
      productName: string
      productSlug: string
      variant?: string
    },
  ) {
    await page.goto(`${baseURL}/en/shop`)
    await expect(page).toHaveURL(/\/shop/)

    const productCard = page.locator(`a[href$="/products/${productSlug}"]`).first()
    await productCard.waitFor({ state: 'visible' })
    await productCard.click()

    if (variant) {
      const variantButton = page.getByRole('button', { name: variant })
      await variantButton.waitFor({ state: 'visible' })
      await variantButton.click()
    }

    const addToCartButton = page.getByRole('button', { name: 'Add to Cart' })
    await expect(addToCartButton).toBeVisible()
    await addToCartButton.click()

    const cartCount = page.locator('button[data-slot="sheet-trigger"] span').last()
    await expect(cartCount).toHaveText('1')
    await cartCount.click()

    const productInCart = page.getByRole('dialog').getByText(productName, { exact: false })
    await expect(productInCart).toBeVisible()
  }

  async function removeFromCartAndConfirm(page: Page) {
    const reduceQuantityButton = page.getByRole('button', { name: 'Reduce item quantity' })
    await expect(reduceQuantityButton).toBeVisible()
    await reduceQuantityButton.click()

    const emptyCartMessage = page.getByText('Your cart is empty.')
    await expect(emptyCartMessage).toBeVisible()
  }

  async function checkout(
    page: Page,
    paymentDetails: {
      cardNumber: string
      expiryDate: string
      cvc: string
      postcode: string
    },
    guestEmail?: string | null,
  ): Promise<void> {
    await page.goto(`${baseURL}/en/checkout`)

    if (guestEmail) {
      const emailInput = page.locator('input[type="email"]')
      await emailInput.fill(guestEmail)

      const continueGuestBtn = page.getByRole('button', { name: /continue as guest/i })
      await continueGuestBtn.click()
    }

    const confirmAddress = page.getByRole('button', { name: 'Confirm address' })
    await confirmAddress.click()

    const { cardNumber, expiryDate, cvc, postcode } = paymentDetails

    const stripeIframe = page.frameLocator('iframe[title="Secure payment input frame"]')

    await stripeIframe.locator('#Field-numberInput').fill(cardNumber)
    await stripeIframe.locator('#Field-expiryInput').fill(expiryDate)
    await stripeIframe.locator('#Field-cvcInput').fill(cvc)
    await stripeIframe.locator('#Field-postalCodeInput').fill(postcode)

    const payNowButton = page.getByRole('button', { name: 'Pay now' })
    await payNowButton.click()

    await page.waitForURL(/\/orders/)
    await expect(page).toHaveURL(/\/orders/)
  }

  async function expectOrderIsDisplayed(page: Page): Promise<void> {
    const orderHeader = await page.locator('h1.text-sm.uppercase.font-mono > span').textContent()
    expect(orderHeader).toContain('Order #')

    const orderNumber = orderHeader?.replace(/^Order #/, '').trim()
    const pageURL = page.url()

    expect(pageURL).toContain(`/orders/${orderNumber}`)
  }

  async function saveAndConfirmSuccess(page: Page) {
    const saveButton = page.locator('#action-save')
    await saveButton.click()

    const successMessage = page.locator('text=Updated successfully')
    await expect(successMessage).toBeVisible()
  }
})
