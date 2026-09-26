-- Checkout intent ownership and subscription-scoped entitlement ordering.
BEGIN;
CREATE TABLE public.billing_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('free','pro','team')),
  price_id TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  event_id TEXT NOT NULL,
  event_created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX billing_subscriptions_user ON public.billing_subscriptions(user_id, status);
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
INSERT INTO public.billing_subscriptions(subscription_id,user_id,customer_id,status,tier,price_id,current_period_end,event_id,event_created_at)
 SELECT stripe_subscription_id,id,stripe_customer_id,stripe_subscription_status,
   CASE WHEN tier IN ('pro','team') THEN tier ELSE 'free' END,stripe_price_id,subscription_current_period_end,
   coalesce(stripe_event_id,'migration-legacy'),coalesce(stripe_event_created_at,updated_at)
 FROM public.users WHERE stripe_subscription_id IS NOT NULL AND stripe_customer_id IS NOT NULL
   AND stripe_subscription_status IS NOT NULL AND stripe_price_id IS NOT NULL;

CREATE TABLE public.checkout_intents (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  plan TEXT NOT NULL,
  return_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  session_id TEXT,
  session_url TEXT
);
ALTER TABLE public.checkout_intents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_checkout_intent(p_user_id TEXT,p_plan TEXT,p_return_url TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account public.users; intent public.checkout_intents;
BEGIN
  SELECT * INTO account FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_USER_UNKNOWN'; END IF;
  IF p_plan NOT IN ('pro_monthly','pro_yearly','team_monthly','team_yearly') OR length(p_return_url)>2048 THEN RAISE EXCEPTION 'BILLING_INPUT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.billing_subscriptions WHERE user_id=p_user_id AND status IN ('active','trialing','past_due','unpaid','incomplete'))
    OR account.stripe_subscription_status IN ('active','trialing','past_due','unpaid','incomplete')
    THEN RAISE EXCEPTION 'BILLING_SUBSCRIPTION_EXISTS'; END IF;
  SELECT * INTO intent FROM public.checkout_intents WHERE user_id=p_user_id;
  IF FOUND AND intent.expires_at>now() THEN
    IF intent.plan<>p_plan OR intent.return_url<>p_return_url THEN RAISE EXCEPTION 'BILLING_CHECKOUT_PENDING'; END IF;
  ELSE
    INSERT INTO public.checkout_intents(user_id,plan,return_url,expires_at)
      VALUES(p_user_id,p_plan,p_return_url,date_trunc('second',now())+interval '1 hour')
    ON CONFLICT(user_id) DO UPDATE SET id=gen_random_uuid(),plan=EXCLUDED.plan,return_url=EXCLUDED.return_url,
      expires_at=EXCLUDED.expires_at,session_id=NULL,session_url=NULL RETURNING * INTO intent;
  END IF;
  RETURN to_jsonb(intent)||jsonb_build_object('customer_id',account.stripe_customer_id);
END $$;
REVOKE ALL ON FUNCTION public.acquire_checkout_intent(TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_checkout_intent(TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.bind_stripe_customer(p_user_id TEXT,p_customer_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing TEXT;
BEGIN
 SELECT stripe_customer_id INTO existing FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BILLING_USER_UNKNOWN'; END IF;
 IF existing IS NOT NULL AND existing<>p_customer_id THEN RAISE EXCEPTION 'BILLING_CUSTOMER_CONFLICT'; END IF;
 UPDATE public.users SET stripe_customer_id=p_customer_id WHERE id=p_user_id;
 RETURN p_customer_id;
END $$;
REVOKE ALL ON FUNCTION public.bind_stripe_customer(TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_stripe_customer(TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_checkout_intent(p_user_id TEXT,p_intent_id UUID,p_session_id TEXT,p_session_url TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.checkout_intents SET session_id=p_session_id,session_url=p_session_url
 WHERE user_id=p_user_id AND id=p_intent_id AND (session_id IS NULL OR session_id=p_session_id);
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.complete_checkout_intent(TEXT,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_checkout_intent(TEXT,UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_event(
  p_event_id TEXT,p_event_created_at TIMESTAMPTZ,p_event_type TEXT,p_user_id TEXT,p_customer_id TEXT,
  p_subscription_id TEXT,p_subscription_status TEXT,p_price_id TEXT,p_tier TEXT,p_current_period_end TIMESTAMPTZ
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.billing_subscriptions; selected public.billing_subscriptions;
BEGIN
 IF p_tier NOT IN ('free','pro','team') OR p_subscription_status NOT IN
   ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')
   THEN RAISE EXCEPTION 'invalid subscription entitlement'; END IF;
 -- One lock order for all subscriptions of a user. Each RPC is one transaction.
 PERFORM 1 FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown billing user'; END IF;
 INSERT INTO public.stripe_webhook_events(id,event_type,user_id,created_at)
   VALUES(p_event_id,p_event_type,p_user_id,p_event_created_at) ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 SELECT * INTO previous FROM public.billing_subscriptions WHERE subscription_id=p_subscription_id;
 IF FOUND THEN
   IF previous.user_id<>p_user_id OR previous.customer_id<>p_customer_id THEN RAISE EXCEPTION 'subscription owner conflict'; END IF;
   IF previous.event_created_at>p_event_created_at OR
     (previous.status IN ('canceled','incomplete_expired') AND p_subscription_status NOT IN ('canceled','incomplete_expired')) THEN RETURN 'stale'; END IF;
 END IF;
 INSERT INTO public.billing_subscriptions(subscription_id,user_id,customer_id,status,tier,price_id,current_period_end,event_id,event_created_at)
 VALUES(p_subscription_id,p_user_id,p_customer_id,p_subscription_status,
   CASE WHEN p_subscription_status IN ('active','trialing') THEN p_tier ELSE 'free' END,p_price_id,p_current_period_end,p_event_id,p_event_created_at)
 ON CONFLICT(subscription_id) DO UPDATE SET status=EXCLUDED.status,tier=EXCLUDED.tier,price_id=EXCLUDED.price_id,
   current_period_end=EXCLUDED.current_period_end,event_id=EXCLUDED.event_id,event_created_at=EXCLUDED.event_created_at;
 SELECT * INTO selected FROM public.billing_subscriptions WHERE user_id=p_user_id
 ORDER BY CASE WHEN status IN ('active','trialing') AND tier='team' THEN 3 WHEN status IN ('active','trialing') AND tier='pro' THEN 2 ELSE 0 END DESC,
   event_created_at DESC, subscription_id DESC LIMIT 1;
 UPDATE public.users SET tier=selected.tier,
   stripe_customer_id=selected.customer_id,stripe_subscription_id=selected.subscription_id,
   stripe_subscription_status=selected.status,stripe_price_id=selected.price_id,
   stripe_event_id=p_event_id,stripe_event_created_at=greatest(stripe_event_created_at,p_event_created_at),
   subscription_current_period_end=selected.current_period_end,updated_at=now() WHERE id=p_user_id;
 RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.apply_stripe_subscription_event(TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_event(TEXT,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;
COMMIT;
