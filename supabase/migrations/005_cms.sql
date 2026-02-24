-- ==========================================
-- SASTRERÍA PRATS — Migración 005
-- CMS: Páginas, Secciones, Bloques, Blog, Contacto
-- ==========================================

CREATE TABLE cms_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  title_es TEXT NOT NULL,
  title_en TEXT,
  description_es TEXT,
  description_en TEXT,
  page_type TEXT NOT NULL DEFAULT 'static' CHECK (page_type IN ('static', 'landing', 'legal')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order INTEGER DEFAULT 0,
  seo_title_es TEXT,
  seo_title_en TEXT,
  seo_description_es TEXT,
  seo_description_en TEXT,
  og_image_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE cms_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL DEFAULT 'content' CHECK (section_type IN ('hero', 'content', 'gallery', 'testimonials', 'cta', 'features', 'faq', 'custom')),
  title_es TEXT,
  title_en TEXT,
  subtitle_es TEXT,
  subtitle_en TEXT,
  content_es TEXT,
  content_en TEXT,
  background TEXT DEFAULT 'white',
  sort_order INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE cms_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_id UUID NOT NULL REFERENCES cms_sections(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL DEFAULT 'text' CHECK (block_type IN ('text', 'image', 'video', 'button', 'card', 'testimonial', 'faq_item', 'custom')),
  title_es TEXT,
  title_en TEXT,
  content_es TEXT,
  content_en TEXT,
  image_url TEXT,
  link_url TEXT,
  link_label_es TEXT,
  link_label_en TEXT,
  sort_order INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT NOT NULL UNIQUE,
  title_es TEXT NOT NULL,
  title_en TEXT,
  excerpt_es TEXT,
  excerpt_en TEXT,
  body_es TEXT,
  body_en TEXT,
  featured_image_url TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE contact_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  service TEXT,
  preferred_date TEXT,
  message TEXT,
  locale TEXT DEFAULT 'es',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved', 'spam')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_cms_pages_slug ON cms_pages(slug);
CREATE INDEX idx_cms_pages_status ON cms_pages(status);
CREATE INDEX idx_cms_sections_page ON cms_sections(page_id);
CREATE INDEX idx_cms_blocks_section ON cms_blocks(section_id);
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON blog_posts(status);
CREATE INDEX idx_blog_posts_published ON blog_posts(published_at) WHERE status = 'published';
CREATE INDEX idx_blog_posts_category ON blog_posts(category);
CREATE INDEX idx_contact_requests_status ON contact_requests(status);

-- Triggers
CREATE TRIGGER trigger_cms_pages_updated_at BEFORE UPDATE ON cms_pages FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_cms_sections_updated_at BEFORE UPDATE ON cms_sections FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_cms_blocks_updated_at BEFORE UPDATE ON cms_blocks FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER trigger_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- RLS
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_pages_select" ON cms_pages FOR SELECT USING (status = 'published' OR user_has_permission(auth.uid(), 'cms.view'));
CREATE POLICY "cms_pages_modify" ON cms_pages FOR ALL USING (user_has_permission(auth.uid(), 'cms.edit_pages'));
CREATE POLICY "cms_sections_select" ON cms_sections FOR SELECT USING (TRUE);
CREATE POLICY "cms_sections_modify" ON cms_sections FOR ALL USING (user_has_permission(auth.uid(), 'cms.edit_pages'));
CREATE POLICY "cms_blocks_select" ON cms_blocks FOR SELECT USING (TRUE);
CREATE POLICY "cms_blocks_modify" ON cms_blocks FOR ALL USING (user_has_permission(auth.uid(), 'cms.edit_pages'));
CREATE POLICY "blog_posts_select" ON blog_posts FOR SELECT USING (status = 'published' OR user_has_permission(auth.uid(), 'cms.manage_blog'));
CREATE POLICY "blog_posts_modify" ON blog_posts FOR ALL USING (user_has_permission(auth.uid(), 'cms.manage_blog'));
CREATE POLICY "contact_requests_select" ON contact_requests FOR SELECT USING (user_has_permission(auth.uid(), 'cms.view'));
CREATE POLICY "contact_requests_insert" ON contact_requests FOR INSERT WITH CHECK (TRUE);
