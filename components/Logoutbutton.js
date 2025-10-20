import { supabase } from '../lib/supabaseClient';

export default function LogoutButton() {
  const onClick = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <button onClick={onClick} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd' }}>
      Salir
    </button>
  );
}
