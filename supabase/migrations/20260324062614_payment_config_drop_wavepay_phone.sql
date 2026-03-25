-- Product accepts KPay (KBZ Pay) only; WavePay phone column removed from payment_config.
ALTER TABLE public.payment_config DROP COLUMN IF EXISTS payment_phone_wavepay;
