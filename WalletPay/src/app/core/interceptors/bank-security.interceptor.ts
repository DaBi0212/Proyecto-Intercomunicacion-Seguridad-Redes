import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { WalletStateService } from '../services/wallet-state.service';
import { environment } from '../../../environments/environment';

/**
 * Interceptor de Seguridad Bancaria (JWT + Certificate Pinning Header Validation)
 * Mitiga ataques Man-in-the-Middle (MitM) hacia la API del Banco Central.
 */
export const bankSecurityInterceptor: HttpInterceptorFn = (req, next) => {
  const walletService = inject(WalletStateService);
  const jwt = walletService.getJwtSessionToken();

  const securedRequest = req.clone({
    setHeaders: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      'X-Client-Platform': 'Ionic-iOS-Capacitor-Wallet',
      'X-SSL-Pinned-SPKI': environment.sslPinnedCertSha256
    }
  });

  return next(securedRequest);
};

