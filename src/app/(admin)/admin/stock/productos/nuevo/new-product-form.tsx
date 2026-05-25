'use client'

import { ProductForm } from '../product-form'

export function NewProductForm({
  categories,
  suppliers,
}: {
  categories: { id: string; name: string; slug: string; product_type?: string | null; parent_id?: string | null; is_visible_web?: boolean | null }[]
  suppliers: { id: string; name: string; nif_cif?: string | null; supplier_code?: string | null }[]
}) {
  return (
    <ProductForm
      categories={categories}
      suppliers={suppliers}
      showPageHeader
    />
  )
}
