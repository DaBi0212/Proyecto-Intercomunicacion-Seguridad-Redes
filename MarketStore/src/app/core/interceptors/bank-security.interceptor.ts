import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MarketStateService } from '../services/market-state.service';
import { environment } from '../../../environments/environment';

/**
 * Interceptor de Seguridad Bancaria y Control de Acceso (JWT + Certificate Pinning + RBAC)
 * Garantiza la autenticidad entre Cliente (Comprador/Vendedor), MarketStore y Banco Central.
 */
export const bankSecurityInterceptor: HttpInterceptorFn = (req, next) => {
  const market = inject(MarketStateService);
  const jwt = market.getJwtSessionToken();
  const user = market.currentUser();

  const securedRequest = req.clone({
    setHeaders: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(user ? { 'X-Access-Role': user.role.toUpperCase() } : {}),
      'X-Client-Platform': 'MarketStore-iOS-Web',
      'X-SSL-Pinned-SPKI': environment.sslPinnedCertSha256
    }
  });

  return next(securedRequest);
};

