'use client'

/**
 * Editor WYSIWYG TipTap para el admin del blog.
 *
 * Producía HTML directo (no Markdown) compatible con el render público de
 * /blog/[slug], que ya hace DOMPurify.sanitize + dangerouslySetInnerHTML.
 *
 * Toolbar: bold, italic, h2-h3, listas, blockquote, code, link, image,
 * undo, redo. La inserción de imagen llama a `onImageUpload` (provisto
 * por el padre) que sube a Supabase Storage y devuelve la URL pública.
 *
 * Cargar SIEMPRE con dynamic({ ssr: false }) — ProseMirror no es SSR-safe.
 */

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFileDropzone } from '@/hooks/use-file-dropzone'
import {
  Bold, Italic, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Link as LinkIcon,
  Image as ImageIcon, Undo, Redo,
} from 'lucide-react'

type Props = {
  value: string
  onChange: (html: string) => void
  /** Si se aporta, el botón "Imagen" del toolbar permite subir desde local. */
  onImageUpload?: (file: File) => Promise<string>
  placeholder?: string
  /** Altura mínima del área editable. Default: 320px. */
  minHeight?: number
}

function ToolbarBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn('h-8 w-8', active && 'bg-muted text-foreground')}
    >
      {children}
    </Button>
  )
}

function Toolbar({
  editor, onImageUpload,
}: {
  editor: Editor
  onImageUpload?: (file: File) => Promise<string>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelectImage = () => {
    if (!onImageUpload) return
    fileInputRef.current?.click()
  }

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !onImageUpload) return
    try {
      const url = await onImageUpload(file)
      if (url) editor.chain().focus().setImage({ src: url, alt: file.name }).run()
    } catch (err) {
      console.error('[rich-text-editor] image upload failed:', err)
    }
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL del enlace (vacío para quitar):', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1 py-1">
      <ToolbarBtn title="Negrita (Ctrl+B)" active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Cursiva (Ctrl+I)" active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1 h-5 w-px bg-border" />

      {/* El H1 de la página es el título del post; el cuerpo empieza en H2 para
          no duplicar encabezados (mejor SEO). Por eso no hay botón H1 aquí. */}
      <ToolbarBtn title="Encabezado 2" active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Encabezado 3" active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn title="Lista" active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Lista numerada" active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Cita" active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Código" active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn title="Enlace" active={editor.isActive('link')} onClick={setLink}>
        <LinkIcon className="h-4 w-4" />
      </ToolbarBtn>
      {onImageUpload && (
        <>
          <ToolbarBtn title="Insertar imagen" onClick={handleSelectImage}>
            <ImageIcon className="h-4 w-4" />
          </ToolbarBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageFile}
          />
        </>
      )}

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn title="Deshacer" disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn title="Rehacer" disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="h-4 w-4" />
      </ToolbarBtn>
    </div>
  )
}

export function RichTextEditor({
  value, onChange, onImageUpload, placeholder, minHeight = 320,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value || '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          'prose-headings:text-prats-navy prose-a:text-prats-gold',
          'px-4 py-3',
        ),
        style: `min-height: ${minHeight}px`,
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      // TipTap emite "<p></p>" para un editor vacío; preferimos string vacío.
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  // Sincronizar cambios externos del value (ej. carga inicial al editar un post
  // existente, que se rellena en un useEffect del padre tras la primera render).
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    const incoming = value || ''
    const normalizedCurrent = current === '<p></p>' ? '' : current
    if (incoming !== normalizedCurrent) {
      editor.commands.setContent(incoming, { emitUpdate: false })
    }
  }, [value, editor])

  const { dragging, dropzoneProps } = useFileDropzone({
    onFiles: (files) => {
      if (!onImageUpload || !editor) return
      const img = files.find((f) => f.type.startsWith('image/'))
      if (!img) return
      void (async () => {
        try {
          const url = await onImageUpload(img)
          if (url) editor.chain().focus().setImage({ src: url, alt: img.name }).run()
        } catch (err) {
          console.error('[rich-text-editor] image drop upload failed:', err)
        }
      })()
    },
  })

  if (!editor) {
    return (
      <div
        className="rounded-md border bg-muted/30"
        style={{ minHeight: minHeight + 40 }}
      />
    )
  }

  return (
    <div
      {...(onImageUpload ? dropzoneProps : {})}
      className={cn(
        'rounded-md border bg-background overflow-hidden transition-shadow',
        dragging && 'ring-2 ring-prats-navy ring-offset-2',
      )}
    >
      <Toolbar editor={editor} onImageUpload={onImageUpload} />
      <EditorContent editor={editor} />
      {dragging && onImageUpload && (
        <p className="border-t bg-prats-navy/5 px-4 py-1.5 text-xs text-prats-navy">
          Suelta la imagen para insertarla
        </p>
      )}
    </div>
  )
}

export default RichTextEditor
