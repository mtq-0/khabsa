-- مين برا الصورة؟ now uses real photos only: switch off the built-in drawn (SVG) picture pairs.
-- Pairs an admin uploaded by hand (processed to WebP) and real-photo pairs are not touched.
update content_items c
   set status = 'disabled', updated_at = now()
 where c.kind = 'picture-pair'
   and c.pack_id is null
   and c.status = 'active'
   and exists (select 1 from images i where i.id = (c.data->>'a')::uuid and i.mime = 'image/svg+xml');
