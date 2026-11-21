-- Foto pública do médico (busca e perfil). Só caminhos locais do próprio site.
ALTER TABLE "professionals" ADD COLUMN "photo_url" VARCHAR(300);
ALTER TABLE "professionals"
  ADD CONSTRAINT "professionals_photo_url_local"
  CHECK ("photo_url" IS NULL OR "photo_url" ~ '^/assets/photos/[a-z0-9/_-]+\.(jpg|jpeg|png|webp)$');
