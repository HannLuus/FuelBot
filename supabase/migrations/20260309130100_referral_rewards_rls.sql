-- Allow referrers to read their own referral rewards (for "My referral rewards" on Operator page).
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_rewards_select_own ON public.referral_rewards;
CREATE POLICY referral_rewards_select_own ON public.referral_rewards
  FOR SELECT
  USING (referrer_user_id = auth.uid());

-- Admins can read all referral rewards (for Admin "Referral payouts" list).
DROP POLICY IF EXISTS referral_rewards_select_admin ON public.referral_rewards;
CREATE POLICY referral_rewards_select_admin ON public.referral_rewards
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Admin write operations use service role in Edge Functions (bypasses RLS).
