export type TicketDenomination = 50 | 100 | 200 | 500;
export type TicketStatus = 'active' | 'used' | 'expired';
export type UserRole = 'buyer' | 'seller';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  storeName?: string;
  verifiedLevel: string;
  avatarInitials: string;
  avatarHex?: string;
  unusedTicketsCount?: number;
  unusedBalance?: number;
  storeCredit?: number;
}

export interface BankTicket {
  id: string;
  serialMasked: string;
  amount: TicketDenomination;
  tier: string;
  colorClass: string;
  status: TicketStatus;
  issuedAt: string;
  usedAt?: string;
  orderId?: string;
  signatureHash: string;
  signature?: string;
  issuedEpoch?: number;
  ownerName?: string;
  ownerEmail?: string;
  qrRevealed: boolean;
}

export interface OrderReceipt {
  orderId: string;
  status: string;
  bankCode: string;
  subtotalCents: number;
  ticketIds: string[];
  buyerEmail: string;
  signature: string;
}

export type ProductCategory =
  | 'all'
  | 'audio'
  | 'magsafe'
  | 'hogar'
  | 'estudio'
  | 'digital';

export interface Product {
  id: string;
  sku: string;
  title: string;
  subtitle: string;
  description: string;
  category: Exclude<ProductCategory, 'all'>;
  categoryLabel: string;
  price: number;
  stock: number;
  rating: number;
  reviewsCount: number;
  badge?: string;
  surfaceClass: string;
  accentColor: string;
  symbolName: string;
  specs: string[];
  sellerId: string;
  sellerName: string;
  active: boolean;
  recommendedTickets: TicketDenomination[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'verified' | 'preparing' | 'shipped' | 'delivered';

export interface StoreOrder {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerEmail: string;
  items: {
    productId: string;
    title: string;
    quantity: number;
    unitPrice: number;
    symbolName: string;
  }[];
  subtotal: number;
  ticketsUsed: {
    id: string;
    amount: TicketDenomination;
    tier: string;
    colorClass: string;
    signatureHash: string;
  }[];
  totalPaidWithTickets: number;
  changeCredited: number;
  bankVerificationCode: string;
  status: OrderStatus;
  receipt?: OrderReceipt;
}

export interface AuditLogItem {
  time: string;
  category: 'info' | 'sec' | 'bank' | 'warn';
  message: string;
}

