ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN email_templates.thumbnail_url IS 'URL pública de la miniatura PNG generada con Playwright. Usada en la galería visual de /admin/emails.';
