'use client'

import { ProductForm } from '../product-form'

export function NewProductForm({
  categories,
  suppliers,
}: {
  categories: { id: string; name: string; slug: string }[]
  suppliers: { id: string; name: string }[]
}) {
  return (
    <ProductForm
      categories={categories}
      suppliers={suppliers}
      showPageHeader
    />
  )
}
