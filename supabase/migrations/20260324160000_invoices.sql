-- Sequential invoice numbers and persisted invoices for customer emails (station + B2B).

CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  n bigint;
  y text;
BEGIN
  y := to_char((now() AT TIME ZONE 'utc'), 'YYYY');
  n := nextval('public.invoice_number_seq');
  RETURN 'FB-' || y || '-' || lpad(n::text, 6, '0');
END;
$fn$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number() TO service_role;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('station_subscription', 'b2b_route_access')),
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id uuid REFERENCES public.stations(id) ON DELETE SET NULL,
  b2b_subscription_id uuid REFERENCES public.b2b_subscriptions(id) ON DELETE SET NULL,
  line_description text NOT NULL,
  subtotal_mmk bigint NOT NULL,
  tax_rate_percent numeric(6, 2) NOT NULL,
  tax_mmk bigint NOT NULL,
  total_mmk bigint NOT NULL,
  currency text NOT NULL DEFAULT 'MMK',
  payment_method text,
  payment_reference text,
  issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_customer_user_id_idx ON public.invoices (customer_user_id);
CREATE INDEX IF NOT EXISTS invoices_issued_at_idx ON public.invoices (issued_at DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
