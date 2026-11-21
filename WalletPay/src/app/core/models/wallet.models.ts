export type TicketDenomination = 50 | 100 | 200 | 500;
export type TicketStatus = 'active' | 'used' | 'expired';

export interface WalletUserAccount {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  avatarHex?: string;
  unusedTicketsCount?: number;
  unusedBalance?: number;
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
  usedByName?: string;
  usedByEmail?: string;
  orderId?: string;
  signatureHash: string;
  signature?: string;
  issuedEpoch?: number;
  qrRevealed: boolean;
  ownerName?: string;
  ownerEmail?: string;
  isShared?: boolean;
  isSharedWithMe?: boolean;
  sharedWithEmails?: string[];
  qrPayload?: string;
}

export interface TicketPurchaseRequest {
  requestId: string;
  amount: TicketDenomination;
  tier: string;
  colorClass: string;
  paymentMethod: string;
  createdAt: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  mintedTicketId?: string;
  bankAuthCode: string;
  statusReport: string;
}

export interface WalletTransaction {
  id: string;
  type: 'buy' | 'redeem';
  iconType: 'arrow-up-right' | 'card' | 'bank' | 'bag';
  title: string;
  subtitle: string;
  date: string;
  amount: number;
}

export interface AuditLogItem {
  time: string;
  category: 'info' | 'sec' | 'bank' | 'warn';
  message: string;
}
