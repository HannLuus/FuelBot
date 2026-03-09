-- spatial_ref_sys: PostGIS system table owned by supabase_admin; we cannot enable RLS (must be owner).
-- Control API exposure via privileges: revoke direct access from anon and authenticated so the table
-- is not exposed via the Data API. PostGIS and SECURITY DEFINER functions still work (service role / owner).
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
