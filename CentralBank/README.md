# CentralBank · Consola Maestra de Administración (Desktop Nativo WPF .NET 10)

Software de escritorio nativo para Windows (**C# / WPF sobre .NET 10**, 100% nativo, no web) diseñado para el **Administrador del Banco Central** dentro del ecosistema de **WalletPay** y **MarketStore**.

## Características Principales

1. **Historial de Transacciones por Usuario, Monto y Hora Exacta**:
   - Visualización detallada de cada compra y canje de tickets realizada por cada usuario (`Alejandro Mendoza`, `Valeria Ríos`, `Carlos Navarro`, `Mariana Ortega`, `Diego Herrera`).
   - Registro del **monto exacto** (`$50`, `$100`, `$200`, `$500 MXN`), **fecha y hora exacta de la compra** (`HH:mm:ss hrs`), método de pago (`Apple Pay`, `SPEI`, `Visa`, `Mastercard`, `OXXO Pay`) y firma criptográfica `SHA-256 / RSA-2048`.
   - Filtros interactivos por usuario, tipo de operación, denominación y estado actual del ticket.

2. **Control de Tickets Usados vs. No Usados (Comprados sin usar)**:
   - Bóveda visual con tarjetas de tickets **1:1 con WalletPay y MarketStore** (`$50 Estándar`, `$100 Plata`, `$200 Oro`, `$500 Titanium`).
   - Clasificación en tiempo real entre:
     - **Tickets Comprados Sin Usar (`SIN USAR · ACTIVO`)**: Certificados adquiridos que siguen disponibles en la bóveda del usuario.
     - **Tickets Ya Usados (`YA USADO · CANJEADO`)**: Certificados liquidados en órdenes de `MarketStore` (`#ORD-449`, `#ORD-398`, etc.) con sello de verificación bancaria (`BC-AUTH-xxxxx-OK`) y hora de canje.

3. **Capital Total Obtenido de Venta de Tickets**:
   - Panel financiero en tiempo real con el **Capital Total Obtenido**, desglosado entre **Capital en Circulación (Tickets Sin Usar)** y **Capital Liquidado (Tickets Ya Usados)**.
   - Desglose de recaudación por denominación (`$50`, `$100`, `$200`, `$500`) y balance individual por usuario.

4. **Auditor Criptográfico Anti-Doble Gasto y Emisor en Vivo**:
   - Verificador de folios (`TKT-XXXX-XXXX`) para comprobar autenticidad y evitar el doble gasto.
   - Emisor administrativo para registrar nuevas compras de tickets o simular el uso/canje de tickets activos en 1 clic.
   - Exportación del Libro Mayor y balance de capital a **CSV**.
   - Soporte de **Modo Claro y Modo Oscuro** siguiendo los tokens de *Apple Human Interface Guidelines*.

## Cómo Ejecutar la Aplicación

- **Opción 1 (Doble clic)**: Ejecuta [`Iniciar-CentralBank.bat`](./Iniciar-CentralBank.bat) o directamente el ejecutable nativo compilado:
  ```
  bin\Release\net10.0-windows\CentralBank.exe
  ```
- **Opción 2 (Desde terminal)**:
  ```powershell
  cd "c:\Users\david\Desktop\Proyecto Redes\CentralBank"
  dotnet run
  ```

