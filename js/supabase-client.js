// Flip this one line to switch which Supabase project the app talks to.
// 'dev'  = your private sandbox for testing changes safely
// 'prod' = the real one your friends actually use — be careful here
const ENV = 'prod';

const CONFIGS = {
  prod: {
    url: 'https://aswuynuthzuprilqfgac.supabase.co',
    key: 'sb_publishable_kOXWzI41lUG5IjG-PhvE8w_Q8-sNgqF'
  },
  dev: {
    url: 'https://pszydlmsrgrxhivngnoo.supabase.co',
    key: 'sb_publishable_8U9xsbhscalJvcCImS7CaA_10qD4kd3'
  }
};

const SUPABASE_URL = CONFIGS[ENV].url;
const SUPABASE_KEY = CONFIGS[ENV].key;

// `supabase` here refers to the global object the CDN script attaches to window.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
