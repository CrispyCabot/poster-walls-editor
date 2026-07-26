import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../auth/oidc.js';

export function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/', { replace: true }));
  }, [navigate]);

  return <p>Signing you in…</p>;
}
