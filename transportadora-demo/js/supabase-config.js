/* Conexão com o Supabase (frontend).
   A chave "publishable" é pública por design — pode ficar no navegador.
   Quem protege os dados é o RLS (regras por papel) no banco. */
window.SUPABASE_CONFIG = {
  url: "https://txiuruoglwxsrgzjkwwv.supabase.co",
  publishableKey: "sb_publishable_fT5VT9mRG73xuGg_GYneSw_TGdBk4Ck",
};
