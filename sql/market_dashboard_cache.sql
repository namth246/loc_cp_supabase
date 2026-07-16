create table if not exists public.market_dashboard_cache (
    cache_key text not null,
    data_date date not null,
    generated_at timestamptz not null default timezone('utc', now()),
    payload jsonb not null,
    primary key (cache_key, data_date),
    constraint market_dashboard_cache_payload_is_object
        check (jsonb_typeof(payload) = 'object')
);

create index if not exists idx_market_dashboard_cache_latest
    on public.market_dashboard_cache (cache_key, generated_at desc);

comment on table public.market_dashboard_cache is
'Precomputed payload cache for /api/market-dashboard so user requests only read one ready-made JSON row.';
