import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuditLogItem,
  BankTicket,
  CartItem,
  OrderStatus,
  Product,
  ProductCategory,
  SavedUserCard,
  StoreOrder,
  TicketDenomination,
  TicketPurchaseRequest,
  UserAccount,
  UserRole
} from '../models/market.models';
import { environment } from '../../../environments/environment';
import { BankCryptoService } from './bank-crypto.service';

@Injectable({
  providedIn: 'root'
})
export class MarketStateService {
  readonly isAuthenticated = signal<boolean>(false);
  readonly isDarkMode = signal<boolean>(false);
  readonly currentUser = signal<UserAccount | null>(null);
  readonly registeredUsers = signal<UserAccount[]>([]);
  readonly preselectedTicketIdFromWallet = signal<string | null>(null);

  /** Estado global de búsqueda y filtros para la barra de navegación tipo MercadoLibre */
  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<ProductCategory>('all');
  readonly onlyAffordable = signal<boolean>(false);

  /** Estado de conexión en vivo con CentralBank (:7070) */
  readonly bankConnected = signal<boolean>(false);
  readonly activeBankUrl = signal<string>(environment.bankApiUrl);
  readonly networkModalOpen = signal<boolean>(false);
  readonly ticketRequests = signal<TicketPurchaseRequest[]>([]);
  readonly savedUserCards = signal<SavedUserCard[]>([]);

  /** HUD biométrico y criptográfico estilo iOS (Face ID / Banco Central) */
  readonly hudState = signal<{ expanded: boolean; label: string; symbol: string }>({
    expanded: false,
    label: 'Face ID',
    symbol: 'faceid'
  });

  /** Control de apertura del Drawer / Sheet de la Bolsa de Compras */
  readonly cartOpen = signal<boolean>(false);

  /** Saldo a favor por remanentes de tickets de valor fijo (sincronizado con SQLite de CentralBank) */
  readonly storeCredit = signal<number>(0);

  private jwtToken: string | null = null;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private syncPollingTimer?: ReturnType<typeof setInterval>;
  private themeOverridden = false;

  readonly demoAccounts: Record<UserRole, UserAccount> = {
    buyer: {
      id: 'USR-BUYER-01',
      name: 'Alejandro Mendoza',
      email: 'cliente@marketstore.mx',
      role: 'buyer',
      verifiedLevel: 'Face ID + Llavero iOS',
      avatarInitials: 'AM'
    },
    seller: {
      id: 'USR-SELLER-01',
      name: 'Sofía Valdés',
      email: 'vendedor@marketstore.mx',
      role: 'seller',
      storeName: 'Aether Studio Oficial',
      verifiedLevel: 'Comercio Verificado MarketStore',
      avatarInitials: 'SV'
    }
  };

  /**
   * Bóveda de Tickets Electrónicos sincronizada en tiempo real con la BD SQLite de CentralBank y WalletPay.
   * Inicia sin datos de prueba (0 tickets).
   */
  readonly tickets = signal<BankTicket[]>([]);

  /**
   * Catálogo de 20 productos publicados con distintos precios, stocks e imágenes obtenidas de internet
   * (sin almacenar archivos de imagen en el repositorio, servidos directamente en la app de Vercel).
   */
  readonly initialPublishedProducts: Product[] = [
    {
      id: 'PRD-201',
      sku: 'MS-MAG-100',
      title: 'Cargador Magnético MagCharge Qi2 15W',
      subtitle: 'Alineación magnética de precisión · Cable trenzado USB-C',
      description: 'Base de carga inalámbrica rápida con certificación Qi2 de 15 W y carcasa de aluminio anodizado.',
      category: 'magsafe',
      categoryLabel: 'Accesorios MagSafe',
      price: 100,
      stock: 18,
      rating: 4.9,
      reviewsCount: 142,
      badge: '1 Ticket $100',
      surfaceClass: 'prod-surface-blue',
      accentColor: '#007AFF',
      symbolName: 'bolt.fill',
      imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80'],
      specs: ['Potencia 15 W Qi2 certificada', 'Aluminio reciclado grado aeroespacial', 'Pago verificado con Tickets Bancarios'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100]
    },
    {
      id: 'PRD-202',
      sku: 'MS-AUD-200',
      title: 'Auriculares StudioPods Pro Spatial ANC',
      subtitle: 'Cancelación activa de ruido híbrida y audio espacial',
      description: 'Sonido de estudio con ecualización adaptativa, estuche MagSafe con altavoz UWB y hasta 30 horas de batería.',
      category: 'audio',
      categoryLabel: 'Audio y Música',
      price: 200,
      stock: 14,
      rating: 4.95,
      reviewsCount: 289,
      badge: '1 Ticket $200',
      surfaceClass: 'prod-surface-purple',
      accentColor: '#7C3AED',
      symbolName: 'headphones',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80'],
      specs: ['Cancelación Activa de Ruido 2x', 'Estuche con carga MagSafe', 'Resistencia IPX4 al sudor y agua'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200]
    },
    {
      id: 'PRD-203',
      sku: 'MS-MAG-050',
      title: 'Localizador Inteligente AetherTag UWB',
      subtitle: 'Rastreo milimétrico de banda ultraancha con bocina',
      description: 'Localiza llaves, mochilas o equipaje al instante desde tu dispositivo con alertas sonoras y dirección precisa.',
      category: 'magsafe',
      categoryLabel: 'Accesorios MagSafe',
      price: 50,
      stock: 32,
      rating: 4.85,
      reviewsCount: 118,
      badge: '1 Ticket $50',
      surfaceClass: 'prod-surface-emerald',
      accentColor: '#34C759',
      symbolName: 'sparkles',
      imageUrl: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=800&q=80'],
      specs: ['Chip UWB de precisión direccional', 'Batería reemplazable de 1 año', 'Certificación IP67 contra agua y polvo'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [50]
    },
    {
      id: 'PRD-204',
      sku: 'MS-HOM-150',
      title: 'Bocina Inteligente HomeSphere Mini 360°',
      subtitle: 'Audio computacional envolvente y hub Matter / Thread',
      description: 'Acústica de 360 grados con graves profundos, micrófonos de campo lejano y sensor de temperatura interior.',
      category: 'hogar',
      categoryLabel: 'Hogar Inteligente',
      price: 150,
      stock: 11,
      rating: 4.88,
      reviewsCount: 74,
      badge: 'Tickets $100 + $50',
      surfaceClass: 'prod-surface-amber',
      accentColor: '#EA580C',
      symbolName: 'speaker.wave.2',
      imageUrl: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=800&q=80'],
      specs: ['Sonido omnidireccional 360°', 'Controlador domótico Matter & Thread', 'Emparejamiento estéreo inalámbrico'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100, 50]
    },
    {
      id: 'PRD-205',
      sku: 'MS-EST-500',
      title: 'Monitor Studio Display Mini LED 27" 5K',
      subtitle: 'Panel Retina 5K · 120 Hz ProMotion · Cuerpo unibody',
      description: 'Calibrado de fábrica para diseño, fotografía y edición de video con cámara ultra gran angular de 12 MP.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 500,
      stock: 6,
      rating: 5.0,
      reviewsCount: 64,
      badge: '1 Ticket $500',
      surfaceClass: 'prod-surface-titanium',
      accentColor: '#5856D6',
      symbolName: 'laptopcomputer',
      imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=800&q=80'],
      specs: ['Resolución 5120 × 2880 (218 ppi)', 'Brillo sostenido de 1000 nits P3', 'Thunderbolt 4 con entrega de 96 W'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [500]
    },
    {
      id: 'PRD-206',
      sku: 'MS-MAG-100B',
      title: 'Cartera MagSafe FineWoven con Blindaje RFID',
      subtitle: 'Capacidad para 3 tarjetas y soporte de ubicación',
      description: 'Tejido de microsarga de alta resistencia con imanes integrados de alineación instantánea.',
      category: 'magsafe',
      categoryLabel: 'Accesorios MagSafe',
      price: 100,
      stock: 23,
      rating: 4.78,
      reviewsCount: 53,
      badge: '1 Ticket $100',
      surfaceClass: 'prod-surface-rose',
      accentColor: '#E11D48',
      symbolName: 'wallet.pass',
      imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80'],
      specs: ['Blindaje anticlonación RFID', 'Imanes N52 de alta sujeción', 'Notificación de separación en el móvil'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100]
    },
    {
      id: 'PRD-207',
      sku: 'MS-EST-250',
      title: 'Smartwatch AetherWatch Ultra Titanium 49mm',
      subtitle: 'Caja de titanio grado 5 · GPS de doble frecuencia',
      description: 'Pantalla de cristal de zafiro de 3000 nits, botón de acción programable y autonomía de hasta 72 horas.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 250,
      stock: 9,
      rating: 4.94,
      reviewsCount: 91,
      badge: 'Tickets $200 + $50',
      surfaceClass: 'prod-surface-titanium',
      accentColor: '#007AFF',
      symbolName: 'watch',
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80'],
      specs: ['Titanio aeroespacial grado 5', 'Sumergible hasta 100 metros (EN13319)', 'Incluye base magnética de carga rápida'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 50]
    },
    {
      id: 'PRD-208',
      sku: 'MS-DIG-050',
      title: 'Suscripción AetherCloud+ 2 TB (Pase Anual)',
      subtitle: 'Bóveda cifrada en la nube + Retransmisión privada',
      description: 'Sincronización automática multi-dispositivo y respaldo cifrado de extremo a extremo por 12 meses.',
      category: 'digital',
      categoryLabel: 'Tarjetas y Digital',
      price: 50,
      stock: 40,
      rating: 4.96,
      reviewsCount: 312,
      badge: '1 Ticket $50',
      surfaceClass: 'prod-surface-blue',
      accentColor: '#0A84FF',
      symbolName: 'shield.checkered',
      imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80'],
      specs: ['2 TB compartibles hasta con 5 usuarios', 'Activación instantánea tras validar ticket', 'Soporte prioritario 24/7'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [50]
    },
    {
      id: 'PRD-209',
      sku: 'MS-EST-300',
      title: 'Teclado Mecánico Inalámbrico KeyStudio Low-Profile',
      subtitle: 'Chasis de aluminio CNC · Switches táctiles silenciosos',
      description: 'Teclado mecánico ultradelgado con retroiluminación adaptativa, conexión Bluetooth 5.3 y receptor 2.4 GHz.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 300,
      stock: 15,
      rating: 4.91,
      reviewsCount: 108,
      badge: 'Tickets $200 + $100',
      surfaceClass: 'prod-surface-titanium',
      accentColor: '#5856D6',
      symbolName: 'laptopcomputer',
      imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80'],
      specs: ['Cuerpo de aluminio mecanizado CNC', 'Batería recargable USB-C de 200 horas', 'Teclas PBT de doble inyección'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 100]
    },
    {
      id: 'PRD-210',
      sku: 'MS-EST-150',
      title: 'Mouse Ergonómico ProTrack Precision 8K',
      subtitle: 'Sensor óptico de 26,000 DPI · Rueda electromagnética',
      description: 'Diseñado para flujos de trabajo intensivos con desplazamiento silencioso MagSpeed y carga inalámbrica Qi.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 150,
      stock: 21,
      rating: 4.89,
      reviewsCount: 87,
      badge: 'Tickets $100 + $50',
      surfaceClass: 'prod-surface-blue',
      accentColor: '#007AFF',
      symbolName: 'sparkles',
      imageUrl: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80'],
      specs: ['Rueda electromagnética de acero', 'Conexión simultánea con 3 equipos', 'Clicks silenciosos de alta durabilidad'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100, 50]
    },
    {
      id: 'PRD-211',
      sku: 'MS-AUD-350',
      title: 'Audífonos Over-Ear StudioMax Reference Hi-Fi',
      subtitle: 'Diadema de acero inoxidable y almohadillas viscoelásticas',
      description: 'Transductores dinámicos de 45 mm diseñados para monitoreo sin distorsión, con audio espacial y DAC USB-C.',
      category: 'audio',
      categoryLabel: 'Audio y Música',
      price: 350,
      stock: 8,
      rating: 4.97,
      reviewsCount: 164,
      badge: 'Tickets $200 + $100 + $50',
      surfaceClass: 'prod-surface-purple',
      accentColor: '#7C3AED',
      symbolName: 'headphones',
      imageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=800&q=80'],
      specs: ['Audio sin pérdida de 24 bits / 96 kHz', 'Corona de malla transpirable', '40 horas de reproducción continua'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 100, 50]
    },
    {
      id: 'PRD-212',
      sku: 'MS-MAG-200',
      title: 'Batería Magnética PowerVault Qi2 10,000 mAh',
      subtitle: 'Carga inalámbrica de 15 W con soporte plegable integrado',
      description: 'Batería portátil ultracompacta con pantalla OLED de porcentaje y puerto bidireccional USB-C PD de 27 W.',
      category: 'magsafe',
      categoryLabel: 'Accesorios MagSafe',
      price: 200,
      stock: 19,
      rating: 4.86,
      reviewsCount: 132,
      badge: '1 Ticket $200',
      surfaceClass: 'prod-surface-blue',
      accentColor: '#007AFF',
      symbolName: 'bolt.fill',
      imageUrl: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=800&q=80'],
      specs: ['Capacidad real de 10,000 mAh', 'Soporte kickstand de aluminio', 'Protección térmica inteligente'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200]
    },
    {
      id: 'PRD-213',
      sku: 'MS-AUD-250',
      title: 'Micrófono Condensador VocalCast USB-C / XLR',
      subtitle: 'Cápsula cardioide de estudio con brazo articulado',
      description: 'Ideal para streaming, podcasts y grabación vocal con filtro antipop interno y monitoreo de latencia cero.',
      category: 'audio',
      categoryLabel: 'Audio y Música',
      price: 250,
      stock: 12,
      rating: 4.92,
      reviewsCount: 78,
      badge: 'Tickets $200 + $50',
      surfaceClass: 'prod-surface-amber',
      accentColor: '#EA580C',
      symbolName: 'speaker.wave.2',
      imageUrl: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=800&q=80'],
      specs: ['Salida dual USB-C digital y XLR analógica', 'Preamplificador de bajo ruido integrado', 'Chasis metálico antirresonancia'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 50]
    },
    {
      id: 'PRD-214',
      sku: 'MS-HOM-200',
      title: 'Cámara de Seguridad HomeGuard 4K HDR Interior/Exterior',
      subtitle: 'Visión nocturna a color e inteligencia artificial local',
      description: 'Reconocimiento de personas, paquetes y vehículos con almacenamiento cifrado y compatibilidad HomeKit Secure Video.',
      category: 'hogar',
      categoryLabel: 'Hogar Inteligente',
      price: 200,
      stock: 16,
      rating: 4.84,
      reviewsCount: 65,
      badge: '1 Ticket $200',
      surfaceClass: 'prod-surface-emerald',
      accentColor: '#34C759',
      symbolName: 'shield.checkered',
      imageUrl: 'https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?auto=format&fit=crop&w=800&q=80'],
      specs: ['Sensor 4K HDR con ángulo de 160°', 'Audio bidireccional con cancelación de eco', 'Resistencia climática IP66'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200]
    },
    {
      id: 'PRD-215',
      sku: 'MS-HOM-100',
      title: 'Lámpara Arquitectónica Lumina Desk Matter RGBWW',
      subtitle: 'Iluminación circadiana sin parpadeo · Control táctil',
      description: 'Barra de luz de aluminio para escritorio o estudio con ajuste automático de temperatura de color (2700K–6500K).',
      category: 'hogar',
      categoryLabel: 'Hogar Inteligente',
      price: 100,
      stock: 25,
      rating: 4.87,
      reviewsCount: 94,
      badge: '1 Ticket $100',
      surfaceClass: 'prod-surface-amber',
      accentColor: '#EA580C',
      symbolName: 'sparkles',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80'],
      specs: ['Índice de reproducción cromática CRI > 97', 'Integración nativa con Matter y voz', 'Puerto de carga USB-C lateral'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100]
    },
    {
      id: 'PRD-216',
      sku: 'MS-EST-400',
      title: 'Unidad SSD Externa ThunderDrive NVMe 2 TB',
      subtitle: 'Velocidad de hasta 3,200 MB/s · Carcasa acorazada IP68',
      description: 'Almacenamiento portátil de estado sólido para edición 4K ProRes directa desde cámara o estación de trabajo.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 400,
      stock: 10,
      rating: 4.95,
      reviewsCount: 119,
      badge: 'Tickets $200 + $200',
      surfaceClass: 'prod-surface-titanium',
      accentColor: '#007AFF',
      symbolName: 'laptopcomputer',
      imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=800&q=80'],
      specs: ['Interfaz USB4 / Thunderbolt de 40 Gbps', 'Cifrado por hardware AES-256', 'Resistente a caídas de hasta 3 metros'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 200]
    },
    {
      id: 'PRD-217',
      sku: 'MS-MAG-150',
      title: 'Estación de Carga 3-en-1 MagCube Stand Pro',
      subtitle: 'Carga simultánea para Smartphone, Reloj y Auriculares',
      description: 'Cubo plegable de aluminio macizo con cabezal MagSafe ajustable a 60° para modo de espera nocturno.',
      category: 'magsafe',
      categoryLabel: 'Accesorios MagSafe',
      price: 150,
      stock: 17,
      rating: 4.91,
      reviewsCount: 146,
      badge: 'Tickets $100 + $50',
      surfaceClass: 'prod-surface-blue',
      accentColor: '#007AFF',
      symbolName: 'bolt.fill',
      imageUrl: 'https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1586816879360-004f5b0c51e3?auto=format&fit=crop&w=800&q=80'],
      specs: ['Módulo de carga rápida para reloj', 'Incluye adaptador GaN de 45 W', 'Base antideslizante lastrada'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100, 50]
    },
    {
      id: 'PRD-218',
      sku: 'MS-AUD-450',
      title: 'Altavoz Portátil SoundPulse Rover Hi-Res Waterproof',
      subtitle: 'Sonido estéreo de 60 W con radiadores pasivos duales',
      description: 'Altavoz inalámbrico de alto desempeño para exteriores con 24 horas de autonomía y función powerbank.',
      category: 'audio',
      categoryLabel: 'Audio y Música',
      price: 450,
      stock: 7,
      rating: 4.9,
      reviewsCount: 83,
      badge: 'Tickets $200 + $200 + $50',
      surfaceClass: 'prod-surface-purple',
      accentColor: '#7C3AED',
      symbolName: 'speaker.wave.2',
      imageUrl: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=80'],
      specs: ['Sumergible IP67 y flotante', 'Códec LDAC de alta resolución', 'Correa desmontable de nylon balístico'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [200, 200, 50]
    },
    {
      id: 'PRD-219',
      sku: 'MS-DIG-100',
      title: 'Licencia ProCreate & AetherDesign Suite (Anual)',
      subtitle: 'Suite de ilustración vectorial, edición RAW y prototipado 3D',
      description: 'Acceso completo en escritorio y tablet a motores de renderizado acelerados por GPU y biblioteca de recursos.',
      category: 'digital',
      categoryLabel: 'Tarjetas y Digital',
      price: 100,
      stock: 35,
      rating: 4.93,
      reviewsCount: 205,
      badge: '1 Ticket $100',
      surfaceClass: 'prod-surface-rose',
      accentColor: '#E11D48',
      symbolName: 'sparkles',
      imageUrl: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=800&q=80'],
      specs: ['Licencia para hasta 3 dispositivos', 'Actualizaciones mayores incluidas', 'Entrega digital inmediata'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [100]
    },
    {
      id: 'PRD-220',
      sku: 'MS-EST-700',
      title: 'Cámara Mirrorless CinemaPocket 6K + Lente 35mm f/1.4',
      subtitle: 'Sensor Super 35 HDR · Grabación RAW en tarjeta CFexpress',
      description: 'Cámara digital compacta de cine con rango dinámico de 13 pasos, pantalla táctil abatible y doble ISO nativo.',
      category: 'estudio',
      categoryLabel: 'Cómputo y Estudio',
      price: 700,
      stock: 4,
      rating: 4.99,
      reviewsCount: 49,
      badge: 'Tickets $500 + $200',
      surfaceClass: 'prod-surface-titanium',
      accentColor: '#5856D6',
      symbolName: 'laptopcomputer',
      imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
      images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80'],
      specs: ['Captura 6K hasta 60 fps en 12-bit RAW', 'Incluye objetivo luminoso 35mm f/1.4', 'Cuerpo de compuesto de fibra de carbono'],
      sellerId: 'USR-SELLER-01',
      sellerName: 'Market Store Oficial',
      active: true,
      recommendedTickets: [500, 200]
    }
  ];

  readonly products = signal<Product[]>([...this.initialPublishedProducts]);

  /** Bolsa de compras: inicia completamente vacía (sin datos de prueba) */
  readonly cart = signal<CartItem[]>([]);

  /** Historial de Órdenes: inicia completamente vacío (sin órdenes de prueba) */
  readonly orders = signal<StoreOrder[]>([]);

  readonly auditLogs = signal<AuditLogItem[]>([]);

  // Propiedades calculadas
  readonly activeTickets = computed(() => this.tickets().filter((t) => t.status === 'active'));
  readonly usedTickets = computed(() => this.tickets().filter((t) => t.status === 'used'));
  readonly availableTicketBalance = computed(() =>
    this.activeTickets().reduce((acc, t) => acc + t.amount, 0)
  );
  readonly totalPurchasingPower = computed(
    () => this.availableTicketBalance() + this.storeCredit()
  );

  readonly activeProducts = computed(() => this.products().filter((p) => p.active));
  readonly cartCount = computed(() =>
    this.cart().reduce((acc, item) => acc + item.quantity, 0)
  );
  readonly cartSubtotal = computed(() =>
    this.cart().reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  );

  readonly totalSellerRevenue = computed(() =>
    this.orders().reduce((acc, o) => acc + o.subtotal, 0)
  );
  readonly totalVerifiedTicketsCount = computed(() =>
    this.orders().reduce((acc, o) => acc + o.ticketsUsed.length, 0)
  );

  constructor(
    private router: Router,
    public crypto: BankCryptoService
  ) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    this.applyTheme(media.matches);
    media.addEventListener('change', (e) => {
      if (!this.themeOverridden) this.applyTheme(e.matches);
    });
    this.activeBankUrl.set(this.crypto.getCustomBankUrl());
    this.loadLocalCatalogProducts();
    this.loadLocalDeviceAccounts();
    this.restorePersistedSession();
    this.fetchRegisteredUsers();
  }

  private loadLocalCatalogProducts(): void {
    try {
      const raw = localStorage.getItem('ms_published_catalog_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.products.set(parsed);
          return;
        }
      }
    } catch {}
    this.products.set([...this.initialPublishedProducts]);
    this.saveLocalCatalogProducts(this.products());
  }

  private saveLocalCatalogProducts(list: Product[]): void {
    try {
      localStorage.setItem('ms_published_catalog_v3', JSON.stringify(list));
    } catch {}
  }

  private applyServerOrLocalProducts(serverProductsJson?: string): void {
    if (serverProductsJson && typeof serverProductsJson === 'string') {
      try {
        const parsed = JSON.parse(serverProductsJson);
        if (Array.isArray(parsed)) {
          if (parsed.length >= 20) {
            this.products.set(parsed);
            this.saveLocalCatalogProducts(parsed);
          } else if (this.products().length > 0) {
            this.persistProductsToServer();
          }
          return;
        }
      } catch {}
    }
  }

  private async persistProductsToServer(): Promise<void> {
    const current = this.products();
    this.saveLocalCatalogProducts(current);
    try {
      await this.crypto.request('catalog.products.save', { products: current });
    } catch {}
  }

  private savePersistedSession(user: UserAccount): void {
    try {
      localStorage.setItem('ms_active_session_user_v2', JSON.stringify(user));
    } catch {}
  }

  private clearPersistedSession(): void {
    try {
      localStorage.removeItem('ms_active_session_user_v2');
    } catch {}
  }

  private restorePersistedSession(): void {
    try {
      const raw = localStorage.getItem('ms_active_session_user_v2');
      if (!raw) return;
      const parsed = JSON.parse(raw) as UserAccount;
      if (!parsed || !parsed.email) return;
      const cleanEmail = parsed.email.trim().toLowerCase();
      this.currentUser.set({ ...parsed, email: cleanEmail });
      this.applySavedCardsFromServerOrLocal(cleanEmail, parsed.savedCardsJson);
      this.jwtToken = this.crypto.loadProtectedItem(`devpass_${cleanEmail}`) || 'session-active';
      this.isAuthenticated.set(true);
      this.startRealtimeBankSync();
    } catch {}
  }

  private async trySilentReauth(): Promise<boolean> {
    const user = this.currentUser();
    if (!user || !user.email) return false;
    const cleanEmail = user.email.trim().toLowerCase();
    const deviceToken = this.crypto.loadProtectedItem(`devpass_${cleanEmail}`);
    if (!deviceToken) return false;
    try {
      const data = await this.crypto.request('auth.biometric', {
        email: cleanEmail,
        deviceToken,
        roleCode: user.role
      });
      if (data?.ok) {
        if (data.deviceToken) {
          this.crypto.saveProtectedItem(`devpass_${cleanEmail}`, data.deviceToken);
        }
        return true;
      }
    } catch {}
    return false;
  }

  /**
   * Carga únicamente las cuentas que se hayan autenticado o vinculado en ESTE dispositivo/navegador,
   * garantizando que ninguna cuenta de otro dispositivo aparezca ni se mezcle.
   */
  private loadLocalDeviceAccounts(): void {
    try {
      const raw = localStorage.getItem('ms_local_device_accounts_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.registeredUsers.set(parsed);
          return;
        }
      }
    } catch {}
    this.registeredUsers.set([]);
  }

  private rememberLocalDeviceAccount(user: UserAccount): void {
    if (!user || !user.email) return;
    const cleanEmail = user.email.trim().toLowerCase();
    const current = this.registeredUsers().filter((u) => u.email.trim().toLowerCase() !== cleanEmail);
    const updated: UserAccount[] = [
      {
        ...user,
        email: cleanEmail
      },
      ...current
    ];
    this.registeredUsers.set(updated);
    try {
      localStorage.setItem('ms_local_device_accounts_v2', JSON.stringify(updated));
    } catch {}
  }

  removeLocalDeviceAccount(email: string): void {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return;
    this.crypto.removeProtectedItem(`devpass_${clean}`);
    const filtered = this.registeredUsers().filter((u) => u.email.trim().toLowerCase() !== clean);
    this.registeredUsers.set(filtered);
    try {
      localStorage.setItem('ms_local_device_accounts_v2', JSON.stringify(filtered));
    } catch {}
  }

  private getLocalCardsStorageKey(email: string): string {
    return `ms_account_cards_${(email || '').trim().toLowerCase()}`;
  }

  private loadLocalSavedCards(email: string): SavedUserCard[] {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return [];
    try {
      const raw = localStorage.getItem(this.getLocalCardsStorageKey(clean));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  private saveLocalSavedCards(email: string, cards: SavedUserCard[]): void {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return;
    try {
      localStorage.setItem(this.getLocalCardsStorageKey(clean), JSON.stringify(cards));
    } catch {}
  }

  applySavedCardsFromServerOrLocal(email: string, serverCardsJson?: string): void {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) {
      this.savedUserCards.set([]);
      return;
    }

    let serverCards: SavedUserCard[] = [];
    if (serverCardsJson && typeof serverCardsJson === 'string') {
      try {
        const parsed = JSON.parse(serverCardsJson);
        if (Array.isArray(parsed)) {
          serverCards = parsed;
        }
      } catch {}
    }

    const localCards = this.loadLocalSavedCards(clean);
    if (serverCards.length > 0) {
      this.savedUserCards.set(serverCards);
      this.saveLocalSavedCards(clean, serverCards);
    } else if (localCards.length > 0) {
      this.savedUserCards.set(localCards);
      this.crypto.request('user.cards.save', { cards: localCards }).catch(() => {});
    } else {
      this.savedUserCards.set([]);
    }
  }

  async addOrUpdateUserCard(card: SavedUserCard): Promise<void> {
    const user = this.currentUser();
    const email = (user?.email || '').trim().toLowerCase();
    const current = this.savedUserCards().filter(
      (c) =>
        c.id !== card.id &&
        c.accountNumber.replace(/\D/g, '') !== card.accountNumber.replace(/\D/g, '')
    );
    const updated = [card, ...current];
    this.savedUserCards.set(updated);
    if (email) {
      this.saveLocalSavedCards(email, updated);
    }
    try {
      await this.crypto.request('user.cards.save', { cards: updated });
    } catch {}
  }

  async removeUserCard(cardId: string): Promise<void> {
    const user = this.currentUser();
    const email = (user?.email || '').trim().toLowerCase();
    const updated = this.savedUserCards().filter((c) => c.id !== cardId);
    this.savedUserCards.set(updated);
    if (email) {
      this.saveLocalSavedCards(email, updated);
    }
    try {
      await this.crypto.request('user.cards.save', { cards: updated });
    } catch {}
  }

  async saveBankConnectionUrl(rawUrl: string): Promise<{ ok: boolean; message: string }> {
    const norm = this.crypto.setCustomBankUrl(rawUrl);
    this.activeBankUrl.set(norm);
    const probe = await this.crypto.testConnection();
    this.bankConnected.set(probe.ok);
    if (probe.ok) {
      this.activeBankUrl.set(probe.activeUrl);
      await this.fetchRegisteredUsers();
      return { ok: true, message: `Conectado a CentralBank en ${probe.activeUrl}` };
    }
    return {
      ok: false,
      message: probe.error || 'No se pudo conectar con CentralBank en esa dirección.'
    };
  }

  searchFromNavbar(query: string, category?: ProductCategory): void {
    this.searchQuery.set(query);
    if (category) {
      this.selectedCategory.set(category);
    }
    if (this.router.url !== '/catalog') {
      this.router.navigateByUrl('/catalog');
    }
  }

  selectCategoryFromNavbar(category: ProductCategory): void {
    this.selectedCategory.set(category);
    this.haptic('selection');
    if (this.router.url !== '/catalog') {
      this.router.navigateByUrl('/catalog');
    }
  }

  toggleAffordableFromNavbar(): void {
    this.onlyAffordable.update((v) => !v);
    this.haptic('selection');
    if (this.router.url !== '/catalog') {
      this.router.navigateByUrl('/catalog');
    }
  }

  private filterAuthenticTickets(raw: BankTicket[]): BankTicket[] {
    const valid: BankTicket[] = [];
    for (const t of raw) {
      if (this.crypto.isTicketAuthentic(t)) {
        valid.push(t);
      } else {
        this.addAuditLog(
          'warn',
          `[Integridad] El ticket ${t?.id || 'desconocido'} fue descartado porque sus datos o su sello fueron alterados.`
        );
      }
    }
    return valid;
  }

  isTicketAuthentic(ticket: BankTicket): boolean {
    return this.crypto.isTicketAuthentic(ticket);
  }

  async fetchRegisteredUsers(): Promise<void> {
    this.loadLocalDeviceAccounts();
    try {
      const probe = await this.crypto.testConnection();
      this.bankConnected.set(probe.ok);
      if (probe.ok && probe.activeUrl) {
        this.activeBankUrl.set(probe.activeUrl);
      }
    } catch {
      this.bankConnected.set(false);
    }
  }

  toggleTheme(): void {
    this.themeOverridden = true;
    this.applyTheme(!this.isDarkMode());
    this.haptic('light');
  }

  private applyTheme(dark: boolean): void {
    this.isDarkMode.set(dark);
    document.documentElement.classList.toggle('ion-palette-dark', dark);
  }

  haptic(kind: 'light' | 'medium' | 'selection' | 'success' | 'error' = 'light'): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (kind === 'success') navigator.vibrate([12, 40, 18]);
        else if (kind === 'error') navigator.vibrate([30, 50, 30]);
        else navigator.vibrate(10);
      }
    } catch {
      /* sin soporte háptico en escritorio */
    }
  }

  getJwtSessionToken(): string | null {
    return this.jwtToken;
  }

  addAuditLog(category: AuditLogItem['category'], message: string): void {
    const time = new Date().toTimeString().split(' ')[0];
    this.auditLogs.update((prev) => [{ time, category, message }, ...prev.slice(0, 29)]);
  }

  async triggerBiometricPulse(
    label: string,
    durationMs = 950,
    symbol = 'faceid'
  ): Promise<void> {
    this.hudState.set({ expanded: true, label, symbol });
    this.haptic('light');
    return new Promise((resolve) => {
      setTimeout(() => {
        this.hudState.set({ expanded: false, label: 'Face ID', symbol: 'faceid' });
        setTimeout(resolve, 140);
      }, durationMs);
    });
  }

  hasSavedDevicePass(email: string): boolean {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return false;
    return !!this.crypto.loadProtectedItem(`devpass_${clean}`);
  }

  /**
   * Canjea el pase de un solo uso emitido cuando el cliente pulsa "Usar en Tienda Virtual" desde WalletPay.
   * Si alguien intenta reutilizar o inventar un enlace, el banco lo rechaza.
   */
  async redeemWalletPayHandoff(handoffToken: string, ticketId?: string): Promise<boolean> {
    try {
      const data = await this.crypto.request('auth.handoff.redeem', { handoffToken });
      if (!data?.ok || !data.user) {
        this.addAuditLog('warn', `[Acceso] Enlace desde WalletPay rechazado: ${data?.error || 'Token inválido'}.`);
        return false;
      }

      if (data.deviceToken) {
        this.crypto.saveProtectedItem(`devpass_${data.user.email.toLowerCase()}`, data.deviceToken);
      }

      const user: UserAccount = {
        ...data.user,
        role: 'buyer'
      };

      this.jwtToken = data.deviceToken || 'session-active';
      this.currentUser.set(user);
      this.isAuthenticated.set(true);
      this.savePersistedSession(user);
      this.rememberLocalDeviceAccount(user);
      this.applySavedCardsFromServerOrLocal(user.email, data.user?.savedCardsJson);
      if (Array.isArray(data.tickets)) this.tickets.set(this.filterAuthenticTickets(data.tickets));
      if (ticketId) {
        this.preselectedTicketIdFromWallet.set(ticketId);
      }
      this.resetInactivityWatchdog();
      this.startRealtimeBankSync();
      this.addAuditLog(
        'bank',
        `[Enlace WalletPay -> MarketStore] Sesión verificada para ${user.name} (${user.email})${
          ticketId ? ` con ticket seleccionado ${ticketId}` : ''
        }.`
      );
      return true;
    } catch {
      return false;
    }
  }

  async authenticateAccount(params: {
    mode: 'login' | 'register' | 'biometric';
    role: UserRole;
    email: string;
    name?: string;
    password?: string;
    storeName?: string;
  }): Promise<{ ok: boolean; error?: string; requirePassword?: boolean }> {
    const cleanEmail = (params.email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Escribe un correo electrónico válido.' };
    }

    try {
      let data: any;
      if (params.mode === 'register') {
        data = await this.crypto.request('auth.register', {
          email: cleanEmail,
          name: (params.name || '').trim(),
          password: params.password || '',
          roleCode: params.role,
          storeName: params.storeName || (params.role === 'seller' ? `${params.name} Oficial` : '')
        });
      } else if (params.mode === 'biometric') {
        const deviceToken = this.crypto.loadProtectedItem(`devpass_${cleanEmail}`);
        if (!deviceToken) {
          return {
            ok: false,
            requirePassword: true,
            error: 'Ingresa tu contraseña la primera vez en este dispositivo para activar Face ID.'
          };
        }
        data = await this.crypto.request('auth.biometric', {
          email: cleanEmail,
          deviceToken,
          roleCode: params.role
        });
      } else {
        data = await this.crypto.request('auth.login', {
          email: cleanEmail,
          password: params.password || '',
          roleCode: params.role,
          storeName: params.storeName || ''
        });
      }

      if (!data?.ok || !data.user) {
        if (data?.code === 'DEVICE_UNLOCK_REQUIRED') {
          this.crypto.removeProtectedItem(`devpass_${cleanEmail}`);
          return {
            ok: false,
            requirePassword: true,
            error: data.error || 'Ingresa tu contraseña para continuar.'
          };
        }
        this.addAuditLog('warn', `[Control de Acceso] Intento rechazado para ${cleanEmail}: ${data?.error || 'Credenciales inválidas'}.`);
        return {
          ok: false,
          error: data?.error || 'Credenciales inválidas. Verifica tu correo y contraseña.'
        };
      }

      if (data.deviceToken) {
        this.crypto.saveProtectedItem(`devpass_${cleanEmail}`, data.deviceToken);
      }

      const user: UserAccount = {
        ...data.user,
        role: params.role
      };

      this.tickets.set(Array.isArray(data.tickets) ? this.filterAuthenticTickets(data.tickets) : []);
      this.orders.set([]);
      this.storeCredit.set(typeof data.user.storeCredit === 'number' ? data.user.storeCredit : 0);
      this.bankConnected.set(true);
      this.activeBankUrl.set(this.crypto.getActiveBankUrl());
      this.rememberLocalDeviceAccount(user);
      this.applySavedCardsFromServerOrLocal(user.email, data.user?.savedCardsJson);

      if (Array.isArray(data.ticketRequests)) {
        this.ticketRequests.set(data.ticketRequests);
      }

      const hudLabel =
        params.role === 'seller'
          ? `Vendedor: ${user.name.split(' ')[0]}`
          : `Comprador: ${user.name.split(' ')[0]}`;
      await this.triggerBiometricPulse(hudLabel, 850, 'faceid');

      this.jwtToken = data.deviceToken || 'session-active';
      this.currentUser.set(user);
      this.isAuthenticated.set(true);
      this.savePersistedSession(user);
      this.resetInactivityWatchdog();
      this.startRealtimeBankSync();

      this.addAuditLog(
        'sec',
        `[Control de Acceso] Sesión iniciada como ${
          params.role === 'seller' ? 'VENDEDOR' : 'COMPRADOR'
        }: ${user.name} (${user.email}).`
      );

      if (params.role === 'seller') {
        this.router.navigateByUrl('/seller');
      } else {
        this.router.navigateByUrl('/catalog');
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'No se pudo conectar con el Banco Central (:7070). Asegúrate de que CentralBank esté abierto.'
      };
    }
  }

  private startRealtimeBankSync(): void {
    if (this.syncPollingTimer) clearInterval(this.syncPollingTimer);
    this.syncWithCentralBank();
    this.syncPollingTimer = setInterval(() => {
      if (this.isAuthenticated()) {
        this.syncWithCentralBank();
      }
    }, 2000);
  }

  async syncWithCentralBank(): Promise<void> {
    const user = this.currentUser();
    if (!user || !this.isAuthenticated()) {
      await this.fetchRegisteredUsers();
      return;
    }

    try {
      let data = await this.crypto.request('state.sync');
      if (!data?.ok) {
        if (data?.code === 'UNAUTHORIZED') {
          // Reconectar automáticamente en segundo plano sin cerrar la sesión del usuario
          const reauthed = await this.trySilentReauth();
          if (reauthed) {
            data = await this.crypto.request('state.sync');
          }
        }
        if (!data?.ok) return;
      }

      this.bankConnected.set(true);
      this.activeBankUrl.set(this.crypto.getActiveBankUrl());

      if (data.user) {
        this.rememberLocalDeviceAccount({ ...data.user, role: user.role });
        this.applySavedCardsFromServerOrLocal(user.email, data.user.savedCardsJson);
      }
      if (typeof data.productsJson === 'string') {
        this.applyServerOrLocalProducts(data.productsJson);
      }
      if (Array.isArray(data.ticketRequests)) {
        this.ticketRequests.set(data.ticketRequests);
      }

      const revealedIds = new Set(
        this.tickets()
          .filter((t) => t.qrRevealed)
          .map((t) => t.id)
      );

      if (Array.isArray(data.tickets)) {
        const syncedTickets: BankTicket[] = this.filterAuthenticTickets(data.tickets).map((t) => ({
          ...t,
          qrRevealed: revealedIds.has(t.id)
        }));
        this.tickets.set(syncedTickets);
      }

      if (typeof data.storeCredit === 'number') {
        this.storeCredit.set(data.storeCredit);
      }

      if (Array.isArray(data.orders)) {
        this.orders.set(data.orders);
      }
    } catch {
      // Ignorar si CentralBank aún no se ha abierto
    }
  }

  async switchRole(targetRole: UserRole): Promise<void> {
    const curr = this.currentUser();
    if (!curr || curr.role === targetRole) return;
    try {
      const data = await this.crypto.request('auth.role', {
        roleCode: targetRole,
        storeName: targetRole === 'seller' ? curr.storeName || `${curr.name} Oficial` : ''
      });
      if (data?.ok && data.user) {
        const nextUser: UserAccount = { ...curr, ...data.user, role: targetRole };
        this.currentUser.set(nextUser);
        this.savePersistedSession(nextUser);
        await this.syncWithCentralBank();
        this.router.navigateByUrl(targetRole === 'seller' ? '/seller' : '/catalog');
      }
    } catch {
      // Ignorar si el servidor no responde
    }
  }

  lockSession(reason = 'Cambio de cuenta / Cierre de sesión'): void {
    this.clearPersistedSession();
    this.crypto.request('auth.logout').catch(() => {});
    this.jwtToken = null;
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.savedUserCards.set([]);
    this.tickets.set([]);
    this.orders.set([]);
    this.cart.set([]);
    this.storeCredit.set(0);
    this.cartOpen.set(false);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (this.syncPollingTimer) clearInterval(this.syncPollingTimer);
    this.addAuditLog('warn', `[Seguridad] ${reason}.`);
    this.fetchRegisteredUsers();
    this.router.navigateByUrl('/auth');
  }

  resetInactivityWatchdog(): void {
    // La sesión permanece abierta indefinidamente hasta que el usuario cierre sesión manualmente.
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
  }

  // =========================================================================
  // BOLSA DE COMPRAS Y CHECKOUT CON APROBACIÓN EN CENTRALBANK DESKTOP
  // =========================================================================

  addToCart(product: Product, qty = 1, openDrawer = false): void {
    this.resetInactivityWatchdog();
    if (product.stock <= 0) return;

    this.cart.update((items) => {
      const existing = items.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + qty);
        return items.map((i) =>
          i.product.id === product.id ? { ...i, quantity: nextQty } : i
        );
      }
      return [...items, { product, quantity: Math.min(product.stock, qty) }];
    });

    this.haptic('selection');
    if (openDrawer) {
      this.cartOpen.set(true);
    }
  }

  updateCartQuantity(productId: string, delta: number): void {
    this.resetInactivityWatchdog();
    this.cart.update((items) =>
      items
        .map((item) => {
          if (item.product.id !== productId) return item;
          const next = Math.min(item.product.stock, item.quantity + delta);
          return next > 0 ? { ...item, quantity: next } : null;
        })
        .filter((i): i is CartItem => i !== null)
    );
    this.haptic('selection');
  }

  removeFromCart(productId: string): void {
    this.cart.update((items) => items.filter((i) => i.product.id !== productId));
    this.haptic('light');
  }

  findOptimalTicketsForAmount(targetAmount: number): string[] {
    const active = [...this.activeTickets()].sort((a, b) => a.amount - b.amount);
    if (active.length === 0 || targetAmount <= 0) return [];

    // Si el usuario vino desde WalletPay con un ticket específico y cubre o ayuda a cubrir, priorizarlo
    const preselected = this.preselectedTicketIdFromWallet();
    if (preselected) {
      const found = active.find((t) => t.id === preselected);
      if (found && found.amount + this.storeCredit() >= targetAmount) {
        return [found.id];
      }
    }

    const netNeeded = Math.max(0, targetAmount - this.storeCredit());
    if (netNeeded === 0) return [];

    let bestIds: string[] = [];
    let bestSum = Infinity;
    let bestCount = Infinity;

    const n = Math.min(active.length, 15);
    const totalSubsets = 1 << n;
    for (let mask = 1; mask < totalSubsets; mask++) {
      let sum = 0;
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          sum += active[i].amount;
          ids.push(active[i].id);
        }
      }
      if (sum >= netNeeded) {
        if (sum < bestSum || (sum === bestSum && ids.length < bestCount)) {
          bestSum = sum;
          bestIds = ids;
          bestCount = ids.length;
        }
      }
    }

    if (bestIds.length === 0) {
      return active.map((t) => t.id);
    }
    return bestIds;
  }

  async acquireBankTicket(
    amount: TicketDenomination,
    method = 'Tarjeta Visa •••• 4821 (MarketStore)',
    onProgress?: (msg: string) => void
  ): Promise<BankTicket> {
    this.resetInactivityWatchdog();
    await this.triggerBiometricPulse(`Solicitando Ticket $${amount}...`, 850, 'building.columns');

    const data = await this.crypto.request('tickets.purchase.request', {
      amount,
      paymentMethod: method
    });

    if (!data?.ok) {
      throw new Error(data?.error || 'El Banco Central rechazó la solicitud del ticket.');
    }

    if (data.ticket && !data.pendingApproval) {
      const minted = data.ticket as BankTicket;
      if (!this.crypto.isTicketAuthentic(minted)) {
        throw new Error('El ticket recibido no superó la validación de autenticidad.');
      }
      await this.syncWithCentralBank();
      return minted;
    }

    const requestId = data.requestId;
    if (onProgress) {
      onProgress(`Solicitud #${requestId} enviada a CentralBank · Esperando aprobación del pago con tarjeta por el Administrador...`);
    }

    while (true) {
      await new Promise((r) => setTimeout(r, 1200));
      const statusData = await this.crypto.request('tickets.purchase.status', { requestId });
      if (!statusData?.ok) continue;

      if (statusData.approvalStatus === 'pending') {
        if (onProgress) {
          onProgress(`Esperando en CentralBank Desktop: Acepta el pago de tarjeta de la Solicitud #${requestId} ($${amount} MXN)...`);
        }
        continue;
      }

      if (statusData.approvalStatus === 'rejected') {
        await this.syncWithCentralBank();
        throw new Error(statusData.statusReport || 'El Administrador del Banco Central rechazó el pago de la tarjeta.');
      }

      if (statusData.approvalStatus === 'approved' && statusData.ticket) {
        const minted = statusData.ticket as BankTicket;
        if (!this.crypto.isTicketAuthentic(minted)) {
          throw new Error('El ticket recibido no superó la validación de autenticidad.');
        }
        await this.syncWithCentralBank();
        this.addAuditLog(
          'bank',
          `[Banco Central] Pago de tarjeta aprobado (#${requestId}) · Ticket ${minted.id} ($${amount} MXN) emitido.`
        );
        this.haptic('success');
        return minted;
      }
    }
  }

  async importExternalTicketFolio(
    rawFolio: string,
    _amount: TicketDenomination
  ): Promise<{ ok: boolean; message: string; ticket?: BankTicket }> {
    this.resetInactivityWatchdog();
    const cleaned = rawFolio.trim().toUpperCase();
    if (cleaned.length < 6) {
      return { ok: false, message: 'Ingresa un folio válido (ej. TKT-8420-A1B2).' };
    }

    await this.triggerBiometricPulse('Verificando Folio con Banco...', 750, 'shield.checkered');

    try {
      const localTicket = this.tickets().find((t) => t.id.toUpperCase() === cleaned);
      const data = await this.crypto.request('tickets.verify', {
        folio: cleaned,
        ...(localTicket
          ? {
              ticket: {
                id: localTicket.id,
                amount: localTicket.amount,
                ownerEmail: localTicket.ownerEmail,
                issuedEpoch: localTicket.issuedEpoch,
                signature: localTicket.signature
              }
            }
          : {})
      });

      if (data?.ticket && !this.crypto.isTicketAuthentic(data.ticket)) {
        return {
          ok: false,
          message: `El ticket ${cleaned} presenta datos alterados y fue rechazado.`
        };
      }

      await this.syncWithCentralBank();
      return {
        ok: !!data?.ok,
        message: data?.message || 'No se pudo verificar el folio.',
        ticket: data?.ticket
      };
    } catch {
      return {
        ok: false,
        message: 'No se pudo conectar con CentralBank (:7070).'
      };
    }
  }

  /**
   * Verifica la autenticidad de cada ticket seleccionado en la propia tienda antes de enviarlo,
   * transmite el pedido por el canal seguro al Banco Central y verifica el sello del comprobante
   * de aprobación antes de liberar la compra.
   */
  async verifyAndCheckoutWithTickets(
    selectedTicketIds: string[],
    onProgress?: (stage: string) => void
  ): Promise<{ ok: boolean; error?: string; order?: StoreOrder }> {
    this.resetInactivityWatchdog();

    const items = this.cart();
    if (items.length === 0) {
      return { ok: false, error: 'Tu bolsa de compras está vacía.' };
    }

    const allKnown = this.tickets();
    const chosenTickets: BankTicket[] = [];
    for (const id of selectedTicketIds) {
      const found = allKnown.find((t) => t.id === id);
      if (!found) {
        return { ok: false, error: `El ticket ${id} no se encuentra en tu bóveda.` };
      }
      if (found.status !== 'active') {
        this.addAuditLog('warn', `[Anti-Doble Gasto] Intento de reutilizar el ticket ${found.id} bloqueado.`);
        return {
          ok: false,
          error: `El ticket ${found.id} ya fue utilizado anteriormente y no puede volver a canjearse.`
        };
      }
      // Verificación local en la tienda: si alguien alteró el monto, el folio, el titular o el sello en memoria, se rechaza de inmediato
      if (!this.crypto.isTicketAuthentic(found)) {
        this.addAuditLog('warn', `[Integridad] Ticket ${found.id} rechazado por modificación de datos o sello inválido.`);
        return {
          ok: false,
          error: `El ticket ${found.id} fue modificado o su sello de autenticidad es inválido. Compra cancelada.`
        };
      }
      chosenTickets.push(found);
    }

    const ticketsSum = chosenTickets.reduce((acc, t) => acc + t.amount, 0);
    const availableCredit = this.storeCredit();
    const subtotal = this.cartSubtotal();

    if (ticketsSum + availableCredit < subtotal) {
      return {
        ok: false,
        error: `Los tickets seleccionados ($${ticketsSum}) más tu saldo a favor ($${availableCredit}) no cubren el total de $${subtotal} MXN.`
      };
    }

    const user = this.currentUser();
    if (!user) {
      return { ok: false, error: 'Inicia sesión para completar la compra.' };
    }

    if (onProgress) {
      onProgress('Validando autenticidad de los tickets automáticamente con el Banco Central...');
    }

    let orderId = '';
    try {
      const reqData = await this.crypto.request('orders.request', {
        tickets: chosenTickets.map((t) => ({
          id: t.id,
          amount: t.amount,
          ownerEmail: t.ownerEmail || user.email,
          issuedEpoch: t.issuedEpoch || 0,
          signature: t.signature || ''
        })),
        items: items.map((i) => ({
          productId: i.product.id,
          title: i.product.title,
          quantity: i.quantity,
          unitPrice: i.product.price,
          symbolName: i.product.symbolName
        }))
      });

      if (!reqData?.ok) {
        this.addAuditLog('warn', `[Checkout Rechazado] ${reqData?.error || 'Solicitud rechazada por el Banco Central.'}`);
        await this.syncWithCentralBank();
        return { ok: false, error: reqData?.error || 'El Banco Central rechazó la solicitud.' };
      }
      orderId = reqData.orderId;

      if (reqData.approvalStatus === 'approved' && reqData.receipt && reqData.order) {
        const receiptOk = this.crypto.isOrderReceiptAuthentic(
          reqData.receipt,
          orderId,
          subtotal,
          selectedTicketIds,
          user.email
        );
        if (!receiptOk) {
          this.addAuditLog(
            'warn',
            `[Integridad] El comprobante de aprobación para la orden #${orderId} no superó la validación de autenticidad.`
          );
          return {
            ok: false,
            error: 'El comprobante de autorización recibido fue alterado y la tienda rechazó liberar la orden.'
          };
        }

        await this.triggerBiometricPulse('Tickets Validados · Compra Aprobada', 850, 'checkmark.seal.fill');

        this.products.update((prods) =>
          prods.map((p) => {
            const cartItem = items.find((i) => i.product.id === p.id);
            if (!cartItem) return p;
            return { ...p, stock: Math.max(0, p.stock - cartItem.quantity) };
          })
        );

        this.cart.set([]);
        await this.syncWithCentralBank();

        const approvedOrder: StoreOrder = reqData.order;
        this.addAuditLog(
          'bank',
          `[Compra Validada Automáticamente] Orden #${orderId} por $${subtotal} MXN autorizada por el Banco Central con sello ${reqData.bankVerificationCode}.`
        );
        this.haptic('success');
        return { ok: true, order: approvedOrder };
      }
    } catch {
      return {
        ok: false,
        error: 'No se pudo conectar con CentralBank Desktop (:7070). Asegúrate de que la aplicación CentralBank esté abierta.'
      };
    }

    if (onProgress) {
      onProgress(
        `Orden #${orderId} en verificación automática de tickets con el Banco Central...`
      );
    }

    // Polling en tiempo real hasta que el Administrador en CentralBank verifique y apruebe (o rechace)
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const statusData = await this.crypto.request('orders.status', { orderId });
        if (!statusData?.ok) continue;

        if (statusData.approvalStatus === 'pending') {
          if (statusData.isAuthenticityVerified && statusData.isAuthenticityValid) {
            if (onProgress) {
              onProgress(
                `¡Tickets verificados en CentralBank! (${statusData.verificationReport}) · Esperando clic en "Aprobar Compra"...`
              );
            }
          } else if (onProgress) {
            onProgress(
              `Esperando en CentralBank Desktop: Ve a la pestaña "Aprobar Compras Tienda" para verificar los tickets y aprobar la Orden #${orderId}...`
            );
          }
          continue;
        }

        if (statusData.approvalStatus === 'rejected') {
          await this.syncWithCentralBank();
          return {
            ok: false,
            error: statusData.verificationReport || 'La compra fue rechazada por el Administrador del Banco Central.'
          };
        }

        if (statusData.approvalStatus === 'approved') {
          // La tienda comprueba que el comprobante de aprobación lleve el sello legítimo del Banco Central
          const receiptOk = this.crypto.isOrderReceiptAuthentic(
            statusData.receipt,
            orderId,
            subtotal,
            selectedTicketIds,
            user.email
          );
          if (!receiptOk) {
            this.addAuditLog(
              'warn',
              `[Integridad] El comprobante de aprobación para la orden #${orderId} no superó la validación de autenticidad.`
            );
            return {
              ok: false,
              error: 'El comprobante de autorización recibido fue alterado y la tienda rechazó liberar la orden.'
            };
          }

          await this.triggerBiometricPulse('Compra Aprobada por Banco Central', 850, 'checkmark.seal.fill');

          // Descontar stock local de los productos comprados
          this.products.update((prods) =>
            prods.map((p) => {
              const cartItem = items.find((i) => i.product.id === p.id);
              if (!cartItem) return p;
              return { ...p, stock: Math.max(0, p.stock - cartItem.quantity) };
            })
          );

          this.cart.set([]);
          await this.syncWithCentralBank();

          const approvedOrder: StoreOrder = statusData.order;
          this.addAuditLog(
            'bank',
            `[Compra Aprobada por CentralBank] Orden #${orderId} por $${subtotal} MXN autorizada con código ${statusData.bankVerificationCode}.`
          );
          this.haptic('success');
          return { ok: true, order: approvedOrder };
        }
      } catch {
        // Reintentar polling
      }
    }
  }

  async toggleTicketQrReveal(ticketId: string): Promise<void> {
    const target = this.tickets().find((t) => t.id === ticketId);
    if (!target) return;

    if (!target.qrRevealed) {
      await this.triggerBiometricPulse('Desbloqueando QR', 750, 'faceid');
    }

    this.tickets.update((list) =>
      list.map((t) => (t.id === ticketId ? { ...t, qrRevealed: !t.qrRevealed } : t))
    );
  }

  // =========================================================================
  // GESTIÓN DE VENDEDOR (PRODUCTOS E INVENTARIO + ÓRDENES)
  // =========================================================================

  async createOrUpdateProduct(payload: {
    id?: string;
    title: string;
    subtitle: string;
    description: string;
    category: Product['category'];
    price: number;
    stock: number;
    symbolName: string;
    surfaceClass: string;
    imageUrl?: string;
    images?: string[];
    specs: string[];
  }): Promise<Product> {
    this.resetInactivityWatchdog();
    await this.triggerBiometricPulse(
      payload.id ? 'Actualizando Catálogo...' : 'Publicando Producto...',
      750,
      'cube.box'
    );

    const categoryLabels: Record<Product['category'], string> = {
      audio: 'Audio y Música',
      magsafe: 'Accesorios MagSafe',
      hogar: 'Hogar Inteligente',
      estudio: 'Cómputo y Estudio',
      digital: 'Tarjetas y Digital'
    };

    const recommended = this.computeRecommendedTickets(payload.price);
    const badgeText =
      recommended.length === 1
        ? `1 Ticket $${recommended[0]}`
        : `Tickets ${recommended.map((r) => '$' + r).join(' + ')}`;

    const normalizedImages = Array.isArray(payload.images)
      ? payload.images.filter((img) => typeof img === 'string' && img.trim().length > 0)
      : payload.imageUrl
      ? [payload.imageUrl]
      : [];
    const mainImageUrl = payload.imageUrl || normalizedImages[0] || undefined;

    if (payload.id) {
      let updatedProd!: Product;
      this.products.update((list) =>
        list.map((p) => {
          if (p.id !== payload.id) return p;
          updatedProd = {
            ...p,
            title: payload.title,
            subtitle: payload.subtitle,
            description: payload.description,
            category: payload.category,
            categoryLabel: categoryLabels[payload.category],
            price: payload.price,
            stock: payload.stock,
            symbolName: payload.symbolName,
            surfaceClass: payload.surfaceClass,
            imageUrl: mainImageUrl,
            images: normalizedImages,
            specs: payload.specs,
            recommendedTickets: recommended,
            badge: badgeText
          };
          return updatedProd;
        })
      );
      await this.persistProductsToServer();
      this.addAuditLog('info', `[Vendedor] Producto ${updatedProd.sku} actualizado ($${payload.price} MXN).`);
      return updatedProd;
    }

    const num = Math.floor(200 + Math.random() * 799);
    const newProd: Product = {
      id: `PRD-${num}`,
      sku: `MS-${payload.category.substring(0, 3).toUpperCase()}-${payload.price}`,
      title: payload.title,
      subtitle: payload.subtitle,
      description: payload.description,
      category: payload.category,
      categoryLabel: categoryLabels[payload.category],
      price: payload.price,
      stock: payload.stock,
      rating: 5.0,
      reviewsCount: 1,
      badge: badgeText,
      surfaceClass: payload.surfaceClass,
      accentColor: '#007AFF',
      symbolName: payload.symbolName,
      imageUrl: mainImageUrl,
      images: normalizedImages,
      specs: payload.specs.length ? payload.specs : ['Garantía oficial MarketStore', 'Pago verificado con Tickets Bancarios'],
      sellerId: this.currentUser()?.id ?? 'USR-SELLER-01',
      sellerName: this.currentUser()?.storeName ?? 'Market Store Oficial',
      active: true,
      recommendedTickets: recommended
    };

    this.products.update((list) => [newProd, ...list]);
    await this.persistProductsToServer();
    this.addAuditLog(
      'info',
      `[Vendedor] Nuevo producto publicado: "${newProd.title}" ($${newProd.price} MXN).`
    );
    this.haptic('success');
    return newProd;
  }

  toggleProductActive(productId: string): void {
    this.products.update((list) =>
      list.map((p) => (p.id === productId ? { ...p, active: !p.active } : p))
    );
    this.persistProductsToServer();
    this.haptic('selection');
  }

  deleteProduct(productId: string): void {
    this.products.update((list) => list.filter((p) => p.id !== productId));
    this.cart.update((items) => items.filter((i) => i.product.id !== productId));
    this.persistProductsToServer();
    this.haptic('light');
  }

  advanceOrderStatus(orderId: string): void {
    const flow: OrderStatus[] = ['verified', 'preparing', 'shipped', 'delivered'];
    this.orders.update((list) =>
      list.map((o) => {
        if (o.id !== orderId) return o;
        const idx = flow.indexOf(o.status);
        const nextStatus = flow[Math.min(flow.length - 1, idx + 1)];
        return { ...o, status: nextStatus };
      })
    );
    this.haptic('selection');
  }

  private computeRecommendedTickets(price: number): TicketDenomination[] {
    const denoms: TicketDenomination[] = [500, 200, 100, 50];
    let remaining = price;
    const result: TicketDenomination[] = [];
    for (const d of denoms) {
      while (remaining >= d && result.length < 3) {
        result.push(d);
        remaining -= d;
      }
    }
    if (remaining > 0 || result.length === 0) {
      result.push(50);
    }
    return result;
  }
}
