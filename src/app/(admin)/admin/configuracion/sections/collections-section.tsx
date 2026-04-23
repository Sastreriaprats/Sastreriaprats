'use client'

import { Layers } from 'lucide-react'
import { TaxonomySection } from './taxonomy-section'
import {
  listCollectionsAdmin,
  createCollection,
  updateCollection,
  deleteCollection,
} from '@/actions/product-taxonomies'

export function CollectionsSection() {
  return (
    <TaxonomySection
      label="Colección"
      labelPlural="Colecciones"
      taxonomy="collection"
      icon={<Layers className="h-5 w-5 text-muted-foreground" />}
      listAction={listCollectionsAdmin}
      createAction={createCollection}
      updateAction={updateCollection}
      deleteAction={deleteCollection}
    />
  )
}
