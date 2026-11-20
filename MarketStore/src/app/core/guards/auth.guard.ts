import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { MarketStateService } from '../services/market-state.service';

export const authGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const market = inject(MarketStateService);
  const router = inject(Router);

  const handoffParam = route.queryParamMap.get('handoff');
  const ticketIdParam = route.queryParamMap.get('ticketId');

  // Si viene redirigido desde el botón "Usar en Tienda Virtual" de WalletPay, validar el pase único con el banco
  if (handoffParam) {
    const ok = await market.redeemWalletPayHandoff(handoffParam, ticketIdParam || undefined);
    if (ok) {
      return true;
    }
    return router.parseUrl('/auth');
  }

  if (!market.isAuthenticated()) {
    return router.parseUrl('/auth');
  }
  return true;
};
